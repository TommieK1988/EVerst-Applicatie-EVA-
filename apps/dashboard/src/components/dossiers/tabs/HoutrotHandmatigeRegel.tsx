'use client'

import { useState } from 'react'
import { Button, FormField, FormRow, Input, Textarea, inputVariants } from '@/components/ui'
import { formatCurrency } from '@/lib/houtrotherstel/utils'
import {
  valideerHandmatigeRegel, verkoopMateriaal, TARIEF_BRON_LABEL, type HandmatigeRegel,
} from '@/lib/houtrotherstel/handmatige-regel'
import { REGEL_CATEGORIEEN, type RegelCategorie, type RegelType } from '@/lib/houtrotherstel/types'
import type { HandmatigeStandaarden } from '@/services/houtrotherstel/handmatig'

const selectCls = inputVariants()

/** "12,5" en "12.5" zijn allebei 12,5; leeg blijft leeg (NaN), zodat de validatie het meldt. */
const getal = (v: string) => (v.trim() === '' ? NaN : Number(v.replace(',', '.')))
const invoer = (n: number | undefined) => (n == null || !Number.isFinite(n) ? '' : String(n).replace('.', ','))

/**
 * Formulier voor één handmatige regel: arbeid of materiaal die niet in de
 * bibliotheek staat. Rekent zelf niets op; de opslagvorm komt uit
 * `regelVanHandmatig()`, zodat scherm en database dezelfde bedragen kennen.
 */
