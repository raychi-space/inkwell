import { api, apiResponse } from '../../shared/api/client'
import type { Article, Page, Uploaded } from './types'

type ArticleInput = Pick<
  Article,
  'version' | 'title' | 'slug' | 'summary' | 'bodyMarkdown' | 'tags' | 'coverUrl' | 'category'
> & { publicationMetadata?: boolean }

export type AdminFilters = {
  status?: string
  type?: string
  category?: string
  tag?: string
  sort?: string
}
export async function listArticles(page = 1, filters: AdminFilters = {}): Promise<Page<Article>> {
  const params = new URLSearchParams({ page: String(page), pageSize: '50' })
  for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value)
  return api(`/api/v1/admin/contents?${params}`)
}

export async function getArticle(id: string): Promise<Article> {
  return api(`/api/v1/admin/contents/${id}`)
}

export async function createArticle(type: Article['type']): Promise<Article> {
  return api(`/api/v1/admin/contents?type=${type}`, { method: 'POST', body: '{}' })
}

export async function saveArticle(id: string, input: ArticleInput): Promise<Article> {
  return api(`/api/v1/admin/contents/${id}`, { method: 'PUT', body: JSON.stringify(input) })
}

export async function publishArticle(
  id: string,
  expectedVersion: number,
  assistantId?: string,
  metadataReviewed = false,
): Promise<Article> {
  return api(`/api/v1/admin/contents/${id}/publish`, {
    method: 'POST',
    body: JSON.stringify({
      expectedVersion,
      metadataReviewed,
      ...(assistantId ? { assistantId } : {}),
    }),
  })
}

export async function unpublishArticle(id: string, expectedVersion: number): Promise<Article> {
  return api(`/api/v1/admin/contents/${id}/unpublish`, {
    method: 'POST',
    body: JSON.stringify({ expectedVersion }),
  })
}

export async function upload(articleId: string, file: File): Promise<Uploaded> {
  const body = new FormData()
  body.append('file', file)
  return api<Uploaded>(`/api/v1/admin/articles/${articleId}/assets`, { method: 'POST', body })
}

export async function exportContent(
  id: string,
  version: number,
  signal: AbortSignal,
): Promise<Blob> {
  const response = await apiResponse(
    `/api/v1/admin/contents/${encodeURIComponent(id)}/export?expectedVersion=${version}`,
    { signal },
  )
  return response.blob()
}
