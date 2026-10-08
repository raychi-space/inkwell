export type Article = {
  id: string
  slug: string
  type: 'ARTICLE' | 'POST'
  status: 'DRAFT' | 'PUBLISHED'
  version: number
  title: string
  summary: string
  bodyMarkdown: string
  tags: string[]
  coverUrl: string | null
  category: string | null
  hasUnpublishedChanges: boolean
  createdAt: string
  updatedAt: string
  publishedAt: string | null
  publicUpdatedAt: string | null
  summaryStatus?: 'NONE' | 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'SKIPPED' | 'CANCELLED'
  summaryError?: string | null
}

export type Page<T> = { items: T[]; page: number; pageSize: number; total: number }
export type ContentRevisionSummary = {
  id: string
  articleVersion: number
  operation: string
  title: string
  summary: string
  createdAt: string
}
export type ContentRevision = ContentRevisionSummary & {
  snapshot: Pick<Article, 'title' | 'summary' | 'bodyMarkdown' | 'tags' | 'coverUrl' | 'category'>
}
export type Uploaded = {
  id: string
  articleId: string
  url: string
  previewUrl: string
  mediaType: string
  byteSize: number
  width: number
  height: number
}
