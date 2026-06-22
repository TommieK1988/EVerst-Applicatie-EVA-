'use client'

import React, { useState, useMemo, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { Pencil, Trash2, Plus, X, Search } from 'lucide-react'
import { Card, CardHeader, CardBody } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { EmptyState } from '@/components/ui/empty-state'
import {
  upsertAk, verwijderAk, type AkInput,
  upsertDoelstelling, verwijderDoelstelling, type DoelstellingInput,
  upsertOhw, verwijderOhw, type OhwInput,
} from '@/app/(platform)/management/instellingen/actions'
import type { ManagementProjectKeuze } from '@/lib/dashboard/queries'
import type { ManagementAK, ManagementDoelstelling, ManagementOhw } from '@/lib/dashboard/aggregaties'

const HUIDIG_JAAR = 2026

const eur = new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
function fEur(v: number | null | undefined): string {
  return v == null ? '—' : eur.format(v)
}

type Props = {
  akData: ManagementAK[]
  doelstellingen: ManagementDoelstelling[]
  ohwData: ManagementOhw[]
  projectKeuze: ManagementProjectKeuze[]
  filialen: string[]
  projectleiders: string[]
}

export default function ManagementInstellingen({ akData, doelstellingen, ohwData, projectKeuze, filialen, projectleiders }: Props) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <AkSectie akData={akData} filialen={filialen} />
        <DoelstellingSectie doelstellingen={doelstellingen} filialen={filialen} projectleiders={projectleiders} />
      </div>
      <OhwSectie ohwData={ohwData} projectKeuze={projectKeuze} />
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

/* ── OHW-correctie per dossier ────────────────────────────────────── */

const HUIDIG_BOEKJAAR = HUIDIG_JAAR

const leegOhw: OhwInput = {
  boekjaar: HUIDIG_BOEKJAAR, bouw7_id: '', projectnummer: null, projectnaam: null, filiaal: null,
  omzet_vorig_boekjaar: 0, resultaat_vorig_boekjaar: 0, opmerkingen: '',
}

/** Tolerante bedrag-parse: accepteert komma én punt als decimaalteken. */
function parseBedrag(s: string): number {
  const n = Number(String(s).replace(',', '.').trim())
  return Number.isFinite(n) ? n : 0
}
const bedragStr = (n: number | null | undefined) => (n ? String(n) : '')

function OhwSectie({ ohwData, projectKeuze }: { ohwData: ManagementOhw[]; projectKeuze: ManagementProjectKeuze[] }) {
  const router = useRouter()
  const [form, setForm] = useState<OhwInput>(leegOhw)
  // Bedragen als losse string-state zodat decimalen (1234,56) tijdens typen blijven staan.
  const [omzetRaw, setOmzetRaw] = useState('')
  const [resultaatRaw, setResultaatRaw] = useState('')
  const [isPending, startTransition] = useTransition()

  function bewerk(o: ManagementOhw) {
    setForm({
      id: o.id, boekjaar: o.boekjaar, bouw7_id: o.bouw7_id,
      projectnummer: o.projectnummer, projectnaam: o.projectnaam, filiaal: o.filiaal,
      omzet_vorig_boekjaar: o.omzet_vorig_boekjaar ?? 0,
      resultaat_vorig_boekjaar: o.resultaat_vorig_boekjaar ?? 0,
      opmerkingen: o.opmerkingen ?? '',
    })
    setOmzetRaw(bedragStr(o.omzet_vorig_boekjaar))
    setResultaatRaw(bedragStr(o.resultaat_vorig_boekjaar))
  }
  function reset() { setForm(leegOhw); setOmzetRaw(''); setResultaatRaw('') }

  function opslaan() {
    if (!form.bouw7_id) { toast.error('Kies eerst een dossier'); return }
    startTransition(async () => {
      const r = await upsertOhw({
        ...form,
        omzet_vorig_boekjaar: parseBedrag(omzetRaw),
        resultaat_vorig_boekjaar: parseBedrag(resultaatRaw),
      })
      if (r.ok) { toast.success('OHW-correctie opgeslagen'); reset(); router.refresh() }
      else toast.error(r.fout ?? 'Opslaan mislukt')
    })
  }
  function wis(id: string) {
    startTransition(async () => {
      const r = await verwijderOhw(id)
      if (r.ok) { toast.success('Verwijderd'); router.refresh() }
      else toast.error(r.fout ?? 'Verwijderen mislukt')
    })
  }

  const huidigLabel = form.projectnummer
    ? `${form.projectnummer}${form.projectnaam ? ` — ${form.projectnaam}` : ''}`
    : null

  return (
    <Card>
      <CardHeader>OHW-correctie per dossier (stand 1 januari)</CardHeader>
      <CardBody>
        <div className="flex flex-col gap-2.5">
          <div className="grid gap-2" style={{ gridTemplateColumns: '160px 1fr' }}>
            <Veld label="Boekjaar">
              <Input inputSize="md" type="number" value={form.boekjaar}
                onChange={e => setForm(f => ({ ...f, boekjaar: Number(e.target.value) }))} />
            </Veld>
            <Veld label="Dossier">
              <DossierPicker
                value={form.bouw7_id}
                currentLabel={huidigLabel}
                projectKeuze={projectKeuze}
                onChange={p => setForm(f => ({
                  ...f,
                  bouw7_id: p?.bouw7_id ?? '',
                  projectnummer: p?.projectnummer ?? null,
                  projectnaam: p?.projectnaam ?? null,
                  filiaal: p?.filiaal ?? null,
                }))}
              />
            </Veld>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Veld label="Omzet vorig boekjaar (€)">
              <Input inputSize="md" inputMode="decimal" placeholder="0,00" value={omzetRaw}
                onChange={e => setOmzetRaw(e.target.value)} />
            </Veld>
            <Veld label="Resultaat vorig boekjaar (€)">
              <Input inputSize="md" inputMode="decimal" placeholder="0,00" value={resultaatRaw}
                onChange={e => setResultaatRaw(e.target.value)} />
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
          <p className="text-[11px] text-neutral-500">
            De ingevulde omzet en resultaat worden aan het vórige boekjaar toegewezen en op het dashboard
            van de Gerealiseerd-cijfers afgetrokken (per werkmaatschappij opgeteld). De opdrachtwaarde
            (In opdracht) blijft ongewijzigd.
          </p>
        </div>

        <div className="mt-4 overflow-x-auto">
          {ohwData.length === 0 ? (
            <EmptyState title="Nog geen OHW-correcties" tone="neutral" size="sm" />
          ) : (
            <table className="w-full border-collapse text-[12px]">
              <thead>
                <tr>
                  <th className={th}>Boekjaar</th>
                  <th className={cn(th, 'text-left')}>Dossier</th>
                  <th className={cn(th, 'text-left')}>Werkmij.</th>
                  <th className={cn(th, 'text-right')}>Omzet vorig bj.</th>
                  <th className={cn(th, 'text-right')}>Resultaat vorig bj.</th>
                  <th className={th} />
                </tr>
              </thead>
              <tbody>
                {ohwData.map((o, i) => (
                  <tr key={o.id} className={i % 2 === 0 ? 'bg-white' : 'bg-neutral-50/60'}>
                    <td className={cn(td, 'text-center')}>{o.boekjaar}</td>
                    <td className={td}>
                      <span className="font-medium">{o.projectnummer ?? o.bouw7_id}</span>
                      {o.projectnaam && <span className="text-neutral-500"> — {o.projectnaam}</span>}
                    </td>
                    <td className={td}>{o.filiaal ?? <span className="text-neutral-400">—</span>}</td>
                    <td className={cn(td, 'text-right')}>{fEur(o.omzet_vorig_boekjaar)}</td>
                    <td className={cn(td, 'text-right')}>{fEur(o.resultaat_vorig_boekjaar)}</td>
                    <td className={cn(td, 'text-right whitespace-nowrap')}>
                      <RijActies onBewerk={() => bewerk(o)} onWis={() => wis(o.id)} disabled={isPending} />
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

/** Zoek-picker over de managementprojecten (projectnummer + naam + opdrachtgever). */
function DossierPicker({ value, currentLabel, projectKeuze, onChange }: {
  value: string
  currentLabel: string | null
  projectKeuze: ManagementProjectKeuze[]
  onChange: (p: ManagementProjectKeuze | null) => void
}) {
  const [zoek, setZoek] = useState('')
  const [open, setOpen] = useState(false)

  const geselecteerd = value ? (projectKeuze.find(p => p.bouw7_id === value) ?? null) : null
  const label = geselecteerd
    ? `${geselecteerd.projectnummer} — ${geselecteerd.projectnaam}`
    : currentLabel

  const filtered = useMemo(() => {
    const q = zoek.trim().toLowerCase()
    const lijst = q
      ? projectKeuze.filter(p =>
          `${p.projectnummer} ${p.projectnaam} ${p.opdrachtgever ?? ''}`.toLowerCase().includes(q))
      : projectKeuze
    return lijst.slice(0, 50)
  }, [zoek, projectKeuze])

  if (value && !open) {
    return (
      <div className="flex gap-1">
        <div className="flex h-9 flex-1 items-center rounded-md border border-neutral-300 bg-neutral-50 px-3 text-[13px] text-neutral-900">
          <span className="truncate">{label ?? value}</span>
        </div>
        <Button variant="ghost" size="md" onClick={() => { setOpen(true); setZoek('') }} title="Ander dossier kiezen">
          <Search className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="md" onClick={() => onChange(null)} title="Wissen">
          <X className="h-4 w-4" />
        </Button>
      </div>
    )
  }

  return (
    <div className="relative">
      <Input inputSize="md" value={zoek} placeholder="Zoek op projectnummer, naam of opdrachtgever…"
        autoFocus={open}
        onChange={e => setZoek(e.target.value)}
        onFocus={() => setOpen(true)} />
      {open && (
        <div className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-neutral-200 bg-white shadow-lg">
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-[12px] text-neutral-500">Geen projecten gevonden</div>
          ) : filtered.map(p => (
            <button
              key={p.bouw7_id}
              type="button"
              onClick={() => { onChange(p); setOpen(false); setZoek('') }}
              className="flex w-full flex-col items-start gap-0.5 border-b border-neutral-100 px-3 py-2 text-left last:border-b-0 hover:bg-brand-50"
            >
              <span className="text-[12px] font-medium text-neutral-900">
                {p.projectnummer} — {p.projectnaam}
              </span>
              <span className="text-[11px] text-neutral-500">
                {[p.opdrachtgever, p.filiaal].filter(Boolean).join(' · ') || '—'}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
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
