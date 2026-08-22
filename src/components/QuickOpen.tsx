import { useEffect, useMemo, useRef, useState } from "react";
import { api, type NoteMetaItem } from "../lib/api";
import { useStore } from "../lib/store";
import { fuzzyScore } from "../lib/wikilink";

/** ⌘P 快速打开：全库笔记模糊搜索（不打开时不扫描，省资源） */
export default function QuickOpen({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [notes, setNotes] = useState<NoteMetaItem[] | null>(null);
  const [sel, setSel] = useState(0);
  const openFile = useStore((s) => s.openFile);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    void api.listAllNotes().then(setNotes).catch(() => setNotes([]));
  }, []);

  const results = useMemo(() => {
    if (!notes) return [];
    return notes
      .map((n) => ({ n, score: fuzzyScore(query, n.relPath) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 30)
      .map((x) => x.n);
  }, [notes, query]);

  useEffect(() => setSel(0), [query]);

  const pick = (rel: string) => {
    void openFile(rel);
    onClose();
  };

  return (
    <div className="quickopen-mask" onMouseDown={onClose}>
      <div className="quickopen" onMouseDown={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="input"
          placeholder="搜索笔记名…（回车打开，Esc 关闭）"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") onClose();
            if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(s + 1, results.length - 1)); }
            if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
            if (e.key === "Enter" && results[sel]) pick(results[sel].relPath);
          }}
          style={{ userSelect: "text" }}
        />
        <div className="qo-list">
          {notes === null && <div className="qo-item" style={{ color: "var(--text-faint)" }}>加载中…</div>}
          {notes !== null && results.length === 0 && (
            <div className="qo-item" style={{ color: "var(--text-faint)" }}>无匹配笔记</div>
          )}
          {results.map((n, i) => (
            <div key={n.relPath} className={`qo-item${i === sel ? " sel" : ""}`} onMouseEnter={() => setSel(i)} onClick={() => pick(n.relPath)}>
              <span>📝 {n.title || n.relPath.replace(/\.md$/i, "")}</span>
              <span className="qo-path">{n.relPath}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
