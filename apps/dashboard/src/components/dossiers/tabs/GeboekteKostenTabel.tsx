'use client'

import React, { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import type { GebruikerLayout } from '@everts/database/platform-types'
import OverzichtTabel, { type KolomDefinitie } from '@/components/overzicht/OverzichtTabel'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter, Badge, Button,
} from '@/components/ui'
import { fmtDatum } from './tab-ui'
import {
  verplaatsGeboekteKost, hercodeerGeboekteKost, wisInkoopCorrectie,
  type GeboekteKostenRegel, type ProjectBewakingscode,
} from '@/lib/dossiers/actions'
import { SlidersHorizontal } from 'lucide-react'

type OrderOptie = { orderId: number; code: string | null; omschrijving: string | null; relatie: string | null }
type ContractOptie = { contractId: number; onderaannemer: string | null; omschrijving: string | null }

type Props = {
  dossierId: string
  data: GeboekteKostenRegel[]
  layouts: GebruikerLayout[]
  user_id: string | null
  orders: OrderOptie[]
  contracten: ContractOptie[]
  projectcodes: ProjectBewakingscode[]
}

type Rij = GeboekteKostenRegel & { id: string }

const euro = (n: number | null | undefined): string =>
  n == null ? '—' : new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)

const selectStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px', fontSize: 13, borderRadius: 8,
  border: '1px solid var(--border)', background: 'white', color: 'var(--fg)',
}

