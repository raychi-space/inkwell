import { useEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { createTurn, getTurn } from "./api";
import type {
  Assistant,
  EditorAgentAdapter,
  Proposal,
  SelectionSnapshot,
  TurnRequest,
} from "./types";
import { Select } from "../../shared/ui/Select";
import { errorMessage } from "../../shared/lib/errors";
interface Props {
  adapterRef: RefObject<EditorAgentAdapter | null>;
  previewHost: RefObject<HTMLDivElement | null>;
  title: string;
  available: Assistant[];
  assistantId: string;
  onAssistantChange: (id: string) => void;
  onLock: (value: boolean) => void;
  onBusy: (value: boolean) => void;
}
interface Entry {
  role: "user" | "assistant";
  content: string;
}
export function WritingAssistant({
  adapterRef,
  previewHost,
  title,
  available,
  assistantId,
  onAssistantChange,
  onLock,
  onBusy,
}: Props) {
  const [entries, setEntries] = useState<Entry[]>([]),
    [message, setMessage] = useState(""),
    [notice, setNotice] = useState("");
  const [selection, setSelection] = useState<SelectionSnapshot | null>(null),
    [proposal, setProposal] = useState<Proposal | null>(null);
  const [pending, setPending] = useState(false),
    [retry, setRetry] = useState<TurnRequest | null>(null);
  const [previewTop, setPreviewTop] = useState(0);
  const mounted = useRef(true),
    flight = useRef(false),
    decision = useRef(false),
    epoch = useRef(0);
  const historyHost = useRef<HTMLDivElement>(null);
  const callbacks = useRef({ onLock, onBusy, onAssistantChange });
  callbacks.current = { onLock, onBusy, onAssistantChange };
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      epoch.current++;
      callbacks.current.onLock(false);
      callbacks.current.onBusy(false);
    };
  }, []);
  useEffect(() => { historyHost.current?.scrollTo({ top: historyHost.current.scrollHeight }); }, [entries]);
  useEffect(() => {
    if (proposal?.kind === "replacement" && previewHost.current) {
      const anchor = adapterRef.current?.getAnchor(proposal.selectionId);
      if (anchor)
        setPreviewTop(
          Math.max(
            previewHost.current.scrollTop + 8,
            Math.min(
              anchor.getBoundingClientRect().bottom -
                previewHost.current.getBoundingClientRect().top +
                previewHost.current.scrollTop +
                8,
              previewHost.current.scrollTop +
                previewHost.current.clientHeight -
                340,
            ),
          ),
        );
    }
  }, [proposal, adapterRef, previewHost]);
  function clearSelection() {
    if (selection) adapterRef.current?.releaseSelection(selection.selectionId);
    setSelection(null);
    callbacks.current.onLock(false);
  }
  function capture() {
    if (flight.current || proposal) return;
    const value = adapterRef.current?.captureSelection();
    if (!value) {
      setNotice(
        "请先选择普通无格式段落中的文字。表格、图片、链接及复杂块选区暂不支持。",
      );
      return;
    }
    setSelection(value);
    setRetry(null);
    setNotice("已捕获选区，可在右侧填写修改要求。");
  }
  function recordDecision(value: string) {
    setEntries((v) => {
      const next = [...v];
      const last = next.at(-1);
      if (last?.role === "assistant")
        next[next.length - 1] = {
          ...last,
          content: last.content + "\n[建议" + value + "]",
        };
      return next;
    });
    setProposal(null);
    setRetry(null);
    clearSelection();
  }
  async function execute(request: TurnRequest, retrying = false) {
    if (flight.current || proposal) return;
    if (
      request.mode === "rewrite" &&
      (!request.context.selection ||
        !adapterRef.current?.validateSelection(
          request.context.selection.selectionId,
        ))
    ) {
      setNotice("原文已变化，请重新选择。");
      setRetry(null);
      clearSelection();
      return;
    }
    flight.current = true;
    decision.current = false;
    const runEpoch = ++epoch.current;
    setPending(true);
    callbacks.current.onBusy(true);
    setNotice("正在执行…");
    setRetry(null);
    if (request.mode === "rewrite") callbacks.current.onLock(true);
    if (!retrying)
      setEntries((v) => [
        ...(v.at(-1)?.role === "user" ? v.slice(0, -1) : v),
        { role: "user", content: request.message },
      ]);
    try {
      const created = await createTurn(request);
      let task = await getTurn(created.turnId);
      while (task.status === "pending" || task.status === "running") {
        await new Promise((r) => setTimeout(r, 1000));
        if (!mounted.current || runEpoch !== epoch.current) return;
        task = await getTurn(task.turnId);
      }
      if (!mounted.current || runEpoch !== epoch.current) return;
      if (task.status === "failed") {
        setEntries((v) => [
          ...v,
          {
            role: "assistant",
            content: "本轮失败：" + (task.error?.message ?? "执行失败。"),
          },
        ]);
        clearSelection();
        setNotice(task.error?.message ?? "执行失败。");
        return;
      }
      const result = task.result;
      if (!result) throw new Error("任务结果缺失。");
      setEntries((v) => [
        ...v,
        { role: "assistant", content: result.reply || "已生成建议，请确认。" },
      ]);
      setNotice("");
      const proposed = result.proposal;
      if (proposed?.kind === "replacement") {
        if (
          !["chat", "rewrite"].includes(request.mode) ||
          proposed.selectionId !== request.context.selection?.selectionId ||
          !adapterRef.current?.validateSelection(proposed.selectionId)
        ) {
          clearSelection();
          setNotice("原文已变化，请重新选择。");
          return;
        }
        if (proposed.newText === request.context.selection.beforeMarkdown) {
          clearSelection();
          setNotice("没有修改。");
          return;
        }
        callbacks.current.onLock(true);
        setProposal(proposed);
      } else if (proposed) {
        clearSelection();
        setNotice("结果类型不匹配，请重新发送。");
      } else if (!request.context.selection || !adapterRef.current?.validateSelection(request.context.selection.selectionId)) clearSelection();
    } catch (e) {
      if (mounted.current && runEpoch === epoch.current) {
        setNotice(errorMessage(e));
        setRetry(request);
        callbacks.current.onLock(false);
      }
    } finally {
      if (mounted.current && runEpoch === epoch.current) {
        flight.current = false;
        setPending(false);
        callbacks.current.onBusy(false);
      }
    }
  }
  function submit() {
    if (!assistantId || flight.current || proposal) return;
    const content = message.trim();
    if (!content) { setNotice("请输入消息。"); return; }
    const request: TurnRequest = {
      requestId: crypto.randomUUID(), assistantId, mode: "chat", message: content,
      history: (entries.at(-1)?.role === "user" ? entries.slice(0, -1) : entries).slice(-40),
      context: {
        title, documentMarkdown: adapterRef.current?.getCurrentMarkdown() ?? "",
        ...(selection ? { selection } : {}),
      },
    };
    setMessage("");
    void execute(request);
  }
  function accept() {
    if (decision.current || !proposal) return;
    decision.current = true;
    try {
      if (proposal.kind === "replacement") {
        if (!adapterRef.current)
          throw new Error("编辑器已重新加载，请重新选择。");
        adapterRef.current.applyReplacement(
          proposal.selectionId,
          proposal.newText,
        );
      } else throw new Error("结果类型不匹配。");
      recordDecision("已接受");
    } catch (e) {
      setNotice(errorMessage(e));
      recordDecision("已过期");
    }
  }
  const preview = proposal?.kind === "replacement" && (
    <section
      className="agent-replacement-preview"
      style={{ top: previewTop }}
      aria-label="选区修改建议"
    >
      <h3>选区修改建议</h3>
      <div className="agent-preview-diff">
      <div className="proposal-before">
        <strong>原文</strong>
        <pre>{selection?.beforeMarkdown}</pre>
      </div>
      <div className="proposal-after">
        <strong>{proposal.newText === "" ? "删除选区" : "新文"}</strong>
        <pre>{proposal.newText || "（将删除所选文字）"}</pre>
      </div>
      </div>
      <div className="actions">
        <button className="primary" onClick={accept}>
          接受
        </button>
        <button onClick={() => recordDecision("已拒绝")}>拒绝</button>
      </div>
    </section>
  );
  return (
    <section className="card writing-assistant" aria-label="写作对话">
      <header className="conversation-head">
        <h2>写作对话</h2>
        <Select label="选择助手" value={assistantId} onChange={id => {
          if (!pending && !proposal) { callbacks.current.onAssistantChange(id); }
        }} options={available.map(v => ({ value: v.id, label: v.name }))} />
      </header>
      <div className="agent-history" ref={historyHost} aria-live="polite" aria-label="对话记录">
        {!entries.length && <div className="conversation-empty"><strong>聊聊这篇文章</strong><p>{available.length ? "默认正常对话。引用选区后，明确提出修改要求，助手才会提供待确认的改写建议。" : "请先在助手管理中配置并启用助手。"}</p></div>}
        {entries.map((v, i) => <div key={i} className={"agent-message " + v.role}><small>{v.role === "user" ? "你" : "助手"}</small><p>{v.content}</p></div>)}
      </div>
      <div className="conversation-composer">
        {selection && <div className="agent-selection"><small>已引用选区</small><p>{selection.beforeMarkdown.slice(0, 100)}{selection.beforeMarkdown.length > 100 ? "…" : ""}</p><button disabled={pending || !!proposal} onClick={clearSelection}>移除引用</button></div>}
        <label>消息<textarea rows={3} value={message} onChange={e => setMessage(e.target.value)} disabled={pending || !!proposal} placeholder="聊聊想法，或明确告诉助手怎样改写引用的选区…" onKeyDown={e => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !e.nativeEvent.isComposing) { e.preventDefault(); submit(); }
        }} /></label>
        <div className="agent-actions">
          <button disabled={pending || !!proposal} onMouseDown={e => e.preventDefault()} onClick={capture}>引用选区</button>
          <button className="primary" disabled={pending || !!proposal || !assistantId} onClick={submit}>发送</button>
        </div>
        {notice && <p role="status" className="notice">{notice}</p>}
        {retry && <button disabled={pending || !!proposal} onClick={() => void execute(retry, true)}>重试本次提交</button>}
      </div>
      {preview && previewHost.current && createPortal(preview, previewHost.current)}
    </section>
  );
}
