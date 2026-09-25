/**
 * Mandaat bij een regie- of stelpostregel: wat de klant vooraf heeft toegezegd, tegenover wat er
 * geboekt is.
 *
 * Het contracttotaal telt het hoogste van de twee. Zolang het geboekte eronder blijft is het
 * mandaat alleen informatie; komt het erboven, dan telt het geboekte en is het mandaat dus
 * overschreden. Dat moet op de regel zelf te zien zijn, op de meerwerkregel én op de
 * bewakingscode in de nacalculatie, want daar wordt het gefactureerd.
 */

import { Badge } from '@/components/ui'

const fmt = (v: number) =>
  new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 }).format(v)

export default function MandaatIndicator({ mandaat, geboekt, toonMandaat = true }: {
  mandaat: number
  /**
   * Geboekte **verkoopwaarde** excl. btw (uren × verkooptarief, kosten × opslag), inclusief wat al
   * gefactureerd is. Nooit de kostprijs: het mandaat is een verkoopbedrag.
   */
  geboekt: number
  /** Het mandaatbedrag zelf noemen; uit waar het al in een invoerveld ernaast staat (dan de ruimte). */
  toonMandaat?: boolean
}) {
  const over = geboekt - mandaat
  // Kort in beeld (de kolom is smal), de bedragen volledig in de tooltip.
  const uitleg = `Mandaat ${fmt(mandaat)} · geboekte verkoopwaarde ${fmt(geboekt)} (incl. opslagen)`
  if (over > 0.005) {
    return (
      <Badge tone="warning" size="sm" dot className="whitespace-nowrap"
        title={`${uitleg}. Het contracttotaal telt nu de geboekte verkoopwaarde, niet het mandaat.`}>
        Boven mandaat +{fmt(over)}
      </Badge>
    )
  }
  return (
    <span className="whitespace-nowrap text-[10.5px] text-neutral-500" title={uitleg}>
      {toonMandaat ? `Mandaat ${fmt(mandaat)}` : `Nog ${fmt(-over)} binnen mandaat`}
    </span>
  )
}
