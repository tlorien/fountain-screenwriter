import {
  Plugin, PluginSettingTab, Setting,
  MarkdownView, Notice, FileSystemAdapter, TFile, Editor, Platform,
} from 'obsidian';
import {
  fountainHighlightExtension,
  setHighlight, setMarks, TokenLine, TokenMark,
} from './highlight/fountainHighlight';
import { hoverTooltip, Tooltip, EditorView, ViewUpdate } from '@codemirror/view';

/** Return every element that can contain CodeMirror in this pane. */
function cmHosts(view: MarkdownView): HTMLElement[] {
  // source (live-preview) and reading view are both `.markdown-source-view`
  // on Mobile they sit deeper inside the container
  return Array.from(
    view.containerEl.querySelectorAll<HTMLElement>('.markdown-source-view')
  );
}

/* Desktop-only helpers; resolved at runtime */
type Fs   = typeof import('fs');
type Path = typeof import('path');

let fs: Fs   | undefined;
let path: Path | undefined;
let run: ((...a: any[]) => Promise<any>) | undefined;

async function loadDesktopDeps(): Promise<boolean> {
  if (Platform.isMobileApp) return false;              // skip on mobile
  ({ default: fs }   = await import('fs')  as any);
  ({ default: path } = await import('path') as any);
  const { execFile }  = await import('child_process');
  const { promisify } = await import('util');
  run = promisify(execFile);
  return true;
}

/* 1.  Settings types & defaults */
type ColourKey =
  | 'scene_heading' | 'section' | 'character' | 'dialogue' | 'transition'
  | 'action' | 'parenthetical' | 'lyric' | 'title' | 'credit' | 'author'
  | 'source' | 'draft_date' | 'contact' | 'synopsis' | 'note' | 'centered'
  | 'extension';

interface ScreenwriterSettings {
  colours: Partial<Record<ColourKey, string>>;
  showHoverHints:      boolean;
  enableSyntaxColours: boolean;
  enableIndentation:   boolean;
}

const DEFAULT_SETTINGS: ScreenwriterSettings = {
  colours: {},
  showHoverHints: true,
  enableSyntaxColours: true,
  enableIndentation: true,
};

const THEME_COLOURS: Record<ColourKey, string> = {
  scene_heading : 'var(--color-orange)',
  section       : 'var(--text-accent)',
  character     : 'var(--interactive-accent)',
  dialogue      : 'var(--text-normal)',
  transition    : 'var(--text-muted)',
  action        : 'var(--text-normal)',
  parenthetical : 'var(--text-faint)',
  lyric         : 'var(--text-accent)',
  title         : 'var(--text-accent)',
  credit        : 'var(--text-accent)',
  author        : 'var(--text-accent)',
  source        : 'var(--text-accent)',
  draft_date    : 'var(--text-accent)',
  contact       : 'var(--text-accent)',
  synopsis      : 'var(--text-faint)',
  note          : 'var(--text-faint)',
  centered      : 'scr-centered',
  extension     : 'var(--text-muted)',
};

/* 2.  Fountain token → CSS class map */
const TOKEN_CLASS: Record<ColourKey|'unknown',string> = {
  scene_heading:'scr-scene',  section:'scr-sec',        character:'scr-char',
  dialogue:'scr-dialogue',    transition:'scr-trans',   action:'scr-action',
  parenthetical:'scr-paren',  lyric:'scr-lyric',        title:'scr-title',
  credit:'scr-credit',        author:'scr-author',      source:'scr-source',
  draft_date:'scr-draftdate', contact:'scr-contact',    synopsis:'scr-syn',
  note:'scr-note',            unknown:'scr-unknown',    centered:'scr-centered',
  extension:'scr-ext',
};

/* 3.  Main plugin */
export default class ScreenwriterPlugin extends Plugin {

