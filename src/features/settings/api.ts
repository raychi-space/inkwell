import { api } from '../../shared/api/client'

export type SiteLink = { label: string; href: string }
export type SocialAccount = { platform: string; enabled: boolean; href: string }
export type HomeSection = { id: 'feed' | 'writing' | 'posts' | 'thoughts'; visible: boolean }
export type HomepageSection = { id: 'featured' | 'posts' | 'writing' | 'projects' | 'stats'; visible: boolean }
export type HomepageProject = { name: string; description: string; status: string; href: string }
export type HomepageSettings = {
  focus: string
  projects: HomepageProject[]
  recentSections: HomepageSection[]
  bottomSections: HomepageSection[]
}
export type SiteSettings = {
  version: number
  siteName: string
  intro: string
  avatarUrl: string | null
  contacts: SiteLink[]
  accounts: SiteLink[]
  socialAccounts: SocialAccount[]
  projectIntro: string
  navigation: SiteLink[]
  homeSections: HomeSection[]
  homepage: HomepageSettings
}

export const getSettings = () => api<SiteSettings>('/api/v1/admin/settings')
export const saveSettings = (value: SiteSettings) => api<SiteSettings>('/api/v1/admin/settings', {
  method: 'PUT', body: JSON.stringify(value),
})
