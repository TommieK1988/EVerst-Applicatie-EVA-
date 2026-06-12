'use client'

import { useState, useEffect, useTransition } from 'react'
import { Plus, Trash2, Zap } from 'lucide-react'
import toast from 'react-hot-toast'
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerBody,
} from '@/components/ui'
import {
  getTriggersVoorSjabloon, upsertTrigger, verwijderTrigger,
  type ActielijstTrigger, type TriggerConditie,
} from '@/app/(platform)/taken/actions/sjablonen'
import { getToggleDefinities, type ToggleDefinitie } from '@/app/(platform)/instellingen/dossier-toggles/actions'
import { getDossierCategorieen } from '@/app/(platform)/instellingen/bedrijfsinstellingen/actions'
import { zoekRelaties, getUniekeBouw7Categorieen } from '@/lib/dossiers/actions'

// ─── Statische keuzelijsten ───────────────────────────────────────────────────

const EVENT_TYPES = [
  { value: 'dossier_status',     label: 'Dossier bereikt status' },
  { value: 'dossier_aangemaakt', label: 'Dossier aangemaakt' },
  { value: 'rol_toegewezen',     label: 'Rol toegewezen' },
  { value: 'veld_waarde',        label: 'Veld krijgt waarde' },
  { value: 'bedrag_drempel',     label: 'Bedrag boven drempel' },
  { value: 'toggle_aan',         label: 'Toggle aangezet' },
]

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
  actief: boolean
}

let keyCounter = 0
const nieuweKey = () => `t${keyCounter++}`

const sel = 'w-full appearance-none border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-400'
const inp = 'w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400'

export default function SjabloonTriggers({ templateId }: { templateId: string }) {
  const [open, setOpen] = useState(false)
  const [refDataGeladen, setRefDataGeladen] = useState(false)
  const [triggers, setTriggers] = useState<DraftTrigger[]>([])
  const [categorieen, setCategorieen] = useState<string[]>([])
  const [bouw7Categorieen, setBouw7Categorieen] = useState<string[]>([])
  const [toggles, setToggles] = useState<ToggleDefinitie[]>([])
  const [, startT] = useTransition()

  // Triggers direct op mount laden zodat de knop het aantal kan tonen.
  useEffect(() => {
    getTriggersVoorSjabloon(templateId).then(rows =>
      setTriggers(rows.map(r => ({
        id: r.id, localKey: nieuweKey(), event_type: r.event_type,
        event_config: r.event_config ?? {}, condities: r.condities ?? [], actief: r.actief,
      }))),
    ).catch(() => {})
  }, [templateId])

  // Referentiedata (categorieën, toggles) lazy bij eerste keer openen.
  useEffect(() => {
    if (!open || refDataGeladen) return
    setRefDataGeladen(true)
    getDossierCategorieen().then(setCategorieen).catch(() => {})
    getUniekeBouw7Categorieen().then(setBouw7Categorieen).catch(() => {})
    getToggleDefinities().then(d => setToggles(d.filter(t => t.actief))).catch(() => {})
  }, [open, refDataGeladen])

  function patch(key: string, change: Partial<DraftTrigger>) {
    setTriggers(prev => prev.map(t => t.localKey === key ? { ...t, ...change } : t))
  }

  function voegToe() {
    setTriggers(prev => [...prev, {
      localKey: nieuweKey(), event_type: 'dossier_status', event_config: {}, condities: [], actief: true,
    }])
  }

  function bewaar(t: DraftTrigger) {
    startT(async () => {
      try {
        const { id } = await upsertTrigger({
          id: t.id, template_id: templateId, event_type: t.event_type,
          event_config: t.event_config, condities: t.condities, actief: t.actief,
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
              Elke trigger activeert dit sjabloon zodra de gebeurtenis plaatsvindt en alle condities kloppen —
              één keer per dossier. Een status-trigger vuurt op de status <em>nadat</em> het dossier die fase
              bereikt; condities worden op dat moment gecheckt.
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
  trigger, categorieen, bouw7Categorieen, toggles, onPatch, onBewaar, onVerwijder,
}: {
  trigger: DraftTrigger
  categorieen: string[]
  bouw7Categorieen: string[]
  toggles: ToggleDefinitie[]
  onPatch: (c: Partial<DraftTrigger>) => void
  onBewaar: () => void
  onVerwijder: () => void
}) {
  const cfg = trigger.event_config
  const setCfg = (c: Record<string, unknown>) => onPatch({ event_config: c })

  return (
    <div className="border border-slate-200 rounded-lg p-3 space-y-3 bg-slate-50/50">
      <div className="flex items-center gap-2">
        <select value={trigger.event_type} onChange={e => onPatch({ event_type: e.target.value, event_config: {} })} className={sel}>
          {EVENT_TYPES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
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

      {/* Condities */}
      <CondititesEditor
        condities={trigger.condities}
        categorieen={categorieen}
        bouw7Categorieen={bouw7Categorieen}
        toggles={toggles}
        onChange={(c) => onPatch({ condities: c })}
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
  condities, categorieen, bouw7Categorieen, toggles, onChange,
}: {
  condities: TriggerConditie[]
  categorieen: string[]
  bouw7Categorieen: string[]
  toggles: ToggleDefinitie[]
  onChange: (c: TriggerConditie[]) => void
}) {
  const [klantZoek, setKlantZoek] = useState('')
  const [klantResultaten, setKlantResultaten] = useState<{ id: string; naam: string }[]>([])

  function set(i: number, c: TriggerConditie) {
    onChange(condities.map((x, idx) => idx === i ? c : x))
  }
  function voegToe() { onChange([...condities, { soort: 'veld', veld: 'categorie', op: 'eq', waarde: '' }]) }
  function verwijder(i: number) { onChange(condities.filter((_, idx) => idx !== i)) }

  async function zoek(q: string) {
    setKlantZoek(q)
    if (q.trim().length < 2) { setKlantResultaten([]); return }
    try { setKlantResultaten(await zoekRelaties(q)) } catch { setKlantResultaten([]) }
  }

  return (
    <div className="border-t border-slate-200 pt-2 space-y-2">
      <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wide">Condities (alle moeten kloppen)</p>
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
                {c.klant_id
                  ? <div className="flex items-center gap-2 text-xs min-w-0">
                      <span className="px-2 py-1 bg-blue-50 text-blue-700 rounded truncate" title={c.klant_naam}>
                        {c.klant_naam ?? 'Gekozen opdrachtgever'}
                      </span>
                      <button onClick={() => set(i, { soort: 'klant', op: 'eq' })} className="text-slate-400 hover:text-red-500 flex-shrink-0">wijzig</button>
                    </div>
                  : <>
                      <input type="text" value={klantZoek} onChange={e => zoek(e.target.value)} placeholder="Zoek opdrachtgever…" className={inp} />
                      {klantResultaten.length > 0 && (
                        <div className="mt-1 border border-slate-200 rounded-lg max-h-32 overflow-auto bg-white">
                          {klantResultaten.map(r => (
                            <button key={r.id} onClick={() => { set(i, { soort: 'klant', op: 'eq', klant_id: r.id, klant_naam: r.naam }); setKlantZoek(''); setKlantResultaten([]) }}
                              className="block w-full text-left px-2 py-1.5 text-xs hover:bg-slate-50">{r.naam}</button>
                          ))}
                        </div>
                      )}
                    </>}
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
