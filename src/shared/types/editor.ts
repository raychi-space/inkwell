export interface SelectionSnapshot {
  selectionId: string
  beforeMarkdown: string
  contextBefore: string
  contextAfter: string
}
export interface EditorAgentAdapter {
  captureSelection(): SelectionSnapshot | null
  getCurrentMarkdown(): string
  applyDocument(before: string, markdown: string): void
  validateSelection(selectionId: string): boolean
  applyReplacement(selectionId: string, markdown: string): void
  releaseSelection(selectionId: string): void
  getAnchor(selectionId: string): HTMLElement | null
}
