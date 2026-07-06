'use client'

import React, { useState, useTransition, useEffect } from 'react'
import toast from 'react-hot-toast'
import { Search } from 'lucide-react'
import type {
  BedrijfsagendaItemMetDoelgroep,
  BedrijfsagendaType,
  BedrijfsagendaHerhaling,
  MedewerkerAfdeling,
  Medewerker,
} from '@everts/database/platform-types'
import { bedrijfsagendaTypeLabels, bedrijfsagendaTypeKleur } from '@everts/database/platform-types'
import { maakAgendaItem, updateAgendaItem, verwijderAgendaItem, bewerkEnkelOccurrence, verwijderEnkelOccurrence } from '@/app/(platform)/planning/bedrijfsagenda/actions'
import {
  Alert,
  Button,
  Card, CardHeader, CardBody,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter,
  Input,
  Textarea,
} from '@/components/ui'

type Props = {
  item?: BedrijfsagendaItemMetDoelgroep
  initialDatum?: string
  seriesId?: string
  occurrenceDatum?: string
  afdelingen?: Pick<MedewerkerAfdeling, 'id' | 'naam'>[]
  medewerkers?: Pick<Medewerker, 'id' | 'voornaam' | 'tussenvoegsel' | 'achternaam' | 'afdeling'>[]
  onClose: () => void
  onSaved?: () => void
}

const labelStyle: React.CSSProperties = {
  fontSize: 10, fontWeight: 700,
  color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.08em',
  display: 'block', marginBottom: 4,
}

const fieldStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 0,
}

const WEEKDAGEN     = ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo']
const WEEKDAG_NAMEN = ['maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag', 'zondag']
const ORDINAL_LABELS: Record<number, string> = { 1: 'eerste', 2: 'tweede', 3: 'derde', 4: 'vierde', [-1]: 'laatste' }

type BereikType = 'geen_einddatum' | 'na_keer' | 'op_datum'

type FormState = {
  type:                        BedrijfsagendaType
  titel:                       string
  omschrijving:                string
  start_datum:                 string
  eind_datum:                  string
  hele_dag:                    boolean
  start_tijd:                  string
  eind_tijd:                   string
  locatie:                     string
  kleur:                       string
  herhaling:                   BedrijfsagendaHerhaling
  herhaling_interval:          number
  herhaling_weekdagen:         number[]
  herhaling_einde:             string
  herhaling_aantal:            number | null
  herhaling_maand_type:        'dag' | 'weekdag'
  herhaling_maand_weekordinal: number | null
  in_planning:                 boolean
  in_agenda:                   boolean
  stuur_herinnering:           boolean
  herinnering_dagen:           number
  doelgroep_afdelingen:        string[]
  doelgroep_medewerkers:       string[]
}

