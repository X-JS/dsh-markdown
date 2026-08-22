import type { LinkEntry } from "./api";

/** 从 markdown 提取 [[双链]]（去别名，排除 ![[嵌入]]） */
export function extractWikilinks(text: string): string[] {
  const out: string[] = [];
  const re = /(?<!\!)\[\[([^\[\]]+?)\]\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const name = m[1].split("|")[0].trim();
    if (name) out.push(name);
  }
  return out;
}

/** 从 markdown 提取大纲标题 */
export function extractOutline(text: string): { level: number; text: string; line: number }[] {
  const out: { level: number; text: string; line: number }[] = [];
  let inCode = false;
  text.split("\n").forEach((line, i) => {
    if (line.trim().startsWith("```")) inCode = !inCode;
    if (inCode) return;
    const m = /^(#{1,6})\s+(.*)$/.exec(line);
    if (m) out.push({ level: m[1].length, text: m[2].trim(), line: i });
  });
  return out;
}

/** 由链接索引计算某笔记的反向链接（谁引用了它） */
export function backlinksFor(
  linkIndex: LinkEntry[],
  noteRel: string
): LinkEntry[] {
  // 匹配规则：target 与笔记名（不含 .md）相同，或 target 是笔记的相对路径（不含扩展名）
  const base = noteRel.replace(/\.md$/i, "");
  const name = base.split("/").pop()!.toLowerCase();
  return linkIndex.filter((l) => {
    const t = l.target.toLowerCase();
    return t === name || t === base.toLowerCase() || t === `${base.toLowerCase()}.md`;
  });
}

/** 模糊匹配：快速打开用 */
export function fuzzyScore(query: string, target: string): number {
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  if (!q) return 1;
  let qi = 0;
  let score = 0;
  let streak = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      qi++;
      streak++;
      score += 1 + streak + (ti === 0 || "/ ._-" .includes(t[ti - 1]) ? 2 : 0);
    } else {
      streak = 0;
    }
  }
  return qi === q.length ? score : 0;
}
