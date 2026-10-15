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
  icon?: string
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
