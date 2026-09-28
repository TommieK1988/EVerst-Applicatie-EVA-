'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import {
  Badge, Button, EmptyState, FormField, FormRow, Input,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui'
import {
  bewaarStandaardregel, zetStandaardregelActief, type Standaardregel,
} from '@/lib/dossiers/factuur-standaardregels'

type Form = { omschrijving: string; eenheid: string; prijs: string; btw_tarief_id: string }
const leeg: Form = { omschrijving: '', eenheid: '', prijs: '', btw_tarief_id: '' }
/** Radix Select kent geen lege waarde; dit staat voor "btw van de factuur". */
const GEEN_BTW = 'factuur'

const euro = (n: number) =>
  new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(n)

function RegelForm({ initial, btw, bezig, onOpslaan, onAnnuleer }: {
  initial: Form
  btw: { id: string; label: string }[]
  bezig: boolean
  onOpslaan: (f: Form) => void
  onAnnuleer: () => void
}) {
  const [f, setF] = useState<Form>(initial)
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-neutral-200 bg-white p-3">
      <FormRow cols="2">
        <FormField label="Omschrijving op de factuur" upper required className="col-span-full">
          <Input value={f.omschrijving} autoFocus placeholder="bijv. Voorrijkosten"
                 onChange={e => setF(p => ({ ...p, omschrijving: e.target.value }))} />
        </FormField>
        <FormField label="Prijs excl. btw (€)" upper>
          <Input type="number" step="0.01" inputMode="decimal" value={f.prijs}
                 onChange={e => setF(p => ({ ...p, prijs: e.target.value }))} />
        </FormField>
        <FormField label="Eenheid" upper>
          <Input value={f.eenheid} placeholder="stuk, rit, uur…"
                 onChange={e => setF(p => ({ ...p, eenheid: e.target.value }))} />
        </FormField>
        <FormField label="Btw" upper className="col-span-full">
          <Select value={f.btw_tarief_id || GEEN_BTW}
                  onValueChange={v => setF(p => ({ ...p, btw_tarief_id: v === GEEN_BTW ? '' : v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={GEEN_BTW}>Zelfde als de factuur</SelectItem>
              {btw.map(t => <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </FormField>
      </FormRow>
      <div className="flex gap-2">
        <Button variant="primary" disabled={bezig || !f.omschrijving.trim()} onClick={() => onOpslaan(f)}>
          {bezig ? 'Opslaan…' : 'Opslaan'}
        </Button>
        <Button variant="ghost" onClick={onAnnuleer}>Annuleer</Button>
      </div>
    </div>
  )
}

/**
 * De bedrijfsbrede kieslijst voor losse regels op een regiefactuur. Uitzetten in plaats van
 * verwijderen: de regel verdwijnt uit de kiezer maar is terug te halen.
 */
export default function StandaardRegelsBeheer({ initial, btw }: {
  initial: Standaardregel[]
  btw: { id: string; label: string }[]
}) {
  const router = useRouter()
  const [bewerk, setBewerk] = useState<string | 'nieuw' | null>(null)
  const [bezig, setBezig] = useState(false)
  const btwLabel = new Map(btw.map(t => [t.id, t.label]))

  async function opslaan(id: string | undefined, f: Form) {
    const tekst = f.prijs.trim().replace(',', '.')
    const prijs = tekst === '' ? null : Number(tekst)
    if (prijs != null && !Number.isFinite(prijs)) { toast.error('De prijs is geen bedrag.'); return }
    setBezig(true)
    const r = await bewaarStandaardregel({
      id, omschrijving: f.omschrijving, eenheid: f.eenheid || null, prijs, btw_tarief_id: f.btw_tarief_id || null,
    })
    setBezig(false)
    if (!r.ok) { toast.error(r.error); return }
    setBewerk(null)
    router.refresh()
  }

  async function zetActief(r: Standaardregel) {
    const res = await zetStandaardregelActief(r.id, !r.actief)
    if (!res.ok) { toast.error(res.error); return }
    router.refresh()
  }

  return (
    <div className="flex flex-col gap-2">
      {initial.length === 0 && bewerk !== 'nieuw' && (
        <EmptyState size="sm" tone="neutral" title="Nog geen standaardregels"
                    description="Bijvoorbeeld voorrijkosten of opstartkosten." />
      )}
      {initial.map(r => bewerk === r.id ? (
        <RegelForm key={r.id} btw={btw} bezig={bezig}
          initial={{ omschrijving: r.omschrijving, eenheid: r.eenheid ?? '', prijs: r.prijs != null ? String(r.prijs) : '', btw_tarief_id: r.btw_tarief_id ?? '' }}
          onOpslaan={f => opslaan(r.id, f)} onAnnuleer={() => setBewerk(null)} />
      ) : (
        <div key={r.id}
             className={`flex items-center gap-3 rounded-lg border border-neutral-200 px-3 py-2 ${r.actief ? 'bg-white' : 'bg-neutral-50 opacity-60'}`}>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-semibold text-neutral-900">{r.omschrijving}</div>
            <div className="text-[12px] text-neutral-500">
              {r.prijs != null ? euro(r.prijs) : 'Geen prijs'}{r.eenheid ? ` / ${r.eenheid}` : ''}
              {r.btw_tarief_id && btwLabel.get(r.btw_tarief_id) ? ` · ${btwLabel.get(r.btw_tarief_id)}` : ''}
            </div>
          </div>
          {!r.actief && <Badge tone="neutral">Uit</Badge>}
          <Button variant="ghost" size="sm" onClick={() => setBewerk(r.id)}>Bewerken</Button>
          <Button variant="ghost" size="sm" onClick={() => zetActief(r)}>{r.actief ? 'Uitzetten' : 'Aanzetten'}</Button>
        </div>
      ))}
      {bewerk === 'nieuw'
        ? <RegelForm initial={leeg} btw={btw} bezig={bezig} onOpslaan={f => opslaan(undefined, f)} onAnnuleer={() => setBewerk(null)} />
        : <div><Button variant="outline" size="sm" onClick={() => setBewerk('nieuw')}>Regel toevoegen</Button></div>}
    </div>
  )
}
