import { useEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { assistants, createTurn, getTurn } from "./api";
import type {
  Assistant,
  EditorAgentAdapter,
  Proposal,
  SelectionSnapshot,
  TurnRequest,
  WritingMode,
} from "./types";
import { Select } from "../../shared/components/Select";
import { errorMessage } from "../../shared/errors";
interface Props {
  adapterRef: RefObject<EditorAgentAdapter | null>;
  previewHost: RefObject<HTMLDivElement | null>;
  title: string;
  summary: string;
  onSummary: (value: string) => void;
  onLock: (value: boolean) => void;
  onBusy: (value: boolean) => void;
  canSummarize: boolean;
}
interface Entry {
  role: "user" | "assistant";
  content: string;
}
export function WritingAssistant({
  adapterRef,
  previewHost,
  title,
  summary,
  onSummary,
  onLock,
  onBusy,
  canSummarize,
}: Props) {
  const [available, setAvailable] = useState<Assistant[]>([]),
    [assistantId, setAssistantId] = useState("");
  const [entries, setEntries] = useState<Entry[]>([]),
    [message, setMessage] = useState(""),
    [notice, setNotice] = useState("");
  const [selection, setSelection] = useState<SelectionSnapshot | null>(null),
    [proposal, setProposal] = useState<Proposal | null>(null);
  const [pending, setPending] = useState(false),
    [retry, setRetry] = useState<TurnRequest | null>(null);
  const [snapshot, setSnapshot] = useState<{
    body: string;
    summary: string;
    title: string;
  } | null>(null);
  const [previewTop, setPreviewTop] = useState(0);
  const mounted = useRef(true),
    flight = useRef(false),
    decision = useRef(false),
    epoch = useRef(0);
  const callbacks = useRef({ onLock, onBusy });
  callbacks.current = { onLock, onBusy };
  useEffect(() => {
    mounted.current = true;
    void assistants()
      .then((items) => {
        if (mounted.current) {
          const enabled = items.filter((v) => v.enabled);
          setAvailable(enabled);
          setAssistantId(enabled[0]?.id ?? "");
        }
      })
      .catch((e) => {
        if (mounted.current) setNotice(errorMessage(e));
      });
    return () => {
      mounted.current = false;
      epoch.current++;
      callbacks.current.onLock(false);
      callbacks.current.onBusy(false);
    };
  }, []);
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
          request.mode !== "rewrite" ||
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
        setProposal(proposed);
      } else if (proposed?.kind === "summary") {
        if (request.mode !== "summarize") {
          setNotice("结果类型不匹配。");
          return;
        }
        setSnapshot({
          body: request.context.documentMarkdown ?? "",
          summary: request.context.currentSummary ?? "",
          title: request.context.title,
        });
        setProposal(proposed);
      } else clearSelection();
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
  function submit(mode: WritingMode) {
    if (!assistantId || flight.current || proposal) return;
    if (mode === "rewrite" && !selection) {
      setNotice("请先在正文中选择文字，再点击“交给助手”。");
      return;
    }
    const content =
      message.trim() ||
      (mode === "summarize"
        ? "请为全文生成简洁摘要。"
        : mode === "rewrite"
          ? "请润色选区，保留原意。"
          : "");
    if (!content) {
      setNotice("请输入消息。");
      return;
    }
    const request: TurnRequest = {
      requestId: crypto.randomUUID(),
      assistantId,
      mode,
      message: content,
      history: (entries.at(-1)?.role === "user"
        ? entries.slice(0, -1)
        : entries
      ).slice(-40),
      context: {
        title,
        ...(selection ? { selection } : {}),
        ...(mode !== "rewrite"
          ? { documentMarkdown: adapterRef.current?.getCurrentMarkdown() ?? "" }
          : {}),
        ...(mode === "summarize" ? { currentSummary: summary } : {}),
      },
    };
    setMessage("");
    void execute(request);
  }
  const stale =
    proposal?.kind === "summary" &&
    snapshot &&
    (snapshot.body !== adapterRef.current?.getCurrentMarkdown() ||
      snapshot.summary !== summary ||
      snapshot.title !== title);
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
      } else {
        if (stale) throw new Error("内容或摘要已变化，请重新生成。");
        onSummary(proposal.summary);
      }
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
      <div className="proposal-before">
        <strong>原文</strong>
        <pre>{selection?.beforeMarkdown}</pre>
      </div>
      <div className="proposal-after">
        <strong>{proposal.newText === "" ? "删除选区" : "新文"}</strong>
        <pre>{proposal.newText || "（将删除所选文字）"}</pre>
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
    <section className="card writing-assistant" aria-label="写作助手">
      <h2>写作助手</h2>
      <Select
        label="选择助手"
        value={assistantId}
        onChange={(v) => {
          if (!pending && !proposal) setAssistantId(v);
        }}
        options={available.map((v) => ({ value: v.id, label: v.name }))}
      />
      {!available.length && <p>请先在“助手管理”中配置并启用助手。</p>}
      <div className="agent-history" aria-live="polite">
        {entries.map((v, i) => (
          <div key={i} className={"agent-message " + v.role}>
            <small>{v.role === "user" ? "你" : "助手"}</small>
            <p>{v.content}</p>
          </div>
        ))}
      </div>
      <button
        disabled={pending || !!proposal}
        onMouseDown={(e) => e.preventDefault()}
        onClick={capture}
      >
        交给助手
      </button>
      {selection && (
        <p className="agent-selection">
          已捕获选区：{selection.beforeMarkdown.slice(0, 100)}
          {selection.beforeMarkdown.length > 100 ? "…" : ""}
          <button disabled={pending || !!proposal} onClick={clearSelection}>
            清除选区
          </button>
        </p>
      )}
      <label>
        消息
        <textarea
          rows={3}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          disabled={pending || !!proposal}
          placeholder="讨论想法，或描述修改要求…"
        />
      </label>
      <div className="agent-actions">
        <button
          disabled={pending || !!proposal || !assistantId}
          onClick={() => submit("chat")}
        >
          发送
        </button>
        <button
          disabled={pending || !!proposal || !assistantId}
          onClick={() => submit("rewrite")}
        >
          修改选区
        </button>
        <button
          disabled={pending || !!proposal || !assistantId || !canSummarize}
          onClick={() => submit("summarize")}
        >
          生成摘要
        </button>
      </div>
      {notice && (
        <p role="status" className="notice">
          {notice}
        </p>
      )}
      {retry && (
        <button
          disabled={pending || !!proposal}
          onClick={() => void execute(retry, true)}
        >
          重试本次提交
        </button>
      )}
      {proposal?.kind === "summary" && (
        <section className="agent-summary-proposal" aria-label="摘要建议">
          <h3>摘要建议</h3>
          <p>{proposal.summary}</p>
          {stale && (
            <p role="status">
              建议已过期：正文、标题或摘要已变化，请重新生成。
            </p>
          )}
          <button disabled={!!stale} onClick={accept}>
            应用摘要
          </button>
          <button onClick={() => recordDecision(stale ? "已过期" : "已拒绝")}>
            关闭建议
          </button>
        </section>
      )}
      {preview &&
        previewHost.current &&
        createPortal(preview, previewHost.current)}
    </section>
  );
}
