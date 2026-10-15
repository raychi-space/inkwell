export type ReadingSettings = {
  version: number
  displayDays: number
  translationAssistantId: string | null
}

export type ReadingSource = {
  id: string
  name: string
  description: string
  siteUrl: string
  listingUrl: string
  adapter: 'OPENAI_DEVELOPERS' | 'ANTHROPIC_ENGINEERING'
  enabled: boolean
  position: number
  lastCheckedAt: string | null
  lastSuccessAt: string | null
  lastError: string | null
  articleCount: number
}

export type ReadingShelf = { settings: ReadingSettings; sources: ReadingSource[] }
export type ReadingSourceInput = Pick<
  ReadingSource,
  'name' | 'description' | 'siteUrl' | 'listingUrl' | 'adapter' | 'enabled' | 'position'
>
export type AssistantTemplate = { id: string; name: string; description: string; icon: string }
