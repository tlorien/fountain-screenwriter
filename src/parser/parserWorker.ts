/// <reference lib="webworker" />

import fountain from '@thombruce/fountain-js';

/*──────────────── helpers ───────────────────────────────────────────*/

/* remove YAML */
const stripFrontMatter = (s: string) => s.replace(/^---[\s\S]*?---\s*\n*/u, '');

/* generic plain-text stripper (drops <tags> and emphasis markup) */
const plain = (s: string) => s.replace(/<[^>]+>/g, '').replace(/[_*~]/g, '').trim();

/* heading “.EXT. … #12#” → EXT … */
const normHeading = (s: string) =>
  s.replace(/^\./, '')
   .replace(/\s+#[-A-Z0-9.]+#\s*$/i, '')
   .trim().toUpperCase();

/* character “@BRICK (V.O.)^” → BRICK */
const normChar = (s: string) =>
  s.replace(/^@/, '')
   .replace(/\s*\([^)]+\)\s*$/, '')
   .replace(/\s*\^\s*$/, '')
   .trim().toUpperCase();

/* lyrics, sections, synopsis, notes */
const normLyric   = (s: string) => s.replace(/^~\s*/, '').trim().toUpperCase();
const normSection = (s: string) => s.replace(/^#+\s*/, '').trim().toUpperCase();
const normSyn     = (s: string) => s.replace(/^=\s*/, '').trim().toUpperCase();
const normNote    = (s: string) => s.replace(/^\[\[|\]\]$/g, '').trim().toUpperCase();

/* centred “>TEXT<” */
const normCenter  = (s: string) =>
  s.replace(/^>\s*/, '').replace(/\s*<\s*$/, '').trim().toUpperCase();

/* forced transition “>BURN TO PINK” or “SMASH CUT TO:” */
const normTrans   = (s: string) =>
  s.replace(/^>\s*/, '').replace(/\s*:\s*$/, '').trim().toUpperCase();

/* title-page key whitelist */
const TP_KEYS = new Set([
  'title','credit','author','authors','source',
  'draft_date','date','contact'
]);

/*──────────────── worker ───────────────────────────────────────────*/

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = ({ data }) => {
  try {
    const original = String(data);
    const script   = stripFrontMatter(original);
    const srcLines = original.split(/\r?\n/);

    /* parse with fountain-js */
    const { tokens: raw = [] } = fountain.parse(script, true) as any;
    const tokens: any[] = [];

    /* 1. split multi-line tokens (<br>) */
    raw.forEach((tok: any) => {
      const parts = String(tok.text ?? '').split(/<br\s*\/?>/i);
      parts.forEach((txt, i) => {
        if (!txt.trim()) return;
        const t = { ...tok, text: txt.trim() };
        if (i > 0 && t.type === 'character') t.type = 'dialogue';
        tokens.push(t);
      });
    });

    /* 2. upgrade / re-classify */
    const extRx = /^([A-Z][A-Z0-9 ]+?)\s*\(([^)]+)\)$/i;
    const atRx  = /^@(.+)/i;

    for (const t of tokens) {
      if (!t.text) continue;

      /* @FORCED CHARACTER */
      const at = t.text.match(atRx);
      if (at) { t.type = 'character'; t.text = at[1].trim(); }

      /* lyric */
      if (t.type === 'action' && t.text.startsWith('~')) {
        t.type = 'lyric'; t.text = t.text.slice(1).trimStart();
      }

      /* extensions */
      if (t.type === 'action' || t.type === 'character') {
        const m = t.text.match(extRx);
        if (m) { t.type = 'character'; t.text = m[1].trim(); t.ext = m[2].trim(); }
      }

      /* >FORCED TRANS or >CENTER< */
      if (t.type === 'action' && t.text.startsWith('>')) {
        const stripped = t.text.slice(1).trim();
        if (stripped.endsWith('<')) {
          t.type = 'centered'; t.text = stripped.slice(0, -1).trim();
        } else {
          t.type = 'transition'; t.text = stripped;
        }
      }

      /* dual caret */
      if (t.type === 'character' && /\^\s*$/.test(t.text)) {
        t.text = t.text.replace(/\^\s*$/, '').trimEnd(); t.dual = true;
      }

      if (t.type === 'dialogue' && /^\~/.test(t.text)) {
        t.type = 'lyric';
        t.text = t.text.slice(1).trim();
      }
    }
    

    /* 3. attach accurate line numbers */
    let cursor = 0;
    for (const t of tokens) {
      if (!t.text) { t.line = -1; continue; }

      const target =
        t.type === 'scene_heading' ? normHeading(t.text) :
        t.type === 'character'     ? normChar(t.text)    :
        t.type === 'lyric'         ? normLyric(t.text)   :
        t.type === 'section'       ? normSection(t.text) :
        t.type === 'synopsis'      ? normSyn(t.text)     :
        t.type === 'note'          ? normNote(t.text)    :
        t.type === 'centered'      ? normCenter(t.text)  :
        t.type === 'transition'    ? normTrans(t.text)   :
        TP_KEYS.has(t.type)        ? t.text.trim().toUpperCase() :
        plain(t.text).toUpperCase();

      let found = -1;
      for (let ln = cursor; ln < srcLines.length; ln++) {
        const src = srcLines[ln].trim();
        const probe =
          t.type === 'scene_heading' ? normHeading(src) :
          t.type === 'character'     ? normChar(src)    :
          t.type === 'lyric'         ? normLyric(src)   :
          t.type === 'section'       ? normSection(src) :
          t.type === 'synopsis'      ? normSyn(src)     :
          t.type === 'note'          ? normNote(src)    :
          t.type === 'centered'      ? normCenter(src)  :
          t.type === 'transition'    ? normTrans(src)   :
          TP_KEYS.has(t.type)        ? src.replace(/^[A-Z ]+:\s*/i,'').trim().toUpperCase() :
          plain(src).toUpperCase();

        if (probe === target) { found = ln; cursor = ln + 1; break; }
      }
      t.line = found;
    }

    /* 4. second pass: dialogue block promotion */
    const blankBetween = (from: number, to: number) =>
      srcLines.slice(from + 1, to).some(l => /^\s*$/.test(l));

    for (let i = 0; i < tokens.length; i++) {
      const cue = tokens[i];
      if (cue.type !== 'character') continue;

      let j = i + 1;
      let prev = cue.line;

      if (
        j < tokens.length &&
        tokens[j].text?.trimStart().startsWith('(') &&
        !blankBetween(prev, tokens[j].line)
      ) {
        tokens[j].type = 'parenthetical';
        if (cue.dual) tokens[j].dual = true;
        prev = tokens[j].line; j++;
      }

      for (; j < tokens.length; j++) {
        const t = tokens[j];
        if (t.line === -1) continue;
        if (
          ['character','scene_heading','section','transition','lyric']
            .includes(t.type)
        ) break;
        if (blankBetween(prev, t.line)) break;

        t.type = t.text.trimStart().startsWith('(') ? 'parenthetical' : 'dialogue';
        if (cue.dual) t.dual = true;
        prev = t.line;
      }
    }

    ctx.postMessage({ tokens });
  } catch (e) {
    ctx.postMessage({ error: (e as Error).message });
  }
};

export {};