  public  settings!: ScreenwriterSettings;
  private worker!       : Worker;
  private styleEl       : HTMLStyleElement|null = null;
  private indentResetEl : HTMLStyleElement|null = null;

  private lineTypeMap = new Map<number,string>();            // line → type
  private statusEl    : HTMLElement|null = null;             // status-bar
  private hoverExt    : any;                                 // CM6 tooltip

  /* ────────── LIFECYCLE ───────────────────────────────────────── */
  async onload() {
    await this.loadSettings();

    /* order matters → reset-indent FIRST, colours SECOND */
    this.applyIndentToggle(this.settings.enableIndentation);
    this.injectColourCSS();

    /* CodeMirror extensions */
    this.hoverExt = this.buildHoverTooltip();
    const caretExt = EditorView.updateListener.of((vu:ViewUpdate) => {
      if (vu.selectionSet) this.updateStatusBar();
    });
    this.registerEditorExtension([
      fountainHighlightExtension(), this.hoverExt, caretExt,
    ]);

    /* Parser worker */
    this.worker = await this.makeWorker();
    this.register(() => this.worker.terminate());


    /* Status-bar */
    this.statusEl = this.addStatusBarItem();
    this.statusEl.addClass('scr-status');
    this.statusEl.setText('…');

    this.addSettingTab(new ColourSettingTab(this));
    if (!Platform.isMobileApp) this.registerDesktopExportCommands();

    /* Workspace listeners */
    const hooked = new WeakSet<Editor>();
    const send   = this.debounce((v:MarkdownView|null) => {
      if (v && this.isScriptFile(v.file))
        this.worker.postMessage(v.editor.getValue());
    },250);

    this.registerEvent(this.app.workspace.on('editor-change', (_e,v) => {
      if (!(v instanceof MarkdownView)) return;
      send(v); this.updateStatusBar(); this.markEditor(v);

      const ed = v.editor as any;
      if (!hooked.has(ed) && ed.on) {
        hooked.add(ed);
        ed.on('cursorActivity', () => this.updateStatusBar());
      }
    }));
    this.registerEvent(this.app.workspace.on('file-open', () => this.reparseActive()));
    this.registerEvent(this.app.workspace.on('layout-change', () => this.reparseActive()));

    /* Initial parse */
    this.reparseActive();
    this.worker.onmessage = ({data}) => {
      console.log('[Screenwriter] Fountain AST:', data);
      this.applyHighlight(data);}
  }                                           /* ◀── end onload —— */

  /* ────────── HELPERS ─────────────────────────────────────────── */
  private buildHoverTooltip() {
    const plugin = this;
    return hoverTooltip((view,pos):Tooltip|null => {
      if (!plugin.settings.showHoverHints) return null;
      const ln = view.state.doc.lineAt(pos).number-1;
      const type = plugin.lineTypeMap.get(ln);
      if (!type) return null;
      return {
        pos,end:pos,above:true,
        create: () => {
          const dom = document.createElement('div');
          dom.className = 'scr-hover-tooltip';
          dom.textContent = type.toUpperCase();
          return { dom };
        },
      };
    });
  }

public markEditor(view: MarkdownView | null) {
  if (!view) return;
  const on = this.isScriptFile(view.file);
  cmHosts(view).forEach(host => host.classList.toggle('scr-page', on));
}

