import type { BedrijfsIdentiteit } from '@/lib/bedrijf/identiteit'

/**
 * Het merk zoals een buitenstaander het ziet: beeldmerk + naam van deze organisatie.
 *
 * Gedeeld door het klantportaal, de publieke opleverpagina's en de foutschermen daaromheen.
 * Die toonden alle vijf hun eigen hardgeschreven `EVERTS.` met `/logo-beeldmerk.svg`; dat is
 * precies wat een tweede installatie stilzwijgend verkeerd zou tonen.
 *
 * Bewust een dom presentatiecomponent: het leest niets zelf, zodat het ook binnen een
 * client-component te gebruiken is. De aanroeper haalt de identiteit op met
 * `getBedrijfsIdentiteit()`.
 *
 * Zonder ingevulde organisatiegegevens rendert dit **niets** in plaats van een placeholder —
 * een lege kop valt op en is te repareren; het merk van een ander bedrijf valt niet op.
 */
export function Woordmerk({
  identiteit,
  formaat = 26,
  className = '',
}: {
  identiteit: Pick<BedrijfsIdentiteit, 'naam' | 'woordmerk' | 'logo_icon_url' | 'logo_primair_url'>
  /** Hoogte van het beeldmerk in pixels. */
  formaat?: number
  className?: string
}) {
  const logo = identiteit.logo_icon_url ?? identiteit.logo_primair_url
  const tekst = identiteit.woordmerk || identiteit.naam

  if (!logo && !tekst) return null

  return (
    <span className={`flex items-center gap-2.5 ${className}`.trim()}>
      {logo && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logo} alt={tekst || 'Logo'} height={formaat} style={{ height: formaat, width: 'auto' }} />
      )}
      {tekst && (
        <span className="text-[15px] font-extrabold tracking-[0.06em]">{tekst}</span>
      )}
    </span>
  )
}
