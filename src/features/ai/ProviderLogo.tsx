import { Icon } from '../../shared/components/Icon'
import { providerBrand, type ProviderIdentity } from './providerBrand'

const assets = import.meta.glob('./assets/providers/*.svg', { eager: true, query: '?url', import: 'default' }) as Record<string, string>

export function ProviderLogo({ provider, size = 24 }: { provider?: ProviderIdentity; size?: number }) {
  const brand = providerBrand(provider)
  const url = brand && assets[`./assets/providers/${brand.icon}.svg`]
  return <span className="provider-logo" data-provider-brand={brand?.id ?? 'custom'} aria-hidden="true" title={brand?.label ?? '自定义连接'}>
    {url ? <img src={url} alt="" width={size} height={size} /> : <Icon name="server" size={size} />}
  </span>
}