  private reparseActive(){
    const v = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!v || !this.isScriptFile(v.file)) { this.markEditor(v); return; }
    this.worker.postMessage(v.editor.getValue());
    this.markEditor(v); this.updateStatusBar();
  }

  /* ---------- Worker loader (mobile-safe) -------------------- */
  private async makeWorker(): Promise<Worker> {
    /* 1 · Fast path – works in Electron and modern Android / iOS     */
    try {
      return new Worker(new URL('./parserWorker.js', import.meta.url));
    } catch (_) { /* fall through */ }
  
    /* 2 · Universal fallback      */
    const workerPath = `${this.app.vault.configDir}/plugins/${this.manifest.id}/parserWorker.js`;
    const src = await this.app.vault.adapter.read(workerPath);
    return new Worker(
      URL.createObjectURL(new Blob([src], { type: 'text/javascript' }))
    );
  }

  /* ---------- Desktop-only export commands -------------------- */
  private registerDesktopExportCommands(){
    this.addCommand({
      id:'export-script-pdf', name:'Export script → PDF',
      checkCallback:checking=>{
        const v = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!v || !this.isScriptFile(v.file)) return false;
        if (!checking) this.exportScript(v.file!,'pdf');
        return true;
      },
    });
    this.addCommand({
      id:'export-script-fdx', name:'Export script → Final Draft (FDX)',
      checkCallback:checking=>{
        const v = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!v || !this.isScriptFile(v.file)) return false;
        if (!checking) this.exportScript(v.file!,'fdx');
        return true;
      },
    });
  }

  private async exportScript(file: TFile, fmt: 'pdf' | 'fdx') {
    // ─── Desktop only — ensure Node deps & correct vault adapter ───
    if (
      !(await loadDesktopDeps()) ||
      !(this.app.vault.adapter instanceof FileSystemAdapter) ||
      !fs || !path || !run
    ) {
      new Notice('Export is available on Desktop only');
      return;
    }
  
    // Safely cast adapter after instanceof check
    const adapter = this.app.vault.adapter as FileSystemAdapter;
    const vaultDir = adapter.getBasePath();
    const outDir = path.join(vaultDir, 'scripts', 'exports');
    await fs.promises.mkdir(outDir, { recursive: true });
  
    const cmd = 'fountain'; // fountain-cli
    const args = [
      file.path,
      '--output', path.join(outDir, `${file.basename}.${fmt}`)
    ];
    if (fmt === 'pdf') args.push('--pdf');
  
    new Notice('Exporting…');
    try {
      await run(cmd, args, { cwd: vaultDir });
      new Notice(`Exported → ${outDir}`);
    } catch (e: any) {
      new Notice(`Export failed: ${e.message}`);
    }
  }

  /* ---------- Indentation toggle ------------------------------ */
  /** Master switch for left-flush / classic margins */
public applyIndentToggle(active: boolean) {
  /* start from a clean slate every time */
  this.indentResetEl?.remove();
  this.indentResetEl = null;

  /* classic margins wanted → nothing to inject */
  if (active) return;

  /* inject one high-specificity reset scoped to .scr-page */
  const css = `
    /* every Fountain line back to flush-left */
    .scr-page .cm-line[class*="scr-"]{
      padding-left:0!important;
      margin-left:0!important;
      text-align:left!important;
    }
    /* cancel right-edge stuff */
    .scr-page .cm-line.scr-trans{padding-right:0!important;}
    .scr-page .cm-line.scr-centered{display:block!important;}
  `;
  this.indentResetEl = Object.assign(document.createElement('style'), {
    id         : 'screenwriter-indent-reset',
    textContent: css,
  });
  document.head.appendChild(this.indentResetEl);
}


  /* ---------- Highlight pipeline ------------------------------ */
  /** Build CM decorations + status-bar map */
