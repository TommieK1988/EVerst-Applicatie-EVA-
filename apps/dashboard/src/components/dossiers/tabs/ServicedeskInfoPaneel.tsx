'use client'

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { Card, CardHeader, CardBody, Button, Input } from '@/components/ui'
import {
  getServicedeskMandaat, getDoorlooptijdPerFase, updateServicedeskInstellingen,
  type MandaatStatus, type SubstatusFase,
} from '@/lib/dossiers/servicedesk'
import { maakOfferteVoorServicedesk, offerteAkkoordServicedesk } from '@/lib/dossiers/actions'
import { slaAanvraagProjectIdOp } from '@/components/everts-calc/calculatie/AanvraagCalculatieTab'
import { SERVICEDESK_STATUSSEN } from '../types'

const fmt = (v: number) =>
  new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 }).format(v)

// Doorlooptijd-drempels (dagen open). Aanpasbaar als constante.
const DRUK_ORANJE = 14
const DRUK_ROOD   = 30

const faseLabel = (k: string) => SERVICEDESK_STATUSSEN.find(s => s.key === k)?.label ?? k

type Props = {
  dossierId: string
  titel: string
  createdAt: string | null
  initieelMandaat: number | null
  initieleFacturatiemethode: 'regie' | 'termijnen'
  heeftCalculatie: boolean
}