export default function GeboekteKostenTabel({ dossierId, data, layouts, user_id, orders, contracten, projectcodes }: Props) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [actief, setActief] = useState<Rij | null>(null)

  const rijen: Rij[] = useMemo(() => data.map((r) => ({ ...r, id: String(r.bronId) })), [data])

  const typeOpties = useMemo(
    () => [...new Set(rijen.map((r) => r.typeKosten).filter(Boolean) as string[])].sort(),
    [rijen],
  )
  const codeOpties = useMemo(
    () => [...new Set(rijen.map((r) => r.code).filter(Boolean) as string[])].sort(),
    [rijen],
  )

  const doe = (actie: () => Promise<{ ok: boolean; error?: string }>, succes: string) => {
    start(async () => {
      const res = await actie()
      if (res.ok) { toast.success(succes); setActief(null); router.refresh() }
      else toast.error(res.error ?? 'Mislukt')
    })
  }

  const kolommen: KolomDefinitie<Rij>[] = useMemo(() => [
    {
      key: 'factuurnummer', label: 'Factuurnr.', vast: true, filterType: 'tekst',
      sorteerWaarde: (r) => r.factuurnummer ?? '',
      render: (r) => (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 600, color: 'var(--fg)' }}>
          {r.factuurnummer ?? '—'}
          {r.gecorrigeerd && <Badge tone="warning">gecorrigeerd</Badge>}
        </span>
      ),
    },
    {
      key: 'leverancier', label: 'Leverancier / OA', filterType: 'tekst',
      sorteerWaarde: (r) => r.leverancier ?? '',
      render: (r) => (
        <div>
          <div style={{ fontSize: 13, color: 'var(--fg)' }}>{r.leverancier ?? '—'}</div>
          {r.leverancierType && (
            <div style={{ fontSize: 11, color: 'var(--fg-muted)' }}>
              {r.leverancierType === 'onderaannemer' ? 'Onderaannemer' : 'Leverancier'}
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'omschrijving', label: 'Omschrijving', filterType: 'tekst',
      sorteerWaarde: (r) => r.omschrijving ?? '',
      render: (r) => <span style={{ fontSize: 13, color: 'var(--fg-soft)' }}>{r.omschrijving ?? '—'}</span>,
    },
    {
      key: 'typeKosten', label: 'Type kosten', filterType: 'select', filterOpties: typeOpties,
      sorteerWaarde: (r) => r.typeKosten ?? '',
      render: (r) => <span style={{ fontSize: 13 }}>{r.typeKosten ?? '—'}</span>,
    },
    {
      key: 'code', label: 'Bewakingscode', filterType: 'select', filterOpties: codeOpties,
      sorteerWaarde: (r) => r.code ?? '',
      render: (r) => (
        <span style={{ fontSize: 13 }} title={r.codeNaam ?? undefined}>
          {r.code ?? '— niet gecodeerd'}{r.codeNaam ? ` · ${r.codeNaam}` : ''}
        </span>
      ),
    },
    {
      key: 'bedrag', label: 'Bedrag excl.', filterType: 'tekst',
      sorteerWaarde: (r) => r.bedrag,
      render: (r) => <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)' }}>{euro(r.bedrag)}</span>,
    },
    {
      key: 'btw', label: 'Btw', standaard_zichtbaar: false,
      sorteerWaarde: (r) => r.btw ?? 0,
      render: (r) => <span style={{ fontSize: 13, color: 'var(--fg-soft)' }}>{euro(r.btw)}</span>,
    },
    {
      key: 'totaal', label: 'Totaal incl.', standaard_zichtbaar: false,
      sorteerWaarde: (r) => r.totaal ?? 0,
      render: (r) => <span style={{ fontSize: 13, color: 'var(--fg-soft)' }}>{euro(r.totaal)}</span>,
    },
    {
      key: 'datum', label: 'Datum', filterType: 'tekst',
      sorteerWaarde: (r) => r.datum ?? '',
      render: (r) => <span style={{ fontSize: 13 }}>{fmtDatum(r.datum)}</span>,
    },
    {
      key: 'vervaldatum', label: 'Vervaldatum', standaard_zichtbaar: false,
      sorteerWaarde: (r) => r.vervaldatum ?? '',
      render: (r) => <span style={{ fontSize: 13 }}>{fmtDatum(r.vervaldatum)}</span>,
    },
    {
      key: 'betaald', label: 'Betaald', filterType: 'select', filterOpties: ['Ja', 'Nee'],
      sorteerWaarde: (r) => (r.betaald ? 'Ja' : 'Nee'),
      render: (r) => <Badge tone={r.betaald ? 'success' : 'neutral'}>{r.betaald ? 'Ja' : 'Nee'}</Badge>,
    },
    {
      key: 'actie', label: '', vast: true,
      render: (r) => (
        <button
          onClick={(e) => { e.stopPropagation(); setActief(r) }}
          title="Toewijzen / hercoderen"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 9px', fontSize: 12,
            borderRadius: 7, border: '1px solid var(--border)', background: 'white', color: 'var(--fg)', cursor: 'pointer',
          }}
        >
          <SlidersHorizontal size={13} /> Corrigeren
        </button>
      ),
    },
  ], [typeOpties, codeOpties])

  const huidigeDoelwaarde = actief
    ? actief.toegewezenOrderId != null ? `order:${actief.toegewezenOrderId}`
      : actief.toegewezenContractId != null ? `contract:${actief.toegewezenContractId}` : ''
    : ''

  return (
    <>
      <OverzichtTabel
        scherm="inkoop-geboekt"
        data={rijen}
        kolommen={kolommen}
        layouts={layouts}
        user_id={user_id}
        selecteerbaar={false}
        beginSortering={[{ id: 'datum', desc: true }]}
      />

      <Dialog open={!!actief} onOpenChange={(o) => { if (!o) setActief(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Geboekte kost corrigeren</DialogTitle>
          </DialogHeader>
          {actief && (
            <DialogBody style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              {/* Read-only factuurinfo */}
              <div style={{ fontSize: 12.5, color: 'var(--fg-soft)', lineHeight: 1.6 }}>
                <div><strong style={{ color: 'var(--fg)' }}>{actief.factuurnummer ?? '—'}</strong> · {actief.leverancier ?? '—'}</div>
                <div>{euro(actief.bedrag)} excl. btw · {actief.typeKosten ?? '—'} · {fmtDatum(actief.datum)}</div>
                <div style={{ fontSize: 11.5, color: 'var(--fg-muted)', marginTop: 4 }}>
                  Alleen de toewijzing en bewakingscode zijn aanpasbaar; dit wijzigt niets in Bouw7.
                </div>
              </div>

              {/* Toewijzen aan order/contract */}
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
                          {[o.code, o.omschrijving, o.relatie].filter(Boolean).join(' · ') || `Order ${o.orderId}`}
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

              {/* Hercoderen */}
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
