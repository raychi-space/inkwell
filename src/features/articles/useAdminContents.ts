import { useEffect, useState } from 'react'
import { listArticles, type AdminFilters } from './api'
import type { Article, Page } from './types'
import { errorMessage } from '../../shared/lib/errors'
import { invalidateReadCache } from '../../shared/api/sessionCache'

export function useAdminContents(page: number, filters: AdminFilters) {
  const [result, setResult] = useState<Page<Article> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const { status, type, category, tag, sort } = filters
  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    void listArticles(page, { status, type, category, tag, sort })
      .then((value) => {
        if (active) setResult(value)
      })
      .catch((reason) => {
        if (active) setError(errorMessage(reason))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [page, status, type, category, tag, sort, revision])
  return {
    result,
    loading,
    error,
    refresh: () => {
      invalidateReadCache()
      setRevision((value) => value + 1)
    },
  }
}
