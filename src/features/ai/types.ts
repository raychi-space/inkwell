import type { SelectionSnapshot, InsertionSnapshot } from '../../shared/types/editor'
export type { Assistant, Provider } from '../../shared/types/ai'
export type {
  SelectionSnapshot,
  InsertionSnapshot,
  EditorAgentAdapter,
} from '../../shared/types/editor'
export type WritingMode = 'chat' | 'rewrite' | 'insert' | 'summarize' | 'metadata'
export type Proposal =
  | { kind: 'document'; documentId: string; newText: string }
  | { kind: 'metadata'; title: string; summary: string; slug: string }
  | { kind: 'replacement'; selectionId: string; newText: string }
  | { kind: 'insertion'; insertionId: string; newText: string }
  | { kind: 'summary'; summary: string }
export interface TurnRequest {
  requestId: string
  assistantId: string
  mode: WritingMode
  message: string
  history: { role: 'user' | 'assistant'; content: string }[]
  context: {
    title: string
    documentId?: string
    selection?: SelectionSnapshot
    insertion?: InsertionSnapshot
    documentMarkdown?: string
    currentSummary?: string
  }
}
export interface Turn {
  partialReply?: string
  turnId: string
  status: 'pending' | 'running' | 'succeeded' | 'failed'
  result?: { reply: string; proposal?: Proposal }
  error?: { code: string; message: string; retryable: boolean }
}
