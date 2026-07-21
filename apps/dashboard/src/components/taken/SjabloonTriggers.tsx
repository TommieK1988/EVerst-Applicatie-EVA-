'use client'

import { useState, useEffect, useCallback, useTransition } from 'react'
import { Plus, Trash2, Zap } from 'lucide-react'
import toast from 'react-hot-toast'
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerBody,
  Combobox,
  type ComboboxOption,
} from '@/components/ui'
import {
  getTriggersVoorSjabloon, upsertTrigger, verwijderTrigger, getMedewerkerTriggerRefData,
  type ActielijstTrigger, type TriggerConditie,
} from '@/app/(platform)/taken/actions/sjablonen'
import { getToggleDefinities, type ToggleDefinitie } from '@/app/(platform)/instellingen/dossier-toggles/actions'
import { getDossierCategorieen } from '@/app/(platform)/instellingen/bedrijfsinstellingen/actions'
import { zoekRelaties, getUniekeBouw7Categorieen } from '@/lib/dossiers/actions'

// ─── Statische keuzelijsten ───────────────────────────────────────────────────

const EVENT_TYPES_DOSSIER = [
  { value: 'dossier_status',     label: 'Dossier bereikt status' },
  { value: 'dossier_aangemaakt', label: 'Dossier aangemaakt' },
  { value: 'rol_toegewezen',     label: 'Rol toegewezen' },
  { value: 'veld_waarde',        label: 'Veld krijgt waarde' },
  { value: 'bedrag_drempel',     label: 'Bedrag boven drempel' },
  { value: 'toggle_aan',         label: 'Toggle aangezet' },
]

const EVENT_TYPES_MEDEWERKER = [
  { value: 'medewerker_aangemaakt',  label: 'Medewerker aangemaakt' },
  { value: 'medewerker_veld_waarde', label: 'Veld krijgt waarde' },
  { value: 'medewerker_datum_gezet', label: 'Datum ingevuld of gewijzigd' },
  { value: 'medewerker_attribuut',   label: 'Eigen veld krijgt waarde' },
]

/** Velden op de medewerker die als event/conditie kunnen dienen (spiegel van de whitelist). */
const MEDEWERKER_VELD_OPTIES = [
  { value: 'functie',  label: 'Functie' },
  { value: 'afdeling', label: 'Afdeling' },
  { value: 'actief',   label: 'Actief' },
]
const MEDEWERKER_CONDITIE_VELDEN = [
  ...MEDEWERKER_VELD_OPTIES,
  { value: 'extern', label: 'Extern (ZZP/uitzend)' },
]
const MEDEWERKER_DATUM_OPTIES = [
  { value: 'in_dienst_vanaf', label: 'In dienst vanaf' },
  { value: 'uit_dienst_per',  label: 'Uit dienst per' },
]
const JA_NEE = [{ value: 'true', label: 'Ja' }, { value: 'false', label: 'Nee' }]

interface MedewerkerRefData {
  functies: string[]
  afdelingen: string[]
  attributen: { id: string; naam: string }[]
}

const SUBSTATUSSEN_PER_FASE: Record<string, { value: string; label: string }[]> = {
  aanvraag: [
    { value: 'nieuw', label: 'Nieuw' }, { value: 'inlezen_aanvraag', label: 'Inlezen aanvraag' },
    { value: 'werkopname', label: 'Werkopname' }, { value: 'uitwerken_begroting', label: 'Uitwerken begroting' },
    { value: 'controle_begroting', label: 'Controle begroting' }, { value: 'offerte_gereed', label: 'Offerte gereed' },
    { value: 'verzonden', label: 'Verzonden' }, { value: 'afgewezen', label: 'Afgewezen' }, { value: 'vervallen', label: 'Vervallen' },
  ],
  offerte: [
    { value: 'verzonden', label: 'Verzonden' }, { value: 'nabellen', label: 'Nabellen' },
    { value: 'in_behandeling', label: 'In behandeling' }, { value: 'mondelinge_toezegging', label: 'Mondelinge toezegging' },
    { value: 'gewonnen', label: 'Gewonnen' }, { value: 'verloren', label: 'Verloren' }, { value: 'vervallen', label: 'Vervallen' },
  ],
  opdracht: [
    { value: 'nieuwe_opdracht', label: 'Nieuwe opdracht' }, { value: 'werkvoorbereiding', label: 'Werkvoorbereiding' },
    { value: 'onderhanden', label: 'Onderhanden' }, { value: 'uitvoering_gereed', label: 'Uitvoering gereed' },
    { value: 'financieel_gereed', label: 'Financieel gereed' }, { value: 'financieel_afgesloten', label: 'Financieel afgesloten' },
  ],
}