export default function HoutrotHandmatigeRegel({
  standaarden, start, onOpslaan, onAnnuleer,
}: {
  /** `null` = de standaardwaarden worden nog geladen. */
  standaarden: HandmatigeStandaarden | null
  /** Bestaande regel om te bewerken; weglaten = nieuwe regel. */
  start?: { regel: HandmatigeRegel; fotoUrl?: string }
  onOpslaan: (regel: HandmatigeRegel, foto: File | null, fotoWeg: boolean) => void
  onAnnuleer: () => void
}) {
  const s = start?.regel
  const functies = standaarden?.functies ?? []
  const [type, setType] = useState<RegelType>(s?.type ?? 'arbeid')
  const [omschrijving, setOmschrijving] = useState(s?.omschrijving ?? '')
  const [categorie, setCategorie] = useState<RegelCategorie>(s?.categorie ?? 'reparatie')
  const [btw, setBtw] = useState<'hoog' | 'laag'>(s?.btw_tarief ?? 'hoog')
  const [notitie, setNotitie] = useState(s?.notitie ?? '')
  const [foto, setFoto] = useState<File | null>(null)
  const [fotoWeg, setFotoWeg] = useState(false)

  // Arbeid
  const [functie, setFunctie] = useState(s?.type === 'arbeid' ? s.functie : '')
  const [uren, setUren] = useState(s?.type === 'arbeid' ? invoer(s.uren) : '1')
  const [uurtarief, setUurtarief] = useState(s?.type === 'arbeid' ? invoer(s.uurtarief) : '')
  const [kostprijsUur, setKostprijsUur] = useState(s?.type === 'arbeid' ? invoer(s.kostprijs_per_uur) : '')

  // Materiaal
  const [aantal, setAantal] = useState(s?.type === 'materiaal' ? invoer(s.aantal) : '1')
  const [eenheid, setEenheid] = useState(s?.type === 'materiaal' ? s.eenheid : 'st')
  const [inkoop, setInkoop] = useState(s?.type === 'materiaal' ? invoer(s.inkoopprijs) : '')
  const [opslag, setOpslag] = useState(
    s?.type === 'materiaal' ? invoer(s.opslag_pct) : invoer(standaarden?.opslagPct),
  )
  const [fout, setFout] = useState<string | null>(null)

  const standaardFunctie = functies.find(f => f.naam === functie)
  // De opslag kan pas worden voorgesteld als de standaarden binnen zijn.
  const opslagWaarde = opslag === '' && standaarden && !s ? invoer(standaarden.opslagPct) : opslag

  function kiesFunctie(naam: string) {
    setFunctie(naam)
    const f = functies.find(x => x.naam === naam)
    if (f) { setUurtarief(invoer(f.verkoop)); setKostprijsUur(invoer(f.kostprijs)) }
  }

  const verkoopPerStuk = type === 'arbeid'
    ? getal(uurtarief)
    : verkoopMateriaal(getal(inkoop) || 0, getal(opslagWaarde) || 0)
  const hoeveel = getal(type === 'arbeid' ? uren : aantal)
  const regelTotaal = Number.isFinite(verkoopPerStuk) && Number.isFinite(hoeveel) ? verkoopPerStuk * hoeveel : 0

  function opslaan() {
    const gedeeld = {
      omschrijving, categorie, btw_tarief: btw,
      notitie: notitie.trim() || undefined,
      foto_pad: fotoWeg ? undefined : s?.foto_pad,
    }
    const kandidaat = type === 'arbeid'
      ? { type, ...gedeeld, functie, uren: getal(uren), uurtarief: getal(uurtarief), kostprijs_per_uur: getal(kostprijsUur || '0') }
      : { type, ...gedeeld, aantal: getal(aantal), eenheid, inkoopprijs: getal(inkoop), opslag_pct: getal(opslagWaarde) }
    const uitkomst = valideerHandmatigeRegel(kandidaat)
    if (!uitkomst.ok) { setFout(uitkomst.fout); return }
    onOpslaan(uitkomst.regel, foto, fotoWeg)
  }

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-neutral-200 bg-neutral-50 p-4">
      {fout && <p className="text-[12.5px] text-error-700">{fout}</p>}

      <div className="flex gap-2">
        {(['arbeid', 'materiaal'] as const).map(t => (
          <Button key={t} type="button" size="sm" variant={type === t ? 'primary' : 'outline'}
            onClick={() => { setType(t); setFout(null) }}>
            {t === 'arbeid' ? 'Arbeid' : 'Materiaal'}
          </Button>
        ))}
      </div>

      <FormField label="Omschrijving" upper required>
        <Input value={omschrijving} onChange={e => setOmschrijving(e.target.value)}
          placeholder={type === 'arbeid' ? 'bijv. Kozijnhout uitzagen en inlassen' : 'bijv. Meranti 44×69'} />
      </FormField>

      {type === 'arbeid' ? (
        <>
          <FormRow cols="2">
            <FormField label="Functie" upper required>
              <select className={selectCls} value={functie} onChange={e => kiesFunctie(e.target.value)}>
                <option value="">{standaarden ? '— kies —' : 'Laden…'}</option>
                {functie && !standaardFunctie && <option value={functie}>{functie}</option>}
                {functies.map(f => <option key={f.naam} value={f.naam}>{f.naam}</option>)}
              </select>
            </FormField>
            <FormField label="Aantal uren" upper required>
              <Input inputMode="decimal" value={uren} onChange={e => setUren(e.target.value)} />
            </FormField>
          </FormRow>
          <FormRow cols="2">
            <FormField label="Uurtarief" upper required
              helper={standaardFunctie
                ? `Standaard ${formatCurrency(standaardFunctie.verkoop)} (${TARIEF_BRON_LABEL[standaardFunctie.bron]})`
                : 'Kies een functie voor het standaardtarief.'}>
              <Input inputMode="decimal" prefix="€" value={uurtarief} onChange={e => setUurtarief(e.target.value)} />
            </FormField>
            <FormField label="Kostprijs per uur" upper optional>
              <Input inputMode="decimal" prefix="€" value={kostprijsUur} onChange={e => setKostprijsUur(e.target.value)} />
            </FormField>
          </FormRow>
        </>
      ) : (
        <>
          <FormRow cols="2">
            <FormField label="Aantal" upper required>
              <Input inputMode="decimal" value={aantal} onChange={e => setAantal(e.target.value)} />
            </FormField>
            <FormField label="Eenheid" upper required>
              <select className={selectCls} value={eenheid} onChange={e => setEenheid(e.target.value)}>
                {!(standaarden?.eenheden ?? []).includes(eenheid) && <option value={eenheid}>{eenheid}</option>}
                {(standaarden?.eenheden ?? []).map(e => <option key={e} value={e}>{e}</option>)}
              </select>
            </FormField>
          </FormRow>
          <FormRow cols="3">
            <FormField label="Inkoopprijs" upper required>
              <Input inputMode="decimal" prefix="€" value={inkoop} onChange={e => setInkoop(e.target.value)} />
            </FormField>
            <FormField label="Opslag" upper required>
              <Input inputMode="decimal" suffix="%" value={opslagWaarde} onChange={e => setOpslag(e.target.value)} />
            </FormField>
            <FormField label="Verkoopprijs" upper helper="Inkoop plus opslag">
              <Input value={formatCurrency(verkoopPerStuk)} readOnly disabled />
            </FormField>
          </FormRow>
        </>
      )}

      <FormRow cols="2">
        <FormField label="Categorie" upper>
          <select className={selectCls} value={categorie} onChange={e => setCategorie(e.target.value as RegelCategorie)}>
            {(Object.keys(REGEL_CATEGORIEEN) as RegelCategorie[]).map(c => (
              // Kort gehouden: de volledige naam past niet in een halve kolom.
              <option key={c} value={c}>{c === 'meerwerk' ? 'Aanvullend (meerwerk)' : REGEL_CATEGORIEEN[c]}</option>
            ))}
          </select>
        </FormField>
        <FormField label="Btw" upper>
          <select className={selectCls} value={btw} onChange={e => setBtw(e.target.value as 'hoog' | 'laag')}>
            <option value="hoog">21% (hoog)</option>
            <option value="laag">9% (laag)</option>
          </select>
        </FormField>
      </FormRow>

      <FormRow cols="2">
        <FormField label="Notitie" upper optional>
          <Textarea rows={2} value={notitie} onChange={e => setNotitie(e.target.value)} />
        </FormField>
        <FormField label="Foto" upper optional>
          {start?.fotoUrl && !fotoWeg && !foto ? (
            <div className="flex items-center gap-2 text-[12.5px]">
              <a href={start.fotoUrl} target="_blank" rel="noopener noreferrer" className="text-brand-700 underline">Huidige foto</a>
              <Button type="button" size="sm" variant="ghost" onClick={() => setFotoWeg(true)}>Weghalen</Button>
            </div>
          ) : (
            <input type="file" accept="image/*" className="w-full text-[12.5px]"
              onChange={e => setFoto(e.target.files?.[0] ?? null)} />
          )}
        </FormField>
      </FormRow>

      <div className="flex items-center justify-between gap-3 border-t border-neutral-200 pt-3">
        <span className="text-[12.5px] text-neutral-500">
          Regeltotaal <strong className="text-neutral-900">{formatCurrency(regelTotaal)}</strong>
        </span>
        <div className="flex gap-2">
          <Button type="button" size="sm" variant="outline" onClick={onAnnuleer}>Annuleren</Button>
          <Button type="button" size="sm" onClick={opslaan}>{start ? 'Regel bijwerken' : 'Regel toevoegen'}</Button>
        </div>
      </div>
    </div>
  )
}
