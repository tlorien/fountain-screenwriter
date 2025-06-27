/* Line-class & inline-mark decorations for Fountain */

import {
  Decoration, DecorationSet, EditorView, ViewPlugin,
} from '@codemirror/view';
import {
  StateEffect, StateField, RangeSetBuilder, Extension,
} from '@codemirror/state';

/* ---------- public types ---------- */
export type TokenLine = { line: number; cls: string };
export type TokenMark = { from: number; to: number; cls: string };

/* ---------- public effects ---------- */
export const setHighlight = StateEffect.define<TokenLine[]>();
export const setMarks     = StateEffect.define<TokenMark[]>();

/* ------------------------------------------------------------------ */
/*  1.  Factory helpers                                                */
/* ------------------------------------------------------------------ */

export function fountainSyntaxDecorations(): Extension {
  return [lineField, markField, keepAlivePlugin];
}

export function fountainHighlightExtension(
  opts: { indent?: boolean } = {},
): Extension {
  const parts: Extension[] = [fountainSyntaxDecorations()];
  return parts;
}

/* ------------------------------------------------------------------ */
/*  2.  Private implementation                                         */
/* ------------------------------------------------------------------ */

/* ---------- line decorations ---------- */
const lineField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    for (const e of tr.effects) if (e.is(setHighlight)) {
      const b = new RangeSetBuilder<Decoration>();
      for (const { line, cls } of e.value) {
        if (line < 0 || line >= tr.state.doc.lines) continue;
        const pos = tr.state.doc.line(line + 1).from; // 1-based → pos
        b.add(pos, pos, Decoration.line({ class: cls }));
      }
      deco = b.finish();
    }
    return deco.map(tr.changes);
  },
  provide: f => EditorView.decorations.from(f),
});

/* ---------- inline marks ---------- */
const markField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    for (const e of tr.effects) if (e.is(setMarks)) {
      const b = new RangeSetBuilder<Decoration>();
      for (const { from, to, cls } of e.value) {
        if (from < to) b.add(from, to, Decoration.mark({ class: cls }));
      }
      deco = b.finish();
    }
    return deco.map(tr.changes);
  },
  provide: f => EditorView.decorations.from(f),
});

/* ---------- dummy plugin (keeps fields alive) ---------- */
const keepAlivePlugin = ViewPlugin.fromClass(class {});
