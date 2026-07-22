'use client'

import { Fragment, useState, useMemo, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import type { UrenRegel, BewakingscodeOptie } from '@/lib/dossiers/actions'
import { updateUurlogBewakingscode } from '@/lib/dossiers/actions'
import type { UrenExtraVelden } from '@/lib/uren/types'
import { fmt, fmtUren, fmtTarief, fmtDatum, TH, TD, ROOD, GROEN } from '@/components/dossiers/tabs/tab-ui'
import { useDossierReadOnly } from '@/components/dossiers/DossierReadOnlyContext'

/* ─── Week helpers ─────────────────────────────────────────────────────────── */

function isoWeekNummer(dateStr: string | null): number | null {
  if (!dateStr) return null
  const d = new Date(dateStr)
  const utc = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  utc.setUTCDate(utc.getUTCDate() + 4 - (utc.getUTCDay() || 7))
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1))
  return Math.ceil((((utc.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
}

function fmtWeek(dateStr: string | null): string {
  const w = isoWeekNummer(dateStr)
  return w != null ? `W${w}` : '—'
}

/* ─── Types ─────────────────────────────────────────────────────────────────── */

/**
 * Eén regel in de tabel. In het dossier is dat een kale `UrenRegel`; op het bedrijfsbrede
 * overzicht (/uren) zijn de extra velden gevuld. Welke kolommen renderen bepaalt `kolommen`,
 * niet de aanwezigheid van de velden.
 */
export type UrenTabelRegel = UrenRegel & Partial<UrenExtraVelden>

export type UrenKolom =
  | 'medewerker' | 'dossier' | 'datum' | 'weeknummer' | 'uursoort' | 'code'
  | 'geaccordeerd' | 'geaccordeerdDoor' | 'geaccordeerdOp' | 'dienstverband'
  | 'projectleider' | 'opmerking'
  | 'uren' | 'uurtarief' | 'bedrag'

/** Kolommen van de dossier-Urentab — ongewijzigd t.o.v. vóór het delen van dit component. */
export const DOSSIER_KOLOMMEN: UrenKolom[] = [
  'medewerker', 'datum', 'weeknummer', 'uursoort', 'code', 'uren', 'uurtarief', 'bedrag',
]

/** Kolommen van het bedrijfsbrede overzicht: idem + dossier, accordering, dienstverband, context. */
export const OVERZICHT_KOLOMMEN: UrenKolom[] = [
  'medewerker', 'dossier', 'datum', 'weeknummer', 'uursoort', 'code',
  'geaccordeerd', 'geaccordeerdDoor', 'geaccordeerdOp', 'dienstverband', 'projectleider', 'opmerking',
  'uren', 'uurtarief', 'bedrag',
]

/**
 * Vaste renderorde. De `kolommen`-prop kiest alléén wélke kolommen meedoen — de vololgorde ligt
 * hier vast zodat de drie numerieke kolommen altijd rechts eindigen. Daar leunen de subtotaal- en
 * totaalregels op (die spannen de tekstkolommen met één colSpan en vullen daarna de getallen).
 */
const KOLOM_VOLGORDE: UrenKolom[] = [
  'medewerker', 'dossier', 'datum', 'weeknummer', 'uursoort', 'code',
  'geaccordeerd', 'geaccordeerdDoor', 'geaccordeerdOp', 'dienstverband', 'projectleider', 'opmerking',
  'uren', 'uurtarief', 'bedrag',
]

const NUMERIEK = new Set<UrenKolom>(['uren', 'uurtarief', 'bedrag'])

const KOLOM_LABEL: Record<UrenKolom, string> = {
  medewerker: 'Medewerker',
  dossier: 'Dossier',
  datum: 'Datum',
  weeknummer: 'Week',
  uursoort: 'Uursoort',
  code: 'Bewakingscode',
  geaccordeerd: 'Geaccordeerd',
  geaccordeerdDoor: 'Geacc. door',
  geaccordeerdOp: 'Geacc. op',
  dienstverband: 'Dienstverband',
  projectleider: 'Projectleider',
  opmerking: 'Opmerking',
  uren: 'Uren',
  uurtarief: 'Uurtarief',
  bedrag: 'Bedrag',
}

/** Sorteren op deze kolommen geeft ook subtotalen. */
const GROEPEER_KEYS = new Set<UrenKolom>([
  'medewerker', 'weeknummer', 'uursoort', 'code', 'dossier', 'dienstverband', 'geaccordeerd', 'projectleider',
])

type DataRij = { type: 'data'; regel: UrenTabelRegel }
type SubtotaalRij = { type: 'subtotaal'; label: string; uren: number; bedrag: number }
type TabelRij = DataRij | SubtotaalRij

/* ─── Helpers ───────────────────────────────────────────────────────────────── */

function dossierLabel(r: UrenTabelRegel): string {
  return [r.dossierNummer, r.dossierTitel].filter(Boolean).join(' · ') || '—'
}

function sorteerWaarde(r: UrenTabelRegel, key: UrenKolom): string | number {
  switch (key) {
    case 'medewerker':       return (r.medewerker ?? '').toLowerCase()
    case 'dossier':          return dossierLabel(r).toLowerCase()
    case 'datum':            return r.datum ?? ''
    case 'weeknummer':       return isoWeekNummer(r.datum) ?? 0
    case 'uursoort':         return (r.uursoort ?? '').toLowerCase()
    case 'code':             return (r.code ?? '').toLowerCase()
    case 'geaccordeerd':     return r.geaccordeerd ? 1 : 0
    case 'geaccordeerdDoor': return (r.geaccordeerdDoor ?? '').toLowerCase()
    case 'geaccordeerdOp':   return r.geaccordeerdOp ?? ''
    case 'dienstverband':    return r.extern ? 1 : 0
    case 'projectleider':    return (r.projectleider ?? '').toLowerCase()
    case 'opmerking':        return (r.opmerking ?? '').toLowerCase()
    case 'uren':             return r.uren
    case 'uurtarief':        return r.uurtarief ?? 0
    case 'bedrag':           return r.bedrag
  }
}

function groepLabel(r: UrenTabelRegel, key: UrenKolom): string {
  switch (key) {
    case 'medewerker':    return r.medewerker ?? '—'
    case 'dossier':       return dossierLabel(r)
    case 'weeknummer':    return fmtWeek(r.datum)
    case 'uursoort':      return r.uursoort ?? '—'
    case 'code':          return r.code ? `${r.code}${r.codeNaam ? ` · ${r.codeNaam}` : ''}` : '—'
    case 'geaccordeerd':  return r.geaccordeerd ? 'Geaccordeerd' : 'Niet geaccordeerd'
    case 'dienstverband': return r.extern ? 'Extern' : 'Intern'
    case 'projectleider': return r.projectleider ?? '—'
    default:              return ''
  }
}

/** Doorzoekbare tekst van een regel — alleen de kolommen die daadwerkelijk getoond worden. */
function zoekTekst(r: UrenTabelRegel, kolommen: UrenKolom[]): string {
  const delen: (string | null | undefined)[] = []
  for (const k of kolommen) {
    switch (k) {
      case 'medewerker':       delen.push(r.medewerker); break
      case 'dossier':          delen.push(r.dossierNummer, r.dossierTitel); break
      case 'datum':            delen.push(r.datum); break
      case 'weeknummer':       delen.push(fmtWeek(r.datum)); break
      case 'uursoort':         delen.push(r.uursoort); break
      case 'code':             delen.push(r.code, r.codeNaam); break
      case 'geaccordeerd':     delen.push(r.geaccordeerd ? 'ja geaccordeerd' : 'nee niet geaccordeerd'); break
      case 'geaccordeerdDoor': delen.push(r.geaccordeerdDoor); break
      case 'dienstverband':    delen.push(r.extern ? 'extern' : 'intern'); break
      case 'projectleider':    delen.push(r.projectleider); break
      case 'opmerking':        delen.push(r.opmerking); break
      default: break
    }
  }
  return delen.filter(Boolean).join(' ').toLowerCase()
}

/* ─── Sorteer-header cel ────────────────────────────────────────────────────── */

function THSort({
  children, sortKey, huidig, asc, onClick, right,
}: {
  children: React.ReactNode
  sortKey: UrenKolom
  huidig: UrenKolom
  asc: boolean
  onClick: (k: UrenKolom) => void
  right?: boolean
}) {
  const actief = huidig === sortKey
  return (
    <th
      onClick={() => onClick(sortKey)}
      style={{
        padding: '7px 12px', textAlign: right ? 'right' : 'left', fontSize: 11, fontWeight: 700,
        color: actief ? 'var(--accent)' : 'var(--neutral-500)',
        textTransform: 'uppercase', letterSpacing: '0.04em',
        borderBottom: '2px solid var(--border)', whiteSpace: 'nowrap',
        cursor: 'pointer', userSelect: 'none',
      }}
    >
      {children}{actief ? (asc ? ' ↑' : ' ↓') : ''}
    </th>
  )
}

/* ─── Hoofd component ───────────────────────────────────────────────────────── */

interface Props {
  regels: UrenTabelRegel[]
  totalen: { uren: number; bedrag: number }
  perMedewerker: boolean
  /** Welke kolommen renderen (volgorde ligt vast in KOLOM_VOLGORDE). Default: de dossier-set. */
  kolommen?: UrenKolom[]
  /** Beginsortering. Default 'datum' aflopend. */
  beginSortering?: UrenKolom
  /**
   * Alleen mét dossierId én bewakingscodes is de bewakingscode-kolom bewerkbaar (write-back naar
   * Bouw7). Op het bedrijfsbrede overzicht ontbreken ze → daar is de kolom alleen-lezen.
   */
  dossierId?: string
  bewakingscodes?: BewakingscodeOptie[]
  /**
   * Maximum aantal datarijen dat direct rendert, met een "toon alles"-knop daaronder. Zonder cap
   * zet een heel jaar ruim 5.000 rijen × 15 kolommen in de DOM en wordt sorteren merkbaar traag.
   */
  maxRijen?: number
}

export default function UrenDetailTable({
  regels, totalen, perMedewerker,
  kolommen = DOSSIER_KOLOMMEN,
  beginSortering = 'datum',
  dossierId, bewakingscodes = [],
  maxRijen,
}: Props) {
  const router = useRouter()
  const readOnly = useDossierReadOnly()
  const [pending, start] = useTransition()
  const [sortKey, setSortKey] = useState<UrenKolom>(beginSortering)
  const [sortAsc, setSortAsc] = useState(false)
  const [zoek, setZoek] = useState('')
  const [toonAlles, setToonAlles] = useState(false)

  const zichtbareKolommen = useMemo(
    () => KOLOM_VOLGORDE.filter((k) => kolommen.includes(k)),
    [kolommen],
  )
  const tekstKolommen = zichtbareKolommen.filter((k) => !NUMERIEK.has(k))
  const numeriekeKolommen = zichtbareKolommen.filter((k) => NUMERIEK.has(k))

  function toggleSort(key: UrenKolom) {
    if (sortKey === key) setSortAsc((v) => !v)
    else { setSortKey(key); setSortAsc(true) }
  }

  const codeBewerkbaar = !readOnly && !!dossierId && bewakingscodes.length > 0

  function wijzigCode(regel: UrenTabelRegel, nieuwCode: string) {
    if (!dossierId || !regel.bouw7Id || !regel.bouw7ProjectId || !regel.hourTypeId) return
    const optie = bewakingscodes.find((o) => o.code === nieuwCode)
    if (!optie) return
    start(async () => {
      const res = await updateUurlogBewakingscode(
        dossierId,
        { id: regel.bouw7Id!, bouw7ProjectId: regel.bouw7ProjectId!, logHours: String(regel.uren), logDate: regel.datum ?? '', hourTypeId: regel.hourTypeId! },
        optie.pslId,
      )
      if (res.ok) { toast.success('Bewakingscode bijgewerkt in Bouw7'); router.refresh() }
      else toast.error(res.error ?? 'Bouw7-update mislukt')
    })
  }

  /* Gefilterd + gesorteerd */
  const { rijen, aantalData, gefilterdTotaal } = useMemo(() => {
    const term = zoek.trim().toLowerCase()
    const gefilterd = term
      ? regels.filter((r) => zoekTekst(r, zichtbareKolommen).includes(term))
      : regels

    const gesorteerd = [...gefilterd].sort((a, b) => {
      const va = sorteerWaarde(a, sortKey)
      const vb = sorteerWaarde(b, sortKey)
      const cmp = typeof va === 'number' && typeof vb === 'number'
        ? va - vb
        : String(va).localeCompare(String(vb), 'nl')
      return sortAsc ? cmp : -cmp
    })

    const totaal = {
      uren: gesorteerd.reduce((s, r) => s + r.uren, 0),
      bedrag: gesorteerd.reduce((s, r) => s + r.bedrag, 0),
    }

    // Cap vóór het groeperen, zodat subtotalen bij de getoonde rijen horen.
    const begrensd = maxRijen != null && !toonAlles ? gesorteerd.slice(0, maxRijen) : gesorteerd

    if (!perMedewerker || !GROEPEER_KEYS.has(sortKey)) {
      return {
        rijen: begrensd.map((r) => ({ type: 'data' as const, regel: r })) as TabelRij[],
        aantalData: gesorteerd.length,
        gefilterdTotaal: totaal,
      }
    }

    /* Subtotalen per groep */
    const uit: TabelRij[] = []
    let groep: UrenTabelRegel[] = []
    let huidigLabel = ''

    const sluitGroep = () => {
      if (groep.length === 0) return
      uit.push(...groep.map((g) => ({ type: 'data' as const, regel: g })))
      uit.push({
        type: 'subtotaal',
        label: huidigLabel,
        uren: groep.reduce((s, g) => s + g.uren, 0),
        bedrag: groep.reduce((s, g) => s + g.bedrag, 0),
      })
      groep = []
    }

    for (const r of begrensd) {
      const label = groepLabel(r, sortKey)
      if (label !== huidigLabel) sluitGroep()
      huidigLabel = label
      groep.push(r)
    }
    sluitGroep()

    return { rijen: uit, aantalData: gesorteerd.length, gefilterdTotaal: totaal }
  }, [regels, zoek, sortKey, sortAsc, perMedewerker, zichtbareKolommen, maxRijen, toonAlles])

  const tabel: React.CSSProperties = { width: '100%', borderCollapse: 'collapse' }
  const subtotaalBg = 'var(--neutral-50, #f8fafb)'
  const gefilterd = zoek.trim().length > 0
  const eindTotaal = gefilterd ? gefilterdTotaal : totalen
  const afgekapt = maxRijen != null && !toonAlles && aantalData > maxRijen

  /* ── Simpele bewakingscode-fallback (geen interactiviteit nodig) ── */
  if (!perMedewerker) {
    return (
      <table style={tabel}>
        <thead>
          <tr>
            <TH>Bewakingscode</TH><TH>Omschrijving</TH>
            <TH right>Geboekte uren</TH><TH right>Gem. tarief</TH><TH right>Arbeidskosten</TH>
          </tr>
        </thead>
        <tbody>
          {regels.map((r, i) => (
            <tr key={i}>
              <TD>{r.code ?? '—'}</TD><TD>{r.codeNaam ?? '—'}</TD>
              <TD right>{fmtUren(r.uren)}</TD><TD right>{fmtTarief(r.uurtarief)}</TD>
              <TD right accent={r.bedrag > 0}>{fmt(r.bedrag)}</TD>
            </tr>
          ))}
          <tr style={{ background: 'var(--neutral-100, #eef2f3)' }}>
            <TD vet>Totaal</TD><TD>{''}</TD>
            <TD right vet>{fmtUren(totalen.uren, true)}</TD><TD>{''}</TD>
            <TD right vet>{fmt(totalen.bedrag, true)}</TD>
          </tr>
        </tbody>
      </table>
    )
  }

  /** Celinhoud per kolom. */
  function cel(k: UrenKolom, r: UrenTabelRegel): React.ReactNode {
    switch (k) {
      case 'medewerker':
        return <TD>{r.medewerker ?? '—'}</TD>
      case 'dossier':
        return (
          <TD>
            {r.dossierHref ? (
              <Link href={r.dossierHref} style={{ color: 'var(--accent)', textDecoration: 'none' }} title={dossierLabel(r)}>
                {dossierLabel(r)}
              </Link>
            ) : (
              <span title={dossierLabel(r)}>{dossierLabel(r)}</span>
            )}
          </TD>
        )
      case 'datum':
        return <TD>{fmtDatum(r.datum)}</TD>
      case 'weeknummer':
        return <TD>{fmtWeek(r.datum)}</TD>
      case 'uursoort':
        return <TD>{r.uursoort ?? '—'}</TD>
      case 'code':
        return (
          <TD>
            {codeBewerkbaar && r.bouw7Id != null ? (
              <select
                disabled={pending}
                value={r.code ?? ''}
                onChange={(e) => wijzigCode(r, e.target.value)}
                style={{
                  fontSize: 12, border: '1px solid var(--neutral-200)', borderRadius: 4,
                  padding: '2px 4px', background: 'var(--neutral-50)', cursor: 'pointer', minWidth: 120,
                }}
              >
                {!r.code && <option value="">— geen code —</option>}
                {bewakingscodes.map((o) => (
                  <option key={o.pslId} value={o.code}>
                    {o.code}{o.naam ? ` · ${o.naam}` : ''}
                  </option>
                ))}
              </select>
            ) : (
              r.code ? `${r.code}${r.codeNaam ? ` · ${r.codeNaam}` : ''}` : '—'
            )}
          </TD>
        )
      case 'geaccordeerd':
        return (
          <TD kleur={r.geaccordeerd ? GROEN : ROOD}>
            <span style={{ fontWeight: 600 }}>{r.geaccordeerd ? 'Ja' : 'Nee'}</span>
          </TD>
        )
      case 'geaccordeerdDoor':
        return <TD>{r.geaccordeerdDoor ?? '—'}</TD>
      case 'geaccordeerdOp':
        return <TD>{fmtDatum(r.geaccordeerdOp ?? null)}</TD>
      case 'dienstverband':
        return <TD>{r.extern ? 'Extern' : 'Intern'}</TD>
      case 'projectleider':
        return <TD>{r.projectleider ?? '—'}</TD>
      case 'opmerking':
        return <TD><span title={r.opmerking ?? undefined}>{r.opmerking ?? '—'}</span></TD>
      case 'uren':
        return <TD right>{fmtUren(r.uren)}</TD>
      case 'uurtarief':
        return <TD right>{fmtTarief(r.uurtarief)}</TD>
      case 'bedrag':
        return <TD right accent={r.bedrag > 0}>{fmt(r.bedrag)}</TD>
    }
  }

  /** Numerieke cellen van een totaal-/subtotaalregel (uurtarief blijft leeg). */
  function totaalCellen(waarden: { uren: number; bedrag: number }, stijl: React.CSSProperties) {
    return numeriekeKolommen.map((k) => {
      if (k === 'uurtarief') return <td key={k} style={{ padding: '5px 12px' }} />
      const isUren = k === 'uren'
      return (
        <td
          key={k}
          style={{
            padding: '5px 12px', textAlign: 'right', whiteSpace: 'nowrap',
            color: isUren ? 'var(--neutral-900)' : 'var(--accent)', ...stijl,
          }}
        >
          {isUren ? fmtUren(waarden.uren, true) : fmt(waarden.bedrag, true)}
        </td>
      )
    })
  }

  return (
    <div>
      {/* Zoekbalk */}
      <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--neutral-100)' }}>
        <input
          type="search"
          placeholder={kolommen.includes('dossier')
            ? 'Zoeken op medewerker, dossier, week, uursoort, bewakingscode…'
            : 'Zoeken op medewerker, week, uursoort, bewakingscode…'}
          value={zoek}
          onChange={(e) => setZoek(e.target.value)}
          style={{
            width: '100%', padding: '6px 10px', fontSize: 13,
            border: '1px solid var(--neutral-200)', borderRadius: 6,
            background: 'var(--neutral-50)', outline: 'none',
            boxSizing: 'border-box',
          }}
        />
      </div>

      {/* Tabel */}
      <div style={{ overflowX: 'auto', opacity: pending ? 0.6 : 1 }}>
        <table style={tabel}>
          <thead>
            <tr>
              {zichtbareKolommen.map((k) => (
                <THSort key={k} sortKey={k} huidig={sortKey} asc={sortAsc} onClick={toggleSort} right={NUMERIEK.has(k)}>
                  {KOLOM_LABEL[k]}
                </THSort>
              ))}
            </tr>
          </thead>
          <tbody>
            {rijen.map((rij, i) => {
              if (rij.type === 'subtotaal') {
                return (
                  <tr key={`sub-${i}`} style={{ background: subtotaalBg, borderTop: '1px solid var(--neutral-200)' }}>
                    <td colSpan={tekstKolommen.length} style={{ padding: '5px 12px', fontSize: 12, fontWeight: 600, color: 'var(--neutral-600)' }}>
                      Subtotaal — {rij.label}
                    </td>
                    {totaalCellen(rij, { fontSize: 12, fontWeight: 700 })}
                  </tr>
                )
              }
              const r = rij.regel
              return (
                <tr key={i}>
                  {zichtbareKolommen.map((k) => <Fragment key={k}>{cel(k, r)}</Fragment>)}
                </tr>
              )
            })}

            {/* Eindtotaal */}
            <tr style={{ background: 'var(--neutral-100, #eef2f3)' }}>
              <td colSpan={tekstKolommen.length} style={{ padding: '6px 12px', fontSize: 13, fontWeight: 700, color: 'var(--neutral-900)' }}>
                Totaal{gefilterd ? ` (${aantalData} van ${regels.length} regels)` : ''}
              </td>
              {totaalCellen(eindTotaal, { fontSize: 13, fontWeight: 700 })}
            </tr>
          </tbody>
        </table>
      </div>

      {afgekapt && (
        <div style={{
          padding: '8px 12px', borderTop: '1px solid var(--neutral-100)',
          display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: 11.5, color: 'var(--neutral-500)' }}>
            Eerste {maxRijen} van {aantalData} regels getoond — het totaal hieronder telt alle {aantalData} regels.
          </span>
          <button
            onClick={() => setToonAlles(true)}
            style={{
              padding: '4px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
              border: '1px solid var(--neutral-200)', borderRadius: 6,
              background: 'var(--neutral-50)', color: 'var(--neutral-800)',
            }}
          >
            Toon alle {aantalData} regels
          </button>
        </div>
      )}

      {gefilterd && (
        <div style={{ padding: '6px 12px', fontSize: 11.5, color: 'var(--neutral-500)', borderTop: '1px solid var(--neutral-100)' }}>
          {aantalData} regels gevonden voor &quot;{zoek}&quot;
        </div>
      )}
    </div>
  )
}
