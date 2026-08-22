import { useEffect, useRef, useState } from "react";
import { useStore } from "../lib/store";

let mmPromise: Promise<{ Transformer: typeof import("markmap-lib").Transformer; Markmap: typeof import("markmap-view").Markmap }> | null = null;
function loadMarkmap() {
  mmPromise ??= Promise.all([import("markmap-lib"), import("markmap-view")]).then(
    ([lib, view]) => ({ Transformer: lib.Transformer, Markmap: view.Markmap })
  );
  return mmPromise;
}

/** markmap 文字样式：强制覆盖默认的 currentColor（调色板色），
 *  深色主题白字、浅色主题深字，并用背景色描边让文字在任何底色上清晰 */
export function mmTextStyle(dark: boolean): string {
  return `
    .markmap-node text, text.markmap-node-text, .markmap-node-text {
      fill: ${dark ? "#ffffff" : "#1f2328"} !important;
      paint-order: stroke;
      stroke: ${dark ? "#1e2126" : "#f7f8fa"};
      stroke-width: 4px;
      stroke-linejoin: round;
    }
  `;
}

/** 全文大纲 → 思维导图（markmap，动态加载） */
export default function MindmapView({ dark }: { dark: boolean }) {
  const content = useStore((s) => s.content);
  const currentRel = useStore((s) => s.currentRel);
  const svgRef = useRef<SVGSVGElement>(null);
  const markmapRef = useRef<import("markmap-view").Markmap | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!svgRef.current) return;
    let cancelled = false;
    setError("");
    void loadMarkmap()
      .then(async ({ Transformer, Markmap }) => {
        if (cancelled) return;
        try {
          const transformer = new Transformer();
          // 去掉代码块避免噪音节点
          const clean = content.replace(/```[\s\S]*?```/g, "");
          const { root } = transformer.transform(clean || (currentRel ?? "空文档"));
          if (!markmapRef.current) {
            const palette = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"];
            markmapRef.current = Markmap.create(svgRef.current!, {
              autoFit: true,
              duration: 300,
              spacingVertical: 8,
              initialExpandLevel: 3,
              color: (node: { state?: { depth: number } }) => palette[(node?.state?.depth ?? 0) % palette.length],
              style: () => mmTextStyle(dark),
            }, root);
          } else {
            // 主题切换时刷新文字样式（markmap 的 style 注入在 svg 内的 <style> 元素）
            const styleEl = svgRef.current?.querySelector("style");
            if (styleEl) styleEl.textContent = mmTextStyle(dark);
            markmapRef.current.setData(root);
            markmapRef.current.fit();
          }
        } catch (e) {
          setError(String(e).slice(0, 200));
        }
      })
      .catch((e) => setError(String(e)));
    return () => {
      cancelled = true;
    };
  }, [content, currentRel, dark]);

  useEffect(() => () => { markmapRef.current?.destroy(); }, []);

  return (
    <div style={{ flex: 1, position: "relative", background: "var(--bg)" }}>
      {error && (
        <div style={{ position: "absolute", top: 8, left: 8, color: "#e11d48", fontSize: 12, zIndex: 2 }}>
          导图解析失败：{error}
        </div>
      )}
      <svg ref={svgRef} className="graph-canvas" style={{ width: "100%", height: "100%" }} />
    </div>
  );
}