const ROL_OPTIES = [
  { value: 'project_manager_id', label: 'Projectleider' },
  { value: 'teamleider_id',      label: 'Teamleider' },
  { value: 'werkvoorbereider_id',label: 'Werkvoorbereider' },
  { value: 'calculator_id',      label: 'Calculator' },
  { value: 'uitvoerder_id',      label: 'Uitvoerder' },
  { value: 'controller_id',      label: 'Controller' },
]

const VELD_OPTIES = [
  { value: 'categorie',            label: 'Categorie' },
  { value: 'bouw7_categorie_naam', label: 'Bouw7-categorie' },
]

const CONDITIE_VELDEN = [
  { value: 'categorie',            label: 'Categorie' },
  { value: 'bouw7_categorie_naam', label: 'Bouw7-categorie' },
  { value: 'bedrag_excl_btw',      label: 'Bedrag (excl. btw)' },
  { value: 'hoofdstatus',          label: 'Fase' },
  { value: 'actieve_substatus',    label: 'Substatus' },
]

const OP_OPTIES = [
  { value: 'eq', label: '=' }, { value: 'neq', label: '≠' },
  { value: 'gt', label: '>' }, { value: 'gte', label: '≥' },
  { value: 'lt', label: '<' }, { value: 'lte', label: '≤' },
]

// Tekstvelden kennen alleen =/≠; de overige operatoren zijn alleen zinvol voor bedragen.
const OP_OPTIES_TEKST = OP_OPTIES.filter(o => o.value === 'eq' || o.value === 'neq')

// Alle substatussen over de fases heen, ontdubbeld op waarde (voor de Substatus-conditie).
const ALLE_SUBSTATUSSEN: { value: string; label: string }[] = (() => {
  const map = new Map<string, string>()
  for (const lijst of Object.values(SUBSTATUSSEN_PER_FASE)) {
    for (const s of lijst) if (!map.has(s.value)) map.set(s.value, s.label)
  }
  return Array.from(map, ([value, label]) => ({ value, label }))
})()

const FASE_OPTIES = [
  { value: 'aanvraag', label: 'Aanvraag' },
  { value: 'offerte',  label: 'Offerte' },
  { value: 'opdracht', label: 'Opdracht' },
]

// ─── Lokaal draft-type ──────────────────────────────────────────────────────────

interface DraftTrigger {
  id?: string
  localKey: string
  event_type: string
  event_config: Record<string, unknown>
  condities: TriggerConditie[]
  conditie_logica: 'en' | 'of'
  actief: boolean
}

let keyCounter = 0
const nieuweKey = () => `t${keyCounter++}`

const sel = 'w-full appearance-none border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-400'
const inp = 'w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400'

