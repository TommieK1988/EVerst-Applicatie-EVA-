'use client'

import React, { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter, Badge, Button,
} from '@/components/ui'
import { fmtDatum } from './tab-ui'
import {
  verplaatsGeboekteKost, hercodeerGeboekteKost, wisInkoopCorrectie,
  hercodeerGeboekteKostenBulk, verplaatsGeboekteKostenBulk, wisInkoopCorrectiesBulk,
  getInkoopFactuurDetail,
  type GeboekteKostenRegel, type ProjectBewakingscode, type InkoopFactuurDetail,
} from '@/lib/dossiers/actions'
import {
  SlidersHorizontal, Search, ChevronUp, ChevronDown, ChevronsUpDown, ChevronRight,
  ExternalLink, FileText, Lock,
} from 'lucide-react'
import { useDossierReadOnly } from '../DossierReadOnlyContext'

/** Bouw7 opent een inkoopfactuur op deze URL — hiermee kan de gebruiker de factuur zelf inzien. */
const bouw7FactuurUrl = (invoiceId: number) => `https://start.bouw7.nl/purchase-invoice#/view/${invoiceId}`
/** Factuurdocument via de EVA-proxy (Bouw7-download vereist een Bearer-token). */
const documentUrl = (hash: string, naam: string | null) =>
  `/api/bouw7/bestand/${encodeURIComponent(hash)}${naam ? `?naam=${encodeURIComponent(naam)}` : ''}`

type OrderOptie = { orderId: number; nummer: string | null; leverancier: string | null; omschrijving: string | null }
type ContractOptie = { contractId: number; onderaannemer: string | null; omschrijving: string | null }

type Props = {
  dossierId: string
  data: GeboekteKostenRegel[]
  orders: OrderOptie[]
  contracten: ContractOptie[]
  projectcodes: ProjectBewakingscode[]
}

const euro = (n: number | null | undefined): string =>
  n == null ? '—' : new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)

/**
 * Dropdown-waarde van een bewakingscode: hoofdstuk + code. Codes zijn niet uniek per project,
 * dus de code alleen is niet genoeg om te bepalen waar de kost in Bouw7 naartoe moet.
 */
const codeKey = (c: ProjectBewakingscode): string => `${c.hoofdstukId ?? ''}|${c.code}`
const parseCodeKey = (v: string): { hoofdstukId: number | null; code: string } => {
  const i = v.indexOf('|')
  const h = v.slice(0, i)
  return { hoofdstukId: h ? Number(h) : null, code: v.slice(i + 1) }
}
const codeLabel = (c: ProjectBewakingscode): string =>
  `${c.code}${c.naam ? ` · ${c.naam}` : ''}${c.hoofdstukNaam ? ` (${c.hoofdstukNaam})` : ''}`

/**
 * Codes waar een kost naartoe kan: alles wat in de bewakingsstructuur van het Bouw7-project staat.
 * Staat de code daar nog niet onder de kostensoort van de kost, dan voegt EVA die bij het
 * verplaatsen toe (begroot 0). Codes zonder hoofdstuk komen niet uit die structuur — ze zijn
 * alleen aangevuld om een bestaande codering zichtbaar te houden, en zijn geen geldig doel.
 */
const kiesbareCodes = (codes: ProjectBewakingscode[]): ProjectBewakingscode[] =>
  codes.filter((c) => c.hoofdstukId != null)

const selectStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px', fontSize: 13, borderRadius: 8,
  border: '1px solid var(--border)', background: 'white', color: 'var(--fg)',
}

type Kolom = {
  key: string
  label: string
  right?: boolean
  breedte?: number
  waarde: (r: GeboekteKostenRegel) => string | number
  render: (r: GeboekteKostenRegel) => React.ReactNode
}

const aantalFmt = (n: number | null): string =>
  n == null ? '—' : new Intl.NumberFormat('nl-NL', { maximumFractionDigits: 2 }).format(n)

/**
 * Uitgeklapte inhoud van één inkoopfactuur: de échte factuurregels + het factuurdocument.
 * Wordt lazy opgehaald (één Bouw7-call per factuur) zodat een dossier met >100 facturen niet
 * evenveel calls doet bij het laden van de tab.
 */
