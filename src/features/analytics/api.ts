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

export type AnalyticsFilters = {
  from: string
  until: string
  path: string
  source: string
  ip: string
  country: string
  province: string
  city: string
}
export type AnalyticsRetention = {
  rawDays: number
  aggregateDays: number
  timeZone: string
  geoConfigured: boolean
  visitorTrackingSince: string
}
export type AnalyticsOverview = {
  from: string
  to: string
  summary: { pageViews: number; visitors: number; todayPageViews: number; todayVisitors: number }
  trend: { day: string; pageViews: number }[]
  countries: { name: string; pageViews: number }[]
  provinces: { name: string; pageViews: number }[]
  cities: { name: string; pageViews: number }[]
  retention: AnalyticsRetention
}
export type AnalyticsEvent = {
  id: string
  occurredAt: string
  path: string
  source: string
  ip: string | null
  country: string
  province: string
  city: string
}
export type AnalyticsEvents = {
  items: AnalyticsEvent[]
  total: number
  page: number
  pageSize: number
  retention: AnalyticsRetention
}
function detailsQuery(filters: AnalyticsFilters) {
  const to = new Date(`${filters.until}T00:00:00Z`)
  to.setUTCDate(to.getUTCDate() + 1)
  const days = (to.getTime() - Date.parse(`${filters.from}T00:00:00Z`)) / 86400000
  if (!Number.isFinite(days) || days < 1 || days > 366)
    throw new Error('请选择 1～366 天的日期区间。')
  const query = new URLSearchParams({ from: filters.from, to: to.toISOString().slice(0, 10) })
  for (const key of ['path', 'source', 'ip', 'country', 'province', 'city'] as const)
    if (filters[key].trim()) query.set(key, filters[key].trim())
  return query
}
export const analyticsOverview = (filters: AnalyticsFilters, signal: AbortSignal) =>
  api<AnalyticsOverview>(`/api/v1/admin/analytics/overview?${detailsQuery(filters)}`, { signal })
export const analyticsEvents = (filters: AnalyticsFilters, page: number, signal: AbortSignal) => {
  const query = detailsQuery(filters)
  query.set('page', String(page))
  query.set('pageSize', '20')
  return api<AnalyticsEvents>(`/api/v1/admin/analytics/events?${query}`, { signal })
}
