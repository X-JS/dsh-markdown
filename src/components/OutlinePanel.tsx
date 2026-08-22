import { useMemo } from "react";
import { useStore } from "../lib/store";
import { extractOutline } from "../lib/wikilink";

/** 文档大纲：点击标题滚动编辑器/预览到对应位置 */
export default function OutlinePanel({ onJump }: { onJump: (line: number) => void }) {
  const content = useStore((s) => s.content);
  const headings = useMemo(() => extractOutline(content), [content]);

  return (
    <div style={{ overflowY: "auto", padding: "8px 6px" }}>
      {headings.length === 0 && (
        <div style={{ padding: 12, color: "var(--text-faint)", fontSize: 12 }}>暂无标题（用 # 创建）</div>
      )}
      {headings.map((h, i) => (
        <div
          key={i}
          className="ctx-item"
          style={{ paddingLeft: 10 + (h.level - 1) * 12, fontSize: 13, color: h.level <= 2 ? "var(--text)" : "var(--text-secondary)" }}
          onClick={() => onJump(h.line)}
          title={h.text}
        >
          {h.level <= 2 ? <b>{h.text}</b> : h.text}
        </div>
      ))}
    </div>
  );
}
