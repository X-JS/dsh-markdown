import { EditorState, type Extension } from "@codemirror/state";
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection, dropCursor, rectangularSelection, crosshairCursor, highlightSpecialChars } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { bracketMatching, indentOnInput, indentUnit, syntaxHighlighting, defaultHighlightStyle, foldGutter, foldKeymap, HighlightStyle, LanguageDescription } from "@codemirror/language";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { rust } from "@codemirror/lang-rust";
import { json } from "@codemirror/lang-json";
import { sql } from "@codemirror/lang-sql";
import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap, type CompletionContext } from "@codemirror/autocomplete";
import { highlightSelectionMatches, searchKeymap } from "@codemirror/search";
import { tags as t } from "@lezer/highlight";
import { EditorSelection } from "@codemirror/state";
import { fuzzyScore } from "./wikilink";
import { api } from "./api";

export interface NoteMeta {
  relPath: string;
  title: string | null;
}

/** wikilink [[ 补全：匹配全库笔记 */
function wikilinkCompletion(notes: () => NoteMeta[]) {
  return (ctx: CompletionContext) => {
    const before = ctx.matchBefore(/\[\[([^\[\]\n]*)$/);
    if (!before) return null;
    const query = before.text.slice(2);
    const list = notes()
      .map((n) => {
        const label = n.relPath.replace(/\.md$/i, "");
        return { label, detail: n.relPath };
      })
      .map((n) => ({ ...n, score: fuzzyScore(query, n.label) }))
      .filter((n) => n.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 12)
      .map((n) => ({ label: n.label, detail: n.detail, type: "text" }));
    return {
      from: before.from + 2,
      options: list,
      validFor: /^[^\[\]\n]*$/,
    };
  };
}

/** Cmd+B/I/K 与 Markdown 包裹快捷键 */
function wrapKeymap() {
  const wrap = (view: EditorView, open: string, close: string) => {
    const { from, to } = view.state.selection.main;
    const selected = view.state.sliceDoc(from, to);
    view.dispatch({
      changes: { from, to, insert: `${open}${selected}${close}` },
      selection: EditorSelection.range(from + open.length, to + open.length),
    });
    return true;
  };
  return keymap.of([
    { key: "Mod-b", run: (v) => wrap(v, "**", "**") },
    { key: "Mod-i", run: (v) => wrap(v, "*", "*") },
    { key: "Mod-k", run: (v) => wrap(v, "[", "](https://)") },
  ]);
}

/** 粘贴/拖拽图片 → 归档 attachments/年/月 → 插入引用 */
function attachmentHandlers(onSaved: () => void) {
  const handleFiles = async (view: EditorView, files: File[], pos: number) => {
    const images = files.filter((f) => f.type.startsWith("image/"));
    if (!images.length) return false;
    let insert = "";
    for (const f of images) {
      const buf = await f.arrayBuffer();
      const b64 = arrayBufferToBase64(buf);
      const name = f.name || `clipboard-${Date.now()}.png`;
      const rel = await api.saveAttachment(name, b64);
      insert += `\n![${name.replace(/\.[^.]+$/, "")}](${encodeURI(rel)})\n`;
    }
    view.dispatch({
      changes: { from: pos, insert },
      selection: { anchor: pos + insert.length },
    });
    onSaved();
    return true;
  };
  return EditorView.domEventHandlers({
    paste(event, view) {
      const dt = event.clipboardData;
      if (!dt) return false;
      const hasImage = Array.from(dt.items).some(
        (i) => i.kind === "file" && i.type.startsWith("image/")
      );
      if (!hasImage) return false;
      event.preventDefault();
      void handleFiles(view, filesFromItems(dt.items), view.state.selection.main.from).catch(() => {});
      return true;
    },
    drop(event, view) {
      const dt = event.dataTransfer;
      if (!dt || !Array.from(dt.files).some((f) => f.type.startsWith("image/"))) return false;
      const pos = view.posAtCoords({ x: event.clientX, y: event.clientY }) ?? view.state.selection.main.from;
      event.preventDefault();
      void handleFiles(view, Array.from(dt.files), pos).catch(() => {});
      return true;
    },
  });
}

function filesFromItems(items: DataTransferItemList): File[] {
  const files: File[] = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (it.kind === "file" && it.type.startsWith("image/")) {
      const f = it.getAsFile();
      if (f) files.push(f);
    }
  }
  return files;
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

const lightTheme = EditorView.theme({}, { dark: false });
const darkTheme = EditorView.theme(
  {
    "&": { color: "#e6e8ea", backgroundColor: "#1e2126" },
    ".cm-content": { caretColor: "#60a5fa" },
    ".cm-gutters": { backgroundColor: "#1e2126", color: "#6b7280", border: "none" },
    "&.cm-focused": { outline: "none" },
    ".cm-activeLine": { backgroundColor: "rgba(255,255,255,0.04)" },
    ".cm-activeLineGutter": { backgroundColor: "rgba(255,255,255,0.06)" },
    ".cm-selectionBackground, ::selection": { backgroundColor: "rgba(96,165,250,0.25)" },
    ".cm-cursor": { borderLeftColor: "#60a5fa" },
  },
  { dark: true }
);

const darkHighlight = syntaxHighlighting(
  HighlightStyle.define([
    { tag: t.heading, color: "#93c5fd", fontWeight: "600" },
    { tag: t.strong, color: "#fbbf24", fontWeight: "700" },
    { tag: t.emphasis, color: "#f472b6", fontStyle: "italic" },
    { tag: t.link, color: "#7cb1ff" },
    { tag: t.url, color: "#7cb1ff" },
    { tag: t.monospace, color: "#a5d6ff" },
    { tag: t.quote, color: "#9aa0a8" },
    { tag: t.processingInstruction, color: "#9aa0a8" },
  ])
);

export function createExtensions(opts: {
  dark: boolean;
  notes: () => NoteMeta[];
  currentDir: () => string;
  onAttachmentSaved: () => void;
  onPasteText?: (text: string, view: EditorView) => boolean;
}): Extension[] {
  const base: Extension[] = [
    lineNumbers(),
    highlightActiveLineGutter(),
    highlightSpecialChars(),
    history(),
    foldGutter(),
    drawSelection(),
    dropCursor(),
    EditorState.allowMultipleSelections.of(true),
    indentOnInput(),
    indentUnit.of("  "),
    bracketMatching(),
    closeBrackets(),
    rectangularSelection(),
    crosshairCursor(),
    highlightActiveLine(),
    highlightSelectionMatches(),
    autocompletion({
      override: [wikilinkCompletion(opts.notes)],
      activateOnTyping: true,
    }),
    keymap.of([
      ...closeBracketsKeymap,
      ...defaultKeymap,
      ...searchKeymap,
      ...historyKeymap,
      ...foldKeymap,
      ...completionKeymap,
      indentWithTab,
    ]),
    wrapKeymap(),
    attachmentHandlers(opts.onAttachmentSaved),
    EditorView.lineWrapping,
    markdown({
      base: markdownLanguage,
      // 代码块语言按需加载（遇到对应 fence 才 import 语法，省内存）
      codeLanguages: [
        LanguageDescription.of({
          name: "javascript",
          alias: ["js", "jsx", "mjs", "node"],
          extensions: ["js", "jsx", "mjs", "cjs"],
          async load() { return javascript({ typescript: false, jsx: true }); },
        }),
        LanguageDescription.of({
          name: "typescript",
          alias: ["ts", "tsx"],
          extensions: ["ts", "tsx"],
          async load() { return javascript({ typescript: true, jsx: true }); },
        }),
        LanguageDescription.of({
          name: "python",
          alias: ["py"],
          extensions: ["py"],
          load: () => import("@codemirror/lang-python").then((m) => m.python()),
        }),
        LanguageDescription.of({
          name: "rust",
          alias: ["rs"],
          extensions: ["rs"],
          load: () => import("@codemirror/lang-rust").then((m) => m.rust()),
        }),
        LanguageDescription.of({
          name: "json",
          extensions: ["json"],
          load: () => import("@codemirror/lang-json").then((m) => m.json()),
        }),
        LanguageDescription.of({
          name: "sql",
          extensions: ["sql"],
          load: () => import("@codemirror/lang-sql").then((m) => m.sql()),
        }),
        LanguageDescription.of({
          name: "css",
          extensions: ["css"],
          load: () => import("@codemirror/lang-css").then((m) => m.css()),
        }),
        LanguageDescription.of({
          name: "html",
          alias: ["xml"],
          extensions: ["html", "htm", "xml", "svg"],
          load: () => import("@codemirror/lang-html").then((m) => m.html()),
        }),
      ],
      addKeymap: true,
    }),
    opts.dark ? [darkTheme, darkHighlight] : [lightTheme, syntaxHighlighting(defaultHighlightStyle)],
    EditorView.theme({
      "&": { fontSize: "15px", height: "100%" },
      ".cm-scroller": {
        fontFamily: '"SF Mono", Menlo, Consolas, "PingFang SC", monospace',
        lineHeight: "1.7",
        padding: "16px 8px",
      },
      ".cm-content": { userSelect: "text" },
      "&.cm-focused": { outline: "none" },
    }),
  ];
  return base;
}
