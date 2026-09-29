import { api } from '../../shared/api/client'

export type SiteLink = { label: string; href: string }
export type HomeSection = { id: 'feed' | 'writing' | 'posts' | 'thoughts'; visible: boolean }
export type SiteSettings = {
  version: number
  siteName: string
  intro: string
  avatarUrl: string | null
  contacts: SiteLink[]
  accounts: SiteLink[]
  navigation: SiteLink[]
  homeSections: HomeSection[]
}

export const getSettings = () => api<SiteSettings>('/api/v1/admin/settings')
export const saveSettings = (value: SiteSettings) => api<SiteSettings>('/api/v1/admin/settings', {
  method: 'PUT', body: JSON.stringify(value),
})