export default function ServicedeskInfoPaneel({
  dossierId, titel, createdAt, initieelMandaat, initieleFacturatiemethode, heeftCalculatie,
}: Props) {
  const router = useRouter()
  const [mandaat, setMandaat]       = useState<string>(initieelMandaat != null ? String(initieelMandaat) : '')
  const [methode, setMethode]       = useState<'regie' | 'termijnen'>(initieleFacturatiemethode)
  const [status, setStatus]         = useState<MandaatStatus | null>(null)
  const [fases, setFases]           = useState<SubstatusFase[]>([])
  const [bezigOfferte, setBezig]    = useState(false)

  useEffect(() => {
    getServicedeskMandaat(dossierId).then(setStatus).catch(() => setStatus(null))
    getDoorlooptijdPerFase(dossierId).then(setFases).catch(() => setFases([]))
  }, [dossierId])

  const dagenOpen = createdAt
    ? Math.max(0, Math.round((Date.now() - new Date(createdAt).getTime()) / 86_400_000))
    : null
  const dagenKleur = dagenOpen == null ? 'var(--fg-muted)'
    : dagenOpen >= DRUK_ROOD ? '#d9534f'
    : dagenOpen >= DRUK_ORANJE ? '#d97706'
    : '#009439'

  async function bewaarMandaat() {
    const waarde = mandaat.trim() === '' ? null : Number(mandaat.replace(',', '.'))
    await updateServicedeskInstellingen(dossierId, { mandaat_bedrag: waarde })
    getServicedeskMandaat(dossierId).then(setStatus).catch(() => {})
  }

  async function kiesMethode(m: 'regie' | 'termijnen') {
    setMethode(m)
    await updateServicedeskInstellingen(dossierId, { facturatiemethode: m })
    toast.success(m === 'regie' ? 'Facturatie op regie' : 'Facturatie op termijnen')
  }

  async function offerteMaken() {
    setBezig(true)
    const r = await maakOfferteVoorServicedesk(dossierId)
    setBezig(false)
    if (!r.ok) { toast.error(r.error); return }
    slaAanvraagProjectIdOp(dossierId, r.projectId)
    router.push(`/servicedesk/${dossierId}/calculatie`)
    router.refresh()
  }

  async function offerteAkkoord() {
    setBezig(true)
    const r = await offerteAkkoordServicedesk(dossierId)
    setBezig(false)
    if (!r.ok) { toast.error(r.error); return }
    toast.success('Offerte op akkoord — overgezet op termijnen')
    router.refresh()
  }

  const overschreden = status?.overschreden ?? false

  return (
    <Card className="col-span-2">
      <CardHeader>Servicedesk</CardHeader>
      <CardBody>
        <div className="flex flex-wrap items-start justify-between gap-4">
          {/* Doorlooptijd */}
          <div>
            <div className="mb-[3px] text-[10px] font-semibold uppercase tracking-[0.08em] text-neutral-400">Doorlooptijd</div>
            <div className="flex items-center gap-2">
              <span className="tabular-nums text-[22px] font-bold" style={{ color: dagenKleur }}>
                {dagenOpen != null ? `${dagenOpen}` : '—'}
              </span>
              <span className="text-[12px] text-neutral-500">dagen open</span>
            </div>
          </div>

          {/* Facturatiemethode */}
          <div>
            <div className="mb-[6px] text-[10px] font-semibold uppercase tracking-[0.08em] text-neutral-400">Facturatie</div>
            <div className="inline-flex overflow-hidden rounded-lg border border-neutral-200">
              {(['regie', 'termijnen'] as const).map(m => (
                <button
                  key={m}
                  onClick={() => kiesMethode(m)}
                  className="px-3.5 py-1.5 text-[12px] font-semibold capitalize transition-colors"
                  style={{
                    background: methode === m ? 'var(--accent)' : 'transparent',
                    color: methode === m ? '#fff' : 'var(--fg-muted)',
                  }}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          {/* Mandaat */}
          <div>
            <div className="mb-[6px] text-[10px] font-semibold uppercase tracking-[0.08em] text-neutral-400">Mandaat (excl. btw)</div>
            <div className="flex items-center gap-2">
              <span className="text-[13px] text-neutral-400">€</span>
              <Input
                value={mandaat}
                onChange={e => setMandaat(e.target.value)}
                onBlur={bewaarMandaat}
                placeholder="0,00"
                className="w-28 tabular-nums"
                inputMode="decimal"
              />
            </div>
          </div>

          {/* Offerte-acties */}
          <div className="flex items-end gap-2 self-stretch">
            {!heeftCalculatie ? (
              <Button variant="primary" onClick={offerteMaken} disabled={bezigOfferte}>
                {bezigOfferte ? 'Bezig…' : 'Offerte maken'}
              </Button>
            ) : (
              <Button variant="primary" onClick={offerteAkkoord} disabled={bezigOfferte}>
                {bezigOfferte ? 'Bezig…' : 'Offerte akkoord'}
              </Button>
            )}
          </div>
        </div>

        {/* Mandaat-indicator */}
        {status?.mandaat != null && (
          <div
            className="mt-4 rounded-lg border px-3.5 py-3"
            style={{
              borderColor: overschreden ? 'color-mix(in srgb,#d9534f 35%,transparent)' : 'var(--neutral-200,#e3e8ea)',
              background: overschreden ? 'color-mix(in srgb,#d9534f 8%,transparent)' : 'var(--neutral-50,#f8fafa)',
            }}
          >
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-bold" style={{ color: overschreden ? '#d9534f' : 'var(--fg)' }}>
                {overschreden ? '⚠ Mandaat overschreden' : 'Binnen mandaat'}
              </span>
              <span className="tabular-nums text-[13px] font-bold" style={{ color: overschreden ? '#d9534f' : 'var(--fg)' }}>
                {fmt(status.totaal)} / {fmt(status.mandaat)}
              </span>
            </div>
            <div className="mt-1.5 flex gap-4 text-[11px] text-neutral-500">
              <span>Geboekte verkoopwaarde: <span className="tabular-nums font-semibold">{fmt(status.geboekteVerkoop)}</span></span>
              <span>Uitgezette opdrachten +{25}%: <span className="tabular-nums font-semibold">{fmt(status.uitgezetteOpdrachten)}</span></span>
            </div>
          </div>
        )}

        {/* Doorlooptijd per fase */}
        {fases.length > 0 && (
          <div className="mt-4">
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-neutral-400">Tijd per fase</div>
            <div className="flex flex-col gap-1">
              {fases.map((f, i) => (
                <div key={i} className="flex items-center justify-between text-[12px]">
                  <span className="text-neutral-700">{faseLabel(f.substatus)}</span>
                  <span className="tabular-nums text-neutral-500">{f.dagen} {f.dagen === 1 ? 'dag' : 'dagen'}{f.tot ? '' : ' (huidig)'}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardBody>
    </Card>
  )
}
