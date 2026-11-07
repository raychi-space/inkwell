import { api } from '../../shared/api/client'

export type AnalyticsSettings = {
  enabled: boolean
  configured: boolean
  version: number
}

export const analyticsSettings = (signal: AbortSignal) =>
  api<AnalyticsSettings>('/api/v1/admin/analytics/settings', { signal })

export const saveAnalyticsSettings = (
  input: Pick<AnalyticsSettings, 'enabled' | 'version'>,
  signal: AbortSignal,
) =>
  api<AnalyticsSettings>('/api/v1/admin/analytics/settings', {
    method: 'PUT',
    body: JSON.stringify(input),
    signal,
  })

export type AnalyticsReport = {
  appId: string
  from: string
  to: string
  pageViews: number
  unidentifiedPageViews: number
  visitorDays: number
  visits: number
  sources: { name: string; pageViews: number }[]
  regions: { name: string; pageViews: number }[]
  popularPaths: { name: string; pageViews: number }[]
  trend: { day: string; pageViews: number }[]
  retention: { rawDays: number; aggregateDays: number }
  definitions: { visitors: string; visits: string }
}

export const analyticsReport = (from: string, to: string, signal: AbortSignal) =>
  api<AnalyticsReport>(`/api/v1/admin/analytics/report?${new URLSearchParams({ from, to })}`, {
    signal,
  })