private applyHighlight({ tokens, error }: any) {
  if (error || !tokens) return;

  const v = this.app.workspace.getActiveViewOfType(MarkdownView);
  if (!v) return;

  const lines: TokenLine[] = [];
  const marks: TokenMark[] = [];
  this.lineTypeMap.clear();

  for (const t of tokens as any[]) {
    if (t.line === -1) continue;

    /* ---------- choose the line class -------------------------- */
    let cls = TOKEN_CLASS[t.type as ColourKey] ?? TOKEN_CLASS.unknown;

    if (t.type === 'section'   && typeof t.depth === 'number')
      cls = `scr-sec-${Math.min(Math.max(1, t.depth), 6)}`;
    if (t.dual && t.type === 'character') cls = 'scr-char-dual';
    if (t.dual && t.type === 'dialogue')  cls = 'scr-dialogue-dual';
    if (t.type === 'synopsis')            cls = 'scr-syn';

    const raw = v.editor.getLine(t.line);
    if (t.type === 'note' && raw.trim() === `[[${t.text}]]`) cls = 'scr-note';

    /* ---------- status-bar lookup map -------------------------- */
    if (raw.trim() !== '') this.lineTypeMap.set(t.line, t.type);

    /* ---------- push line decoration --------------------------- */
    lines.push({ line: t.line, cls });

    /* mirror preceding “Key:” line on title-page ---------------- */
    if (
      t.line > 0 &&
      /^(scr-(title|credit|author|source|draftdate|contact))$/.test(cls) &&
      !this.lineTypeMap.has(t.line - 1)
    ) {
      const prev = t.line - 1;
      lines.push({ line: prev, cls });
      this.lineTypeMap.set(prev, t.type);
    }

    /* ---------- character extension mark ---------- */
    if (t.ext && t.type === 'character') {
      const start = raw.indexOf('(');
      const end   = raw.lastIndexOf(')') + 1;
      if (start !== -1 && end > start) {
        const base = v.editor.posToOffset({ line: t.line, ch: 0 });
        marks.push({
          from: base + start,
          to:   base + end,
          cls:  'scr-ext',
        });
      }
    }
  }

  /* keep CM’s RangeSetBuilder happy */
  lines.sort((a, b) => a.line - b.line);
  marks.sort((a, b) => (a.from - b.from) || (a.to - b.to));

  (v.editor as any).cm.dispatch({
    effects: [ setHighlight.of(lines), setMarks.of(marks) ]
  });

  this.updateStatusBar();
}


  /* ---------- Status-bar -------------------------------------- */
  public updateStatusBar(){
    if (!this.statusEl) return;
    const v = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!v){
      this.statusEl.setText('');
      // reset to the base class only
      this.statusEl.className = 'scr-status';
      return;
    }
  
    const ln   = v.editor.getCursor().line;
    const type = this.lineTypeMap.get(ln);
    if (!type){
      this.statusEl.setText('');
      this.statusEl.className = 'scr-status';
      return;
    }
  
    // Show the current token name
    this.statusEl.setText(type.toUpperCase());
    // Apply a CSS class instead of inline styles
    this.statusEl.className = `scr-status scr-status--${type}`;
  }
  

  /* ---------- Colour-CSS inject ------------------------------- */
  private injectColourCSS() {
    this.styleEl?.remove();
    this.styleEl = document.createElement('style');
    this.styleEl.id = 'screenwriter-theme-colours';
  
    // ── 1) If syntax-colours are disabled, force everything to the normal text colour
    if (!this.settings.enableSyntaxColours) {
      this.styleEl.textContent = `
        /* lines */
        .scr-page .cm-line[class*="scr-"] {
          color: var(--text-normal) !important;
        }
        /* inline extensions & notes */
        .scr-page .cm-content .scr-ext,
        .scr-page .cm-content .scr-note-inline,
        .scr-page .cm-content .scr-note-inline a {
          color: var(--text-normal) !important;
          background: none !important;
          border-bottom: none !important;
        }
      `;
      document.head.appendChild(this.styleEl);
      return;
    }
  
    // ── 2) Build one rule per token line class
    const rules: string[] = [];
    (Object.keys(TOKEN_CLASS) as ColourKey[]).forEach(key => {
      const cls    = TOKEN_CLASS[key];
      const colour = this.settings.colours[key] ?? THEME_COLOURS[key];
      // skip any panel-wide “section-depth” classes if you prefer
      if (!cls.startsWith('scr-sec')) {
        rules.push(`.scr-page .cm-line.${cls} { color: ${colour}; }`);
      }
    });
  
    // ── 3) Inline extension marks (e.g. JOHN (on the phone))
    const extColour = this.settings.colours.extension ?? THEME_COLOURS.extension;
    rules.push(`
      .scr-page .cm-content .scr-ext {
        color: ${extColour};
      }
    `);
  
    // ── 4) Inline notes
    const noteColour = this.settings.colours.note ?? THEME_COLOURS.note;
    rules.push(`
      .scr-page .cm-content .scr-note-inline,
      .scr-page .cm-content .scr-note-inline a {
        color: ${noteColour};
        background: rgba(255,102,212,.12);
        border-bottom: 1px dotted var(--text-accent);
      }
    `);
  
    this.styleEl.textContent = rules.join('\n');
    document.head.appendChild(this.styleEl);
  }
  
  

  /* ---------- Utils ------------------------------------------- */
  private isScriptFile(file:TFile|null){
    return !!file && this.app.metadataCache.getFileCache(file)?.frontmatter?.script===true;
  }
  private debounce<F extends(...a:any)=>void>(fn:F,ms=300){
    let id:number; return (...a:Parameters<F>)=>{
      clearTimeout(id); id = window.setTimeout(()=>fn(...a),ms);
    };
  }
  async updateColours(){ await this.saveData(this.settings); this.injectColourCSS(); }
  private async loadSettings(){
    this.settings = Object.assign({},DEFAULT_SETTINGS,await this.loadData());
  }
}

