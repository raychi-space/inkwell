import { api } from "../../shared/api/client";
import type { Provider, Assistant, Turn, TurnRequest } from "./types";
const base = "/api/v1/admin/ai";
export const providers = () =>
  api<{ items: Provider[] }>(base + "/providers").then((v) => v.items);
export const assistants = () =>
  api<{ items: Assistant[] }>(base + "/assistants").then((v) => v.items);
export const saveProvider = (id: string | null, body: unknown) =>
  api<Provider>(base + "/providers" + (id ? "/" + id : ""), {
    method: id ? "PATCH" : "POST",
    body: JSON.stringify(body),
  });
export const saveAssistant = (id: string | null, body: unknown) =>
  api<Assistant>(base + "/assistants" + (id ? "/" + id : ""), {
    method: id ? "PATCH" : "POST",
    body: JSON.stringify(body),
  });
export const testProvider = (id: string, model: string) =>
  api<{
    connection: { ok: boolean; reply?: string; error?: string };
    tools: { ok: boolean; error?: string };
    durationMs: number;
  }>(base + "/providers/" + id + "/test", {
    method: "POST",
    body: JSON.stringify({ model }),
  });
export const createTurn = (body: TurnRequest) =>
  api<Turn>(base + "/turns", { method: "POST", body: JSON.stringify(body) });
export const getTurn = (id: string) => api<Turn>(base + "/turns/" + id);
