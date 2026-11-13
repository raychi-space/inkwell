export interface SelectionSnapshot {
  selectionId: string
  beforeMarkdown: string
  contextBefore: string
  contextAfter: string
}
export interface InsertionSnapshot {
  insertionId: string
  contextBefore: string
  contextAfter: string
}
export interface EditorAgentAdapter {
  captureSelection(): SelectionSnapshot | null
  captureInsertion(): InsertionSnapshot | null
  getCurrentMarkdown(): string
  applyDocument(before: string, markdown: string): void
  validateSelection(selectionId: string): boolean
  applyReplacement(selectionId: string, markdown: string): void
  releaseSelection(selectionId: string): void
  validateInsertion(insertionId: string): boolean
  applyInsertion(insertionId: string, markdown: string): void
  releaseInsertion(insertionId: string): void
}
