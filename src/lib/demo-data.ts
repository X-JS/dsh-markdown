/**
 * 网页端演示模式：不依赖后端，用内存示例数据渲染页面，方便先看效果。
 * 由 browser-api.ts 决定是否启用（DEMO_MODE）。关闭后走真实 POST 接口。
 */

export const DEMO_MODE = true;
export const DEMO_USER = { username: "admin", password: "666666" };

export const DEMO_VAULT_ID = "v_demo";

export interface DemoNoteDef {
  path: string;
  title: string;
  content: string;
  dir?: string;
}

// 示例笔记（含 wikilink / mermaid / 图片）
export const DEMO_NOTES: DemoNoteDef[] = [
  {
    path: "欢迎使用.md",
    title: "欢迎使用 DSH Markdown",
    content: `# 欢迎使用 DSH Markdown

这是一个演示知识库，网页端当前使用**内存示例数据**，无需后端即可浏览界面效果。

## 你能做什么

- 左侧文件树：展开目录、右键新建 / 重命名 / 删除
- 编辑器：分栏编辑 + 预览同步
- [[双向链接]] 与 [[思维导图]] 跳转
- 右上角切换「导图」「图谱」视图

## 双向链接

试试点击下面的链接：

- [[快速开始]]
- [[项目规划]]
- [[读书笔记]]

## 流程图

\`\`\`mermaid
flowchart LR
  A[想法] --> B[记录] --> C[知识库]
\`\`\`

> 提示：点击工具栏可切换 分栏 / 预览 / 导图 / 图谱 视图。
`,
  },
  {
    path: "图片示例.md",
    title: "图片示例",
    content: `# 图片示例

外部图片（网络 URL）会自动加载：

![演示图片](https://picsum.photos/seed/dsh/600/300)

> 网页端演示模式下，粘贴图片会走 \`saveAttachment\`，但由于没有后端，这里仅演示 _相对路径_ 图片的渲染骨架。
`,
  },
  {
    path: "快速开始.md",
    title: "快速开始",
    content: `# 快速开始

三步上手：

1. 在左侧「新建」创建一篇笔记
2. 粘贴图片自动归档到 \`attachments/年/月\`
3. 输入 \`[[ \` 引用其它笔记

## 编辑快捷键

- \`Ctrl/⌘ + B\` 加粗 · \`I\` 斜体 · \`K\` 链接
- \`Ctrl/⌘ + S\` 保存 · \`Ctrl/⌘ + P\` 快速打开

回到 [[欢迎使用]]。
`,
  },
  {
    path: "项目规划.md",
    title: "项目规划",
    dir: "项目",
    content: `# 项目规划

## 里程碑

- [x] 界面骨架
- [x] Markdown 编辑与预览
- [ ] 图谱视图
- [ ] 云端同步

## 相关笔记

- [[快速开始]]
- [[读书笔记]]
`,
  },
  {
    path: "读书笔记.md",
    title: "读书笔记",
    dir: "笔记",
    content: `# 读书笔记

> 以 [[思维导图]] 脉络逐步展开，与 [[项目规划]] 关联。

## 要点

知识库的核心在于**双向链接**与**自动聚焦**。
`,
  },
  {
    path: "思维导图.md",
    title: "思维导图",
    content: `# 思维导图

\`\`\`markmap
# DSH
## 编辑
## 预览
## 双链
## 图谱
\`\`\`

用 \`markmap\` 或 \`mindmap\` 代码块即可在预览里生成导图。
`,
  },
];

export interface DemoNode {
  name: string;
  relPath: string;
  isDir: boolean;
  size: number;
  title: string | null;
}

const dirs = ["项目", "笔记", "待办"];

/** 拼出根目录 / 指定目录下的节点列表（模拟 listDir） */
export function demoListDir(rel: string): DemoNode[] {
  const base = rel ? `${rel}/` : "";
  if (!dirs.includes(rel)) {
    // 顶层：目录 + 根级笔记
    const top: DemoNode[] = dirs.map((d) => ({
      name: d,
      relPath: d,
      isDir: true,
      size: 0,
      title: null,
    }));
    for (const n of DEMO_NOTES) {
      if (!n.dir) top.push({ name: n.path, relPath: n.path, isDir: false, size: new Blob([n.content]).size, title: n.title });
    }
    return top;
  }
  // 子目录：是该目录下的笔记
  return DEMO_NOTES.filter((n) => n.dir === rel).map((n) => ({
    name: n.path.split("/").pop()!,
    relPath: n.path,
    isDir: false,
    size: new Blob([n.content]).size,
    title: n.title,
  }));
}

export function demoReadFile(path: string): { content: string; size: number; modified: number } {
  const n = DEMO_NOTES.find((x) => x.path === path);
  if (!n) throw new Error("演示笔记不存在");
  return { content: n.content, size: new Blob([n.content]).size, modified: Math.floor(Date.now() / 1000) };
}

export function demoAllNotes(): { relPath: string; title: string | null }[] {
  return DEMO_NOTES.map((n) => ({ relPath: n.path, title: n.title }));
}

/** 简易 wikilink 索引 */
export function demoIndexLinks(): { source: string; target: string }[] {
  const re = /\[\[([^\[\]]+?)\]\]/g;
  const out: { source: string; target: string }[] = [];
  for (const n of DEMO_NOTES) {
    let m: RegExpExecArray | null;
    const text = n.content;
    while ((m = re.exec(text))) {
      const t = m[1].split("|")[0].trim();
      if (t) out.push({ source: n.path, target: t });
    }
  }
  return out;
}
