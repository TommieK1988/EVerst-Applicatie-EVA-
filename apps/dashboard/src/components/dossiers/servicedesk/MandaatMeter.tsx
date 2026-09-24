import {
  MANDAAT_WAARSCHUWING_PCT, mandaatRuimte, mandaatStand, mandaatVulling,
  type MandaatStand,
} from '../servicedesk-mandaat'

const euro = (n: number) =>
  new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)

/**
 * Kleur en tekst per stand. `over` is rood en nadrukkelijk, maar houdt niets tegen — zie
 * `servicedesk-mandaat.ts` voor waarom er niet geblokkeerd wordt.
 */
const STANDEN: Record<Exclude<MandaatStand, 'geen'>, { kleur: string; achtergrond: string; tekst: string }> = {
  binnen: { kleur: 'var(--success-700)', achtergrond: 'var(--success-500)', tekst: 'Binnen mandaat' },
  bijna:  { kleur: 'var(--warning-700)', achtergrond: 'var(--warning-500)', tekst: 'Bijna op' },
  over:   { kleur: 'var(--error-700)',   achtergrond: 'var(--error-500)',   tekst: 'Mandaat overschreden' },
}

/**
 * Hoeveel er van het mandaat op is, als balk.
 *
 * Puur: de stand gaat erin als twee getallen. Zo is elke toestand te bekijken zonder een bon te
 * hoeven vinden die toevallig net over zijn mandaat heen is — en zonder daarvoor aan
 * productiegegevens te zitten.
 *
 * Staat op de Bon-pagina boven de opbouw van het verbruikte mandaat: eerst hoe het ervoor staat,
 * dan waar dat bedrag vandaan komt. Dat waren twee losse blokken op twee plekken — de meter in
 * een balk boven de tabs, de opbouw in het Servicedesk-blok — en dan las je een percentage zonder
 * te zien waardoor het vol liep.
 */
export function MandaatMeter({ mandaat, totaal }: { mandaat: number | null; totaal: number }) {
  const stand = mandaatStand({ mandaat, totaal })
  // Geen mandaat ingevuld: dan valt er niets te bewaken. Het veld om er een te zetten staat er
  // vlak boven; een lege balk zou alleen maar ruis zijn.
  if (stand === 'geen') return null

  const { kleur, achtergrond, tekst } = STANDEN[stand]
  const vulling = mandaatVulling({ mandaat, totaal })
  const ruimte = mandaatRuimte({ mandaat, totaal })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
        <span style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: kleur }}>
          {tekst}
        </span>
        <span style={{ fontSize: 12, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: 'var(--fg)' }}>
          {euro(totaal)} / {euro(mandaat ?? 0)}
        </span>
      </div>

      <div
        role="meter"
        aria-valuenow={Math.round(vulling)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Mandaat: ${tekst}`}
        style={{ height: 5, borderRadius: 999, background: 'var(--neutral-200, #e3e8ea)', overflow: 'hidden' }}
      >
        <div style={{ width: `${vulling}%`, height: '100%', background: achtergrond, borderRadius: 999 }} />
      </div>

      {ruimte != null && (
        <span style={{ fontSize: 11, color: 'var(--fg-muted)' }}>
          {ruimte >= 0
            ? `Nog ${euro(ruimte)} binnen mandaat`
            : `${euro(Math.abs(ruimte))} boven het mandaat`}
          {stand === 'binnen' && ` · waarschuwing vanaf ${MANDAAT_WAARSCHUWING_PCT}%`}
        </span>
      )}
    </div>
  )
}
