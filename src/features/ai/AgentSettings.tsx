import { useEffect, useState, type FormEvent } from "react";
import {
  providers,
  assistants,
  saveProvider,
  saveAssistant,
  testProvider,
} from "./api";
import type { Provider, Assistant } from "./types";
import { Select } from "../../shared/components/Select";
import { errorMessage } from "../../shared/errors";
const emptyProvider = { name: "", enabled: true, baseUrl: "", models: "" };
const emptyAssistant = {
  name: "",
  enabled: true,
  providerId: "",
  model: "",
  systemPrompt: "",
  fixedContext: "",
  maxOutputTokens: 1024,
  historyTurns: 6,
  maxContextChars: 131072,
  timeoutMs: 30000,
};
export function AgentSettings() {
  const [allProviders, setProviders] = useState<Provider[]>([]),
    [allAssistants, setAssistants] = useState<Assistant[]>([]);
  const [providerId, setProviderId] = useState<string | null>(null),
    [assistantId, setAssistantId] = useState<string | null>(null);
  const [p, setP] = useState(emptyProvider),
    [a, setA] = useState(emptyAssistant);
  const [key, setKey] = useState(""),
    [keyAction, setKeyAction] = useState("retain");
  const [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const [testModel, setTestModel] = useState("");
  async function refresh() {
    const [ps, as] = await Promise.all([providers(), assistants()]);
    setProviders(ps);
    setAssistants(as);
  }
  useEffect(() => {
    void refresh().catch((e) => setNotice(errorMessage(e)));
  }, []);
  function editProvider(value: Provider) {
    setProviderId(value.id);
    setP({
      name: value.name,
      enabled: value.enabled,
      baseUrl: value.baseUrl,
      models: value.models.join("\n"),
    });
    setKey("");
    setKeyAction("retain");
    setTestModel(value.models[0] ?? "");
    setNotice("");
  }
  function editAssistant(value: Assistant) {
    setAssistantId(value.id);
    setA({
      name: value.name,
      enabled: value.enabled,
      providerId: value.providerId,
      model: value.model,
      systemPrompt: value.systemPrompt,
      fixedContext: value.fixedContext,
      maxOutputTokens: value.generationOptions.maxOutputTokens,
      historyTurns: value.historyTurns,
      maxContextChars: value.maxContextChars,
      timeoutMs: value.timeoutMs,
    });
    setNotice("");
  }
  async function submitProvider(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const saved = await saveProvider(providerId, {
        ...p,
        type: "openai-compatible",
        models: p.models
          .split("\n")
          .map((v) => v.trim())
          .filter(Boolean),
        apiKeyAction: keyAction,
        ...(keyAction === "replace" ? { apiKey: key } : {}),
      });
      editProvider(saved);
      await refresh();
      setNotice("服务商已保存。查询不会返回密钥。");
    } catch (e) {
      setNotice(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function submitAssistant(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const { maxOutputTokens, ...rest } = a;
      const saved = await saveAssistant(assistantId, {
        ...rest,
        generationOptions: { maxOutputTokens },
      });
      editAssistant(saved);
      await refresh();
      setNotice("助手已保存，新任务使用此配置。");
    } catch (e) {
      setNotice(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function test() {
    if (!providerId) return;
    setBusy(true);
    try {
      const result = await testProvider(providerId, testModel);
      setNotice(
        `聊天连接：${result.connection.ok ? "通过" : "失败（" + result.connection.error + "）"}；工具与结果 Schema：${result.tools.ok ? "通过" : "未通过（" + result.tools.error + "）"}。${result.durationMs} ms`,
      );
    } catch (e) {
      setNotice(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="workspace studio-page agent-settings">
      <header className="studio-head">
        <div>
          <p className="eyebrow">AI WORKSPACE</p>
          <h1>写作助手配置</h1>
          <p>配置模型服务商与助手。建议在编辑器中确认后才会应用。</p>
        </div>
      </header>
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      <div className="agent-settings-grid">
        <section className="card">
          <h2>模型服务商</h2>
          <div className="agent-config-list">
            {allProviders.map((v) => (
              <button key={v.id} onClick={() => editProvider(v)}>
                {v.name} · {v.enabled ? "启用" : "停用"} ·{" "}
                {v.hasApiKey ? "密钥已保存" : "无密钥"}
              </button>
            ))}
            <button
              onClick={() => {
                setProviderId(null);
                setP(emptyProvider);
                setKey("");
                setKeyAction("replace");
              }}
            >
              新增服务商
            </button>
          </div>
          <form onSubmit={(e) => void submitProvider(e)} className="fields">
            <label>
              服务商名称
              <input
                required
                value={p.name}
                onChange={(e) => setP({ ...p, name: e.target.value })}
              />
            </label>
            <label>
              <input
                type="checkbox"
                checked={p.enabled}
                onChange={(e) => setP({ ...p, enabled: e.target.checked })}
              />
              启用服务商
            </label>
            <label>
              API 地址
              <input
                required
                placeholder="https://api.example.com/v1"
                value={p.baseUrl}
                onChange={(e) => setP({ ...p, baseUrl: e.target.value })}
              />
            </label>
            <label>
              模型 ID（每行一个）
              <textarea
                required
                rows={3}
                value={p.models}
                onChange={(e) => setP({ ...p, models: e.target.value })}
              />
            </label>
            <Select
              label="密钥操作"
              value={keyAction}
              onChange={setKeyAction}
              options={[
                { value: "retain", label: "保留已保存密钥" },
                { value: "replace", label: "设置或替换密钥" },
                { value: "clear", label: "清除已保存密钥" },
              ]}
            />
            {keyAction === "replace" && (
              <label>
                API Key
                <input
                  type="password"
                  autoComplete="new-password"
                  required
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                />
              </label>
            )}
            <button className="primary" disabled={busy}>
              保存服务商
            </button>
          </form>
          {providerId && (
            <div className="fields">
              <Select
                label="测试模型"
                value={testModel}
                onChange={setTestModel}
                options={(
                  allProviders.find((v) => v.id === providerId)?.models ?? []
                ).map((v) => ({ value: v, label: v }))}
              />
              <button disabled={busy || !testModel} onClick={() => void test()}>
                测试连接与工具
              </button>
              <small>使用已保存配置分别测试聊天连接和快照/结果工具能力。</small>
            </div>
          )}
        </section>
        <section className="card">
          <h2>助手</h2>
          <div className="agent-config-list">
            {allAssistants.map((v) => (
              <button key={v.id} onClick={() => editAssistant(v)}>
                {v.name} · {v.enabled ? "启用" : "停用"}
              </button>
            ))}
            <button
              onClick={() => {
                setAssistantId(null);
                setA(emptyAssistant);
              }}
            >
              新增助手
            </button>
          </div>
          <form onSubmit={(e) => void submitAssistant(e)} className="fields">
            <label>
              助手名称
              <input
                required
                value={a.name}
                onChange={(e) => setA({ ...a, name: e.target.value })}
              />
            </label>
            <label>
              <input
                type="checkbox"
                checked={a.enabled}
                onChange={(e) => setA({ ...a, enabled: e.target.checked })}
              />
              启用助手
            </label>
            <Select
              label="模型服务商"
              value={a.providerId}
              onChange={(v) =>
                setA({
                  ...a,
                  providerId: v,
                  model: allProviders.find((p) => p.id === v)?.models[0] ?? "",
                })
              }
              options={[
                { value: "", label: "请选择服务商" },
                ...allProviders.map((v) => ({ value: v.id, label: v.name })),
              ]}
            />
            <Select
              label="助手模型"
              value={a.model}
              onChange={(v) => setA({ ...a, model: v })}
              options={[
                { value: "", label: "请选择模型" },
                ...(
                  allProviders.find((v) => v.id === a.providerId)?.models ?? []
                ).map((v) => ({ value: v, label: v })),
              ]}
            />
            <label>
              身份与写作提示词
              <textarea
                required
                rows={5}
                value={a.systemPrompt}
                onChange={(e) => setA({ ...a, systemPrompt: e.target.value })}
              />
            </label>
            <label>
              固定背景资料
              <textarea
                rows={4}
                value={a.fixedContext}
                onChange={(e) => setA({ ...a, fixedContext: e.target.value })}
              />
            </label>
            <label>
              最大输出 Token
              <input
                type="number"
                min={128}
                max={8192}
                value={a.maxOutputTokens}
                onChange={(e) =>
                  setA({ ...a, maxOutputTokens: Number(e.target.value) })
                }
              />
            </label>
            <label>
              保留完整对话轮数
              <input
                type="number"
                min={0}
                max={20}
                value={a.historyTurns}
                onChange={(e) =>
                  setA({ ...a, historyTurns: Number(e.target.value) })
                }
              />
            </label>
            <label>
              上下文字符预算
              <input
                type="number"
                min={1024}
                max={500000}
                value={a.maxContextChars}
                onChange={(e) =>
                  setA({ ...a, maxContextChars: Number(e.target.value) })
                }
              />
            </label>
            <label>
              执行超时（毫秒）
              <input
                type="number"
                min={100}
                max={120000}
                value={a.timeoutMs}
                onChange={(e) =>
                  setA({ ...a, timeoutMs: Number(e.target.value) })
                }
              />
            </label>
            <button
              className="primary"
              disabled={busy || !a.providerId || !a.model}
            >
              保存助手
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
