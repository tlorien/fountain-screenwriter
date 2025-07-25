import esbuild from "esbuild";
import process from "process";
import builtins from "builtin-modules";

const banner = `
/*
THIS IS A GENERATED/BUNDLED FILE BY ESBUILD
if you want to view the source, please visit the github repository of this plugin
*/
`;

const prod = process.argv.includes("production");

const common = {
  bundle: true,
  banner: { js: banner },
  target: "es2020",
  logLevel: "info",
  sourcemap: prod ? false : "inline",
  treeShaking: true,
  minify: prod,
};

// Main plugin build
await esbuild.build({
  ...common,
  entryPoints: ["src/main.ts"],
  outfile: "main.js",
  format: "cjs",
  platform: "node",
  external: [
    "obsidian",
    "electron",
    "@codemirror/autocomplete",
    "@codemirror/collab",
    "@codemirror/commands",
    "@codemirror/language",
    "@codemirror/lint",
    "@codemirror/search",
    "@codemirror/state",
    "@codemirror/view",
    "@lezer/common",
    "@lezer/highlight",
    "@lezer/lr",
    ...builtins,
  ],
});

// Worker bundle
await esbuild.build({
  entryPoints: ["src/parser/parserWorker.ts"],
  bundle: true,
  outfile: "parserWorker.js",
  format: "iife",
  external: [],
  platform: "browser",
  globalName: "ParserWorker",
  sourcemap: prod ? false : "inline",
  treeShaking: true,
  minify: prod,
});
