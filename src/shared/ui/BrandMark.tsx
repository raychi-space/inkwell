import mantaLight from '../assets/brand/manta-light.webp'
import mantaDark from '../assets/brand/manta-dark.webp'

export function BrandMark({ inverse = false }: { inverse?: boolean }) {
  return (
    <span className={`brand-icon${inverse ? ' brand-icon-inverse' : ''}`} aria-hidden="true">
      <img src={mantaLight} className="brand-icon-light" alt="" width={60} height={40} />
      <img src={mantaDark} className="brand-icon-dark" alt="" width={60} height={40} />
    </span>
  )
}