/* ────────────────────────────────────────────────────────────────── */
/*  4.  Settings tab                                                  */
/* ────────────────────────────────────────────────────────────────── */
class ColourSettingTab extends PluginSettingTab{
  constructor(private plugin:ScreenwriterPlugin){ super(plugin.app,plugin); }
  display(){
    const {containerEl:c}=this; c.empty();

    c.createEl('h2',{text:'Behaviour'});
    /* hover */
    new Setting(c).setName('Show hover hints')
      .addToggle(t=>t.setValue(this.plugin.settings.showHoverHints)
        .onChange(async v=>{
          this.plugin.settings.showHoverHints=v; await this.plugin.saveData(this.plugin.settings);
        }));
    /* colours */
    new Setting(c).setName('Syntax colours')
      .addToggle(t=>t.setValue(this.plugin.settings.enableSyntaxColours)
        .onChange(async v=>{
          this.plugin.settings.enableSyntaxColours=v;
          await this.plugin.updateColours(); this.plugin.updateStatusBar();
        }));
    /* indentation */
    new Setting(c).setName('Indentation')
      .addToggle(t=>t.setValue(this.plugin.settings.enableIndentation)
        .onChange(async v=>{
          this.plugin.settings.enableIndentation=v; await this.plugin.saveData(this.plugin.settings);
          this.plugin.applyIndentToggle(v);
          this.plugin.markEditor(this.plugin.app.workspace.getActiveViewOfType(MarkdownView));
        }));

    c.createEl('h2',{text:'Colour overrides'});
    (Object.keys(TOKEN_CLASS) as ColourKey[]).forEach(key=>{
      new Setting(c).setName(key.replace('_',' '))
        .addText(t=>{
          t.inputEl.type='color';
          t.setValue(this.plugin.settings.colours[key]??'');
          t.onChange(async v=>{
            if(!v||v==='#000000') delete this.plugin.settings.colours[key];
            else this.plugin.settings.colours[key]=v;
            await this.plugin.updateColours();
          });
        })
        .addExtraButton(b=>b.setIcon('reset').setTooltip('Theme default')
          .onClick(async()=>{
            delete this.plugin.settings.colours[key]; await this.plugin.updateColours(); this.display();
          }));
    });

    new Setting(c).addButton(b=>b.setButtonText('Reset all to theme defaults')
      .setCta().onClick(async()=>{
        this.plugin.settings.colours={}; await this.plugin.updateColours(); this.display();
      }));
  }
}
