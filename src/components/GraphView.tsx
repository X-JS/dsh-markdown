import { useEffect, useRef, useState } from "react";
import { useStore } from "../lib/store";
import type { LinkEntry } from "../lib/api";

interface GNode {
  id: string;
  label: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  degree: number;
  depth: number; // 局部模式：距中心笔记的层数
}
interface GEdge {
  a: GNode;
  b: GNode;
}

type GraphMode = "local" | "global";
type LinkDir = "both" | "outgoing" | "incoming";

const idOf = (label: string) => label.replace(/\.md$/i, "").toLowerCase();

/**
 * 关系图谱：canvas 自绘力导向。
 * 全库模式 + 局部模式（当前笔记为中心，1–3 层邻居，方向过滤）——对齐 Obsidian Local Graph 的核心体验。
 * rAF 仅在挂载期间运行，收敛后降频。
 */
export default function GraphView() {
  const linkIndex = useStore((s) => s.linkIndex);
  const treeVersion = useStore((s) => s.treeVersion);
  const currentRel = useStore((s) => s.currentRel);
  const openFile = useStore((s) => s.openFile);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [mode, setMode] = useState<GraphMode>("local");
  const [depth, setDepth] = useState(1);
  const [dir, setDir] = useState<LinkDir>("both");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const parent = canvas.parentElement!;

    // ---- 建图 ----
    const nodeMap = new Map<string, GNode>();
    const edges: GEdge[] = [];

    const ensureNode = (label: string, depth: number): GNode => {
      const id = idOf(label);
      let n = nodeMap.get(id);
      if (!n) {
        n = {
          id,
          label: label.replace(/\.md$/i, ""),
          x: parent.clientWidth / 2 + (Math.random() - 0.5) * 300,
          y: parent.clientHeight / 2 + (Math.random() - 0.5) * 300,
          vx: 0,
          vy: 0,
          degree: 0,
          depth,
        };
        nodeMap.set(id, n);
      }
      if (depth < n.depth) n.depth = depth;
      return n;
    };

    const addEdge = (l: LinkEntry, depth: number) => {
      const a = ensureNode(l.source, depth);
      const b = ensureNode(l.target, depth + 1);
      if (a === b) return;
      a.degree++;
      b.degree++;
      edges.push({ a, b });
    };

    if (mode === "global") {
      for (const l of linkIndex) addEdge(l, 0);
    } else {
      // 局部：以当前笔记为中心 BFS 到 depth 层
      const centerId = currentRel ? idOf(currentRel) : null;
      if (!centerId) {
        return; // 无打开笔记时局部图谱为空
      }
      // 正向邻接（source 引用 target）与反向
      const fwd = new Map<string, LinkEntry[]>();
      const bwd = new Map<string, LinkEntry[]>();
      const norm = (s: string) => idOf(s);
      for (const l of linkIndex) {
        if (dir !== "incoming") {
          const arr = fwd.get(norm(l.source)) ?? [];
          arr.push(l);
          fwd.set(norm(l.source), arr);
        }
        if (dir !== "outgoing") {
          const tArr = bwd.get(norm(l.target)) ?? [];
          tArr.push(l);
          bwd.set(norm(l.target), tArr);
        }
      }
      const visited = new Set<string>([centerId]);
      let frontier = [centerId];
      ensureNode(currentRel!, 0);
      for (let d = 0; d < depth; d++) {
        const next: string[] = [];
        for (const id of frontier) {
          const outs = dir === "incoming" ? [] : fwd.get(id) ?? [];
          const ins = dir === "outgoing" ? [] : bwd.get(id) ?? [];
          for (const l of [...outs, ...ins]) {
            addEdge(l, d);
            const other = norm(l.source) === id ? norm(l.target) : norm(l.source);
            if (!visited.has(other)) {
              visited.add(other);
              next.push(other);
            }
          }
        }
        frontier = next;
      }
    }

    const nodes = Array.from(nodeMap.values());
    let raf = 0;
    const dpr = window.devicePixelRatio || 1;

    const resize = () => {
      canvas.width = parent.clientWidth * dpr;
      canvas.height = parent.clientHeight * dpr;
      canvas.style.width = `${parent.clientWidth}px`;
      canvas.style.height = `${parent.clientHeight}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(parent);

    const W = () => parent.clientWidth;
    const H = () => parent.clientHeight;
    const styles = getComputedStyle(document.documentElement);
    const textColor = styles.getPropertyValue("--text").trim() || "#333";
    const accent = styles.getPropertyValue("--accent").trim() || "#3b82f6";

    let alpha = 0.3;
    const step = () => {
      const W2 = W();
      const H2 = H();
      if (nodes.length < 3000) {
        for (let i = 0; i < nodes.length; i++) {
          const a = nodes[i];
          for (let j = i + 1; j < nodes.length; j++) {
            const b = nodes[j];
            let dx = a.x - b.x;
            let dy = a.y - b.y;
            let d2 = dx * dx + dy * dy;
            if (d2 < 1) { d2 = 1; dx = Math.random(); dy = Math.random(); }
            const f = Math.min(2200 / d2, 4);
            const d = Math.sqrt(d2);
            const fx = (dx / d) * f;
            const fy = (dy / d) * f;
            a.vx += fx; a.vy += fy;
            b.vx -= fx; b.vy -= fy;
          }
        }
        for (const e of edges) {
          const dx = e.b.x - e.a.x;
          const dy = e.b.y - e.a.y;
          const d = Math.sqrt(dx * dx + dy * dy) || 1;
          const f = (d - 120) * 0.002;
          const fx = (dx / d) * f;
          const fy = (dy / d) * f;
          e.a.vx += fx; e.a.vy += fy;
          e.b.vx -= fx; e.b.vy -= fy;
        }
        for (const n of nodes) {
          n.vx += (W2 / 2 - n.x) * 0.0004;
          n.vy += (H2 / 2 - n.y) * 0.0004;
          n.vx *= 0.85; n.vy *= 0.85;
          n.x += n.vx; n.y += n.vy;
          n.x = Math.max(40, Math.min(W2 - 40, n.x));
          n.y = Math.max(40, Math.min(H2 - 40, n.y));
        }
      }

      ctx.clearRect(0, 0, W2, H2);
      ctx.strokeStyle = "rgba(128,128,128,0.25)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (const e of edges) {
        ctx.moveTo(e.a.x, e.a.y);
        ctx.lineTo(e.b.x, e.b.y);
      }
      ctx.stroke();

      const centerId = currentRel ? idOf(currentRel) : null;
      for (const n of nodes) {
        const r = 4 + Math.min(n.degree, 8);
        const isCenter = mode === "local" && n.id === centerId;
        ctx.beginPath();
        ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
        // 局部模式按深度着色：中心红、一层主色、更远渐灰
        ctx.fillStyle = isCenter
          ? "#e11d48"
          : mode === "local"
          ? n.depth <= 1
            ? accent
            : n.depth === 2
            ? "color-mix(in srgb, " + accent + " 60%, #9ca3af)"
            : "#9ca3af"
          : n.degree > 0
          ? accent
          : "#9ca3af";
        ctx.fill();
        if (n.degree >= 1 || isCenter || mode === "local") {
          ctx.fillStyle = textColor;
          ctx.font = "11px -apple-system, sans-serif";
          ctx.textAlign = "center";
          ctx.fillText(n.label.slice(0, 18), n.x, n.y - r - 4);
        }
      }

      alpha *= 0.996;
      if (alpha > 0.005) {
        raf = requestAnimationFrame(step);
      } else {
        setTimeout(() => { raf = requestAnimationFrame(step); }, 500);
      }
    };
    raf = requestAnimationFrame(step);

    const hitTest = (mx: number, my: number): GNode | null => {
      for (const n of nodes) {
        const r = 4 + Math.min(n.degree, 8) + 6;
        if ((n.x - mx) ** 2 + (n.y - my) ** 2 < r * r) return n;
      }
      return null;
    };
    const onClick = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const n = hitTest(e.clientX - rect.left, e.clientY - rect.top);
      if (n) {
        import("../lib/api").then(async ({ api }) => {
          const all = await api.listAllNotes();
          const found = all.find((x) => x.relPath.toLowerCase().replace(/\.md$/, "") === n.id);
          if (found) void openFile(found.relPath);
        });
      }
    };
    canvas.addEventListener("click", onClick);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener("click", onClick);
    };
  }, [linkIndex, treeVersion, currentRel, openFile, mode, depth, dir]);

  return (
    <div style={{ flex: 1, position: "relative", background: "var(--bg)" }}>
      {/* 控制条：模式 / 深度 / 方向（对齐 Obsidian Local Graph 常用项） */}
      <div className="graph-controls no-print">
        <div className="graph-seg">
          <button className={mode === "local" ? "on" : ""} onClick={() => setMode("local")} title="以当前笔记为中心">局部</button>
          <button className={mode === "global" ? "on" : ""} onClick={() => setMode("global")} title="全库笔记">全库</button>
        </div>
        {mode === "local" && (
          <>
            <div className="graph-seg" title="邻域深度">
              {[1, 2, 3].map((d) => (
                <button key={d} className={depth === d ? "on" : ""} onClick={() => setDepth(d)}>
                  {d} 层
                </button>
              ))}
            </div>
            <div className="graph-seg" title="链接方向">
              <button className={dir === "outgoing" ? "on" : ""} onClick={() => setDir("outgoing")}>出链</button>
              <button className={dir === "incoming" ? "on" : ""} onClick={() => setDir("incoming")}>入链</button>
              <button className={dir === "both" ? "on" : ""} onClick={() => setDir("both")}>双向</button>
            </div>
          </>
        )}
      </div>
      {mode === "local" && !currentRel && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-faint)", pointerEvents: "none" }}>
          打开一篇笔记后显示其局部图谱
        </div>
      )}
      {mode === "global" && linkIndex.length === 0 && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-faint)", pointerEvents: "none" }}>
          暂无双向链接：在笔记中输入 [[笔记名]] 建立连接
        </div>
      )}
      <canvas ref={canvasRef} className="graph-canvas" />
    </div>
  );
}
