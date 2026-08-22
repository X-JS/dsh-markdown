import { useMemo } from "react";
import { useStore } from "../lib/store";
import { backlinksFor } from "../lib/wikilink";

/** 反向链接：谁引用了当前笔记 */
export default function BacklinkPanel() {
  const currentRel = useStore((s) => s.currentRel);
  const linkIndex = useStore((s) => s.linkIndex);
  const linkVersion = useStore((s) => s.linkVersion);
  const openFile = useStore((s) => s.openFile);

  const backlinks = useMemo(() => {
    void linkVersion;
    if (!currentRel) return [];
    return backlinksFor(linkIndex, currentRel);
  }, [currentRel, linkIndex, linkVersion]);

  const outgoing = useMemo(() => {
    if (!currentRel) return [];
    return linkIndex.filter((l) => l.source === currentRel);
  }, [currentRel, linkIndex]);

  if (!currentRel) {
    return <div style={{ padding: 12, color: "var(--text-faint)", fontSize: 12 }}>打开一篇笔记后显示链接</div>;
  }

  return (
    <div style={{ overflowY: "auto", padding: "8px 6px", fontSize: 13 }}>
      <div style={{ padding: "6px 10px", color: "var(--text-faint)", fontSize: 12 }}>← 引用本笔记（{backlinks.length}）</div>
      {backlinks.map((l, i) => (
        <div key={i} className="ctx-item" onClick={() => void openFile(l.source)} title={l.source}>
          📝 {l.source}
        </div>
      ))}
      {backlinks.length === 0 && <div style={{ padding: "2px 10px 10px", color: "var(--text-faint)" }}>暂无来源</div>}

      <div style={{ padding: "12px 10px 6px", color: "var(--text-faint)", fontSize: 12 }}>→ 本笔记引用（{outgoing.length}）</div>
      {outgoing.map((l, i) => (
        <div key={i} className="ctx-item" title={`目标：${l.target}`}>
          🔗 {l.target}
        </div>
      ))}
      {outgoing.length === 0 && <div style={{ padding: "2px 10px", color: "var(--text-faint)" }}>暂无出链</div>}
    </div>
  );
}
