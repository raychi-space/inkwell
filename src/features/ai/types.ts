import type { SelectionSnapshot } from '../../shared/types/editor'
export type { SelectionSnapshot, EditorAgentAdapter } from '../../shared/types/editor'
export interface Provider {
  id: string
  name: string
  enabled: boolean
  type: 'openai-compatible'
  baseUrl: string
  models: string[]
  version: number
  hasApiKey: boolean
  apiKeyMask: string | null
}
export interface Assistant {
  id: string
  name: string
  enabled: boolean
  providerId: string
  model: string
  systemPrompt: string
  fixedContext: string
  generationOptions: { maxOutputTokens: number }
  version: number
  historyTurns: number
  maxContextChars: number
  timeoutMs: number
}
export type WritingMode = 'chat' | 'rewrite' | 'summarize'
export type Proposal =
  | { kind: 'replacement'; selectionId: string; newText: string }
  | { kind: 'summary'; summary: string }
export interface TurnRequest {
  requestId: string
  assistantId: string
  mode: WritingMode
  message: string
  history: { role: 'user' | 'assistant'; content: string }[]
  context: {
    title: string
    selection?: SelectionSnapshot
    documentMarkdown?: string
    currentSummary?: string
  }
}
export interface Turn {
  turnId: string
  status: 'pending' | 'running' | 'succeeded' | 'failed'
  result?: { reply: string; proposal?: Proposal }
  error?: { code: string; message: string; retryable: boolean }
}