export default function SjabloonTriggers({
  templateId,
  context = 'dossier',
}: {
  templateId: string
  /** Sjabloon-context: bepaalt welke events en condities beschikbaar zijn. */
  context?: 'dossier' | 'medewerker'
}) {
  const isMedewerker = context === 'medewerker'
  const eventTypes = isMedewerker ? EVENT_TYPES_MEDEWERKER : EVENT_TYPES_DOSSIER

  const [open, setOpen] = useState(false)
  const [refDataGeladen, setRefDataGeladen] = useState(false)
  const [triggers, setTriggers] = useState<DraftTrigger[]>([])
  const [categorieen, setCategorieen] = useState<string[]>([])
  const [bouw7Categorieen, setBouw7Categorieen] = useState<string[]>([])
  const [toggles, setToggles] = useState<ToggleDefinitie[]>([])
  const [medewerkerRef, setMedewerkerRef] = useState<MedewerkerRefData>({ functies: [], afdelingen: [], attributen: [] })
  const [, startT] = useTransition()

  // Triggers direct op mount laden zodat de knop het aantal kan tonen.
  useEffect(() => {
    getTriggersVoorSjabloon(templateId).then(rows =>
      setTriggers(rows.map(r => ({
        id: r.id, localKey: nieuweKey(), event_type: r.event_type,
        event_config: r.event_config ?? {}, condities: r.condities ?? [],
        conditie_logica: r.conditie_logica ?? 'en', actief: r.actief,
      }))),
    ).catch(() => {})
  }, [templateId])

  // Referentiedata (categorieën, toggles) lazy bij eerste keer openen.
  useEffect(() => {
    if (!open || refDataGeladen) return
    setRefDataGeladen(true)
    if (isMedewerker) {
      getMedewerkerTriggerRefData().then(setMedewerkerRef).catch(() => {})
      return
    }
    getDossierCategorieen().then(setCategorieen).catch(() => {})
    getUniekeBouw7Categorieen().then(setBouw7Categorieen).catch(() => {})
    getToggleDefinities().then(d => setToggles(d.filter(t => t.actief))).catch(() => {})
  }, [open, refDataGeladen, isMedewerker])

  function patch(key: string, change: Partial<DraftTrigger>) {
    setTriggers(prev => prev.map(t => t.localKey === key ? { ...t, ...change } : t))
  }

  function voegToe() {
    setTriggers(prev => [...prev, {
      localKey: nieuweKey(), event_type: eventTypes[0].value, event_config: {}, condities: [],
      conditie_logica: 'en', actief: true,
    }])
  }

  function bewaar(t: DraftTrigger) {
    startT(async () => {
      try {
        const { id } = await upsertTrigger({
          id: t.id, template_id: templateId, event_type: t.event_type,
          event_config: t.event_config, condities: t.condities,
          conditie_logica: t.conditie_logica, actief: t.actief,
        })
        patch(t.localKey, { id })
        toast.success('Trigger opgeslagen')
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Opslaan mislukt')
      }
    })
  }

  function verwijder(t: DraftTrigger) {
    startT(async () => {
      if (t.id) { try { await verwijderTrigger(t.id, templateId) } catch { /* genegeerd */ } }
      setTriggers(prev => prev.filter(x => x.localKey !== t.localKey))
    })
  }

  // Alleen opgeslagen, actieve triggers tellen mee in de knop.
  const actieveCount = triggers.filter(t => t.id && t.actief).length

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Triggers instellen"
        className={
          actieveCount > 0
            ? 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100'
            : 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
        }
      >
        <Zap className="w-3.5 h-3.5 text-amber-500" />
        Triggers
        {actieveCount > 0 && <span className="font-semibold">· {actieveCount}</span>}
      </button>

      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent width={480}>
          <DrawerHeader>
            <DrawerTitle>Triggers</DrawerTitle>
            <DrawerDescription>
              {isMedewerker ? (
                <>
                  Elke trigger activeert dit sjabloon zodra de gebeurtenis in het medewerkerdossier plaatsvindt
                  en alle condities kloppen — één keer per medewerker. Let op: ook de Bouw7-sync kan medewerkers
                  aanmaken of wijzigen; gebruik condities (bijv. Extern = Nee) om die buiten te sluiten.
                </>
              ) : (
                <>
                  Elke trigger activeert dit sjabloon zodra de gebeurtenis plaatsvindt en alle condities kloppen —
                  één keer per dossier. Een status-trigger vuurt op de status <em>nadat</em> het dossier die fase
                  bereikt; condities worden op dat moment gecheckt.
                </>
              )}
            </DrawerDescription>
          </DrawerHeader>
          <DrawerBody>
            <div className="space-y-4">
              {triggers.length === 0 && (
                <p className="text-xs text-slate-400">
                  Nog geen triggers ingesteld — dit sjabloon is alleen handmatig te activeren.
                </p>
              )}

              {triggers.map(t => (
                <TriggerKaart
                  key={t.localKey}
                  trigger={t}
                  eventTypes={eventTypes}
                  isMedewerker={isMedewerker}
                  medewerkerRef={medewerkerRef}
                  categorieen={categorieen}
                  bouw7Categorieen={bouw7Categorieen}
                  toggles={toggles}
                  onPatch={(c) => patch(t.localKey, c)}
                  onBewaar={() => bewaar(t)}
                  onVerwijder={() => verwijder(t)}
                />
              ))}

              <button onClick={voegToe} className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium">
                <Plus className="w-3.5 h-3.5" /> Trigger toevoegen
              </button>
            </div>
          </DrawerBody>
        </DrawerContent>
      </Drawer>
    </>
  )
}

