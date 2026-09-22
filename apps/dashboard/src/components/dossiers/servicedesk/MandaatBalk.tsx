import Link from 'next/link'
import { getServicedeskMandaat } from '@/lib/dossiers/servicedesk'
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
 * Los van het ophalen gehouden: zo is elke stand te bekijken zonder een bon te hoeven vinden die
 * toevallig net over zijn mandaat heen is — en zonder daarvoor aan productiegegevens te zitten.
 */
export function MandaatMeter({
  mandaat, totaal, dossierId,
}: {
  mandaat: number | null
  totaal: number
  /** Voor de knop naar de Bon-pagina. Leeg = geen knop (bijvoorbeeld in een voorbeeld). */
  dossierId?: string
}) {
  const stand = mandaatStand({ mandaat, totaal })
  // Geen mandaat ingevuld: dan valt er niets te bewaken. De knop om er een te zetten staat op
  // de Bon-pagina; hier een lege balk tonen zou alleen maar ruis zijn.
  if (stand === 'geen') return null

  const { kleur, achtergrond, tekst } = STANDEN[stand]
  const vulling = mandaatVulling({ mandaat, totaal })
  const ruimte = mandaatRuimte({ mandaat, totaal })

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 260 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 200 }}>
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

      {stand !== 'binnen' && dossierId && (
        <Link
          href={`/servicedesk/${dossierId}/bon`}
          style={{
            fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', textDecoration: 'none',
            padding: '5px 12px', borderRadius: 6, border: `1px solid ${kleur}`, color: kleur,
          }}
        >
          Mandaat verhogen
        </Link>
      )}
    </div>
  )
}

/**
 * Haalt de stand van het mandaat op en tekent de balk.
 *
 * De cijfers komen live uit Bouw7 (geboekte uren en kosten, plus wat er aan opdrachten uitstaat)
 * en dit hoort daarom achter een `<Suspense>`: een traag Bouw7 mag de bon niet ophouden.
 */
export async function MandaatBalk({ dossierId }: { dossierId: string }) {
  const status = await getServicedeskMandaat(dossierId).catch(() => null)
  if (!status) return null
  return <MandaatMeter mandaat={status.mandaat} totaal={status.totaal} dossierId={dossierId} />
}
