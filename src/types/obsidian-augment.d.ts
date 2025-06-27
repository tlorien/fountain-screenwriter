// src/obsidian-augment.d.ts
import 'obsidian';

declare module 'obsidian' {
  interface Editor {
    /** CodeMirror-5 event bus (available at runtime) */
    on(event: 'cursorActivity', callback: () => void): void;
    off(event: 'cursorActivity', callback: () => void): void;
  }
}
