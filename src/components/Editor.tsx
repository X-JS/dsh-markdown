import { useEffect, useRef } from "react";
import { EditorView } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { createExtensions, type NoteMeta } from "../lib/cm";
import { useStore } from "../lib/store";

/**
 * CodeMirror 6 编辑器。
 * 视口增量渲染：10MB+ 文档也只渲染可见区域（大文件的关键）。
 * 外部内容变更（跳转/重载）通过重建 state 同步。
 */
export default function Editor({ notes, dark }: { notes: () => NoteMeta[]; dark: boolean }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const content = useStore((s) => s.content);
  const currentRel = useStore((s) => s.currentRel);
  const updateContent = useStore((s) => s.updateContent);
  const bumpTree = useStore((s) => s.bumpTree);

  // 文档切换 / 外部替换 → 重建
  useEffect(() => {
    if (!hostRef.current) return;
    const view = new EditorView({
      parent: hostRef.current,
      state: EditorState.create({
        doc: content,
        extensions: [
          ...createExtensions({
            dark,
            notes,
            currentDir: () => "",
            onAttachmentSaved: () => bumpTree(),
          }),
          EditorView.updateListener.of((v) => {
            if (v.docChanged) updateContent(v.state.doc.toString());
          }),
        ],
      }),
    });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // 仅在文件切换时重建编辑器实例；主题变化通过重建亦可接受（少见操作）
  }, [currentRel, dark]);

  // store → editor（外部内容变更：reload/跳转）
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== content) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: content },
      });
    }
  }, [content]);

  return <div ref={hostRef} className="editor-host" style={{ height: "100%", overflow: "hidden" }} />;
}
