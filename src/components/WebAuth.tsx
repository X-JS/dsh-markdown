import { useEffect, useState } from "react";
import { useStore } from "../lib/store";
import { login, register, listVaults, createVault } from "../lib/browser-api";

/**
 * 浏览器 Web 版登录 + 知识库选择 UI（纯展示组件）。
 * 登录态编排在 App.tsx：先 WebLogin，再 WebVaultPicker，最后进入主应用。
 */

interface VaultItem {
  id: string;
  name: string;
  noteCount?: number;
  updatedAt?: string;
}

export function WebLogin({ onAuthed }: { onAuthed: () => void }) {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("666666");
  const [mode, setMode] = useState<"login" | "register">("login");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    if (!username.trim() || !password) {
      setError("请输入账号和密码");
      return;
    }
    setBusy(true);
    setError("");
    try {
      if (mode === "register") await register(username.trim(), password);
      else await login(username.trim(), password);
      onAuthed();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="app-shell">
      <div className="welcome" style={{ flex: 1, minHeight: 0 }}>
        <div style={{ fontSize: 56 }}>🗂</div>
        <div style={{ fontSize: 20, fontWeight: 600, color: "var(--text)" }}>登录 DSH Markdown</div>
        <div style={{ maxWidth: 360, textAlign: "center", lineHeight: 1.8 }}>
          使用后端数据服务的账号与密码登录，然后选择或创建你的知识库。
          <br />
          <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>演示账号：admin / 666666（已预填）</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, width: 320 }}>
          <input
            className="input"
            placeholder="账号"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void submit()}
            style={{ userSelect: "text" }}
          />
          <input
            className="input"
            type="password"
            placeholder="密码"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void submit()}
            style={{ userSelect: "text" }}
          />
          {error && <div style={{ fontSize: 12, color: "var(--danger, #e5534b)" }}>{error}</div>}
          <button className="btn primary" disabled={busy} onClick={() => void submit()}>
            {busy ? "请稍候…" : mode === "login" ? "登录" : "注册并登录"}
          </button>
          <button className="btn" disabled={busy} onClick={() => setMode(mode === "login" ? "register" : "login")}>
            {mode === "login" ? "没有账号？去注册" : "已有账号？去登录"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function WebVaultPicker({ onPicked }: { onPicked: () => void }) {
  const selectVault = useStore((s) => s.selectVault);
  const [vaults, setVaults] = useState<VaultItem[]>([]);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void listVaults()
      .then((v) => setVaults(v ?? []))
      .catch(() => setVaults([]));
  }, []);

  const pick = async (id: string) => {
    setBusy(true);
    setError("");
    try {
      await selectVault(id);
      onPicked();
    } catch (e: any) {
      setError(e?.message || String(e));
      setBusy(false);
    }
  };

  const create = async () => {
    if (!name.trim()) return;
    setBusy(true);
    setError("");
    try {
      const v = await createVault(name.trim());
      await pick(v?.id ?? name.trim());
    } catch (e: any) {
      setError(e?.message || String(e));
      setBusy(false);
    }
  };

  return (
    <div className="app-shell">
      <div className="welcome" style={{ flex: 1, minHeight: 0 }}>
        <div style={{ fontSize: 48 }}>📚</div>
        <div style={{ fontSize: 20, fontWeight: 600, color: "var(--text)" }}>选择知识库</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, width: 360, maxHeight: "50vh", overflowY: "auto" }}>
          {vaults.length === 0 && (
            <div style={{ fontSize: 13, color: "var(--text-faint)" }}>暂无知识库，可新建一个</div>
          )}
          {vaults.map((v) => (
            <button key={v.id} className="btn" disabled={busy} onClick={() => void pick(v.id)} style={{ textAlign: "left" }}>
              📁 {v.name}
              {typeof v.noteCount === "number" ? (
                <span style={{ float: "right", fontSize: 12, color: "var(--text-faint)" }}>{v.noteCount}</span>
              ) : null}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, width: 360 }}>
          <input
            className="input"
            placeholder="新建知识库名称"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void create()}
            style={{ flex: 1, userSelect: "text" }}
          />
          <button className="btn primary" disabled={busy || !name.trim()} onClick={() => void create()}>
            新建
          </button>
        </div>
        {error && <div style={{ fontSize: 12, color: "var(--danger, #e5534b)" }}>{error}</div>}
      </div>
    </div>
  );
}
