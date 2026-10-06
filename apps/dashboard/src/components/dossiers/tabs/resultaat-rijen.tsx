import type { ResultaatPost, Subtotaal, VerkoopGrondslag } from '@/lib/dossiers/resultaat-per-code'
import { Badge } from '@/components/ui'
import { ROOD, fmt, TD } from './financieel-ui'

/**
 * De rijen van het blok Verwacht resultaat. Zonder 'use client' of serverimports, zodat zowel het
 * (server)blok als de uitklapbare Hoofdopdracht (client) ze gebruiken.
 */

export const GRONDSLAG_UITLEG: Record<VerkoopGrondslag, string> = {
  vast:          'Afgesproken bedrag',
  eenheidsprijs: 'Eenheidsprijs × werkelijke hoeveelheid',
  doorgerekend:  'Geboekte verkoopwaarde + nog te verwachten kosten, doorgerekend tegen dezelfde verhouding',
  mandaat:       'Mandaat (doorgerekend komt lager uit)',
  verrekend:     'Stelpostbedrag + de verrekening op het tabblad Meerwerk',
  geboekt:       'Geboekte verkoopwaarde — ligt al boven het stelpostbedrag',
  aanneemsom:    'Aanneemsom zonder de stelposten die erin zitten',
}

export const RAND = '1px solid var(--neutral-100, #f4f7f8)'
export const SUBTOTAAL_GRIJS = 'var(--neutral-50, #f8fafa)'
export const TOTAAL_GRIJS = 'var(--neutral-100, #eef2f3)'

export const fmtMarge = (v: number | null): string =>
  v == null ? '—' : `${new Intl.NumberFormat('nl-NL', { maximumFractionDigits: 1 }).format(v)} %`

export const fmtPct = (v: number): string =>
  `${new Intl.NumberFormat('nl-NL', { maximumFractionDigits: 0 }).format(v * 100)} %`

export const resultaatKleur = (v: number | null): string | undefined =>
  v == null ? undefined : v < 0 ? ROOD : v > 0 ? 'var(--success-700, #2e7d4f)' : undefined

/** Marge onder 20 % rood, 20–25 % oranje, daarboven gewoon. */
export const margeKleur = (v: number | null): string | undefined =>
  v == null ? undefined : v < 20 ? ROOD : v < 25 ? 'var(--warning-500, #f08000)' : undefined

export const leeg = (v: number | null): string => (v == null ? '—' : fmt(v, true))

/** Groepskop over de volle breedte, in de stijl van de veldlabels (UPPERCASE 10,5px). */
export function GroepKop({ children }: { children: React.ReactNode }) {
  return (
    <tr>
      <td colSpan={5} style={{
        padding: '12px 12px 4px', fontSize: 10.5, fontWeight: 700, color: 'var(--neutral-500)',
        textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: RAND,
      }}>
        {children}
      </td>
    </tr>
  )
}

const LABEL: Partial<Record<ResultaatPost['soort'], string>> = { stelpost: 'Stelpost', optie: 'Optie', regie: 'Regie' }

export function PostRij({ post, inspringen, metLabel, voor }: {
  post: ResultaatPost; inspringen?: boolean; metLabel?: boolean
  /** Iets vóór de omschrijving, bv. de uitklapknop van de Hoofdopdracht. */
  voor?: React.ReactNode
}) {
  const label = metLabel ? LABEL[post.soort] : undefined
  const aandeel = post.kostenAandeel != null && post.code
    ? `${fmtPct(post.kostenAandeel)} van de kosten van ${post.code}`
    : null
  return (
    <tr>
      <td
        title={[post.omschrijving, post.code, aandeel].filter(Boolean).join(' · ')}
        style={{
          padding: `6px 12px 6px ${inspringen ? 28 : 12}px`, fontSize: 13, color: 'var(--neutral-800)',
          borderBottom: RAND, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}
      >
        {voor}
        {label && <span style={{ marginRight: 8 }}><Badge size="sm" tone="info">{label}</Badge></span>}
        {post.omschrijving}
        {post.code && (
          <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--neutral-400)', fontFamily: 'var(--font-mono, monospace)' }}>
            {post.code}
          </span>
        )}
        {aandeel && <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--neutral-400)' }}>({aandeel})</span>}
      </td>
      <td
        title={GRONDSLAG_UITLEG[post.grondslag]}
        style={{
          padding: '6px 12px', fontSize: 13, textAlign: 'right', color: 'var(--neutral-700)',
          borderBottom: RAND, whiteSpace: 'nowrap', cursor: 'help',
        }}
      >
        {fmt(post.verkoop, true)}
      </td>
      <TD>{leeg(post.prognose)}</TD>
      <TD vet kleur={resultaatKleur(post.resultaat)}>{leeg(post.resultaat)}</TD>
      <TD kleur={margeKleur(post.margePct)}>{fmtMarge(post.margePct)}</TD>
    </tr>
  )
}

export function SubtotaalRij({ label, s, inspringen, achtergrond = SUBTOTAAL_GRIJS }: {
  label: string; s: Subtotaal; inspringen?: boolean; achtergrond?: string
}) {
  return (
    <tr style={{ background: achtergrond }}>
      <td style={{
        padding: `6px 12px 6px ${inspringen ? 28 : 12}px`, fontSize: 13, fontWeight: 700,
        color: 'var(--neutral-900)', borderBottom: RAND, whiteSpace: 'nowrap',
      }}>
        {label}
      </td>
      <TD vet>{fmt(s.verkoop, true)}</TD>
      <TD vet>{leeg(s.prognose)}</TD>
      <TD vet kleur={resultaatKleur(s.resultaat)}>{leeg(s.resultaat)}</TD>
      <TD vet kleur={margeKleur(s.margePct)}>{fmtMarge(s.margePct)}</TD>
    </tr>
  )
}