// ─── Eén trigger-kaart ────────────────────────────────────────────────────────

function TriggerKaart({
  trigger, eventTypes, isMedewerker, medewerkerRef,
  categorieen, bouw7Categorieen, toggles, onPatch, onBewaar, onVerwijder,
}: {
  trigger: DraftTrigger
  eventTypes: { value: string; label: string }[]
  isMedewerker: boolean
  medewerkerRef: MedewerkerRefData
  categorieen: string[]
  bouw7Categorieen: string[]
  toggles: ToggleDefinitie[]
  onPatch: (c: Partial<DraftTrigger>) => void
  onBewaar: () => void
  onVerwijder: () => void
}) {
  const cfg = trigger.event_config
  const setCfg = (c: Record<string, unknown>) => onPatch({ event_config: c })

  // Waardelijst bij het gekozen medewerker-veld; 'actief' is een ja/nee-vlag.
  const medewerkerWaarden =
    cfg.veld === 'functie'  ? medewerkerRef.functies.map(v => ({ value: v, label: v }))
    : cfg.veld === 'afdeling' ? medewerkerRef.afdelingen.map(v => ({ value: v, label: v }))
    : cfg.veld === 'actief'   ? JA_NEE
    : []

  return (
    <div className="border border-slate-200 rounded-lg p-3 space-y-3 bg-slate-50/50">
      <div className="flex items-center gap-2">
        <select value={trigger.event_type} onChange={e => onPatch({ event_type: e.target.value, event_config: {} })} className={sel}>
          {eventTypes.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <button onClick={onVerwijder} className="p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded flex-shrink-0" title="Verwijderen">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Event-config per type */}
      {trigger.event_type === 'dossier_status' && (
        <div className="grid grid-cols-2 gap-2">
          <select value={(cfg.hoofdstatus as string) ?? ''} onChange={e => setCfg({ hoofdstatus: e.target.value, substatus: '' })} className={sel}>
            <option value="">— Fase —</option>
            <option value="aanvraag">Aanvraag</option>
            <option value="offerte">Offerte</option>
            <option value="opdracht">Opdracht</option>
          </select>
          <select value={(cfg.substatus as string) ?? ''} onChange={e => setCfg({ ...cfg, substatus: e.target.value })} disabled={!cfg.hoofdstatus} className={sel}>
            <option value="">— Elke substatus —</option>
            {(SUBSTATUSSEN_PER_FASE[cfg.hoofdstatus as string] ?? []).map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
      )}

      {trigger.event_type === 'dossier_aangemaakt' && (
        <select value={(cfg.hoofdstatus as string) ?? ''} onChange={e => setCfg({ hoofdstatus: e.target.value })} className={sel}>
          <option value="">— Elke fase —</option>
          <option value="aanvraag">Aanvraag</option>
          <option value="offerte">Offerte</option>
          <option value="opdracht">Opdracht</option>
        </select>
      )}

      {trigger.event_type === 'rol_toegewezen' && (
        <select value={(cfg.rol as string) ?? ''} onChange={e => setCfg({ rol: e.target.value })} className={sel}>
          <option value="">— Kies rol —</option>
          {ROL_OPTIES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
      )}

      {trigger.event_type === 'veld_waarde' && (
        <div className="grid grid-cols-2 gap-2">
          <select value={(cfg.veld as string) ?? ''} onChange={e => setCfg({ veld: e.target.value, waarde: '' })} className={sel}>
            <option value="">— Veld —</option>
            {VELD_OPTIES.map(v => <option key={v.value} value={v.value}>{v.label}</option>)}
          </select>
          {cfg.veld === 'bouw7_categorie_naam' ? (
            <select value={(cfg.waarde as string) ?? ''} onChange={e => setCfg({ ...cfg, waarde: e.target.value })} className={sel}>
              <option value="">— Waarde —</option>
              {bouw7Categorieen.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          ) : (
            <select value={(cfg.waarde as string) ?? ''} onChange={e => setCfg({ ...cfg, waarde: e.target.value })} disabled={!cfg.veld} className={sel}>
              <option value="">— Waarde —</option>
              {categorieen.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
        </div>
      )}

      {trigger.event_type === 'bedrag_drempel' && (
        <input type="number" value={(cfg.drempel as number) ?? ''} onChange={e => setCfg({ veld: 'bedrag_excl_btw', drempel: Number(e.target.value) })} placeholder="Drempelbedrag (excl. btw)" className={inp} />
      )}

      {trigger.event_type === 'toggle_aan' && (
        <select value={(cfg.toggle_sleutel as string) ?? ''} onChange={e => setCfg({ toggle_sleutel: e.target.value })} className={sel}>
          <option value="">— Kies toggle —</option>
          {toggles.map(t => <option key={t.id} value={t.sleutel}>{t.label}</option>)}
        </select>
      )}

      {/* Event-config: medewerker-context */}
      {trigger.event_type === 'medewerker_veld_waarde' && (
        <div className="grid grid-cols-2 gap-2">
          <select value={(cfg.veld as string) ?? ''} onChange={e => setCfg({ veld: e.target.value, waarde: '' })} className={sel}>
            <option value="">— Veld —</option>
            {MEDEWERKER_VELD_OPTIES.map(v => <option key={v.value} value={v.value}>{v.label}</option>)}
          </select>
          <select value={(cfg.waarde as string) ?? ''} onChange={e => setCfg({ ...cfg, waarde: e.target.value })} disabled={!cfg.veld} className={sel}>
            <option value="">— Waarde —</option>
            {medewerkerWaarden.map(w => <option key={w.value} value={w.value}>{w.label}</option>)}
          </select>
        </div>
      )}

      {trigger.event_type === 'medewerker_datum_gezet' && (
        <select value={(cfg.veld as string) ?? ''} onChange={e => setCfg({ veld: e.target.value })} className={sel}>
          <option value="">— Kies datum —</option>
          {MEDEWERKER_DATUM_OPTIES.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
        </select>
      )}

      {trigger.event_type === 'medewerker_attribuut' && (
        <div className="grid grid-cols-2 gap-2">
          <select value={(cfg.definitie_id as string) ?? ''} onChange={e => setCfg({ definitie_id: e.target.value, waarde: '' })} className={sel}>
            <option value="">— Eigen veld —</option>
            {medewerkerRef.attributen.map(a => <option key={a.id} value={a.id}>{a.naam}</option>)}
          </select>
          <input
            type="text"
            value={(cfg.waarde as string) ?? ''}
            onChange={e => setCfg({ ...cfg, waarde: e.target.value })}
            placeholder="Elke waarde"
            className={inp}
          />
        </div>
      )}

      {/* Condities */}
      <CondititesEditor
        condities={trigger.condities}
        logica={trigger.conditie_logica}
        isMedewerker={isMedewerker}
        medewerkerRef={medewerkerRef}
        categorieen={categorieen}
        bouw7Categorieen={bouw7Categorieen}
        toggles={toggles}
        onChange={(c) => onPatch({ condities: c })}
        onLogicaChange={(l) => onPatch({ conditie_logica: l })}
      />

      <div className="flex items-center justify-between pt-1">
        <label className="flex items-center gap-1.5 text-xs text-slate-500">
          <input type="checkbox" checked={trigger.actief} onChange={e => onPatch({ actief: e.target.checked })} />
          Actief
        </label>
        <button onClick={onBewaar} className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700">
          Opslaan
        </button>
      </div>
    </div>
  )
}

// ─── Condities-editor ─────────────────────────────────────────────────────────

function CondititesEditor({
  condities, logica, isMedewerker, medewerkerRef,
  categorieen, bouw7Categorieen, toggles, onChange, onLogicaChange,
}: {
  condities: TriggerConditie[]
  logica: 'en' | 'of'
  isMedewerker: boolean
  medewerkerRef: MedewerkerRefData
  categorieen: string[]
  bouw7Categorieen: string[]
  toggles: ToggleDefinitie[]
  onChange: (c: TriggerConditie[]) => void
  onLogicaChange: (l: 'en' | 'of') => void
}) {
  function set(i: number, c: TriggerConditie) {
    onChange(condities.map((x, idx) => idx === i ? c : x))
  }
  function voegToe() {
    onChange([...condities, isMedewerker
      ? { soort: 'veld', veld: 'functie', op: 'eq', waarde: '' }
      : { soort: 'veld', veld: 'categorie', op: 'eq', waarde: '' }])
  }
  function verwijder(i: number) { onChange(condities.filter((_, idx) => idx !== i)) }

  // Medewerker-condities kennen alleen veld-condities; de waardelijst hangt aan het veld.
  const waardenVoorVeld = (veld?: string) =>
    veld === 'functie'  ? medewerkerRef.functies.map(v => ({ value: v, label: v }))
    : veld === 'afdeling' ? medewerkerRef.afdelingen.map(v => ({ value: v, label: v }))
    : JA_NEE   // actief / extern

  if (isMedewerker) {
    return (
      <div className="border-t border-slate-200 pt-2 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wide">
            Condities
            {condities.length < 2 && <span className="normal-case tracking-normal"> (alle moeten kloppen)</span>}
          </p>
          {condities.length >= 2 && (
            <select
              value={logica}
              onChange={e => onLogicaChange(e.target.value as 'en' | 'of')}
              className="appearance-none border border-slate-200 rounded-lg px-2 py-1 text-[11px] bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
            >
              <option value="en">alle condities (EN)</option>
              <option value="of">één van de condities (OF)</option>
            </select>
          )}
        </div>
        {condities.map((c, i) => (
          <div key={i} className="flex items-start gap-2">
            <div className="flex-1 grid grid-cols-3 gap-1.5">
              <select
                value={c.veld ?? ''}
                onChange={e => set(i, { soort: 'veld', veld: e.target.value, op: 'eq', waarde: '' })}
                className={sel}
              >
                {MEDEWERKER_CONDITIE_VELDEN.map(v => <option key={v.value} value={v.value}>{v.label}</option>)}
              </select>
              <select value={c.op ?? 'eq'} onChange={e => set(i, { ...c, op: e.target.value as TriggerConditie['op'] })} className={sel}>
                {OP_OPTIES_TEKST.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <select value={String(c.waarde ?? '')} onChange={e => set(i, { ...c, waarde: e.target.value })} className={sel}>
                <option value="">— Waarde —</option>
                {waardenVoorVeld(c.veld).map(w => <option key={w.value} value={w.value}>{w.label}</option>)}
              </select>
            </div>
            <button onClick={() => verwijder(i)} className="p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded flex-shrink-0">
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        ))}
        <button onClick={voegToe} className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-700">
          <Plus className="w-3 h-3" /> Conditie toevoegen
        </button>
      </div>
    )
  }

  return (
    <div className="border-t border-slate-200 pt-2 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wide">
          Condities
          {condities.length < 2 && <span className="normal-case tracking-normal"> (alle moeten kloppen)</span>}
        </p>
        {condities.length >= 2 && (
          <select
            value={logica}
            onChange={e => onLogicaChange(e.target.value as 'en' | 'of')}
            className="appearance-none border border-slate-200 rounded-lg px-2 py-1 text-[11px] bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
          >
            <option value="en">alle condities (EN)</option>
            <option value="of">één van de condities (OF)</option>
          </select>
        )}
      </div>
      {condities.map((c, i) => (
        <div key={i} className="flex items-start gap-2">
          <div className="flex-1 grid grid-cols-3 gap-1.5">
            <select value={c.soort} onChange={e => set(i, { soort: e.target.value as TriggerConditie['soort'] })} className={sel}>
              <option value="veld">Veld</option>
              <option value="klant">Opdrachtgever</option>
              <option value="relatie_type">Relatie-type</option>
              <option value="toggle">Toggle</option>
            </select>

            {c.soort === 'veld' && <>
              <select
                value={c.veld ?? ''}
                onChange={e => set(i, { soort: 'veld', veld: e.target.value, op: 'eq', waarde: '' })}
                className={sel}
              >
                {CONDITIE_VELDEN.map(v => <option key={v.value} value={v.value}>{v.label}</option>)}
              </select>
              <div className="flex gap-1">
                <select value={c.op ?? 'eq'} onChange={e => set(i, { ...c, op: e.target.value as TriggerConditie['op'] })} className={sel} style={{ width: 56 }}>
                  {(c.veld === 'bedrag_excl_btw' ? OP_OPTIES : OP_OPTIES_TEKST).map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                {c.veld === 'categorie' && (
                  <select value={String(c.waarde ?? '')} onChange={e => set(i, { ...c, waarde: e.target.value })} className={sel}>
                    <option value="">— Waarde —</option>
                    {categorieen.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                  </select>
                )}
                {c.veld === 'bouw7_categorie_naam' && (
                  <select value={String(c.waarde ?? '')} onChange={e => set(i, { ...c, waarde: e.target.value })} className={sel}>
                    <option value="">— Waarde —</option>
                    {bouw7Categorieen.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                  </select>
                )}
                {c.veld === 'hoofdstatus' && (
                  <select value={String(c.waarde ?? '')} onChange={e => set(i, { ...c, waarde: e.target.value })} className={sel}>
                    <option value="">— Fase —</option>
                    {FASE_OPTIES.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                  </select>
                )}
                {c.veld === 'actieve_substatus' && (
                  <select value={String(c.waarde ?? '')} onChange={e => set(i, { ...c, waarde: e.target.value })} className={sel}>
                    <option value="">— Substatus —</option>
                    {ALLE_SUBSTATUSSEN.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                )}
                {c.veld === 'bedrag_excl_btw' && (
                  <input
                    type="number"
                    value={c.waarde === '' || c.waarde == null ? '' : Number(c.waarde)}
                    onChange={e => set(i, { ...c, waarde: e.target.value === '' ? '' : Number(e.target.value) })}
                    placeholder="Bedrag"
                    className={inp}
                  />
                )}
              </div>
            </>}

            {c.soort === 'klant' && (
              <div className="col-span-2">
                <RelatieConditiePicker
                  klantId={c.klant_id}
                  klantNaam={c.klant_naam}
                  onPick={(klant_id, klant_naam) => set(i, { soort: 'klant', op: 'eq', klant_id, klant_naam })}
                />
              </div>
            )}

            {c.soort === 'relatie_type' && (
              <div className="col-span-2 flex gap-1">
                <select value={c.op ?? 'eq'} onChange={e => set(i, { ...c, op: e.target.value as TriggerConditie['op'] })} className={sel} style={{ width: 56 }}>
                  <option value="eq">=</option><option value="neq">≠</option>
                </select>
                <select value={String(c.waarde ?? '')} onChange={e => set(i, { ...c, waarde: e.target.value })} className={sel}>
                  <option value="">— Type —</option>
                  <option value="opdrachtgever">Opdrachtgever</option>
                  <option value="leverancier">Leverancier</option>
                  <option value="onderaannemer">Onderaannemer</option>
                </select>
              </div>
            )}

            {c.soort === 'toggle' && (
              <div className="col-span-2 flex gap-1">
                <select value={c.toggle_sleutel ?? ''} onChange={e => set(i, { ...c, toggle_sleutel: e.target.value })} className={sel}>
                  <option value="">— Toggle —</option>
                  {toggles.map(t => <option key={t.id} value={t.sleutel}>{t.label}</option>)}
                </select>
                <select value={c.aan === false ? 'uit' : 'aan'} onChange={e => set(i, { ...c, aan: e.target.value === 'aan' })} className={sel} style={{ width: 70 }}>
                  <option value="aan">aan</option><option value="uit">uit</option>
                </select>
              </div>
            )}
          </div>
          <button onClick={() => verwijder(i)} className="p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded flex-shrink-0">
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      ))}
      <button onClick={voegToe} className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-700">
        <Plus className="w-3 h-3" /> Conditie toevoegen
      </button>
    </div>
  )
}

// ─── Opdrachtgever-picker (kies uit relaties) ──────────────────────────────────

function RelatieConditiePicker({
  klantId, klantNaam, onPick,
}: {
  klantId?: string
  klantNaam?: string
  onPick: (klantId: string, klantNaam: string) => void
}) {
  // Seed met de huidige keuze zodat de opgeslagen naam meteen zichtbaar is bij heropenen.
  const [options, setOptions] = useState<ComboboxOption[]>(
    klantId ? [{ value: klantId, label: klantNaam ?? 'Gekozen opdrachtgever' }] : [],
  )

  const zoek = useCallback(async (q: string) => {
    if (q.trim().length < 2) return
    try {
      const r = await zoekRelaties(q, { type: 'opdrachtgever' })
      setOptions(r.map(x => ({ value: x.id, label: x.naam })))
    } catch { /* genegeerd */ }
  }, [])

  return (
    <Combobox
      options={options}
      value={klantId}
      onChange={(v) => {
        const opt = options.find(o => o.value === v)
        if (opt) onPick(opt.value, opt.label)
      }}
      placeholder="Kies opdrachtgever…"
      searchPlaceholder="Zoek opdrachtgever…"
      emptyText="Typ om te zoeken…"
      onSearch={zoek}
    />
  )
}
