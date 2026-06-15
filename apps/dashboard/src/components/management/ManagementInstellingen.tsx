'use client'

import React, { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { Pencil, Trash2, Plus, X } from 'lucide-react'
import { Card, CardHeader, CardBody } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { EmptyState } from '@/components/ui/empty-state'
import {
  upsertAk, verwijderAk, type AkInput,
  upsertDoelstelling, verwijderDoelstelling, type DoelstellingInput,
} from '@/app/(platform)/management/instellingen/actions'
import type { ManagementAK, ManagementDoelstelling } from './ManagementDashboard'

const HUIDIG_JAAR = 2026

const eur = new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
function fEur(v: number | null | undefined): string {
  return v == null ? '—' : eur.format(v)
}

type Props = {
  akData: ManagementAK[]
  doelstellingen: ManagementDoelstelling[]
  filialen: string[]
  projectleiders: string[]
}

export default function ManagementInstellingen({ akData, doelstellingen, filialen, projectleiders }: Props) {
  return (
    <div className="grid gap-4" style={{ gridTemplateColumns: '1fr 1fr' }}>
      <AkSectie akData={akData} filialen={filialen} />
      <DoelstellingSectie doelstellingen={doelstellingen} filialen={filialen} projectleiders={projectleiders} />
    </div>
  )
}

/* ── AK ───────────────────────────────────────────────────────────── */

const leegAk: AkInput = { jaar: HUIDIG_JAAR, filiaal: '', bedrag_ak: 0, opmerkingen: '' }

function AkSectie({ akData, filialen }: { akData: ManagementAK[]; filialen: string[] }) {
  const router = useRouter()
  const [form, setForm] = useState<AkInput>(leegAk)
  const [isPending, startTransition] = useTransition()

  function bewerk(a: ManagementAK) {
    setForm({ id: a.id, jaar: a.jaar, filiaal: a.filiaal, bedrag_ak: a.bedrag_ak, opmerkingen: a.opmerkingen ?? '' })
  }
  function reset() { setForm(leegAk) }

  function opslaan() {
    startTransition(async () => {
      const r = await upsertAk(form)
      if (r.ok) { toast.success('AK opgeslagen'); reset(); router.refresh() }
      else toast.error(r.fout ?? 'Opslaan mislukt')
    })
  }
  function wis(id: string) {
    startTransition(async () => {
      const r = await verwijderAk(id)
      if (r.ok) { toast.success('Verwijderd'); router.refresh() }
      else toast.error(r.fout ?? 'Verwijderen mislukt')
    })
  }

  return (
    <Card>
      <CardHeader>Algemene kosten (AK) per werkmaatschappij</CardHeader>
      <CardBody>
        <div className="flex flex-col gap-2.5">
          <div className="grid grid-cols-2 gap-2">
            <Veld label="Jaar">
              <Input inputSize="md" type="number" value={form.jaar}
                onChange={e => setForm(f => ({ ...f, jaar: Number(e.target.value) }))} />
            </Veld>
            <Veld label="Werkmaatschappij">
              <SelectOfVrij value={form.filiaal} opties={filialen} placeholder="Kies of typ…"
                onChange={v => setForm(f => ({ ...f, filiaal: v }))} />
            </Veld>
            <Veld label="AK-bedrag (€)">
              <Input inputSize="md" type="number" value={form.bedrag_ak}
                onChange={e => setForm(f => ({ ...f, bedrag_ak: Number(e.target.value) }))} />
            </Veld>
            <Veld label="Opmerkingen">
              <Input inputSize="md" value={form.opmerkingen ?? ''}
                onChange={e => setForm(f => ({ ...f, opmerkingen: e.target.value }))} />
            </Veld>
          </div>
          <div className="flex gap-2">
            <Button variant="primary" size="md" loading={isPending} onClick={opslaan}>
              {form.id ? 'Bijwerken' : <><Plus className="h-4 w-4" /> Toevoegen</>}
            </Button>
            {form.id && (
              <Button variant="ghost" size="md" onClick={reset}><X className="h-4 w-4" /> Annuleer</Button>
            )}
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          {akData.length === 0 ? (
            <EmptyState title="Nog geen AK ingesteld" tone="neutral" size="sm" />
          ) : (
            <table className="w-full border-collapse text-[12px]">
              <thead>
                <tr>
                  <th className={th}>Jaar</th>
                  <th className={cn(th, 'text-left')}>Werkmaatschappij</th>
                  <th className={cn(th, 'text-right')}>AK-bedrag</th>
                  <th className={th} />
                </tr>
              </thead>
              <tbody>
                {akData.map((a, i) => (
                  <tr key={a.id} className={i % 2 === 0 ? 'bg-white' : 'bg-neutral-50/60'}>
                    <td className={cn(td, 'text-center')}>{a.jaar}</td>
                    <td className={td}>{a.filiaal}</td>
                    <td className={cn(td, 'text-right font-semibold')}>{fEur(a.bedrag_ak)}</td>
                    <td className={cn(td, 'text-right whitespace-nowrap')}>
                      <RijActies onBewerk={() => bewerk(a)} onWis={() => wis(a.id)} disabled={isPending} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </CardBody>
    </Card>
  )
}

/* ── Doelstellingen ───────────────────────────────────────────────── */

const leegDoel: DoelstellingInput = {
  jaar: HUIDIG_JAAR, filiaal: '', projectleider: '', omzet_doelstelling: null, resultaat_doelstelling: null,
}

function DoelstellingSectie({ doelstellingen, filialen, projectleiders }: {
  doelstellingen: ManagementDoelstelling[]; filialen: string[]; projectleiders: string[]
}) {
  const router = useRouter()
  const [form, setForm] = useState<DoelstellingInput>(leegDoel)
  const [isPending, startTransition] = useTransition()

  function bewerk(d: ManagementDoelstelling) {
    setForm({
      id: d.id, jaar: d.jaar, filiaal: d.filiaal ?? '', projectleider: d.projectleider ?? '',
      omzet_doelstelling: d.omzet_doelstelling, resultaat_doelstelling: d.resultaat_doelstelling,
    })
  }
  function reset() { setForm(leegDoel) }

  function opslaan() {
    startTransition(async () => {
      const r = await upsertDoelstelling(form)
      if (r.ok) { toast.success('Doelstelling opgeslagen'); reset(); router.refresh() }
      else toast.error(r.fout ?? 'Opslaan mislukt')
    })
  }
  function wis(id: string) {
    startTransition(async () => {
      const r = await verwijderDoelstelling(id)
      if (r.ok) { toast.success('Verwijderd'); router.refresh() }
      else toast.error(r.fout ?? 'Verwijderen mislukt')
    })
  }

  const getal = (v: string) => v === '' ? null : Number(v)

  return (
    <Card>
      <CardHeader>Doelstellingen (per werkmaatschappij / projectleider)</CardHeader>
      <CardBody>
        <div className="flex flex-col gap-2.5">
          <div className="grid grid-cols-2 gap-2">
            <Veld label="Jaar">
              <Input inputSize="md" type="number" value={form.jaar}
                onChange={e => setForm(f => ({ ...f, jaar: Number(e.target.value) }))} />
            </Veld>
            <Veld label="Werkmaatschappij (optioneel)">
              <SelectOfVrij value={form.filiaal ?? ''} opties={filialen} placeholder="Alle / kies…"
                onChange={v => setForm(f => ({ ...f, filiaal: v }))} />
            </Veld>
            <Veld label="Projectleider (optioneel)">
              <SelectOfVrij value={form.projectleider ?? ''} opties={projectleiders} placeholder="Alle / kies…"
                onChange={v => setForm(f => ({ ...f, projectleider: v }))} />
            </Veld>
            <Veld label="Omzetdoel (€)">
              <Input inputSize="md" type="number" value={form.omzet_doelstelling ?? ''}
                onChange={e => setForm(f => ({ ...f, omzet_doelstelling: getal(e.target.value) }))} />
            </Veld>
            <Veld label="Resultaatdoel (€)">
              <Input inputSize="md" type="number" value={form.resultaat_doelstelling ?? ''}
                onChange={e => setForm(f => ({ ...f, resultaat_doelstelling: getal(e.target.value) }))} />
            </Veld>
          </div>
          <div className="flex gap-2">
            <Button variant="primary" size="md" loading={isPending} onClick={opslaan}>
              {form.id ? 'Bijwerken' : <><Plus className="h-4 w-4" /> Toevoegen</>}
            </Button>
            {form.id && (
              <Button variant="ghost" size="md" onClick={reset}><X className="h-4 w-4" /> Annuleer</Button>
            )}
          </div>
          <p className="text-[11px] text-neutral-500">
            Laat werkmaatschappij óf projectleider leeg voor een algemene doelstelling. Vul projectleider in
            voor de %-behaald-kolom op het dashboard.
          </p>
        </div>

        <div className="mt-4 overflow-x-auto">
          {doelstellingen.length === 0 ? (
            <EmptyState title="Nog geen doelstellingen" tone="neutral" size="sm" />
          ) : (
            <table className="w-full border-collapse text-[12px]">
              <thead>
                <tr>
                  <th className={th}>Jaar</th>
                  <th className={cn(th, 'text-left')}>Werkmij.</th>
                  <th className={cn(th, 'text-left')}>Projectleider</th>
                  <th className={cn(th, 'text-right')}>Omzetdoel</th>
                  <th className={cn(th, 'text-right')}>Resultaatdoel</th>
                  <th className={th} />
                </tr>
              </thead>
              <tbody>
                {doelstellingen.map((d, i) => (
                  <tr key={d.id} className={i % 2 === 0 ? 'bg-white' : 'bg-neutral-50/60'}>
                    <td className={cn(td, 'text-center')}>{d.jaar}</td>
                    <td className={td}>{d.filiaal ?? <span className="text-neutral-400">alle</span>}</td>
                    <td className={td}>{d.projectleider ?? <span className="text-neutral-400">alle</span>}</td>
                    <td className={cn(td, 'text-right')}>{fEur(d.omzet_doelstelling)}</td>
                    <td className={cn(td, 'text-right')}>{fEur(d.resultaat_doelstelling)}</td>
                    <td className={cn(td, 'text-right whitespace-nowrap')}>
                      <RijActies onBewerk={() => bewerk(d)} onWis={() => wis(d.id)} disabled={isPending} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </CardBody>
    </Card>
  )
}

/* ── Sub-componenten ──────────────────────────────────────────────── */

function Veld({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-medium text-neutral-600">{label}</span>
      {children}
    </label>
  )
}

/** Select met bestaande opties + optie om vrije tekst te typen. */
function SelectOfVrij({ value, opties, placeholder, onChange }: {
  value: string; opties: string[]; placeholder: string; onChange: (v: string) => void
}) {
  const VRIJ = '__vrij__'
  const inLijst = value === '' || opties.includes(value)
  const [vrij, setVrij] = useState(!inLijst)

  if (vrij) {
    return (
      <div className="flex gap-1">
        <Input inputSize="md" value={value} placeholder={placeholder}
          onChange={e => onChange(e.target.value)} autoFocus />
        <Button variant="ghost" size="md" onClick={() => { setVrij(false); onChange('') }} title="Uit lijst kiezen">
          <X className="h-4 w-4" />
        </Button>
      </div>
    )
  }
  return (
    <select
      value={value}
      onChange={e => {
        if (e.target.value === VRIJ) { setVrij(true); onChange('') }
        else onChange(e.target.value)
      }}
      className="h-9 rounded-md border border-neutral-300 bg-white px-3 text-[13px] text-neutral-900 outline-none transition-[border-color,box-shadow] [transition-duration:120ms] hover:border-neutral-400 focus:border-brand-500 focus:ring-[3px] focus:ring-brand-100"
    >
      <option value="">{placeholder}</option>
      {opties.map(o => <option key={o} value={o}>{o}</option>)}
      <option value={VRIJ}>+ Anders…</option>
    </select>
  )
}

function RijActies({ onBewerk, onWis, disabled }: { onBewerk: () => void; onWis: () => void; disabled: boolean }) {
  return (
    <div className="inline-flex gap-1">
      <button onClick={onBewerk} disabled={disabled} title="Bewerk"
        className="grid h-7 w-7 place-items-center rounded-md text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800 disabled:opacity-40">
        <Pencil className="h-3.5 w-3.5" />
      </button>
      <button onClick={onWis} disabled={disabled} title="Verwijder"
        className="grid h-7 w-7 place-items-center rounded-md text-neutral-500 hover:bg-error-50 hover:text-error-600 disabled:opacity-40">
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

/* ── Tailwind helper (cn-loos: lokale join) ───────────────────────── */

function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ')
}

const th = 'px-[10px] py-[7px] bg-neutral-50 border-b-2 border-neutral-200 text-[11px] font-bold uppercase tracking-[0.04em] text-neutral-500 text-right whitespace-nowrap'
const td = 'px-[10px] py-[8px] border-b border-neutral-100 align-middle whitespace-nowrap text-[12px] text-neutral-900'