function FactuurRegels({
  dossierId, regel,
}: { dossierId: string; regel: GeboekteKostenRegel }) {
  const [detail, setDetail] = useState<InkoopFactuurDetail | null>(null)
  const [fout, setFout] = useState<string | null>(null)

  React.useEffect(() => {
    let afgebroken = false
    getInkoopFactuurDetail(dossierId, regel.bronId).then((res) => {
      if (afgebroken) return
      if (res.ok) setDetail(res.detail)
      else setFout(res.error)
    })
    return () => { afgebroken = true }
  }, [dossierId, regel.bronId])

  const linkStyle: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 8px', fontSize: 11.5,
    borderRadius: 6, border: '1px solid var(--border)', background: 'white', color: 'var(--fg)',
    textDecoration: 'none',
  }
  const th: React.CSSProperties = {
    padding: '4px 8px', textAlign: 'left', fontSize: 10.5, fontWeight: 700, color: 'var(--neutral-500)',
    textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '1px solid var(--border)',
  }
  const td: React.CSSProperties = {
    padding: '4px 8px', fontSize: 12, color: 'var(--neutral-700)',
    borderBottom: '1px solid var(--neutral-100, #f4f7f8)',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--neutral-600)' }}>
          Factuurregels{detail ? ` (${detail.regels.length})` : ''}
        </span>
        <span style={{ flex: 1 }} />
        {detail?.documentHash && (
          <a href={documentUrl(detail.documentHash, detail.documentNaam)} target="_blank" rel="noreferrer" style={linkStyle}>
            <FileText size={12} /> Factuur (PDF)
          </a>
        )}
        <a href={bouw7FactuurUrl(regel.bronId)} target="_blank" rel="noreferrer" style={linkStyle}>
          <ExternalLink size={12} /> Open in Bouw7
        </a>
      </div>

      {fout ? (
        <div style={{ fontSize: 12, color: 'var(--danger-700, #b91c1c)' }}>Regels ophalen mislukt: {fout}</div>
      ) : !detail ? (
        <div style={{ fontSize: 12, color: 'var(--neutral-500)' }}>Regels laden…</div>
      ) : detail.regels.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--neutral-500)' }}>Deze factuur heeft geen regels in Bouw7.</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', background: 'white', borderRadius: 6 }}>
          <thead>
            <tr>
              <th style={th}>Omschrijving</th>
              <th style={th}>Leverbon</th>
              <th style={th}>Bewakingscode</th>
              <th style={{ ...th, textAlign: 'right' }}>Aantal</th>
              <th style={{ ...th, textAlign: 'right' }}>Stukprijs</th>
              <th style={{ ...th, textAlign: 'right' }}>Subtotaal</th>
              <th style={{ ...th, textAlign: 'right' }}>BTW</th>
            </tr>
          </thead>
          <tbody>
            {detail.regels.map((rg) => (
              <tr key={rg.regelId}>
                <td style={{ ...td, whiteSpace: 'normal' }}>{rg.omschrijving || '—'}</td>
                <td style={{ ...td, whiteSpace: 'nowrap', color: 'var(--neutral-500)' }}>{rg.bonnummer ?? '—'}</td>
                <td style={{ ...td, whiteSpace: 'nowrap' }}>
                  {rg.code
                    ? <span title={rg.codeNaam ?? undefined}>{rg.code}</span>
                    : <span style={{ color: 'var(--neutral-400)' }}>—</span>}
                </td>
                <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>{aantalFmt(rg.aantal)}</td>
                <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>{euro(rg.stukprijs)}</td>
                <td style={{ ...td, textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap' }}>{euro(rg.subtotaal)}</td>
                <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap', color: 'var(--neutral-500)' }}>
                  {rg.btwPercentage != null ? `${rg.btwPercentage}%` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={5} style={{ ...td, textAlign: 'right', fontWeight: 700 }}>Totaal excl. BTW</td>
              <td style={{ ...td, textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap' }}>
                {euro(detail.regels.reduce((s, rg) => s + rg.subtotaal, 0))}
              </td>
              <td style={td} />
            </tr>
          </tfoot>
        </table>
      )}
    </div>
  )
}

type SubtotaalRij = { _sub: true; label: string; bedrag: number }
type DisplayRij = GeboekteKostenRegel | SubtotaalRij
const isSub = (r: DisplayRij): r is SubtotaalRij => '_sub' in r

const GROEPEERBARE_KEYS = new Set(['leverancier', 'typeKosten', 'code'])

export default function GeboekteKostenTabel({ dossierId, data, orders, contracten, projectcodes }: Props) {
  const router = useRouter()
  const readOnly = useDossierReadOnly()
  const [pending, start] = useTransition()
  const [actief, setActief] = useState<GeboekteKostenRegel | null>(null)
  const [sel, setSel] = useState<Set<number>>(new Set())
  const [open, setOpen] = useState<Set<number>>(new Set())
  const [zoek, setZoek] = useState('')
  const [sortKey, setSortKey] = useState<string>('datum')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const kolommen: Kolom[] = useMemo(() => [
    {
      key: 'factuurnummer', label: 'Factuurnr.', waarde: (r) => r.factuurnummer ?? '',
      render: (r) => (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontWeight: 600, color: 'var(--fg)' }}>
          {r.factuurnummer ?? '—'}
          {r.gecorrigeerd && (
            <span
              title="Handmatig gecorrigeerd in EVA"
              style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--warning-500, #f59e0b)', display: 'inline-block', flexShrink: 0 }}
            />
          )}
        </span>
      ),
    },
    {
      key: 'leverancier', label: 'Leverancier / OA', waarde: (r) => r.leverancier ?? '',
      render: (r) => (
        <span title={r.leverancierType === 'onderaannemer' ? 'Onderaannemer' : 'Leverancier'}>
          {r.leverancier ?? '—'}{r.leverancierType === 'onderaannemer' ? ' (OA)' : ''}
        </span>
      ),
    },
    {
      key: 'omschrijving', label: 'Omschrijving', breedte: 240, waarde: (r) => r.omschrijving ?? '',
      render: (r) => (
        <span style={{ display: 'block', maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--fg-soft)' }} title={r.omschrijving ?? undefined}>
          {r.omschrijving ?? '—'}
        </span>
      ),
    },
    { key: 'typeKosten', label: 'Type', waarde: (r) => r.typeKosten ?? '', render: (r) => r.typeKosten ?? '—' },
    {
      key: 'code', label: 'Bewakingscode', breedte: 180, waarde: (r) => r.code ?? '',
      render: (r) => (
        <span
          style={{ display: 'flex', alignItems: 'center', gap: 4, maxWidth: 180, overflow: 'hidden' }}
          title={r.contractGebonden
            ? `${r.codeNaam ?? ''}${r.codeNaam ? ' — ' : ''}Vast: de code komt uit het inkooporder/OA-contract`
            : r.codeNaam ?? undefined}
        >
          {r.contractGebonden && <Lock size={11} style={{ flexShrink: 0, color: 'var(--neutral-400)' }} />}
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {r.code ?? '— niet gecodeerd'}{r.codeNaam ? ` · ${r.codeNaam}` : ''}
          </span>
        </span>
      ),
    },
    { key: 'datum', label: 'Datum', waarde: (r) => r.datum ?? '', render: (r) => fmtDatum(r.datum) },
    { key: 'vervaldatum', label: 'Vervaldatum', waarde: (r) => r.vervaldatum ?? '', render: (r) => fmtDatum(r.vervaldatum) },
    {
      key: 'betaald', label: 'Betaald', waarde: (r) => (r.betaald ? 1 : 0),
      render: (r) => <Badge tone={r.betaald ? 'success' : 'neutral'} size="sm">{r.betaald ? 'Ja' : 'Nee'}</Badge>,
    },
    {
      key: 'bedrag', label: 'Bedrag excl.', right: true, waarde: (r) => r.bedrag,
      render: (r) => <span style={{ fontWeight: 600, color: 'var(--fg)' }}>{euro(r.bedrag)}</span>,
    },
  ], [])

  const rijen = useMemo(() => {
    const q = zoek.trim().toLowerCase()
    let r = data
    if (q) {
      r = data.filter((row) =>
        [row.factuurnummer, row.leverancier, row.omschrijving, row.typeKosten, row.code, row.codeNaam]
          .some((v) => (v ?? '').toLowerCase().includes(q)))
    }
    const kol = kolommen.find((k) => k.key === sortKey)
    if (kol) {
      const dir = sortDir === 'asc' ? 1 : -1
      r = [...r].sort((a, b) => {
        const va = kol.waarde(a), vb = kol.waarde(b)
        if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir
        return String(va).localeCompare(String(vb), 'nl') * dir
      })
    }
    return r
  }, [data, zoek, sortKey, sortDir, kolommen])

  const displayRijen = useMemo((): DisplayRij[] => {
    if (!GROEPEERBARE_KEYS.has(sortKey)) return rijen
    const kol = kolommen.find(k => k.key === sortKey)
    if (!kol) return rijen

    const result: DisplayRij[] = []
    let groepLabel: string | null = null
    let groepBedrag = 0

    for (const rij of rijen) {
      const label = String(kol.waarde(rij))
      if (groepLabel !== null && label !== groepLabel) {
        result.push({ _sub: true, label: groepLabel, bedrag: groepBedrag })
        groepBedrag = 0
      }
      groepLabel = label
      groepBedrag += rij.bedrag
      result.push(rij)
    }
    if (groepLabel !== null) {
      result.push({ _sub: true, label: groepLabel, bedrag: groepBedrag })
    }
    return result
  }, [rijen, sortKey, kolommen])

  const sorteer = (key: string) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir('asc') }
  }

  // `melding` komt terug bij een gedeeltelijk resultaat (bv. bulk-verplaatsing waarbij een paar
  // regels zijn overgeslagen) — die tekst is informatiever dan de standaard succesmelding.
  type ActieResultaat = { ok: boolean; error?: string; melding?: string }
  const doe = (actie: () => Promise<ActieResultaat>, succes: string) => {
    start(async () => {
      const res = await actie()
      if (res.ok) { toast.success(res.melding ?? succes); setActief(null); router.refresh() }
      else toast.error(res.error ?? 'Mislukt', { duration: 8000 })
    })
  }

  // Bulk-actie op de geselecteerde regels — leegt de selectie bij succes.
  const doeBulk = (actie: () => Promise<ActieResultaat>, succes: string) => {
    start(async () => {
      const res = await actie()
      if (res.ok) { toast.success(res.melding ?? succes, { duration: res.melding ? 10000 : 4000 }); setSel(new Set()); router.refresh() }
      else toast.error(res.error ?? 'Mislukt', { duration: 10000 })
    })
  }

  const toggleSel = (bronId: number) =>
    setSel((prev) => { const n = new Set(prev); n.has(bronId) ? n.delete(bronId) : n.add(bronId); return n })

  const toggleOpen = (bronId: number) =>
    setOpen((prev) => { const n = new Set(prev); n.has(bronId) ? n.delete(bronId) : n.add(bronId); return n })

  const totaal = useMemo(() => rijen.reduce((s, r) => s + r.bedrag, 0), [rijen])
  const totaalAlles = useMemo(() => data.reduce((s, r) => s + r.bedrag, 0), [data])
  const totaalToegewezen = useMemo(() =>
    data.filter(r => r.toegewezenOrderId != null || r.toegewezenContractId != null).reduce((s, r) => s + r.bedrag, 0),
  [data])
  const totaalNietToegewezen = totaalAlles - totaalToegewezen

  // Regels die niet mogen (contractgebonden, geen leverbon) worden server-side benoemd overgeslagen.
  const bulkCodes = useMemo(() => kiesbareCodes(projectcodes), [projectcodes])

  const huidigeDoelwaarde = actief
    ? actief.toegewezenOrderId != null ? `order:${actief.toegewezenOrderId}`
      : actief.toegewezenContractId != null ? `contract:${actief.toegewezenContractId}` : ''
    : ''

  // Codes waar déze kost naartoe kan, plus de huidige waarde in dezelfde vorm als de opties.
  const actiefCodes = useMemo(() => (actief ? kiesbareCodes(projectcodes) : []), [actief, projectcodes])
  const huidigeCodeWaarde = useMemo(() => {
    if (!actief?.code) return ''
    return codeKey(actiefCodes.find((c) => c.code === actief.code) ?? projectcodes.find((c) => c.code === actief.code) ?? { code: actief.code, hoofdstukId: null } as ProjectBewakingscode)
  }, [actief, actiefCodes, projectcodes])

  const thStyle = (right?: boolean): React.CSSProperties => ({
    padding: '6px 10px', textAlign: right ? 'right' : 'left', fontSize: 11, fontWeight: 700,
    color: 'var(--neutral-500)', textTransform: 'uppercase', letterSpacing: '0.04em',
    borderBottom: '2px solid var(--border)', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none',
  })
  const tdStyle = (right?: boolean): React.CSSProperties => ({
    padding: '3px 10px', fontSize: 12.5, textAlign: right ? 'right' : 'left', color: 'var(--neutral-700)',
    borderBottom: '1px solid var(--neutral-100, #f4f7f8)', whiteSpace: 'nowrap',
  })
  const subStyle = (right?: boolean): React.CSSProperties => ({
    padding: '2px 10px', fontSize: 11.5, textAlign: right ? 'right' : 'left',
    background: 'var(--neutral-100, #f0f4f5)',
    borderTop: '1px solid var(--border)',
    borderBottom: '2px solid var(--border)',
    color: 'var(--neutral-600)',
    whiteSpace: 'nowrap',
  })

  return (
    <>
      {/* Zoekbalk */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderBottom: '1px solid var(--neutral-100, #f4f7f8)' }}>
        <div style={{ position: 'relative', flex: '0 0 280px' }}>
          <Search size={14} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--neutral-400)' }} />
          <input
            value={zoek}
            onChange={(e) => setZoek(e.target.value)}
            placeholder="Zoeken…"
            style={{ width: '100%', padding: '6px 10px 6px 28px', fontSize: 13, borderRadius: 8, border: '1px solid var(--border)', background: 'white', color: 'var(--fg)' }}
          />
        </div>
        <span style={{ fontSize: 12, color: 'var(--neutral-500)' }}>{rijen.length} regel{rijen.length === 1 ? '' : 's'}</span>
      </div>

      {/* Bulk-balk: zichtbaar zodra er regels geselecteerd zijn */}
      {!readOnly && sel.size > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '10px 12px', background: 'var(--brand-50, #eff6ff)', borderBottom: '1px solid var(--neutral-100, #f4f7f8)' }}>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--fg)' }}>{sel.size} geselecteerd</span>
          <select
            style={{ ...selectStyle, width: 'auto', padding: '6px 10px' }}
            disabled={pending}
            value=""
            onChange={(e) => {
              const v = e.target.value
              if (!v) return
              const { code, hoofdstukId } = parseCodeKey(v)
              doeBulk(() => hercodeerGeboekteKostenBulk(dossierId, [...sel], code, hoofdstukId), `${sel.size} regel(s) verplaatst`)
            }}
          >
            <option value="">Verplaats naar bewakingscode…</option>
            {bulkCodes.map((p) => (
              <option key={codeKey(p)} value={codeKey(p)}>{codeLabel(p)}</option>
            ))}
          </select>
          <select
            style={{ ...selectStyle, width: 'auto', padding: '6px 10px' }}
            disabled={pending}
            value=""
            onChange={(e) => {
              const v = e.target.value
              if (!v) return
              const doel = v.startsWith('order:') ? { orderId: Number(v.slice(6)) }
                : v.startsWith('contract:') ? { contractId: Number(v.slice(9)) }
                : {}
              doeBulk(() => verplaatsGeboekteKostenBulk(dossierId, [...sel], doel), `${sel.size} regel(s) toegewezen`)
            }}
          >
            <option value="">Toewijzen aan order / contract…</option>
            <option value="none">— Niet toegewezen —</option>
            {orders.length > 0 && (
              <optgroup label="Inkooporders">
                {orders.map((o) => (
                  <option key={`o${o.orderId}`} value={`order:${o.orderId}`}>
                    {[o.nummer, o.omschrijving, o.leverancier].filter(Boolean).join(' · ') || `Order ${o.orderId}`}
                  </option>
                ))}
              </optgroup>
            )}
            {contracten.length > 0 && (
              <optgroup label="Onderaannemerscontracten">
                {contracten.map((c) => (
                  <option key={`c${c.contractId}`} value={`contract:${c.contractId}`}>
                    {[c.onderaannemer, c.omschrijving].filter(Boolean).join(' · ') || `Contract ${c.contractId}`}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
          <Button variant="ghost" disabled={pending} onClick={() => doeBulk(() => wisInkoopCorrectiesBulk(dossierId, [...sel]), 'Correcties ongedaan gemaakt')}>
            Correctie wissen
          </Button>
          <Button variant="secondary" disabled={pending} onClick={() => setSel(new Set())}>Deselecteren</Button>
        </div>
      )}

      {/* Tabel */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ ...thStyle(), width: 36, cursor: 'default', textAlign: 'center' }}>
                {!readOnly && (
                  <input
                    type="checkbox"
                    aria-label="Alles selecteren"
                    checked={rijen.length > 0 && rijen.every((r) => sel.has(r.bronId))}
                    ref={(el) => { if (el) el.indeterminate = sel.size > 0 && !rijen.every((r) => sel.has(r.bronId)) }}
                    onChange={(e) => setSel(e.target.checked ? new Set(rijen.map((r) => r.bronId)) : new Set())}
                  />
                )}
              </th>
              {kolommen.map((k) => (
                <th key={k.key} style={thStyle(k.right)} onClick={() => sorteer(k.key)}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, flexDirection: k.right ? 'row-reverse' : 'row' }}>
                    {k.label}
                    {sortKey === k.key
                      ? (sortDir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />)
                      : <ChevronsUpDown size={11} style={{ opacity: 0.35 }} />}
                  </span>
                </th>
              ))}
              <th style={{ ...thStyle(true), cursor: 'default' }} />
            </tr>
          </thead>
          <tbody>
            {displayRijen.map((item, i) => {
              if (isSub(item)) {
                return (
                  <tr key={`sub-${i}`}>
                    <td style={subStyle()} />
                    <td colSpan={kolommen.length - 1} style={subStyle()}>
                      <span style={{ fontWeight: 600 }}>↳ Subtotaal</span>
                      {item.label
                        ? <span style={{ marginLeft: 6, color: 'var(--neutral-500)', fontWeight: 400 }}>{item.label}</span>
                        : <span style={{ marginLeft: 6, color: 'var(--neutral-400)', fontWeight: 400 }}>(niet gecodeerd)</span>}
                    </td>
                    <td style={{ ...subStyle(true), fontWeight: 700, color: 'var(--neutral-800)' }}>{euro(item.bedrag)}</td>
                    <td style={subStyle(true)} />
                  </tr>
                )
              }
              const r = item
              const isOpen = open.has(r.bronId)
              return (
                <React.Fragment key={r.bronId}>
                  <tr style={{ background: sel.has(r.bronId) ? 'color-mix(in srgb, var(--brand-50, #eff6ff) 70%, transparent)' : r.gecorrigeerd ? 'color-mix(in srgb, var(--warning-50, #fff7ed) 60%, transparent)' : undefined }}>
                    <td style={{ ...tdStyle(), textAlign: 'center' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                        <button
                          onClick={() => toggleOpen(r.bronId)}
                          aria-expanded={isOpen}
                          title={isOpen ? 'Inklappen' : 'Inkoopregels tonen'}
                          style={{ display: 'inline-flex', padding: 1, border: 'none', background: 'none', color: 'var(--neutral-500)', cursor: 'pointer' }}
                        >
                          {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </button>
                        {!readOnly && (
                          <input type="checkbox" aria-label="Selecteer regel" checked={sel.has(r.bronId)} onChange={() => toggleSel(r.bronId)} />
                        )}
                      </span>
                    </td>
                    {kolommen.map((k) => <td key={k.key} style={tdStyle(k.right)}>{k.render(r)}</td>)}
                    <td style={{ ...tdStyle(true) }}>
                      {!readOnly && (
                        <button
                          onClick={() => setActief(r)}
                          title="Toewijzen / hercoderen"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 8px', fontSize: 11.5, borderRadius: 6, border: '1px solid var(--border)', background: 'white', color: 'var(--fg)', cursor: 'pointer' }}
                        >
                          <SlidersHorizontal size={12} /> Corrigeren
                        </button>
                      )}
                    </td>
                  </tr>
                  {isOpen && (
                    <tr>
                      <td style={{ ...tdStyle(), background: 'var(--neutral-50)' }} />
                      <td colSpan={kolommen.length + 1} style={{ ...tdStyle(), background: 'var(--neutral-50)', whiteSpace: 'normal', padding: '8px 10px' }}>
                        <FactuurRegels dossierId={dossierId} regel={r} />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              )
            })}
            <tr style={{ background: 'var(--neutral-50)' }}>
              <td style={tdStyle()} />
              <td style={{ ...tdStyle(), fontWeight: 700, color: 'var(--neutral-900)' }} colSpan={kolommen.length - 1}>Totaal{zoek ? ' (gefilterd)' : ''}</td>
              <td style={{ ...tdStyle(true), fontWeight: 700, color: 'var(--neutral-900)' }}>{euro(totaal)}</td>
              <td style={tdStyle(true)} />
            </tr>
            <tr style={{ background: 'var(--neutral-50)' }}>
              <td style={tdStyle()} />
              <td style={{ ...tdStyle(), fontSize: 11, color: 'var(--neutral-500)' }} colSpan={kolommen.length - 1}>↳ Gekoppeld aan order / contract</td>
              <td style={{ ...tdStyle(true), fontSize: 11, color: 'var(--neutral-500)' }}>{euro(totaalToegewezen)}</td>
              <td style={tdStyle(true)} />
            </tr>
            <tr style={{ background: 'var(--neutral-50)' }}>
              <td style={tdStyle()} />
              <td style={{ ...tdStyle(), fontSize: 11, color: 'var(--neutral-500)' }} colSpan={kolommen.length - 1}>↳ Niet gekoppeld</td>
              <td style={{ ...tdStyle(true), fontSize: 11, color: totaalNietToegewezen > 0 ? 'var(--neutral-700)' : 'var(--neutral-400)' }}>{euro(totaalNietToegewezen)}</td>
              <td style={tdStyle(true)} />
            </tr>
          </tbody>
        </table>
      </div>

      <Dialog open={!!actief} onOpenChange={(o) => { if (!o) setActief(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Geboekte kost corrigeren</DialogTitle>
          </DialogHeader>
          {actief && (
            <DialogBody style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div style={{ fontSize: 12.5, color: 'var(--fg-soft)', lineHeight: 1.6 }}>
                <div><strong style={{ color: 'var(--fg)' }}>{actief.factuurnummer ?? '—'}</strong> · {actief.leverancier ?? '—'}</div>
                <div>{euro(actief.bedrag)} excl. btw · {actief.typeKosten ?? '—'} · {fmtDatum(actief.datum)}</div>
                <div style={{ fontSize: 11.5, color: 'var(--fg-muted)', marginTop: 4 }}>
                  {actief.linkBron === 'bouw7'
                    ? 'Huidige koppeling via Bouw7-bonnummer. '
                    : actief.linkBron === 'eva'
                    ? 'Handmatig toegewezen in EVA. '
                    : 'Niet gekoppeld aan een order of contract. '}
                  De toewijzing aan een order/contract is alleen een EVA-berekening; een gewijzigde
                  bewakingscode gaat wél naar Bouw7.
                </div>
              </div>

              <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--fg)' }}>Toewijzen aan inkooporder / OA-contract</span>
                <select
                  style={selectStyle}
                  disabled={pending}
                  value={huidigeDoelwaarde}
                  onChange={(e) => {
                    const v = e.target.value
                    const doel = v.startsWith('order:') ? { orderId: Number(v.slice(6)) }
                      : v.startsWith('contract:') ? { contractId: Number(v.slice(9)) }
                      : {}
                    doe(() => verplaatsGeboekteKost(dossierId, actief.bronId, doel), 'Toewijzing bijgewerkt')
                  }}
                >
                  <option value="">— Niet toegewezen —</option>
                  {orders.length > 0 && (
                    <optgroup label="Inkooporders">
                      {orders.map((o) => (
                        <option key={`o${o.orderId}`} value={`order:${o.orderId}`}>
                          {[o.nummer, o.omschrijving, o.leverancier].filter(Boolean).join(' · ') || `Order ${o.orderId}`}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {contracten.length > 0 && (
                    <optgroup label="Onderaannemerscontracten">
                      {contracten.map((c) => (
                        <option key={`c${c.contractId}`} value={`contract:${c.contractId}`}>
                          {[c.onderaannemer, c.omschrijving].filter(Boolean).join(' · ') || `Contract ${c.contractId}`}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </label>

              {/* Oude EVA-only correctie: de code stond wel in EVA maar niet in Bouw7, waardoor het
                  Financieel-tab afweek. Eén klik zet hem alsnog door. */}
              {actief.code && actief.code !== actief.bronCode && !actief.contractGebonden && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '8px 10px', borderRadius: 8, background: 'var(--warning-50, #fff7ed)', border: '1px solid var(--warning-200, #fed7aa)' }}>
                  <span style={{ fontSize: 11.5, color: 'var(--fg-soft)', flex: 1, minWidth: 200 }}>
                    In Bouw7 staat deze kost nog op <strong>{actief.bronCode ?? 'geen code'}</strong>. De
                    correctie naar <strong>{actief.code}</strong> geldt alleen in EVA — het Financieel-tab wijkt daardoor af.
                  </span>
                  <Button
                    variant="secondary"
                    disabled={pending || !actiefCodes.some((c) => c.code === actief.code)}
                    onClick={() => {
                      const doelCode = actiefCodes.find((c) => c.code === actief.code)
                      if (!doelCode) return
                      doe(() => hercodeerGeboekteKost(dossierId, actief.bronId, doelCode.code, doelCode.hoofdstukId), `Verplaatst naar ${doelCode.code}`)
                    }}
                  >
                    Ook in Bouw7 zetten
                  </Button>
                </div>
              )}

              <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--fg)' }}>Bewakingscode</span>
                <select
                  style={selectStyle}
                  disabled={pending || actief.contractGebonden || actiefCodes.length === 0}
                  value={actief.contractGebonden ? '' : huidigeCodeWaarde}
                  onChange={(e) => {
                    const v = e.target.value
                    if (!v) return
                    const { code, hoofdstukId } = parseCodeKey(v)
                    doe(() => hercodeerGeboekteKost(dossierId, actief.bronId, code, hoofdstukId), `Verplaatst naar ${code}`)
                  }}
                >
                  <option value="">— Kies een bewakingscode —</option>
                  {actiefCodes.map((p) => (
                    <option key={codeKey(p)} value={codeKey(p)}>{codeLabel(p)}</option>
                  ))}
                </select>
                <span style={{ fontSize: 11, color: 'var(--fg-muted)' }}>
                  {actief.contractGebonden
                    ? 'Deze kost hangt aan een inkooporder of onderaannemerscontract — daar bepaalt het contract de bewakingscode. Pas die in Bouw7 aan.'
                    : actief.bonId == null
                    ? 'Deze factuur heeft geen leverbon in Bouw7; er is niets om te verplaatsen.'
                    : actiefCodes.length === 0
                    ? 'Dit project heeft in Bouw7 nog geen bewakingscodes.'
                    : 'De kost wordt ook in Bouw7 op deze code gezet, zodat het Financieel-tab meebeweegt. Staat de code daar nog niet onder deze kostensoort, dan voegt EVA hem toe met begroting 0.'}
                </span>
              </label>
            </DialogBody>
          )}
          <DialogFooter>
            {actief?.gecorrigeerd && (
              <Button
                variant="ghost"
                disabled={pending}
                onClick={() => actief && doe(() => wisInkoopCorrectie(dossierId, actief.bronId), 'Correctie ongedaan gemaakt')}
              >
                Correctie ongedaan maken
              </Button>
            )}
            <Button variant="secondary" disabled={pending} onClick={() => setActief(null)}>Sluiten</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
