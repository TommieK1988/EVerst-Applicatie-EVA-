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
  type GeboekteKostenRegel, type ProjectBewakingscode,
} from '@/lib/dossiers/actions'
import { SlidersHorizontal, Search, ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react'

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

export default function GeboekteKostenTabel({ dossierId, data, orders, contracten, projectcodes }: Props) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [actief, setActief] = useState<GeboekteKostenRegel | null>(null)
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
        <span style={{ display: 'block', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis' }} title={r.codeNaam ?? undefined}>
          {r.code ?? '— niet gecodeerd'}{r.codeNaam ? ` · ${r.codeNaam}` : ''}
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

  const sorteer = (key: string) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir('asc') }
  }

  const doe = (actie: () => Promise<{ ok: boolean; error?: string }>, succes: string) => {
    start(async () => {
      const res = await actie()
      if (res.ok) { toast.success(succes); setActief(null); router.refresh() }
      else toast.error(res.error ?? 'Mislukt')
    })
  }

  const totaal = useMemo(() => rijen.reduce((s, r) => s + r.bedrag, 0), [rijen])
  const totaalAlles = useMemo(() => data.reduce((s, r) => s + r.bedrag, 0), [data])
  const totaalToegewezen = useMemo(() =>
    data.filter(r => r.toegewezenOrderId != null || r.toegewezenContractId != null).reduce((s, r) => s + r.bedrag, 0),
  [data])
  const totaalNietToegewezen = totaalAlles - totaalToegewezen

  const huidigeDoelwaarde = actief
    ? actief.toegewezenOrderId != null ? `order:${actief.toegewezenOrderId}`
      : actief.toegewezenContractId != null ? `contract:${actief.toegewezenContractId}` : ''
    : ''

  const thStyle = (right?: boolean): React.CSSProperties => ({
    padding: '6px 10px', textAlign: right ? 'right' : 'left', fontSize: 11, fontWeight: 700,
    color: 'var(--neutral-500)', textTransform: 'uppercase', letterSpacing: '0.04em',
    borderBottom: '2px solid var(--neutral-200, #e3e8ea)', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none',
  })
  const tdStyle = (right?: boolean): React.CSSProperties => ({
    padding: '3px 10px', fontSize: 12.5, textAlign: right ? 'right' : 'left', color: 'var(--neutral-700)',
    borderBottom: '1px solid var(--neutral-100, #f4f7f8)', whiteSpace: 'nowrap',
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

      {/* Tabel */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
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
            {rijen.map((r) => (
              <tr key={r.bronId} style={{ background: r.gecorrigeerd ? 'color-mix(in srgb, var(--warning-50, #fff7ed) 60%, transparent)' : undefined }}>
                {kolommen.map((k) => <td key={k.key} style={tdStyle(k.right)}>{k.render(r)}</td>)}
                <td style={{ ...tdStyle(true) }}>
                  <button
                    onClick={() => setActief(r)}
                    title="Toewijzen / hercoderen"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 8px', fontSize: 11.5, borderRadius: 6, border: '1px solid var(--border)', background: 'white', color: 'var(--fg)', cursor: 'pointer' }}
                  >
                    <SlidersHorizontal size={12} /> Corrigeren
                  </button>
                </td>
              </tr>
            ))}
            <tr style={{ background: 'var(--neutral-50)' }}>
              <td style={{ ...tdStyle(), fontWeight: 700, color: 'var(--neutral-900)' }} colSpan={kolommen.length - 1}>Totaal{zoek ? ' (gefilterd)' : ''}</td>
              <td style={{ ...tdStyle(true), fontWeight: 700, color: 'var(--neutral-900)' }}>{euro(totaal)}</td>
              <td style={tdStyle(true)} />
            </tr>
            <tr style={{ background: 'var(--neutral-50)' }}>
              <td style={{ ...tdStyle(), fontSize: 11, color: 'var(--neutral-500)' }} colSpan={kolommen.length - 1}>↳ Gekoppeld aan order / contract</td>
              <td style={{ ...tdStyle(true), fontSize: 11, color: 'var(--neutral-500)' }}>{euro(totaalToegewezen)}</td>
              <td style={tdStyle(true)} />
            </tr>
            <tr style={{ background: 'var(--neutral-50)' }}>
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
                  Alleen de toewijzing en bewakingscode zijn aanpasbaar; dit wijzigt niets in Bouw7.
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

              <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--fg)' }}>Bewakingscode</span>
                <select
                  style={selectStyle}
                  disabled={pending}
                  value={actief.code ?? ''}
                  onChange={(e) => {
                    const code = e.target.value
                    if (!code) return
                    const naam = projectcodes.find((p) => p.code === code)?.naam ?? null
                    doe(() => hercodeerGeboekteKost(dossierId, actief.bronId, code, naam), 'Bewakingscode bijgewerkt')
                  }}
                >
                  <option value="">— Kies een bewakingscode —</option>
                  {projectcodes.map((p) => (
                    <option key={p.code} value={p.code}>{p.code}{p.naam ? ` · ${p.naam}` : ''}</option>
                  ))}
                </select>
                <span style={{ fontSize: 11, color: 'var(--fg-muted)' }}>Alleen codes die al op dit project staan.</span>
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