function vandaagStr() {
  // Lokale datum — toISOString() (UTC) geeft vóór 01:00/02:00 NL de vorige dag.
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function bereikType(form: FormState): BereikType {
  if (form.herhaling_aantal !== null) return 'na_keer'
  if (form.herhaling_einde)           return 'op_datum'
  return 'geen_einddatum'
}

/** Berekent de ordinal (1-4, of -1=laatste) van een dag in de maand. */
function berekenOrdinal(dagStr: string): number {
  const dag = parseInt(dagStr.slice(8), 10)
  const ordinal = Math.ceil(dag / 7)
  return ordinal >= 5 ? -1 : ordinal
}

/** ISO weekdag (1=Ma…7=Zo) uit datum-string. */
function isoWeekdag(dagStr: string): number {
  const d = new Date(dagStr)
  const wd = d.getDay() // 0=Zo, 1=Ma…
  return wd === 0 ? 7 : wd
}

function medNaam(m: Pick<Medewerker, 'voornaam' | 'tussenvoegsel' | 'achternaam'>): string {
  return [m.voornaam, m.tussenvoegsel, m.achternaam].filter(Boolean).join(' ')
}

export default function AgendaItemModal({
  item, initialDatum, seriesId, occurrenceDatum,
  afdelingen = [], medewerkers = [], onClose, onSaved,
}: Props) {
  const isEdit = !!item
  const isOccurrence = !!seriesId && !!occurrenceDatum
  const [isPending, startTransition] = useTransition()
  const defaultDatum = initialDatum ?? vandaagStr()

  const [form, setForm] = useState<FormState>(() => ({
    type:                        item?.type                        ?? 'activiteit',
    titel:                       item?.titel                       ?? '',
    omschrijving:                item?.omschrijving                ?? '',
    start_datum:                 item?.start_datum                 ?? defaultDatum,
    eind_datum:                  item?.eind_datum                  ?? defaultDatum,
    hele_dag:                    item?.hele_dag                    ?? true,
    start_tijd:                  item?.start_tijd                  ?? '',
    eind_tijd:                   item?.eind_tijd                   ?? '',
    locatie:                     item?.locatie                     ?? '',
    kleur:                       item?.kleur                       ?? bedrijfsagendaTypeKleur[item?.type ?? 'activiteit'],
    herhaling:                   item?.herhaling                   ?? 'geen',
    herhaling_interval:          item?.herhaling_interval          ?? 1,
    herhaling_weekdagen:         item?.herhaling_weekdagen         ?? [],
    herhaling_einde:             item?.herhaling_einde             ?? '',
    herhaling_aantal:            item?.herhaling_aantal            ?? null,
    herhaling_maand_type:        item?.herhaling_maand_type        ?? 'dag',
    herhaling_maand_weekordinal: item?.herhaling_maand_weekordinal ?? null,
    in_planning:                 item?.in_planning                 ?? false,
    in_agenda:                   item?.in_agenda                   ?? false,
    stuur_herinnering:           item?.stuur_herinnering           ?? false,
    herinnering_dagen:           item?.herinnering_dagen           ?? 1,
    doelgroep_afdelingen:        item?.doelgroep_afdelingen        ?? [],
    doelgroep_medewerkers:       item?.doelgroep_medewerkers       ?? [],
  }))

  const [afdZoek, setAfdZoek] = useState('')
  const [medZoek, setMedZoek] = useState('')

  // ATV-dag shortcut
  useEffect(() => {
    if (form.type === 'atv_dag') {
      setForm(f => ({ ...f, in_planning: true, hele_dag: true }))
    }
  }, [form.type])

  // Weekdag van start_datum invullen bij wekelijks
  useEffect(() => {
    if (form.herhaling === 'wekelijks' && form.herhaling_weekdagen.length === 0) {
      const wd = isoWeekdag(form.start_datum)
      setForm(f => ({ ...f, herhaling_weekdagen: [wd] }))
    }
  }, [form.herhaling]) // eslint-disable-line react-hooks/exhaustive-deps

  // Maandelijks weekdag-ordinal invullen bij wisselen
  useEffect(() => {
    if (form.herhaling === 'maandelijks' && form.herhaling_maand_weekordinal === null) {
      setForm(f => ({ ...f, herhaling_maand_weekordinal: berekenOrdinal(f.start_datum) }))
    }
  }, [form.herhaling]) // eslint-disable-line react-hooks/exhaustive-deps

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm(f => ({ ...f, [key]: value }))
  }

  function setBereik(type: BereikType) {
    if (type === 'geen_einddatum') setForm(f => ({ ...f, herhaling_einde: '', herhaling_aantal: null }))
    if (type === 'na_keer')        setForm(f => ({ ...f, herhaling_einde: '', herhaling_aantal: f.herhaling_aantal ?? 10 }))
    if (type === 'op_datum')       setForm(f => ({ ...f, herhaling_einde: f.herhaling_einde || f.start_datum, herhaling_aantal: null }))
  }

  function toggleWeekdag(nr: number) {
    setForm(f => ({
      ...f,
      herhaling_weekdagen: f.herhaling_weekdagen.includes(nr)
        ? f.herhaling_weekdagen.filter(d => d !== nr)
        : [...f.herhaling_weekdagen, nr],
    }))
  }

  function toggleAfdeling(naam: string) {
    setForm(f => ({
      ...f,
      doelgroep_afdelingen: f.doelgroep_afdelingen.includes(naam)
        ? f.doelgroep_afdelingen.filter(a => a !== naam)
        : [...f.doelgroep_afdelingen, naam],
    }))
  }

  function toggleMedewerker(id: string) {
    setForm(f => ({
      ...f,
      doelgroep_medewerkers: f.doelgroep_medewerkers.includes(id)
        ? f.doelgroep_medewerkers.filter(m => m !== id)
        : [...f.doelgroep_medewerkers, id],
    }))
  }

  function herhalingEenheidLabel() {
    switch (form.herhaling) {
      case 'dagelijks':   return form.herhaling_interval === 1 ? 'dag' : 'dagen'
      case 'wekelijks':   return form.herhaling_interval === 1 ? 'week' : 'weken'
      case 'maandelijks': return form.herhaling_interval === 1 ? 'maand' : 'maanden'
      case 'jaarlijks':   return 'jaar'
      default: return ''
    }
  }

  function handleOpslaan() {
    if (!form.titel.trim()) { toast.error('Vul een titel in'); return }
    if (form.eind_datum < form.start_datum) { toast.error('Einddatum mag niet vóór startdatum liggen'); return }

    startTransition(async () => {
      const payload = {
        type:                form.type,
        titel:               form.titel.trim(),
        omschrijving:        form.omschrijving || null,
        start_datum:         form.start_datum,
        eind_datum:          form.eind_datum,
        hele_dag:            form.hele_dag,
        start_tijd:          form.hele_dag ? null : (form.start_tijd || null),
        eind_tijd:           form.hele_dag ? null : (form.eind_tijd || null),
        locatie:             form.locatie || null,
        kleur:               form.kleur,
        herhaling:           form.herhaling,
        herhaling_einde:     form.herhaling !== 'geen' && form.herhaling_einde ? form.herhaling_einde : null,
        herhaling_interval:  form.herhaling !== 'geen' ? form.herhaling_interval : 1,
        herhaling_weekdagen: form.herhaling === 'wekelijks' ? (form.herhaling_weekdagen.length > 0 ? form.herhaling_weekdagen : null) : null,
        herhaling_aantal:    form.herhaling !== 'geen' ? form.herhaling_aantal : null,
        herhaling_maand_type:        form.herhaling === 'maandelijks' ? form.herhaling_maand_type : 'dag',
        herhaling_maand_weekordinal: form.herhaling === 'maandelijks' && form.herhaling_maand_type === 'weekdag'
          ? (form.herhaling_maand_weekordinal ?? berekenOrdinal(form.start_datum))
          : null,
        in_planning:         form.in_planning,
        in_agenda:           form.in_agenda,
        stuur_herinnering:   form.stuur_herinnering,
        herinnering_dagen:   form.herinnering_dagen,
        doelgroep_afdelingen:  form.doelgroep_afdelingen,
        doelgroep_medewerkers: form.doelgroep_medewerkers,
      }

      const result = isOccurrence && seriesId && occurrenceDatum
        ? await bewerkEnkelOccurrence(seriesId, occurrenceDatum, payload)
        : isEdit
          ? await updateAgendaItem(item!.id, payload)
          : await maakAgendaItem(payload)

      if (result.ok) {
        toast.success(isEdit ? 'Item bijgewerkt' : 'Item aangemaakt')
        onSaved?.()
        onClose()
      } else {
        toast.error(result.error)
      }
    })
  }

  function handleVerwijder() {
    if (!item && !isOccurrence) return
    const titel = item?.titel ?? 'Dit item'
    if (!confirm(`"${titel}" verwijderen?`)) return
    startTransition(async () => {
      if (isOccurrence && seriesId && occurrenceDatum) {
        const result = await verwijderEnkelOccurrence(seriesId, occurrenceDatum)
        if (result.ok) { toast.success('Item verwijderd'); onSaved?.(); onClose() }
        else toast.error(result.error)
        return
      }
      if (!item) return
      const result = await verwijderAgendaItem(item.id)
      if (result.ok) { toast.success('Item verwijderd'); onSaved?.(); onClose() }
      else toast.error(result.error)
    })
  }

  const huidigBereik = bereikType(form)
  const startWd      = isoWeekdag(form.start_datum)
  const startDag     = parseInt(form.start_datum.slice(8), 10)
  const startOrdinal = form.herhaling_maand_weekordinal ?? berekenOrdinal(form.start_datum)

  const gefilterdAfdelingen = afdelingen.filter(a =>
    a.naam.toLowerCase().includes(afdZoek.toLowerCase())
  )
  const gefilterdMedewerkers = medewerkers.filter(m =>
    medNaam(m).toLowerCase().includes(medZoek.toLowerCase())
  )

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose() }}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>
            {isOccurrence ? 'Voorkomen bewerken' : isEdit ? 'Item bewerken' : 'Nieuw agenda-item'}
          </DialogTitle>
        </DialogHeader>

        <DialogBody>
        {/* Occurrence banner */}
        {isOccurrence && (
          <Alert tone="info" className="mb-4 text-[12px]">
            Je bewerkt alleen dit voorkomen. De overige items in de reeks blijven ongewijzigd.
          </Alert>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Type + Kleur */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'end' }}>
            <div style={fieldStyle}>
              <label style={labelStyle}>Type</label>
              <select className="eva-input" value={form.type} onChange={e => {
                const t = e.target.value as BedrijfsagendaType
                setForm(f => ({ ...f, type: t, kleur: bedrijfsagendaTypeKleur[t] }))
              }}>
                {(Object.entries(bedrijfsagendaTypeLabels) as [BedrijfsagendaType, string][]).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle}>Kleur</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input
                  type="color"
                  value={form.kleur}
                  onChange={e => set('kleur', e.target.value)}
                  style={{ width: 38, height: 38, padding: 2, borderRadius: 6, border: '1px solid var(--border)', cursor: 'pointer' }}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => set('kleur', bedrijfsagendaTypeKleur[form.type])}
                  title="Reset naar type-standaard"
                >reset</Button>
              </div>
            </div>
          </div>

          {/* Titel */}
          <div style={fieldStyle}>
            <label style={labelStyle}>Titel *</label>
            <Input style={{ width: '100%' }} placeholder="Omschrijving van het item" value={form.titel} onChange={e => set('titel', e.target.value)} />
          </div>

          {/* Datums */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={fieldStyle}>
              <label style={labelStyle}>Startdatum *</label>
              <input
                type="date" className="eva-input" value={form.start_datum}
                onChange={e => { set('start_datum', e.target.value); if (e.target.value > form.eind_datum) set('eind_datum', e.target.value) }}
              />
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle}>Einddatum *</label>
              <input type="date" className="eva-input" value={form.eind_datum} min={form.start_datum} onChange={e => set('eind_datum', e.target.value)} />
            </div>
          </div>

          {/* Hele dag */}
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' }}>
            <input type="checkbox" checked={form.hele_dag} onChange={e => set('hele_dag', e.target.checked)} disabled={form.type === 'atv_dag'} />
            <span style={{ fontSize: 13, color: 'var(--fg)' }}>Hele dag</span>
          </label>

          {/* Tijden */}
          {!form.hele_dag && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={fieldStyle}>
                <label style={labelStyle}>Starttijd</label>
                <input type="time" className="eva-input" value={form.start_tijd} onChange={e => set('start_tijd', e.target.value)} />
              </div>
              <div style={fieldStyle}>
                <label style={labelStyle}>Eindtijd</label>
                <input type="time" className="eva-input" value={form.eind_tijd} onChange={e => set('eind_tijd', e.target.value)} />
              </div>
            </div>
          )}

          {/* Locatie */}
          <div style={fieldStyle}>
            <label style={labelStyle}>Locatie</label>
            <Input style={{ width: '100%' }} placeholder="Optioneel" value={form.locatie} onChange={e => set('locatie', e.target.value)} />
          </div>

          {/* Omschrijving */}
          <div style={fieldStyle}>
            <label style={labelStyle}>Omschrijving</label>
            <Textarea style={{ width: '100%', minHeight: 72, resize: 'vertical' }} placeholder="Optioneel" value={form.omschrijving} onChange={e => set('omschrijving', e.target.value)} />
          </div>

          {/* Herhaling */}
          {!isOccurrence && (
          <div style={fieldStyle}>
            <label style={labelStyle}>Herhaling</label>
            <select className="eva-input" value={form.herhaling} onChange={e => set('herhaling', e.target.value as BedrijfsagendaHerhaling)}>
              <option value="geen">Geen herhaling</option>
              <option value="dagelijks">Dagelijks</option>
              <option value="wekelijks">Wekelijks</option>
              <option value="maandelijks">Maandelijks</option>
              <option value="jaarlijks">Jaarlijks</option>
            </select>
          </div>
          )}

          {/* Herhaling-instellingen */}
          {!isOccurrence && form.herhaling !== 'geen' && (
            <Card>
            <CardBody style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Interval */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 13, color: 'var(--fg)', whiteSpace: 'nowrap' }}>Herhaal elke</span>
                <input
                  type="number" min={1} max={99} className="eva-input"
                  style={{ width: 64, textAlign: 'center' }}
                  value={form.herhaling_interval}
                  onChange={e => set('herhaling_interval', Math.max(1, Number(e.target.value)))}
                />
                <span style={{ fontSize: 13, color: 'var(--fg)' }}>{herhalingEenheidLabel()}</span>
              </div>

              {/* Weekdagen (wekelijks) */}
              {form.herhaling === 'wekelijks' && (
                <div>
                  <div style={{ ...labelStyle, marginBottom: 8 }}>Op</div>
                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                    {WEEKDAGEN.map((dag, idx) => {
                      const nr = idx + 1
                      const actief = form.herhaling_weekdagen.includes(nr)
                      return (
                        <button
                          key={dag} type="button" onClick={() => toggleWeekdag(nr)}
                          style={{
                            width: 36, height: 32, borderRadius: 6,
                            fontSize: 11, fontWeight: 700, border: `1px solid ${actief ? 'var(--accent)' : 'var(--border)'}`,
                            background: actief ? 'var(--accent)' : 'transparent',
                            color: actief ? 'white' : 'var(--fg-muted)',
                            cursor: 'pointer',
                          }}
                        >{dag}</button>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Maandelijks sub-opties */}
              {form.herhaling === 'maandelijks' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={labelStyle}>Terugkeerpatroon</div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' }}>
                    <input
                      type="radio" name="maand_type"
                      checked={form.herhaling_maand_type === 'dag'}
                      onChange={() => set('herhaling_maand_type', 'dag')}
                    />
                    <span style={{ fontSize: 13, color: 'var(--fg)' }}>
                      Op dag <strong>{startDag}</strong> van de maand
                    </span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' }}>
                    <input
                      type="radio" name="maand_type"
                      checked={form.herhaling_maand_type === 'weekdag'}
                      onChange={() => {
                        set('herhaling_maand_type', 'weekdag')
                        set('herhaling_maand_weekordinal', berekenOrdinal(form.start_datum))
                      }}
                    />
                    <span style={{ fontSize: 13, color: 'var(--fg)' }}>
                      Op de <strong>{ORDINAL_LABELS[startOrdinal] ?? startOrdinal}</strong> <strong>{WEEKDAG_NAMEN[startWd - 1]}</strong> van de maand
                    </span>
                  </label>
                </div>
              )}

              {/* Bereik */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={labelStyle}>Bereik</div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' }}>
                  <input type="radio" name="bereik" checked={huidigBereik === 'geen_einddatum'} onChange={() => setBereik('geen_einddatum')} />
                  <span style={{ fontSize: 13, color: 'var(--fg)' }}>Geen einddatum</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' }}>
                  <input type="radio" name="bereik" checked={huidigBereik === 'na_keer'} onChange={() => setBereik('na_keer')} />
                  <span style={{ fontSize: 13, color: 'var(--fg)' }}>Eindigt na</span>
                  <input
                    type="number" min={1} max={999} className="eva-input"
                    style={{ width: 72, textAlign: 'center' }}
                    value={form.herhaling_aantal ?? ''}
                    disabled={huidigBereik !== 'na_keer'}
                    onChange={e => set('herhaling_aantal', Math.max(1, Number(e.target.value)))}
                    onClick={() => setBereik('na_keer')}
                  />
                  <span style={{ fontSize: 13, color: 'var(--fg)' }}>keer</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' }}>
                  <input type="radio" name="bereik" checked={huidigBereik === 'op_datum'} onChange={() => setBereik('op_datum')} />
                  <span style={{ fontSize: 13, color: 'var(--fg)' }}>Eindigt op</span>
                  <input
                    type="date" className="eva-input"
                    value={form.herhaling_einde}
                    disabled={huidigBereik !== 'op_datum'}
                    min={form.start_datum}
                    onChange={e => set('herhaling_einde', e.target.value)}
                    onClick={() => setBereik('op_datum')}
                  />
                </label>
              </div>
            </CardBody>
            </Card>
          )}

          {/* Instellingen */}
          <Card>
            <CardHeader>Instellingen</CardHeader>
            <CardBody style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' }}>
              <input type="checkbox" checked={form.in_planning} onChange={e => set('in_planning', e.target.checked)} />
              <span style={{ fontSize: 13, color: 'var(--fg)' }}>Toon in medewerkerplanning</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'not-allowed', userSelect: 'none', opacity: 0.45 }}>
              <input type="checkbox" disabled checked={form.in_agenda} />
              <span style={{ fontSize: 13, color: 'var(--fg)' }}>Synchroniseer naar agenda <span style={{ fontSize: 11, color: 'var(--fg-muted)' }}>(binnenkort)</span></span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'not-allowed', userSelect: 'none', opacity: 0.45 }}>
              <input type="checkbox" disabled checked={form.stuur_herinnering} />
              <span style={{ fontSize: 13, color: 'var(--fg)' }}>Herinnering sturen <span style={{ fontSize: 11, color: 'var(--fg-muted)' }}>(binnenkort)</span></span>
            </label>
            </CardBody>
          </Card>

          {/* Doelgroep */}
          <Card>
            <CardHeader>
              Geldt voor
              <span style={{ fontSize: 11, color: 'var(--fg-muted)', fontWeight: 400, letterSpacing: 0, textTransform: 'none' }}>
                Geen selectie = bedrijfsbreed
              </span>
            </CardHeader>
            <CardBody style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* Afdelingen */}
            {afdelingen.length > 0 && (
              <div>
                <div style={{ ...labelStyle, marginBottom: 8 }}>Afdelingen</div>
                <div style={{ position: 'relative', marginBottom: 8 }}>
                  <Search size={12} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--fg-muted)', pointerEvents: 'none', zIndex: 1 }} />
                  <Input
                    style={{ width: '100%', paddingLeft: 28, fontSize: 12 }}
                    placeholder="Zoek afdeling…"
                    value={afdZoek}
                    onChange={e => setAfdZoek(e.target.value)}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 140, overflowY: 'auto' }}>
                  {gefilterdAfdelingen.map(a => (
                    <label key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none', padding: '3px 0' }}>
                      <input
                        type="checkbox"
                        checked={form.doelgroep_afdelingen.includes(a.naam)}
                        onChange={() => toggleAfdeling(a.naam)}
                      />
                      <span style={{ fontSize: 13, color: 'var(--fg)' }}>{a.naam}</span>
                    </label>
                  ))}
                  {gefilterdAfdelingen.length === 0 && (
                    <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>Geen resultaten</span>
                  )}
                </div>
              </div>
            )}

            {/* Medewerkers */}
            {medewerkers.length > 0 && (
              <div>
                <div style={{ ...labelStyle, marginBottom: 8 }}>Medewerkers</div>
                <div style={{ position: 'relative', marginBottom: 8 }}>
                  <Search size={12} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--fg-muted)', pointerEvents: 'none', zIndex: 1 }} />
                  <Input
                    style={{ width: '100%', paddingLeft: 28, fontSize: 12 }}
                    placeholder="Zoek medewerker…"
                    value={medZoek}
                    onChange={e => setMedZoek(e.target.value)}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 160, overflowY: 'auto' }}>
                  {gefilterdMedewerkers.map(m => (
                    <label key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none', padding: '3px 0' }}>
                      <input
                        type="checkbox"
                        checked={form.doelgroep_medewerkers.includes(m.id)}
                        onChange={() => toggleMedewerker(m.id)}
                      />
                      <div>
                        <span style={{ fontSize: 13, color: 'var(--fg)' }}>{medNaam(m)}</span>
                        {m.afdeling && <span style={{ fontSize: 11, color: 'var(--fg-muted)', marginLeft: 6 }}>{m.afdeling}</span>}
                      </div>
                    </label>
                  ))}
                  {gefilterdMedewerkers.length === 0 && (
                    <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>Geen resultaten</span>
                  )}
                </div>
              </div>
            )}
            </CardBody>
          </Card>
        </div>
        </DialogBody>

        <DialogFooter split>
          <div>
            {(isEdit || isOccurrence) && (
              <Button variant="ghost" onClick={handleVerwijder} disabled={isPending} style={{ color: '#ef4444' }}>
                Verwijder
              </Button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="ghost" onClick={onClose} disabled={isPending}>Annuleren</Button>
            <Button variant="primary" onClick={handleOpslaan} loading={isPending} disabled={isPending}>
              {isEdit ? 'Opslaan' : 'Aanmaken'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
