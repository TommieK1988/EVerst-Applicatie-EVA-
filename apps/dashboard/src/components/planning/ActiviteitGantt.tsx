'use client'

import React, { useState, useTransition, useMemo, useRef, useEffect } from 'react'
import {
  format, eachDayOfInterval,
  addMonths, addDays, isToday, isWeekend, parseISO,
  differenceInDays, startOfDay, getISODay, getISOWeek,
} from 'date-fns'
import { nl } from 'date-fns/locale'
import toast from 'react-hot-toast'
import { useRouter } from 'next/navigation'
import type {
  PlanningActiviteit, PlanningItemVerrijkt, Medewerker, PlanningUursoort,
  PlanningFase, PlanningAfhankelijkheid, AfhankelijkheidsType, Uurtarief,
  MedewerkerRooster, MedewerkerAfwezigheid,
} from '@everts/database/platform-types'
import {
  maakPlanningActiviteit, updatePlanningActiviteit,
  maakPlanningItem, verplaatsPlanningItem, verwijderPlanningItem,
  maakPlanningFase, updatePlanningFase, verschuifPlanningFase,
  maakAfhankelijkheid, verwijderAfhankelijkheid,
} from '@/app/(platform)/planning/actions'
import {
  PeriodeNav, PeriodeScrubber, dagOffset, verschuifTs, verschuifDatum, viewBereik,
  usePlanningLayout, buildHeader, buildGridUnits, type View, type HSpan, type HCol, type GridUnit,
} from './layout'
import { useKleurweergave, KleurweergaveToggle, type Kleurweergave } from './KleurweergaveToggle'

// ─── Constants ────────────────────────────────────────────────────────────────

const RIJ_HOOGTE  = 48
const FASE_HOOGTE = 36
const LEFT_W      = 400
const DRAG_MIN_PX = 4

type OA   = { id: string; naam: string }
export type TaakMarker = {
  id: string
  titel: string
  deadline: string
  status: string | null
  prioriteit: string | null
}
type GanttRow =
  | { kind: 'fase'; fase: PlanningFase }
  | { kind: 'activiteit'; activiteit: PlanningActiviteit; nr: number; uitgeklapt: boolean; aantalItems: number }
  | { kind: 'planitem'; activiteit: PlanningActiviteit; medewerker: Medewerker; items: PlanningItemVerrijkt[] }

const PLANITEM_RIJ_HOOGTE = 32

// View-helpers, header-builders en geometry-utilities komen nu uit ./layout
// (zie de layout-laag voor één gedeelde implementatie voor alle drie planningen).

function medKleur(id: string) {
  const hues = [210, 145, 30, 280, 170, 350, 50, 200]
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0xFFFFFF
  return `hsl(${hues[h % hues.length]}, 58%, 44%)`
}

function medNaam(e: PlanningItemVerrijkt) {
  return [e.medewerkers?.voornaam, e.medewerkers?.achternaam].filter(Boolean).join(' ')
}

function berekenWerkuren(
  medewerker_id: string,
  startDt: string,
  eindDt: string,
  roosters: MedewerkerRooster[],
  afwezigheid: MedewerkerAfwezigheid[],
): number {
  const medRoosters = roosters
    .filter(r => r.medewerker_id === medewerker_id)
    .sort((a, b) => b.geldig_vanaf.localeCompare(a.geldig_vanaf))
  const medAfwezig = afwezigheid.filter(a => a.medewerker_id === medewerker_id)
  const start = startOfDay(parseISO(startDt))
  const eind  = startOfDay(parseISO(eindDt))
  if (eind < start) return 0
  const days = eachDayOfInterval({ start, end: eind })
  let total = 0
  for (const dag of days) {
    const dagStr = format(dag, 'yyyy-MM-dd')
    if (medAfwezig.some(a => a.start_datum <= dagStr && a.eind_datum >= dagStr)) continue
    const rooster = medRoosters.find(r =>
      r.geldig_vanaf <= dagStr && (r.geldig_tot === null || r.geldig_tot >= dagStr),
    )
    if (!rooster) continue
    const isoDay = getISODay(dag)
    if (!(rooster.werkdagen as number[]).includes(isoDay)) continue
    const [sh, sm] = (rooster.dagstart as string).split(':').map(Number)
    const [eh, em] = (rooster.dageind as string).split(':').map(Number)
    total += (eh * 60 + em - sh * 60 - sm) / 60
  }
  return Math.round(total * 2) / 2 // afgerond op 0.5u
}

// ─── ItemEditDialog ───────────────────────────────────────────────────────────

function ItemEditDialog({ item, medewerkers, roosters, afwezigheid, onSave, onDelete, onCopy, onSplit, onClose }: {
  item: PlanningItemVerrijkt; medewerkers: Medewerker[]
  roosters: MedewerkerRooster[]; afwezigheid: MedewerkerAfwezigheid[]
  onSave: (p: { medewerker_id: string; start_dt: string; eind_dt: string; uren: number }) => Promise<void>
  onDelete: () => Promise<void>
  onCopy: () => Promise<void>
  onSplit: () => Promise<void>
  onClose: () => void
}) {
  const [medId, setMedId] = useState(item.medewerker_id)
  const [start, setStart] = useState(item.start_dt.slice(0, 10))
  const [eind,  setEind]  = useState(item.eind_dt.slice(0, 10))
  const [uren,  setUren]  = useState(item.uren)
  const [busy,  setBusy]  = useState(false)
  const ts = item.start_dt.slice(11, 19) || '08:00:00'
  const te = item.eind_dt.slice(11, 19)  || '17:00:00'

  useEffect(() => {
    if (!medId || !start || !eind) return
    const berekend = berekenWerkuren(medId, `${start}T08:00:00`, `${eind}T17:00:00`, roosters, afwezigheid)
    if (berekend > 0) setUren(berekend)
  }, [medId, start, eind])

  return (
    <div style={S.backdrop}>
      <div className="eva-card" style={{ padding: '20px 24px', width: 340, maxWidth: '95vw' }}>
        <h3 style={S.dlgTitle}>Planitem bewerken</h3>
        <p style={S.dlgSub}>{medNaam(item)}</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>
            <label style={S.lbl}>Medewerker</label>
            <select className="eva-input" value={medId} onChange={e => setMedId(e.target.value)}>
              {medewerkers.map(m => <option key={m.id} value={m.id}>{[m.voornaam, m.tussenvoegsel, m.achternaam].filter(Boolean).join(' ')}</option>)}
            </select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div><label style={S.lbl}>Start</label><input className="eva-input" type="date" value={start} onChange={e => setStart(e.target.value)} /></div>
            <div><label style={S.lbl}>Eind</label><input className="eva-input" type="date" value={eind} onChange={e => setEind(e.target.value)} /></div>
          </div>
          <div>
            <label style={S.lbl}>Geplande uren</label>
            <div className="eva-input" style={{ background: 'var(--surface-muted,#f5f5f5)', color: 'var(--text-secondary,#666)', cursor: 'default' }}>{uren} uur</div>
            <p style={{ margin: '3px 0 0', fontSize: 11, color: 'var(--text-tertiary,#999)' }}>Berekend op basis van werkrooster</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', marginTop: 16, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="eva-btn-ghost" style={{ color: '#c0392b', fontSize: 13 }} disabled={busy}
              onClick={async () => { setBusy(true); await onDelete(); setBusy(false); onClose() }}>Verwijderen</button>
            <button className="eva-btn-ghost" disabled={busy}
              onClick={async () => { setBusy(true); await onCopy(); setBusy(false); onClose() }}>Kopiëren</button>
            <button className="eva-btn-ghost" disabled={busy}
              onClick={async () => { setBusy(true); await onSplit(); setBusy(false); onClose() }}>Splitsen</button>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="eva-btn-ghost" onClick={onClose}>Annuleren</button>
            <button className="eva-btn-primary" disabled={busy}
              onClick={async () => { setBusy(true); await onSave({ medewerker_id: medId, start_dt: `${start}T${ts}`, eind_dt: `${eind}T${te}`, uren }); setBusy(false); onClose() }}>
              {busy ? '…' : 'Opslaan'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── ToewijzenDialog ──────────────────────────────────────────────────────────

function ToewijzenDialog({ activiteit, medewerkers, dossier_id, roosters, afwezigheid, onClose, onCreated, defaultStart }: {
  activiteit: PlanningActiviteit; medewerkers: Medewerker[]; dossier_id: string
  roosters: MedewerkerRooster[]; afwezigheid: MedewerkerAfwezigheid[]
  onClose: () => void; onCreated: (e: PlanningItemVerrijkt) => void
  defaultStart?: string
}) {
  const today = new Date().toISOString().slice(0, 10)
  const [medId, setMedId] = useState(medewerkers[0]?.id ?? '')
  const [start, setStart] = useState(defaultStart ?? activiteit.gewenste_start ?? today)
  const [eind,  setEind]  = useState(defaultStart ?? activiteit.deadline ?? activiteit.gewenste_start ?? today)
  const [uren,  setUren]  = useState(() => {
    const initMed = medewerkers[0]?.id ?? ''
    const initStart = defaultStart ?? activiteit.gewenste_start ?? today
    const initEind  = defaultStart ?? activiteit.deadline ?? activiteit.gewenste_start ?? today
    if (initMed && roosters.length > 0) {
      const berekend = berekenWerkuren(initMed, `${initStart}T08:00:00`, `${initEind}T17:00:00`, roosters, afwezigheid)
      if (berekend > 0) return String(berekend)
    }
    return String(activiteit.geschatte_uren ?? 8)
  })
  const [busy,  setBusy]  = useState(false)

  function herbereken(newMedId: string, newStart: string, newEind: string) {
    if (!newMedId || roosters.length === 0) return
    const berekend = berekenWerkuren(newMedId, `${newStart}T08:00:00`, `${newEind}T17:00:00`, roosters, afwezigheid)
    if (berekend > 0) setUren(String(berekend))
  }

  async function opslaan() {
    if (!medId) return
    setBusy(true)
    const result = await maakPlanningItem({ activiteit_id: activiteit.id, medewerker_id: medId, start_dt: `${start}T08:00:00`, eind_dt: `${eind}T17:00:00`, uren: parseFloat(uren) || 8, dossier_id, uursoort_id: activiteit.uursoort_id ?? null })
    setBusy(false)
    if (!result.ok) { toast.error(result.error); return }
    onCreated(result.data as PlanningItemVerrijkt)
    onClose()
  }

  return (
    <div style={S.backdrop}>
      <div className="eva-card" style={{ padding: '20px 24px', width: 340, maxWidth: '95vw' }}>
        <h3 style={S.dlgTitle}>Medewerker toewijzen</h3>
        <p style={S.dlgSub}>{activiteit.titel}</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>
            <label style={S.lbl}>Medewerker</label>
            <select className="eva-input" value={medId} onChange={e => { setMedId(e.target.value); herbereken(e.target.value, start, eind) }}>
              {medewerkers.map(m => <option key={m.id} value={m.id}>{[m.voornaam, m.tussenvoegsel, m.achternaam].filter(Boolean).join(' ')}</option>)}
            </select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div><label style={S.lbl}>Start</label><input className="eva-input" type="date" value={start} onChange={e => { setStart(e.target.value); herbereken(medId, e.target.value, eind) }} /></div>
            <div><label style={S.lbl}>Eind</label><input className="eva-input" type="date" value={eind} onChange={e => { setEind(e.target.value); herbereken(medId, start, e.target.value) }} /></div>
          </div>
          <div>
            <label style={S.lbl}>Geplande uren</label>
            <div className="eva-input" style={{ background: 'var(--surface-muted,#f5f5f5)', color: 'var(--text-secondary,#666)', cursor: 'default' }}>{uren} uur</div>
            <p style={{ margin: '3px 0 0', fontSize: 11, color: 'var(--text-tertiary,#999)' }}>Berekend op basis van werkrooster</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
          <button className="eva-btn-ghost" onClick={onClose}>Annuleren</button>
          <button className="eva-btn-primary" onClick={opslaan} disabled={busy || !medId}>{busy ? '…' : 'Toewijzen'}</button>
        </div>
      </div>
    </div>
  )
}

// ─── ActiviteitEditModal ──────────────────────────────────────────────────────

function ActiviteitEditModal({ activiteit, items, uursoorten, onderaannemers, medewerkers, fasen, roosters, afwezigheid, alleActiviteiten, afhankelijkheden, werkbegrotingUursoortIds, dossier_id, uursoortLabel, onSave, onItemCreated, onItemVerwijderd, onAfhankelijkheidChanged, onClose }: {
  activiteit: PlanningActiviteit; items: PlanningItemVerrijkt[]; uursoorten: PlanningUursoort[]
  onderaannemers: OA[]; medewerkers: Medewerker[]; fasen: PlanningFase[]
  roosters: MedewerkerRooster[]; afwezigheid: MedewerkerAfwezigheid[]
  alleActiviteiten: PlanningActiviteit[]; afhankelijkheden: PlanningAfhankelijkheid[]
  werkbegrotingUursoortIds: string[]; dossier_id: string
  uursoortLabel: (u: PlanningUursoort) => string
  onSave: (p: Partial<PlanningActiviteit>) => Promise<void>
  onItemCreated: (e: PlanningItemVerrijkt) => void
  onItemVerwijderd: (id: string) => void
  onAfhankelijkheidChanged: () => void
  onClose: () => void
}) {
  const [titel,        setTitel]        = useState(activiteit.titel)
  const [uursoortId,   setUursoortId]   = useState(activiteit.uursoort_id ?? '')
  const [faseId,       setFaseId]       = useState(activiteit.fase_id ?? '')
  const [oaId,         setOaId]         = useState(activiteit.onderaannemer_id ?? '')
  const [start,        setStart]        = useState(activiteit.gewenste_start ?? '')
  const [deadline,     setDeadline]     = useState(activiteit.deadline ?? '')
  const [uren,         setUren]         = useState(activiteit.geschatte_uren != null ? String(activiteit.geschatte_uren) : '')
  const [omschrijving, setOmschrijving] = useState(activiteit.omschrijving ?? '')
  const [busy,         setBusy]         = useState(false)
  const [toewijzenOpen, setToewijzenOpen] = useState(false)
  const [nieuwVanId,   setNieuwVanId]   = useState('')
  const [nieuwType,    setNieuwType]    = useState<AfhankelijkheidsType>('FS')
  const [nieuwLag,     setNieuwLag]     = useState('0')
  const [savingAfh,    setSavingAfh]    = useState(false)

  const metB = uursoorten.filter(u => werkbegrotingUursoortIds.includes(u.id))
  const zB   = uursoorten.filter(u => !werkbegrotingUursoortIds.includes(u.id))
  const voorgangers = afhankelijkheden.filter(a => a.naar_activiteit_id === activiteit.id)
  const opvolgers   = afhankelijkheden.filter(a => a.van_activiteit_id  === activiteit.id)
  const andereActiviteiten = alleActiviteiten.filter(a => a.id !== activiteit.id)

  async function opslaan() {
    if (!titel.trim()) return
    setBusy(true)
    await onSave({ titel: titel.trim(), uursoort_id: uursoortId || null, fase_id: faseId || null, onderaannemer_id: oaId || null, gewenste_start: start || null, deadline: deadline || null, geschatte_uren: uren ? parseFloat(uren) : null, omschrijving: omschrijving || null })
    setBusy(false); onClose()
  }

  async function addAfh() {
    if (!nieuwVanId) { toast.error('Selecteer een voorganger'); return }
    setSavingAfh(true)
    const result = await maakAfhankelijkheid(nieuwVanId, activiteit.id, nieuwType, parseInt(nieuwLag) || 0)
    setSavingAfh(false)
    if (!result.ok) { toast.error(result.error); return }
    setNieuwVanId('')
    onAfhankelijkheidChanged()
    toast.success('Afhankelijkheid toegevoegd')
  }

  async function delAfh(id: string) {
    const result = await verwijderAfhankelijkheid(id)
    if (!result.ok) { toast.error(result.error); return }
    onAfhankelijkheidChanged()
  }

  async function itemVer(id: string) {
    const result = await verwijderPlanningItem(id)
    if (!result.ok) { toast.error(result.error); return }
    onItemVerwijderd(id)
  }

  const afhBadge = (type: AfhankelijkheidsType) => (
    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700, color: 'var(--accent)', background: 'var(--accent)18', padding: '1px 5px', borderRadius: 3 }}>{type}</span>
  )

  return (
    <div style={S.backdrop}>
      <div className="eva-card" style={{ padding: '24px 28px', width: 560, maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto' }}>
        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, margin: '0 0 18px', color: 'var(--fg)' }}>Activiteit bewerken</h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div><label style={S.lbl}>Naam</label><input className="eva-input" value={titel} onChange={e => setTitel(e.target.value)} autoFocus /></div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={S.lbl}>Uursoort</label>
              <select className="eva-input" value={uursoortId} onChange={e => setUursoortId(e.target.value)}>
                <option value="">— geen —</option>
                {metB.length > 0 && <optgroup label="Werkbegroting">{metB.map(u => <option key={u.id} value={u.id}>{uursoortLabel(u)}</option>)}</optgroup>}
                {zB.length > 0 && <optgroup label="Overig">{zB.map(u => <option key={u.id} value={u.id}>{uursoortLabel(u)}</option>)}</optgroup>}
              </select>
            </div>
            <div>
              <label style={S.lbl}>Fase</label>
              <select className="eva-input" value={faseId} onChange={e => setFaseId(e.target.value)}>
                <option value="">— geen fase —</option>
                {fasen.map(f => <option key={f.id} value={f.id}>{f.naam}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label style={S.lbl}>Onderaannemer</label>
            <select className="eva-input" value={oaId} onChange={e => setOaId(e.target.value)}>
              <option value="">— eigen uitvoering —</option>
              {onderaannemers.map(oa => <option key={oa.id} value={oa.id}>{oa.naam}</option>)}
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <div><label style={S.lbl}>Start</label><input className="eva-input" type="date" value={start} onChange={e => setStart(e.target.value)} /></div>
            <div><label style={S.lbl}>Deadline</label><input className="eva-input" type="date" value={deadline} onChange={e => setDeadline(e.target.value)} /></div>
            <div><label style={S.lbl}>Uren</label><input className="eva-input" type="number" min="0" step="0.5" placeholder="0" value={uren} onChange={e => setUren(e.target.value)} /></div>
          </div>

          <div>
            <label style={S.lbl}>Omschrijving</label>
            <textarea className="eva-input" rows={2} value={omschrijving} onChange={e => setOmschrijving(e.target.value)} style={{ resize: 'vertical', fontFamily: 'var(--font-ui)', fontSize: 13 }} />
          </div>

          {/* Toewijzingen (planitems) */}
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={S.lbl}>Planitems</span>
              <button className="eva-btn-ghost" style={{ fontSize: 12, padding: '3px 10px' }} onClick={() => setToewijzenOpen(true)}>+ Toewijzen</button>
            </div>
            {items.length === 0
              ? <p style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--fg-muted)', margin: 0 }}>Nog geen medewerkers toegewezen.</p>
              : <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {items.map(e => (
                    <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: 'var(--bg)', borderRadius: 6, border: '1px solid var(--border)' }}>
                      <div style={{ width: 10, height: 10, borderRadius: 2, background: medKleur(e.medewerker_id), flexShrink: 0 }} />
                      <span style={{ fontFamily: 'var(--font-ui)', fontSize: 12, flex: 1 }}>{medNaam(e)}</span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-muted)' }}>{e.start_dt.slice(0, 10)} → {e.eind_dt.slice(0, 10)} · {e.uren}u</span>
                      <button style={{ ...S.iconBtn, width: 20, height: 20, fontSize: 11 }} onClick={() => itemVer(e.id)}>×</button>
                    </div>
                  ))}
                </div>
            }
          </div>

          {/* Afhankelijkheden */}
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
            <span style={S.lbl}>Afhankelijkheden</span>

            {voorgangers.length > 0 && (
              <div style={{ marginBottom: 8 }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Voorgangers</span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 4 }}>
                  {voorgangers.map(a => {
                    const va = alleActiviteiten.find(t => t.id === a.van_activiteit_id)
                    return (
                      <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', background: 'var(--bg)', borderRadius: 5, border: '1px solid var(--border)' }}>
                        {afhBadge(a.type)}
                        <span style={{ fontFamily: 'var(--font-ui)', fontSize: 12, flex: 1 }}>{va?.titel ?? '—'}</span>
                        {a.vertraging_dagen > 0 && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-muted)' }}>+{a.vertraging_dagen}d</span>}
                        <button style={{ ...S.iconBtn, width: 18, height: 18, fontSize: 10 }} onClick={() => delAfh(a.id)}>×</button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {opvolgers.length > 0 && (
              <div style={{ marginBottom: 8 }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Opvolgers</span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 4 }}>
                  {opvolgers.map(a => {
                    const na = alleActiviteiten.find(t => t.id === a.naar_activiteit_id)
                    return (
                      <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', background: 'var(--bg)', borderRadius: 5, border: '1px solid var(--border)' }}>
                        {afhBadge(a.type)}
                        <span style={{ fontFamily: 'var(--font-ui)', fontSize: 12, flex: 1 }}>{na?.titel ?? '—'}</span>
                        {a.vertraging_dagen > 0 && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-muted)' }}>+{a.vertraging_dagen}d</span>}
                        <button style={{ ...S.iconBtn, width: 18, height: 18, fontSize: 10 }} onClick={() => delAfh(a.id)}>×</button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Nieuwe voorganger toevoegen */}
            <div style={{ marginTop: 8 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>Voorganger toevoegen</span>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 72px 60px auto', gap: 6, alignItems: 'center' }}>
                <select className="eva-input" style={{ fontSize: 12 }} value={nieuwVanId} onChange={e => setNieuwVanId(e.target.value)}>
                  <option value="">Selecteer activiteit…</option>
                  {andereActiviteiten.map(a => <option key={a.id} value={a.id}>{a.titel}</option>)}
                </select>
                <select className="eva-input" style={{ fontSize: 12 }} value={nieuwType} onChange={e => setNieuwType(e.target.value as AfhankelijkheidsType)}>
                  {(['FS', 'SS', 'FF', 'SF'] as AfhankelijkheidsType[]).map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <input className="eva-input" type="number" min="0" style={{ width: 42, fontSize: 12 }} value={nieuwLag} onChange={e => setNieuwLag(e.target.value)} />
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-muted)' }}>d</span>
                </div>
                <button className="eva-btn-primary" style={{ fontSize: 12, padding: '5px 10px' }} onClick={addAfh} disabled={savingAfh || !nieuwVanId}>{savingAfh ? '…' : '+'}</button>
              </div>
              <p style={{ fontFamily: 'var(--font-ui)', fontSize: 11, color: 'var(--fg-muted)', margin: '4px 0 0' }}>
                FS = einde→start · SS = start→start · FF = einde→einde · SF = start→einde
              </p>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
          <button className="eva-btn-ghost" onClick={onClose}>Annuleren</button>
          <button className="eva-btn-primary" onClick={opslaan} disabled={busy || !titel.trim()}>{busy ? 'Opslaan…' : 'Opslaan'}</button>
        </div>
      </div>

      {toewijzenOpen && (
        <ToewijzenDialog activiteit={activiteit} medewerkers={medewerkers} dossier_id={dossier_id}
          roosters={roosters} afwezigheid={afwezigheid}
          onClose={() => setToewijzenOpen(false)} onCreated={e => { onItemCreated(e); setToewijzenOpen(false) }} />
      )}
    </div>
  )
}

// ─── ActiviteitBalk (draggable achtergrond-balk) ──────────────────────────────

function ActiviteitBalk({ activiteit, vs, ppd, totalDays, accentKleur, isOA, onUpdated, onEdit }: {
  activiteit: PlanningActiviteit; vs: Date; ppd: number; totalDays: number
  accentKleur: string; isOA: boolean
  onUpdated: (p: Partial<PlanningActiviteit>) => void; onEdit: () => void
}) {
  const dragRef = useRef<{ type: 'move' | 'left' | 'right'; startX: number; origStart: string; origDeadline: string } | null>(null)
  const [delta,    setDelta]    = useState(0)
  const [dragType, setDragType] = useState<'move' | 'left' | 'right' | null>(null)

  const effS = activiteit.gewenste_start && dragType ? verschuifDatum(activiteit.gewenste_start, dragType !== 'right' ? delta : 0) : activiteit.gewenste_start
  const effE = activiteit.deadline && dragType ? verschuifDatum(activiteit.deadline, dragType !== 'left' ? delta : 0) : activiteit.deadline

  if (!effS && !effE) return null
  const s = effS ?? effE!
  const e = effE ?? effS!
  const left  = Math.max(0, dagOffset(s, vs)) * ppd
  const right = Math.min(totalDays, dagOffset(e, vs) + 1) * ppd
  const width = Math.max(ppd, right - left)
  if (left >= totalDays * ppd) return null

  function startDrag(ev: React.PointerEvent, type: 'move' | 'left' | 'right') {
    ev.preventDefault(); ev.stopPropagation()
    ;(ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId)
    dragRef.current = { type, startX: ev.clientX, origStart: activiteit.gewenste_start ?? '', origDeadline: activiteit.deadline ?? '' }
    setDragType(type); setDelta(0)
  }
  function onMove(ev: React.PointerEvent) {
    if (!dragRef.current) return
    setDelta(Math.round((ev.clientX - dragRef.current.startX) / ppd))
  }
  async function onUp(ev: React.PointerEvent) {
    if (!dragRef.current) return
    const dx   = ev.clientX - dragRef.current.startX
    const drag = dragRef.current
    dragRef.current = null; setDragType(null); setDelta(0)
    if (Math.abs(dx) < DRAG_MIN_PX) { onEdit(); return }
    const days = Math.round(dx / ppd)
    if (days === 0) return
    const patch: Partial<PlanningActiviteit> = {}
    if (drag.type === 'move') {
      if (drag.origStart)    patch.gewenste_start = verschuifDatum(drag.origStart, days)
      if (drag.origDeadline) patch.deadline       = verschuifDatum(drag.origDeadline, days)
    } else if (drag.type === 'left' && drag.origStart) {
      const ns = verschuifDatum(drag.origStart, days)
      if (drag.origDeadline && ns >= drag.origDeadline) return
      patch.gewenste_start = ns
    } else if (drag.type === 'right' && drag.origDeadline) {
      const nd = verschuifDatum(drag.origDeadline, days)
      if (drag.origStart && nd <= drag.origStart) return
      patch.deadline = nd
    }
    onUpdated(patch)
  }

  const barColor  = isOA ? 'rgba(134,80,196,0.13)' : `${accentKleur}1a`
  const bordColor = isOA ? '#8650c4' : accentKleur
  const hdl: React.CSSProperties = { position: 'absolute', top: 0, bottom: 0, width: 10, cursor: 'ew-resize', zIndex: 4 }

  return (
    <div data-bar="activiteit"
      style={{ position: 'absolute', top: 12, bottom: 12, left, width: Math.min(width, totalDays * ppd - left), borderRadius: 6, background: barColor, border: `2px solid ${bordColor}55`, zIndex: dragType ? 8 : 1, cursor: dragType ? 'grabbing' : 'grab', boxShadow: dragType ? `0 2px 12px ${bordColor}44` : undefined, userSelect: 'none', touchAction: 'none' }}
      onPointerDown={ev => { if (ev.button !== 0) return; startDrag(ev, 'move') }}
      onPointerMove={onMove} onPointerUp={onUp}
    >
      <div style={{ ...hdl, left: 0, borderRadius: '4px 0 0 4px', background: `${bordColor}22` }} onPointerDown={ev => { ev.stopPropagation(); startDrag(ev, 'left') }} onPointerMove={onMove} onPointerUp={onUp} />
      <div style={{ ...hdl, right: 0, borderRadius: '0 4px 4px 0', background: `${bordColor}22` }} onPointerDown={ev => { ev.stopPropagation(); startDrag(ev, 'right') }} onPointerMove={onMove} onPointerUp={onUp} />
    </div>
  )
}

// ─── PlanItemBar (draggable toewijzingsbalk) ──────────────────────────────────

type DragRef = { type: 'move' | 'left' | 'right'; startX: number; origStartDt: string; origEindDt: string; origUren: number; medewerker_id: string; uursoort_id: string | null }

function PlanItemBar({ item, activiteit, vs, ppd, totalDays, dossier_id, medewerkers, roosters, afwezigheid, isDubbel, kleurweergave, medewerkerKleuren, uursoortKleuren, onUpdated, onDeleted, onCreated }: {
  item: PlanningItemVerrijkt; activiteit: PlanningActiviteit
  vs: Date; ppd: number; totalDays: number
  dossier_id: string; medewerkers: Medewerker[]
  roosters: MedewerkerRooster[]; afwezigheid: MedewerkerAfwezigheid[]
  isDubbel: boolean
  kleurweergave: Kleurweergave
  medewerkerKleuren: Record<string, string | null>
  uursoortKleuren: Record<string, string>
  onUpdated: (id: string, p: Partial<PlanningItemVerrijkt>) => void
  onDeleted: (id: string) => void
  onCreated: (e: PlanningItemVerrijkt) => void
}) {
  const dragRef    = useRef<DragRef | null>(null)
  const [delta,    setDelta]    = useState(0)
  const [dragType, setDragType] = useState<'move' | 'left' | 'right' | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [postCopyItem, setPostCopyItem] = useState<PlanningItemVerrijkt | null>(null)

  const effDates = () => {
    const s = item.start_dt, e = item.eind_dt
    if (dragType === 'move')  return { s: verschuifTs(s, delta), e: verschuifTs(e, delta) }
    if (dragType === 'left')  return { s: verschuifTs(s, delta), e }
    if (dragType === 'right') return { s, e: verschuifTs(e, delta) }
    return { s, e }
  }

  const { s: effS, e: effE } = effDates()
  const eLeft  = Math.max(0, dagOffset(effS, vs)) * ppd
  const eDuurD = Math.max(1, differenceInDays(parseISO(effE), parseISO(effS)) + 1)
  const eWidth = Math.min(eDuurD * ppd - 2, totalDays * ppd - eLeft)
  if (eWidth <= 0 || eLeft >= totalDays * ppd) return null

  const uursoortId = (item as any).planning_activiteiten?.uursoort_id as string | undefined
  const kleur = kleurweergave === 'uursoort'
    ? (uursoortId ? (uursoortKleuren[uursoortId] ?? '#4a7c9e') : '#4a7c9e')
    : (medewerkerKleuren[item.medewerker_id] ?? medKleur(item.medewerker_id))
  const naam  = medNaam(item)

  function startDrag(ev: React.PointerEvent, type: DragRef['type']) {
    ev.preventDefault(); ev.stopPropagation()
    ;(ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId)
    dragRef.current = { type, startX: ev.clientX, origStartDt: item.start_dt, origEindDt: item.eind_dt, origUren: item.uren, medewerker_id: item.medewerker_id, uursoort_id: (item as any).planning_activiteiten?.uursoort_id ?? null }
    setDragType(type); setDelta(0)
  }
  function onMove(ev: React.PointerEvent) {
    if (!dragRef.current) return
    setDelta(Math.round((ev.clientX - dragRef.current.startX) / ppd))
  }
  async function onUp(ev: React.PointerEvent) {
    if (!dragRef.current) return
    const dx   = ev.clientX - dragRef.current.startX
    const drag = dragRef.current
    dragRef.current = null; setDragType(null); setDelta(0)
    if (Math.abs(dx) < DRAG_MIN_PX) { setEditOpen(true); return }
    const days = Math.round(dx / ppd)
    if (days === 0) return
    let ns = drag.origStartDt, ne = drag.origEindDt
    if (drag.type === 'move')       { ns = verschuifTs(drag.origStartDt, days); ne = verschuifTs(drag.origEindDt, days) }
    else if (drag.type === 'left')  { ns = verschuifTs(drag.origStartDt, days); if (ns >= ne) return }
    else if (drag.type === 'right') { ne = verschuifTs(drag.origEindDt, days);  if (ne <= ns) return }
    // Clamp: planitem mag niet buiten het datumbereik van de activiteit vallen
    const aMin = activiteit.gewenste_start ? startOfDay(parseISO(activiteit.gewenste_start)).getTime() : null
    const aMax = activiteit.deadline       ? startOfDay(addDays(parseISO(activiteit.deadline), 1)).getTime() - 1 : null
    if (aMin != null && new Date(ns).getTime() < aMin) { toast.error('Planitem valt buiten activiteit-startdatum'); return }
    if (aMax != null && new Date(ne).getTime() > aMax) { toast.error('Planitem valt buiten activiteit-deadline'); return }
    const nieuweUren = roosters.length > 0
      ? berekenWerkuren(drag.medewerker_id, ns, ne, roosters, afwezigheid) || drag.origUren
      : drag.origUren
    onUpdated(item.id, { start_dt: ns, eind_dt: ne, uren: nieuweUren })
    const result = await verplaatsPlanningItem(item.id, { start_dt: ns, eind_dt: ne, medewerker_id: drag.medewerker_id, dossier_id, uursoort_id: drag.uursoort_id, uren: nieuweUren })
    if (!result.ok) { toast.error(result.error); onUpdated(item.id, { start_dt: drag.origStartDt, eind_dt: drag.origEindDt, uren: drag.origUren }) }
  }

  async function handleCopy() {
    const uursoort_id = (item as any).planning_activiteiten?.uursoort_id ?? activiteit.uursoort_id ?? null
    const r = await maakPlanningItem({
      activiteit_id: activiteit.id,
      medewerker_id: item.medewerker_id,
      start_dt: item.start_dt, eind_dt: item.eind_dt, uren: item.uren,
      dossier_id, uursoort_id,
    })
    if (!r.ok) { toast.error(r.error); return }
    const nieuw = { ...(r.data as any), medewerkers: item.medewerkers, planning_activiteiten: (item as any).planning_activiteiten } as PlanningItemVerrijkt
    onCreated(nieuw)
    toast.success('Planitem gekopieerd — kies medewerker')
    setPostCopyItem(nieuw)
  }

  async function handleSplit() {
    const uursoort_id = (item as any).planning_activiteiten?.uursoort_id ?? activiteit.uursoort_id ?? null
    const startMs = new Date(item.start_dt).getTime()
    const eindMs  = new Date(item.eind_dt).getTime()
    const midMs   = Math.round((startMs + eindMs) / 2)
    const midIso  = new Date(midMs).toISOString()
    if (midMs <= startMs || midMs >= eindMs) { toast.error('Te kort om te splitsen'); return }
    const halfUren = Math.round((item.uren / 2) * 100) / 100
    // Eerste helft: bestaande item inkorten
    const r1 = await verplaatsPlanningItem(item.id, {
      start_dt: item.start_dt, eind_dt: midIso,
      medewerker_id: item.medewerker_id, dossier_id, uursoort_id, uren: halfUren,
    })
    if (!r1.ok) { toast.error(r1.error); return }
    onUpdated(item.id, { eind_dt: midIso, uren: halfUren })
    // Tweede helft: nieuw item
    const r2 = await maakPlanningItem({
      activiteit_id: activiteit.id, medewerker_id: item.medewerker_id,
      start_dt: midIso, eind_dt: item.eind_dt, uren: halfUren,
      dossier_id, uursoort_id,
    })
    if (!r2.ok) { toast.error(r2.error); return }
    onCreated({ ...(r2.data as any), medewerkers: item.medewerkers, planning_activiteiten: (item as any).planning_activiteiten } as PlanningItemVerrijkt)
    toast.success('Planitem gesplitst')
  }

  const hdl: React.CSSProperties = { position: 'absolute', top: 0, bottom: 0, width: 8, cursor: 'ew-resize', zIndex: 4, background: 'rgba(255,255,255,0.15)', borderRadius: 2 }

  return (
    <>
      <div data-bar="item"
        title={isDubbel ? 'Medewerker staat ook elders in dezelfde periode ingepland' : undefined}
        style={{ position: 'absolute', top: 10, bottom: 10, left: eLeft, width: eWidth, borderRadius: 5, background: kleur, zIndex: dragType ? 10 : 2, display: 'flex', alignItems: 'center', paddingLeft: 10, overflow: 'hidden', cursor: dragType ? 'grabbing' : 'grab', boxShadow: isDubbel ? `0 0 0 2px #e67e22, ${dragType ? '0 4px 16px rgba(0,0,0,0.3)' : 'none'}` : dragType ? '0 4px 16px rgba(0,0,0,0.3)' : undefined, opacity: dragType ? 0.85 : 1, userSelect: 'none', touchAction: 'none' }}
        onPointerDown={ev => { if (ev.button !== 0) return; startDrag(ev, 'move') }} onPointerMove={onMove} onPointerUp={onUp}
      >
        {isDubbel && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: '#e67e22', borderRadius: '5px 5px 0 0', pointerEvents: 'none' }} />}
        <div style={{ ...hdl, left: 0 }} onPointerDown={ev => { ev.stopPropagation(); startDrag(ev, 'left') }} onPointerMove={onMove} onPointerUp={onUp} />
        {eWidth > 48 && <span style={{ fontFamily: 'var(--font-ui)', fontSize: 11, fontWeight: 600, color: 'white', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: eWidth - 28, zIndex: 1 }}>{naam}</span>}
        <div style={{ ...hdl, right: 0 }} onPointerDown={ev => { ev.stopPropagation(); startDrag(ev, 'right') }} onPointerMove={onMove} onPointerUp={onUp} />
      </div>
      {editOpen && (
        <ItemEditDialog item={item} medewerkers={medewerkers} roosters={roosters} afwezigheid={afwezigheid}
          onSave={async p => { onUpdated(item.id, p); const r = await verplaatsPlanningItem(item.id, { ...p, dossier_id, uursoort_id: (item as any).planning_activiteiten?.uursoort_id ?? null }); if (!r.ok) { toast.error(r.error); onUpdated(item.id, { start_dt: item.start_dt, eind_dt: item.eind_dt }) } }}
          onDelete={async () => { const r = await verwijderPlanningItem(item.id); if (!r.ok) { toast.error(r.error); return }; onDeleted(item.id) }}
          onCopy={handleCopy}
          onSplit={handleSplit}
          onClose={() => setEditOpen(false)} />
      )}
      {postCopyItem && (
        <ItemEditDialog item={postCopyItem} medewerkers={medewerkers} roosters={roosters} afwezigheid={afwezigheid}
          onSave={async p => {
            const med = medewerkers.find(m => m.id === p.medewerker_id)
            const patch: Partial<PlanningItemVerrijkt> = { ...p }
            if (med) (patch as any).medewerkers = { voornaam: med.voornaam, tussenvoegsel: med.tussenvoegsel, achternaam: med.achternaam, functie: med.functie }
            onUpdated(postCopyItem.id, patch)
            const r = await verplaatsPlanningItem(postCopyItem.id, { ...p, dossier_id, uursoort_id: (postCopyItem as any).planning_activiteiten?.uursoort_id ?? null })
            if (!r.ok) toast.error(r.error)
          }}
          onDelete={async () => { const r = await verwijderPlanningItem(postCopyItem.id); if (!r.ok) { toast.error(r.error); return }; onDeleted(postCopyItem.id) }}
          onCopy={async () => { /* no recursive copy-of-copy */ }}
          onSplit={async () => { /* split blijft op origineel */ }}
          onClose={() => setPostCopyItem(null)} />
      )}
    </>
  )
}

// ─── AfhankelijkheidSVG ───────────────────────────────────────────────────────

function AfhankelijkheidSVG({ afhankelijkheden, activiteitMap, activiteitRowY, vs, ppd, totalDays, totalH }: {
  afhankelijkheden: PlanningAfhankelijkheid[]
  activiteitMap: Record<string, PlanningActiviteit>
  activiteitRowY: Record<string, number>
  vs: Date; ppd: number; totalDays: number; totalH: number
}) {
  if (afhankelijkheden.length === 0 || totalH === 0) return null
  const W = totalDays * ppd

  function anchorX(id: string, side: 'start' | 'end'): number | null {
    const a = activiteitMap[id]
    if (!a) return null
    if (side === 'end')   return a.deadline       ? (dagOffset(a.deadline, vs) + 1) * ppd : a.gewenste_start ? dagOffset(a.gewenste_start, vs) * ppd + ppd : null
    if (side === 'start') return a.gewenste_start ? dagOffset(a.gewenste_start, vs) * ppd  : a.deadline ? (dagOffset(a.deadline, vs) + 1) * ppd : null
    return null
  }

  function getAnchors(afh: PlanningAfhankelijkheid): [number, number, number, number] | null {
    const vanSide  = (afh.type === 'SS' || afh.type === 'SF') ? 'start' : 'end'
    const naarSide = (afh.type === 'SF' || afh.type === 'FF') ? 'end'   : 'start'
    const x1 = anchorX(afh.van_activiteit_id,  vanSide)
    const x2 = anchorX(afh.naar_activiteit_id, naarSide)
    const y1 = activiteitRowY[afh.van_activiteit_id]
    const y2 = activiteitRowY[afh.naar_activiteit_id]
    if (x1 == null || x2 == null || y1 == null || y2 == null) return null
    return [x1, y1, x2, y2]
  }

  function arrowPath(x1: number, y1: number, x2: number, y2: number): string {
    const M = 14
    if (Math.abs(y2 - y1) < 2) return `M${x1},${y1} L${x2},${y2}`
    if (x2 >= x1 + M) {
      const xm = x1 + M
      return `M${x1},${y1} L${xm},${y1} L${xm},${y2} L${x2},${y2}`
    }
    const xr = Math.max(x1, x2) + M
    return `M${x1},${y1} L${xr},${y1} L${xr},${y2} L${x2},${y2}`
  }

  return (
    <svg style={{ position: 'absolute', top: 0, left: 0, width: W, height: totalH, pointerEvents: 'none', zIndex: 3, overflow: 'visible' }}>
      <defs>
        <marker id="gantt-arr" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
          <path d="M0,0 L7,3.5 L0,7 Z" fill="rgba(100,100,120,0.75)" />
        </marker>
      </defs>
      {afhankelijkheden.map(afh => {
        const pts = getAnchors(afh)
        if (!pts) return null
        const [x1, y1, x2, y2] = pts
        return (
          <path key={afh.id} d={arrowPath(x1, y1, x2, y2)}
            fill="none" stroke="rgba(100,100,120,0.55)" strokeWidth="1.5"
            strokeDasharray={afh.type !== 'FS' ? '4 3' : undefined}
            markerEnd="url(#gantt-arr)" />
        )
      })}
    </svg>
  )
}

// ─── FaseRij ──────────────────────────────────────────────────────────────────

function FaseRij({ fase, totalW, vs, ppd, totalDays, faseStart, faseEind, onEdit, onNieuweActiviteit, onShift, dragHandleDown, dragHandleMove, dragHandleUp, isDragging, isDropIndicatorAbove }: {
  fase: PlanningFase; totalW: number
  vs: Date; ppd: number; totalDays: number
  faseStart: string | null; faseEind: string | null
  onEdit: () => void; onNieuweActiviteit: () => void
  onShift: (delta: number) => void
  dragHandleDown: (ev: React.PointerEvent) => void
  dragHandleMove: (ev: React.PointerEvent) => void
  dragHandleUp: (ev: React.PointerEvent) => void
  isDragging: boolean
  isDropIndicatorAbove: boolean
}) {
  const dragRef = useRef<{ startX: number } | null>(null)
  const [delta, setDelta] = useState(0)
  const [dragging, setDragging] = useState(false)

  const heeftBereik = !!faseStart && !!faseEind
  const left  = heeftBereik ? Math.max(0, dagOffset(faseStart!, vs)) * ppd : 0
  const right = heeftBereik ? Math.min(totalDays, dagOffset(faseEind!, vs) + 1) * ppd : 0
  const baseWidth = Math.max(ppd, right - left)
  const width = Math.min(baseWidth, totalDays * ppd - left)
  const shiftPx = delta * ppd

  function startDrag(ev: React.PointerEvent) {
    if (ev.button !== 0) return
    ev.preventDefault(); ev.stopPropagation()
    ;(ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId)
    dragRef.current = { startX: ev.clientX }
    setDragging(true); setDelta(0)
  }
  function onMove(ev: React.PointerEvent) {
    if (!dragRef.current) return
    setDelta(Math.round((ev.clientX - dragRef.current.startX) / ppd))
  }
  function onUp(ev: React.PointerEvent) {
    if (!dragRef.current) return
    const dx = ev.clientX - dragRef.current.startX
    const days = Math.round(dx / ppd)
    dragRef.current = null; setDragging(false); setDelta(0)
    if (Math.abs(dx) < DRAG_MIN_PX) return
    if (days !== 0) onShift(days)
  }

  return (
    <>
      {isDropIndicatorAbove && <div style={{ height: 2, background: 'var(--accent)', marginLeft: LEFT_W }} />}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', background: 'var(--bg-active)', minHeight: FASE_HOOGTE, opacity: isDragging ? 0.4 : 1, transition: 'opacity 0.1s' }}>
      <div style={{ width: LEFT_W, flexShrink: 0, position: 'sticky', left: 0, zIndex: 2, background: 'var(--bg-active)', borderRight: '2px solid var(--border)', display: 'flex', alignItems: 'center', padding: '0 10px 0 0', gap: 6 }}>
        <div style={{ width: 20, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'grab', color: 'var(--fg-muted)', fontSize: 14, userSelect: 'none', touchAction: 'none', opacity: 0.45 }}
          onPointerDown={dragHandleDown} onPointerMove={dragHandleMove} onPointerUp={dragHandleUp}
          title="Sleep om te herordenen">⠿</div>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.09em', color: 'var(--fg-muted)', flex: 1, paddingLeft: 24 }}>{fase.naam}</span>
        <button title="Naam wijzigen" onClick={onEdit} style={{ ...S.iconBtn, width: 20, height: 20, fontSize: 11 }}>✎</button>
        <button title="Activiteit toevoegen" onClick={onNieuweActiviteit} style={{ ...S.iconBtn, width: 20, height: 20, fontSize: 14, color: 'var(--accent)' }}>+</button>
      </div>
      <div style={{ position: 'relative', flex: 1, minWidth: totalW, height: FASE_HOOGTE, opacity: 0.85, background: 'repeating-linear-gradient(90deg, transparent 0px, transparent calc(100% - 1px), var(--border) 100%)' }}>
        {heeftBereik && (
          <div data-bar="fase"
            title={`${fase.naam} — sleep om hele fase te verschuiven`}
            style={{ position: 'absolute', top: 8, bottom: 8, left: left + shiftPx, width, borderRadius: 4, background: 'rgba(120,120,140,0.18)', border: '1px dashed rgba(80,80,100,0.6)', cursor: dragging ? 'grabbing' : 'grab', userSelect: 'none', touchAction: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-muted)', zIndex: dragging ? 8 : 1 }}
            onPointerDown={startDrag} onPointerMove={onMove} onPointerUp={onUp}>
            {dragging && delta !== 0 && (
              <span style={{ background: 'var(--bg)', padding: '2px 6px', borderRadius: 3, fontWeight: 700 }}>{delta > 0 ? `+${delta}` : delta}d</span>
            )}
          </div>
        )}
      </div>
    </div>
    </>
  )
}

// ─── PlanitemRij (sub-rij per medewerker, alleen zichtbaar bij uitgeklapt) ────

function PlanitemRij({ activiteit, medewerker, items, gridUnits, vs, ppd, totalDays, dossier_id, medewerkers, roosters, afwezigheid, dubbelGeplandSet, kleurweergave, medewerkerKleuren, uursoortKleuren, onItemUpdated, onItemVerwijderd, onItemCreated }: {
  activiteit: PlanningActiviteit
  medewerker: Medewerker
  items: PlanningItemVerrijkt[]
  gridUnits: GridUnit[]; vs: Date; ppd: number; totalDays: number
  dossier_id: string; medewerkers: Medewerker[]
  roosters: MedewerkerRooster[]; afwezigheid: MedewerkerAfwezigheid[]
  dubbelGeplandSet: Set<string>
  kleurweergave: Kleurweergave
  medewerkerKleuren: Record<string, string | null>
  uursoortKleuren: Record<string, string>
  onItemUpdated: (id: string, p: Partial<PlanningItemVerrijkt>) => void
  onItemVerwijderd: (id: string) => void
  onItemCreated: (e: PlanningItemVerrijkt) => void
}) {
  const totW = totalDays * ppd
  const naam = [medewerker.voornaam, medewerker.tussenvoegsel, medewerker.achternaam].filter(Boolean).join(' ')
  const swatchKleur = medewerkerKleuren[medewerker.id] ?? medKleur(medewerker.id)
  const heeftDubbel = items.some(i => dubbelGeplandSet.has(i.id))

  return (
    <div style={{ display: 'flex', borderBottom: '1px solid var(--border-soft)', background: 'var(--bg)', minHeight: PLANITEM_RIJ_HOOGTE }}>
      <div style={{ width: LEFT_W, flexShrink: 0, position: 'sticky', left: 0, zIndex: 2, background: 'var(--bg)', borderRight: '2px solid var(--border)', display: 'flex', alignItems: 'center', padding: '0 8px 0 70px', gap: 8 }}>
        <div style={{ width: 8, height: 8, borderRadius: 2, background: swatchKleur, flexShrink: 0 }} />
        <span style={{ fontFamily: 'var(--font-ui)', fontSize: 11, color: 'var(--fg-soft)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>{naam}</span>
        {heeftDubbel && <span title="Dubbel ingepland" style={{ fontSize: 12, color: '#e67e22', flexShrink: 0 }}>⚠</span>}
      </div>

      <div style={{ position: 'relative', flex: 1, minWidth: totW, height: PLANITEM_RIJ_HOOGTE }}>
        {gridUnits.map(u => (
          <div key={u.key} style={{
            position: 'absolute', top: 0, bottom: 0, left: u.left, width: u.width,
            background: u.isToday ? 'rgba(31,122,58,0.04)' : u.isWeekend ? 'rgba(0,0,0,0.035)' : 'transparent',
            borderRight:
              u.borderStrength === 'major' ? '1px solid var(--border)'
              : u.borderStrength === 'minor' ? '1px solid var(--border-soft)'
              : 'none',
            boxSizing: 'border-box',
          }} />
        ))}

        {items.map(item => (
          <PlanItemBar key={item.id} item={item} activiteit={activiteit} vs={vs} ppd={ppd} totalDays={totalDays} dossier_id={dossier_id} medewerkers={medewerkers} roosters={roosters} afwezigheid={afwezigheid} isDubbel={dubbelGeplandSet.has(item.id)} kleurweergave={kleurweergave} medewerkerKleuren={medewerkerKleuren} uursoortKleuren={uursoortKleuren} onUpdated={onItemUpdated} onDeleted={onItemVerwijderd} onCreated={onItemCreated} />
        ))}
      </div>
    </div>
  )
}

// ─── ActiviteitGanttRij ───────────────────────────────────────────────────────

function ActiviteitGanttRij({ nr, activiteit, items, uitgeklapt, onToggleUitklap, gridUnits, vs, ppd, totalDays, uursoort, onderaannemer, medewerkers, dossier_id, roosters, afwezigheid, isDragging, isDropIndicatorAbove, dragHandleDown, dragHandleMove, dragHandleUp, onEdit, onActiviteitUpdated, onItemCreated, onItemUpdated, onItemVerwijderd, onTimelineClick }: {
  nr: number; activiteit: PlanningActiviteit; items: PlanningItemVerrijkt[]
  uitgeklapt: boolean; onToggleUitklap: () => void
  gridUnits: GridUnit[]; vs: Date; ppd: number; totalDays: number
  uursoort: PlanningUursoort | undefined; onderaannemer: OA | undefined
  medewerkers: Medewerker[]; dossier_id: string
  roosters: MedewerkerRooster[]; afwezigheid: MedewerkerAfwezigheid[]
  isDragging: boolean; isDropIndicatorAbove: boolean
  dragHandleDown: (ev: React.PointerEvent) => void
  dragHandleMove: (ev: React.PointerEvent) => void
  dragHandleUp: (ev: React.PointerEvent) => void
  onEdit: () => void
  onActiviteitUpdated: (p: Partial<PlanningActiviteit>) => void
  onItemCreated: (e: PlanningItemVerrijkt) => void
  onItemUpdated: (id: string, p: Partial<PlanningItemVerrijkt>) => void
  onItemVerwijderd: (id: string) => void
  onTimelineClick: (clickDate: string, faseId: string | null) => void
}) {
  const [toewijzenOpen, setToewijzenOpen] = useState(false)
  const [paintDrag, setPaintDrag] = useState<{ startX: number; currentX: number } | null>(null)

  const accentKleur = uursoort?.kleur ?? '#4a7c9e'
  const isOA        = !!activiteit.onderaannemer_id
  const totW        = totalDays * ppd
  const heeftDatums = !!activiteit.gewenste_start || !!activiteit.deadline
  const duurDagen   = activiteit.gewenste_start && activiteit.deadline
    ? differenceInDays(parseISO(activiteit.deadline), parseISO(activiteit.gewenste_start)) + 1
    : null

  function handleTimelineClick(e: React.MouseEvent) {
    if (!heeftDatums) return
    if ((e.target as HTMLElement).closest('[data-bar]')) return
    const pxFromLeft = e.clientX - e.currentTarget.getBoundingClientRect().left
    const dayIdx = Math.floor(pxFromLeft / ppd)
    const clickDate = format(addDays(vs, Math.max(0, dayIdx)), 'yyyy-MM-dd')
    onTimelineClick(clickDate, activiteit.fase_id ?? null)
  }

  function handlePaintDown(e: React.PointerEvent) {
    if (e.button !== 0) return
    if (heeftDatums) return
    if ((e.target as HTMLElement).closest('[data-bar]')) return
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    setPaintDrag({ startX: x, currentX: x })
  }
  function handlePaintMove(e: React.PointerEvent) {
    if (!paintDrag) return
    const rect = e.currentTarget.getBoundingClientRect()
    setPaintDrag(p => p ? { ...p, currentX: e.clientX - rect.left } : null)
  }
  function handlePaintUp() {
    if (!paintDrag) return
    const drag = paintDrag
    setPaintDrag(null)
    const aIdx = Math.floor(Math.min(drag.startX, drag.currentX) / ppd)
    const bIdx = Math.floor(Math.max(drag.startX, drag.currentX) / ppd)
    const startIdx = Math.max(0, Math.min(totalDays - 1, aIdx))
    const eindIdx  = Math.max(0, Math.min(totalDays - 1, bIdx))
    const start = format(addDays(vs, startIdx), 'yyyy-MM-dd')
    const eind  = format(addDays(vs, eindIdx),  'yyyy-MM-dd')
    onActiviteitUpdated({ gewenste_start: start, deadline: eind })
  }

  return (
    <>
      {isDropIndicatorAbove && <div style={{ height: 2, background: 'var(--accent)', marginLeft: LEFT_W }} />}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', background: 'var(--bg-elev)', minHeight: RIJ_HOOGTE, opacity: isDragging ? 0.4 : 1, transition: 'opacity 0.1s' }}>

        {/* Sticky linker cel */}
        <div style={{ width: LEFT_W, flexShrink: 0, position: 'sticky', left: 0, zIndex: 2, background: 'var(--bg-elev)', borderRight: '2px solid var(--border)', display: 'flex', alignItems: 'center', padding: '0 8px 0 0' }}>
          <div style={{ width: 20, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'grab', color: 'var(--fg-muted)', fontSize: 14, userSelect: 'none', touchAction: 'none', opacity: 0.45 }}
            onPointerDown={dragHandleDown} onPointerMove={dragHandleMove} onPointerUp={dragHandleUp}
            title="Sleep om te herordenen">⠿</div>
          <div style={{ width: 24, flexShrink: 0, textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-muted)' }}>{nr}</div>
          {items.length > 0 ? (
            <button onClick={onToggleUitklap}
              title={uitgeklapt ? 'Inklappen' : `${items.length} planitem${items.length === 1 ? '' : 's'} tonen`}
              style={{ width: 18, height: 18, flexShrink: 0, marginRight: 4, padding: 0, border: 'none', background: 'transparent', color: 'var(--fg-muted)', cursor: 'pointer', fontSize: 10, lineHeight: 1, display: 'grid', placeItems: 'center' }}>
              {uitgeklapt ? '▼' : '▶'}
            </button>
          ) : (
            <div style={{ width: 18, height: 18, flexShrink: 0, marginRight: 4 }} />
          )}
          <div style={{ width: 4, height: 28, borderRadius: 2, background: accentKleur, flexShrink: 0, marginRight: 10 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 600, color: 'var(--fg)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{activiteit.titel}</span>
              {isOA && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', color: '#8650c4', background: 'rgba(134,80,196,0.08)', padding: '1px 5px', borderRadius: 3, flexShrink: 0 }}>OA</span>}
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-muted)', marginTop: 1 }}>
              {isOA && onderaannemer ? onderaannemer.naam : uursoort?.naam ?? ''}
              {activiteit.geschatte_uren != null ? ` · ${activiteit.geschatte_uren}u geschat` : ''}
              {(() => {
                const geplUren = items.reduce((s, i) => s + (i.uren ?? 0), 0)
                if (geplUren === 0) return null
                return <span style={{ color: geplUren > (activiteit.geschatte_uren ?? Infinity) ? '#e67e22' : 'var(--accent)' }}>
                  {` · ${Math.round(geplUren * 10) / 10}u gepland`}
                </span>
              })()}
            </div>
          </div>
          <div style={{ width: 36, flexShrink: 0, textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-muted)', marginRight: 8 }}>{duurDagen != null ? `${duurDagen}d` : ''}</div>
          <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
            <button title="Bewerken" onClick={onEdit} style={S.iconBtn}>✎</button>
            <button title="Toewijzen" onClick={() => setToewijzenOpen(true)} style={S.iconBtn}>+</button>
          </div>
        </div>

        {/* Gantt-balk area */}
        <div style={{ position: 'relative', flex: 1, minWidth: totW, height: RIJ_HOOGTE, cursor: heeftDatums ? 'crosshair' : 'cell', touchAction: 'none' }}
          onClick={handleTimelineClick}
          onPointerDown={handlePaintDown}
          onPointerMove={handlePaintMove}
          onPointerUp={handlePaintUp}
          onPointerCancel={() => setPaintDrag(null)}>

          {gridUnits.map(u => (
            <div key={u.key} style={{
              position: 'absolute', top: 0, bottom: 0, left: u.left, width: u.width,
              background: u.isToday ? 'rgba(31,122,58,0.06)' : u.isWeekend ? 'rgba(0,0,0,0.055)' : 'transparent',
              borderRight:
                u.borderStrength === 'major' ? '1px solid var(--border)'
                : u.borderStrength === 'minor' ? '1px solid var(--border-soft)'
                : 'none',
              boxSizing: 'border-box',
            }} />
          ))}

          {(() => {
            const off = differenceInDays(startOfDay(new Date()), startOfDay(vs))
            if (off < 0 || off >= totalDays) return null
            return <div style={{ position: 'absolute', top: 0, bottom: 0, left: off * ppd + ppd / 2, width: 2, background: 'var(--accent)', opacity: 0.45, pointerEvents: 'none', zIndex: 1 }} />
          })()}

          {paintDrag && (() => {
            const a = Math.min(paintDrag.startX, paintDrag.currentX)
            const b = Math.max(paintDrag.startX, paintDrag.currentX)
            const aIdx = Math.max(0, Math.floor(a / ppd))
            const bIdx = Math.max(0, Math.floor(b / ppd))
            const left  = aIdx * ppd
            const width = (bIdx - aIdx + 1) * ppd
            return <div style={{ position: 'absolute', top: 12, bottom: 12, left, width, borderRadius: 6, background: `${accentKleur}33`, border: `2px dashed ${accentKleur}`, zIndex: 5, pointerEvents: 'none' }} />
          })()}

          <ActiviteitBalk activiteit={activiteit} vs={vs} ppd={ppd} totalDays={totalDays} accentKleur={accentKleur} isOA={isOA} onUpdated={onActiviteitUpdated} onEdit={onEdit} />
        </div>
      </div>

      {toewijzenOpen && (
        <ToewijzenDialog activiteit={activiteit} medewerkers={medewerkers} dossier_id={dossier_id} roosters={roosters} afwezigheid={afwezigheid}
          onClose={() => setToewijzenOpen(false)} onCreated={e => { onItemCreated(e); setToewijzenOpen(false) }} />
      )}
    </>
  )
}

// ─── Taken-strip (markers op de Gantt) ───────────────────────────────────────

const TAAK_PRIO_KLEUR: Record<string, string> = {
  urgent:  '#dc2626',
  hoog:    '#ea580c',
  normaal: '#ca8a04',
  laag:    '#737373',
}
const TAAK_STATUS_LABEL: Record<string, string> = {
  open: 'Open',
  in_behandeling: 'In behandeling',
  wacht_op: 'Wacht op',
  gereed: 'Gereed',
  vervallen: 'Vervallen',
}

function TakenStrip({ taken, vs, ppd, totalDays, totalW }: {
  taken: TaakMarker[]; vs: Date; ppd: number; totalDays: number; totalW: number
}) {
  const zichtbaar = taken
    .map(t => {
      const off = dagOffset(t.deadline, vs)
      return { taak: t, off, left: off * ppd + ppd / 2 }
    })
    .filter(x => x.off >= 0 && x.off < totalDays)

  if (zichtbaar.length === 0) {
    return (
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
        <div style={{ width: LEFT_W, flexShrink: 0, position: 'sticky', left: 0, zIndex: 5, background: 'var(--bg)', borderRight: '2px solid var(--border)', height: 24, display: 'flex', alignItems: 'center', paddingLeft: 14 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', opacity: 0.5 }}>Taken</span>
        </div>
        <div style={{ flex: 1, minWidth: totalW, height: 24 }} />
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
      <div style={{ width: LEFT_W, flexShrink: 0, position: 'sticky', left: 0, zIndex: 5, background: 'var(--bg)', borderRight: '2px solid var(--border)', height: 24, display: 'flex', alignItems: 'center', paddingLeft: 14 }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
          Taken ({zichtbaar.length})
        </span>
      </div>
      <div style={{ flex: 1, minWidth: totalW, height: 24, position: 'relative' }}>
        {zichtbaar.map(({ taak, left }) => {
          const kleur = TAAK_PRIO_KLEUR[taak.prioriteit ?? 'normaal'] ?? TAAK_PRIO_KLEUR.normaal
          const statusLabel = TAAK_STATUS_LABEL[taak.status ?? 'open'] ?? taak.status ?? ''
          const datumLabel = format(parseISO(taak.deadline), 'd MMM yyyy', { locale: nl })
          const tooltip = `${taak.titel}\n${datumLabel}${statusLabel ? ` · ${statusLabel}` : ''}`
          const isGereed = taak.status === 'gereed'
          return (
            <div key={taak.id}
              title={tooltip}
              style={{
                position: 'absolute', top: '50%', left, transform: 'translate(-50%, -50%)',
                fontSize: 14, lineHeight: 1, color: kleur,
                opacity: isGereed ? 0.4 : 1,
                textShadow: '0 1px 2px rgba(0,0,0,0.15)',
                cursor: 'help', userSelect: 'none',
              }}>
              {isGereed ? '✓' : '★'}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── ActiviteitGantt (hoofd-component) ───────────────────────────────────────

type Props = {
  dossier_id: string
  activiteiten: PlanningActiviteit[]; items: PlanningItemVerrijkt[]
  medewerkers: Medewerker[]; uursoorten: PlanningUursoort[]
  onderaannemers: OA[]; werkbegrotingUursoortIds: string[]
  fasen: PlanningFase[]; afhankelijkheden: PlanningAfhankelijkheid[]
  roosters?: MedewerkerRooster[]
  afwezigheid?: MedewerkerAfwezigheid[]
  uurtarieven?: Uurtarief[]
  taken?: TaakMarker[]
}

export default function ActiviteitGantt({ dossier_id, activiteiten: initA, items: initI, medewerkers, uursoorten, onderaannemers, werkbegrotingUursoortIds, fasen: initF, afhankelijkheden: initAfh, roosters = [], afwezigheid = [], uurtarieven = [], taken = [] }: Props) {
  const router     = useRouter()
  const [, startT] = useTransition()
  const containerRef = useRef<HTMLDivElement>(null)
  const rowsRef      = useRef<HTMLDivElement>(null)

  const [peildatum,  setPeildatum]  = useState(new Date())
  const [view,       setView]       = useState<View>('maand')
  const [viewStart,  setViewStart]  = useState(() => viewBereik('maand', new Date()).vs)

  function handlePeildatum(pd: Date) {
    setPeildatum(pd)
    setViewStart(viewBereik(view, pd).vs)
  }
  function handleView(v: View) {
    setView(v)
    setViewStart(viewBereik(v, peildatum).vs)
  }
  const [activiteiten, setActiviteiten] = useState(initA)
  const [items,        setItems]        = useState(initI)
  const [fasen,        setFasen]        = useState(initF)
  const [afhankelijkheden, setAfhankelijkheden] = useState(initAfh)

  // Sync vanuit server-props na router.refresh()
  useEffect(() => { setActiviteiten(initA) }, [initA])
  useEffect(() => { setItems(initI) }, [initI])
  useEffect(() => { setFasen(initF) }, [initF])
  useEffect(() => { setAfhankelijkheden(initAfh) }, [initAfh])
  const [editActiviteit, setEditActiviteit] = useState<PlanningActiviteit | null>(null)
  const [uitgeklapt, setUitgeklapt] = useState<Set<string>>(new Set())

  const toggleUitklap = (id: string) => setUitgeklapt(prev => {
    const n = new Set(prev)
    if (n.has(id)) n.delete(id); else n.add(id)
    return n
  })

  // Vertical drag — activiteiten
  const [draggingActiviteitId, setDraggingActiviteitId] = useState<string | null>(null)
  const [dropBeforeIdx,        setDropBeforeIdx]        = useState<number | null>(null)

  // Vertical drag — fasen ('END' = drop na alle fasen, anders fase-ID vóór welke gedropped wordt)
  const [draggingFaseId,   setDraggingFaseId]   = useState<string | null>(null)
  const [dropBeforeFaseId, setDropBeforeFaseId] = useState<string>('END')

  // Nieuwe activiteit / fase forms
  const [toonNieuw,     setToonNieuw]     = useState(false)
  const [nieuweNaam,    setNieuweNaam]    = useState('')
  const [nieuweUid,     setNieuweUid]     = useState('')
  const [nieuweFId,     setNieuweFId]     = useState('')
  const [nieuweStart,   setNieuweStart]   = useState('')
  const [savingN,       setSavingN]       = useState(false)
  const [toonNwFase,    setToonNwFase]    = useState(false)
  const [nwFaseNaam,    setNwFaseNaam]    = useState('')
  const [savingF,       setSavingF]       = useState(false)

  // Fit-to-screen via ResizeObserver
  const [availableW, setAvailableW] = useState(800)
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setAvailableW(Math.max(100, entry.contentRect.width - LEFT_W)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // View window — aantal dagen/ppd via layout-engine, maar vs is vrij scrubbaar
  const layout = usePlanningLayout({ peildatum, view, availableW })
  const { totalDays, ppd, totalW } = layout
  const vs       = viewStart
  const ve       = addDays(viewStart, totalDays - 1)
  const { spans, cols } = useMemo(() => buildHeader(view, vs, ve, ppd), [view, vs, ve, ppd])
  const gridUnits       = useMemo(() => buildGridUnits(view, vs, ve, ppd), [view, vs, ve, ppd])

  // Kleurweergave toggle
  const [kleurweergave, setKleurweergave] = useKleurweergave()

  // Lookup maps
  const uursoortMap       = useMemo(() => Object.fromEntries(uursoorten.map(u => [u.id, u])), [uursoorten])
  const oaMap             = useMemo(() => Object.fromEntries(onderaannemers.map(o => [o.id, o])), [onderaannemers])
  const activiteitMap     = useMemo(() => Object.fromEntries(activiteiten.map(a => [a.id, a])), [activiteiten])
  const medewerkerKleuren = useMemo(() => Object.fromEntries(medewerkers.map(m => [m.id, m.kleur])), [medewerkers])
  const uursoortKleuren   = useMemo(() => Object.fromEntries(uursoorten.filter(u => u.kleur).map(u => [u.id, u.kleur])), [uursoorten])
  const itemsPerActiviteit = useMemo(() => {
    const m: Record<string, PlanningItemVerrijkt[]> = {}
    for (const i of items) { if (!m[i.activiteit_id]) m[i.activiteit_id] = []; m[i.activiteit_id].push(i) }
    return m
  }, [items])
  const uursoortOpties = useMemo(() => ({
    metB: uursoorten.filter(u => werkbegrotingUursoortIds.includes(u.id)),
    zB:   uursoorten.filter(u => !werkbegrotingUursoortIds.includes(u.id)),
  }), [uursoorten, werkbegrotingUursoortIds])

  // Tarief-lookup op uursoort-naam (case-insensitive). Tarieven komen uit bedrijfsinstellingen.
  const tariefByLabel = useMemo(() => {
    const m: Record<string, number> = {}
    for (const t of uurtarieven) m[t.label.toLowerCase().trim()] = t.tarief
    return m
  }, [uurtarieven])
  const uursoortLabel = (u: PlanningUursoort) => {
    const tarief = tariefByLabel[u.naam.toLowerCase().trim()]
    return tarief != null ? `${u.naam} — €${tarief}/u` : u.naam
  }

  // Per-medewerker groepering binnen een activiteit (voor uitgeklapte sub-rijen)
  const medewerkerMap = useMemo(() => Object.fromEntries(medewerkers.map(m => [m.id, m])), [medewerkers])

  // Dubbele inplanning detectie
  const dubbelGeplandSet = useMemo(() => {
    const set = new Set<string>()
    const perMed: Record<string, PlanningItemVerrijkt[]> = {}
    for (const i of items) {
      if (!perMed[i.medewerker_id]) perMed[i.medewerker_id] = []
      perMed[i.medewerker_id].push(i)
    }
    for (const its of Object.values(perMed)) {
      for (let a = 0; a < its.length; a++) {
        for (let b = a + 1; b < its.length; b++) {
          if (its[a].start_dt < its[b].eind_dt && its[b].start_dt < its[a].eind_dt) {
            set.add(its[a].id)
            set.add(its[b].id)
          }
        }
      }
    }
    return set
  }, [items])

  // Fase-bereik (min start, max deadline van haar activiteiten)
  const faseBereik = useMemo(() => {
    const m: Record<string, { start: string | null; eind: string | null }> = {}
    for (const f of fasen) m[f.id] = { start: null, eind: null }
    for (const a of activiteiten) {
      if (!a.fase_id || !m[a.fase_id]) continue
      if (a.gewenste_start && (!m[a.fase_id].start || a.gewenste_start < m[a.fase_id].start!)) m[a.fase_id].start = a.gewenste_start
      const eind = a.deadline ?? a.gewenste_start
      if (eind && (!m[a.fase_id].eind || eind > m[a.fase_id].eind!)) m[a.fase_id].eind = eind
    }
    return m
  }, [fasen, activiteiten])

  function buildPlanitemRows(activiteit: PlanningActiviteit): GanttRow[] {
    const itemsVan = itemsPerActiviteit[activiteit.id] ?? []
    const perMed: Record<string, PlanningItemVerrijkt[]> = {}
    for (const it of itemsVan) {
      if (!perMed[it.medewerker_id]) perMed[it.medewerker_id] = []
      perMed[it.medewerker_id].push(it)
    }
    return Object.entries(perMed)
      .map(([medId, its]) => {
        const med = medewerkerMap[medId]
        if (!med) return null
        return { kind: 'planitem' as const, activiteit, medewerker: med, items: its }
      })
      .filter((r): r is Extract<GanttRow, { kind: 'planitem' }> => r !== null)
      .sort((a, b) => [a.medewerker.voornaam, a.medewerker.achternaam].join(' ').localeCompare([b.medewerker.voornaam, b.medewerker.achternaam].join(' ')))
  }

  // Display rows (fase-headers + activiteitrijen + uitgeklapte planitem-rijen)
  const displayRows = useMemo((): GanttRow[] => {
    const sorted  = [...activiteiten].sort((a, b) => a.volgorde - b.volgorde)
    const fSorted = [...fasen].sort((a, b) => a.volgorde - b.volgorde)
    const rows: GanttRow[] = []
    let nr = 0

    const addActiviteit = (a: PlanningActiviteit) => {
      const items = itemsPerActiviteit[a.id] ?? []
      const open  = uitgeklapt.has(a.id)
      rows.push({ kind: 'activiteit', activiteit: a, nr: ++nr, uitgeklapt: open, aantalItems: items.length })
      if (open) rows.push(...buildPlanitemRows(a))
    }

    for (const a of sorted.filter(a => !a.fase_id)) addActiviteit(a)
    for (const f of fSorted) {
      rows.push({ kind: 'fase', fase: f })
      for (const a of sorted.filter(a => a.fase_id === f.id)) addActiviteit(a)
    }
    return rows
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activiteiten, fasen, items, uitgeklapt, medewerkerMap])

  const rowHeight = (r: GanttRow) =>
    r.kind === 'fase'     ? FASE_HOOGTE
    : r.kind === 'planitem' ? PLANITEM_RIJ_HOOGTE
    : RIJ_HOOGTE

  // Y-positions for dependency arrows
  const activiteitRowY = useMemo(() => {
    const m: Record<string, number> = {}
    let y = 0
    for (const row of displayRows) {
      if (row.kind === 'activiteit') m[row.activiteit.id] = y + RIJ_HOOGTE / 2
      y += rowHeight(row)
    }
    return m
  }, [displayRows])
  const totalRowsH = useMemo(() => displayRows.reduce((s, r) => s + rowHeight(r), 0), [displayRows])

  // ── Action handlers ──

  async function handleActiviteitUpdate(id: string, patch: Partial<PlanningActiviteit>) {
    const huidig = activiteiten.find(a => a.id === id)
    let deltaMs = 0
    if (patch.gewenste_start && huidig?.gewenste_start) {
      deltaMs = new Date(patch.gewenste_start).getTime() - new Date(huidig.gewenste_start).getTime()
    }
    const huidigeStart    = huidig?.gewenste_start ?? null
    const huidigeDeadline = huidig?.deadline ?? null
    setActiviteiten(prev => prev.map(a => a.id === id ? { ...a, ...patch } : a))

    // Optimistische cascade: pas client-side items direct aan
    const nieuweStart    = patch.gewenste_start
    const nieuweDeadline = patch.deadline
    const startGew    = nieuweStart    !== undefined && nieuweStart    !== huidigeStart
    const deadlineGew = nieuweDeadline !== undefined && nieuweDeadline !== huidigeDeadline

    if (startGew && deadlineGew && huidigeStart) {
      // Move — shift alle items
      if (deltaMs !== 0) {
        setItems(prev => prev.map(i => {
          if (i.activiteit_id !== id) return i
          const ns = new Date(new Date(i.start_dt).getTime() + deltaMs).toISOString()
          const ne = new Date(new Date(i.eind_dt).getTime()  + deltaMs).toISOString()
          return { ...i, start_dt: ns, eind_dt: ne }
        }))
      }
    } else if (startGew && !deadlineGew && huidigeStart && nieuweStart && nieuweStart > huidigeStart) {
      // Left-resize inkorten — crop items
      const newStartMs = new Date(nieuweStart).getTime()
      setItems(prev => prev.filter(i => {
        if (i.activiteit_id !== id) return true
        return new Date(i.eind_dt).getTime() > newStartMs
      }).map(i => {
        if (i.activiteit_id !== id) return i
        if (new Date(i.start_dt).getTime() < newStartMs)
          return { ...i, start_dt: new Date(newStartMs).toISOString() }
        return i
      }))
    } else if (deadlineGew && !startGew && huidigeDeadline && nieuweDeadline && nieuweDeadline < huidigeDeadline) {
      // Right-resize inkorten — crop items
      const newDeadlineEodMs = new Date(nieuweDeadline + 'T23:59:59').getTime()
      setItems(prev => prev.filter(i => {
        if (i.activiteit_id !== id) return true
        return new Date(i.start_dt).getTime() <= newDeadlineEodMs
      }).map(i => {
        if (i.activiteit_id !== id) return i
        if (new Date(i.eind_dt).getTime() > newDeadlineEodMs)
          return { ...i, eind_dt: new Date(newDeadlineEodMs).toISOString() }
        return i
      }))
    }

    const result = await updatePlanningActiviteit(id, patch as any)
    if (!result.ok) toast.error(result.error)
    else startT(() => router.refresh())
  }

  async function handleNieuweActiviteit(faseId?: string) {
    if (!nieuweNaam.trim()) return
    setSavingN(true)
    const result = await maakPlanningActiviteit({
      dossier_id, titel: nieuweNaam.trim(),
      uursoort_id: nieuweUid || null,
      fase_id: faseId ?? (nieuweFId || null),
      gewenste_start: nieuweStart || null,
      status: 'backlog', volgorde: activiteiten.length + 1,
    })
    setSavingN(false)
    if (!result.ok) { toast.error(result.error); return }
    setActiviteiten(prev => [...prev, result.data])
    setNieuweNaam(''); setNieuweUid(''); setNieuweFId(''); setNieuweStart(''); setToonNieuw(false)
  }

  function handleTimelineClick(clickDate: string, faseId: string | null) {
    setNieuweStart(clickDate)
    setNieuweFId(faseId ?? '')
    setToonNieuw(true)
  }

  async function handleNieuweFase() {
    if (!nwFaseNaam.trim()) return
    setSavingF(true)
    const result = await maakPlanningFase(dossier_id, nwFaseNaam.trim())
    setSavingF(false)
    if (!result.ok) { toast.error(result.error); return }
    setFasen(prev => [...prev, result.data])
    setNwFaseNaam(''); setToonNwFase(false)
    toast.success('Fase aangemaakt')
  }

  async function handleFaseShift(faseId: string, deltaDagen: number) {
    if (deltaDagen === 0) return
    const deltaMs = deltaDagen * 24 * 60 * 60 * 1000
    setActiviteiten(prev => prev.map(a => {
      if (a.fase_id !== faseId) return a
      const patch: Partial<PlanningActiviteit> = {}
      if (a.gewenste_start) patch.gewenste_start = format(addDays(parseISO(a.gewenste_start), deltaDagen), 'yyyy-MM-dd')
      if (a.deadline)       patch.deadline       = format(addDays(parseISO(a.deadline),       deltaDagen), 'yyyy-MM-dd')
      return { ...a, ...patch }
    }))
    setItems(prev => prev.map(i => {
      const a = activiteiten.find(x => x.id === i.activiteit_id)
      if (!a || a.fase_id !== faseId) return i
      const ns = new Date(new Date(i.start_dt).getTime() + deltaMs).toISOString()
      const ne = new Date(new Date(i.eind_dt).getTime()  + deltaMs).toISOString()
      return { ...i, start_dt: ns, eind_dt: ne }
    }))
    const result = await verschuifPlanningFase(faseId, deltaDagen)
    if (!result.ok) toast.error(result.error)
    else startT(() => router.refresh())
  }

  function handleItemUpdated(id: string, patch: Partial<PlanningItemVerrijkt>) {
    setItems(prev => prev.map(i => i.id === id ? { ...i, ...patch } : i))
    startT(() => router.refresh())
  }
  function handleItemVerwijderd(id: string) {
    setItems(prev => prev.filter(i => i.id !== id))
    startT(() => router.refresh())
  }

  // ── Vertical drag ──

  function calcDropIdx(clientY: number): number {
    if (!rowsRef.current) return displayRows.length
    const rect = rowsRef.current.getBoundingClientRect()
    let relY = clientY - rect.top, y = 0
    for (let i = 0; i < displayRows.length; i++) {
      const h = rowHeight(displayRows[i])
      if (relY < y + h / 2) return i
      y += h
    }
    return displayRows.length
  }

  function onDragHandleDown(ev: React.PointerEvent, activiteitId: string) {
    ev.preventDefault(); ev.stopPropagation()
    ;(ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId)
    setDraggingActiviteitId(activiteitId)
    setDropBeforeIdx(calcDropIdx(ev.clientY))
  }
  function onDragHandleMove(ev: React.PointerEvent) {
    if (!draggingActiviteitId) return
    setDropBeforeIdx(calcDropIdx(ev.clientY))
  }
  async function onDragHandleUp(ev: React.PointerEvent) {
    const id = draggingActiviteitId
    const idx = calcDropIdx(ev.clientY)
    setDraggingActiviteitId(null); setDropBeforeIdx(null)
    if (id) await handleReorder(id, idx)
  }

  async function handleReorder(activiteitId: string, dropIdx: number) {
    const actRows = displayRows.filter(r => r.kind === 'activiteit') as Array<{ kind: 'activiteit'; activiteit: PlanningActiviteit; nr: number }>
    const srcIdx = actRows.findIndex(r => r.activiteit.id === activiteitId)
    if (srcIdx < 0) return

    let targetFaseId: string | null = null
    let insertBeforeActIdx = 0
    for (let i = 0; i < dropIdx && i < displayRows.length; i++) {
      const row = displayRows[i]
      if (row.kind === 'fase') targetFaseId = row.fase.id
      else insertBeforeActIdx++
    }

    const newOrder = actRows.map(r => ({ ...r.activiteit }))
    const [moved] = newOrder.splice(srcIdx, 1)
    moved.fase_id = targetFaseId
    const adj = srcIdx < insertBeforeActIdx ? Math.max(0, insertBeforeActIdx - 1) : insertBeforeActIdx
    newOrder.splice(adj, 0, moved)

    const updates = newOrder.map((a, i) => ({ id: a.id, volgorde: i + 1, fase_id: a.fase_id }))
    setActiviteiten(prev => prev.map(a => { const u = updates.find(u => u.id === a.id); return u ? { ...a, volgorde: u.volgorde, fase_id: u.fase_id } : a }))

    await Promise.all(
      updates
        .filter(u => { const orig = activiteiten.find(a => a.id === u.id); return orig && (orig.volgorde !== u.volgorde || orig.fase_id !== u.fase_id) })
        .map(u => updatePlanningActiviteit(u.id, { volgorde: u.volgorde, fase_id: u.fase_id } as any))
    )
    startT(() => router.refresh())
  }

  // ── Fase vertical drag ──

  function calcFaseDropTarget(clientY: number): string | 'END' {
    if (!rowsRef.current) return 'END'
    const rect = rowsRef.current.getBoundingClientRect()
    const relY = clientY - rect.top
    let y = 0
    for (const row of displayRows) {
      const h = rowHeight(row)
      if (row.kind === 'fase' && relY < y + h / 2) return row.fase.id
      y += h
    }
    return 'END'
  }

  function onFaseDragHandleDown(ev: React.PointerEvent, faseId: string) {
    ev.preventDefault(); ev.stopPropagation()
    ;(ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId)
    setDraggingFaseId(faseId)
    setDropBeforeFaseId(calcFaseDropTarget(ev.clientY))
  }
  function onFaseDragHandleMove(ev: React.PointerEvent) {
    if (!draggingFaseId) return
    setDropBeforeFaseId(calcFaseDropTarget(ev.clientY))
  }
  async function onFaseDragHandleUp(ev: React.PointerEvent) {
    const id = draggingFaseId
    const target = calcFaseDropTarget(ev.clientY)
    setDraggingFaseId(null); setDropBeforeFaseId('END')
    if (id != null) await handleFaseReorder(id, target)
  }

  async function handleFaseReorder(faseId: string, beforeId: string | 'END') {
    const sorted = [...fasen].sort((a, b) => (a.volgorde ?? 0) - (b.volgorde ?? 0))
    const srcIdx = sorted.findIndex(f => f.id === faseId)
    if (srcIdx < 0) return

    const newOrder = sorted.filter(f => f.id !== faseId)
    const insertIdx = beforeId === 'END' ? newOrder.length : newOrder.findIndex(f => f.id === beforeId)
    newOrder.splice(insertIdx < 0 ? newOrder.length : insertIdx, 0, sorted[srcIdx])

    const updates = newOrder.map((f, i) => ({ id: f.id, volgorde: i + 1 }))
    setFasen(prev => prev.map(f => { const u = updates.find(u => u.id === f.id); return u ? { ...f, volgorde: u.volgorde } : f }))

    await Promise.all(
      updates
        .filter(u => { const orig = fasen.find(f => f.id === u.id); return orig && orig.volgorde !== u.volgorde })
        .map(u => updatePlanningFase(u.id, { volgorde: u.volgorde }))
    )
    startT(() => router.refresh())
  }

  return (
    <>
      <PeriodeNav
        peildatum={peildatum}
        view={view}
        onPeildatum={handlePeildatum}
        onView={handleView}
        rightSlot={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <KleurweergaveToggle waarde={kleurweergave} onChange={setKleurweergave} />
            <button className="eva-btn-primary" style={{ fontSize: 12, padding: '5px 14px' }} onClick={() => { setNieuweStart(''); setToonNieuw(true) }}>+ Nieuwe activiteit</button>
            <button className="eva-btn-ghost"   style={{ fontSize: 12, padding: '5px 12px' }} onClick={() => setToonNwFase(true)}>+ Fase</button>
          </div>
        }
      />

      <PeriodeScrubber view={view} peildatum={peildatum} vs={viewStart} onChange={setViewStart} />

      {/* Nieuwe fase */}
      {toonNwFase && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 8, padding: '8px 12px', background: 'var(--bg-elev)', borderRadius: 8, border: '1px solid var(--border)', alignItems: 'center' }}>
          <input className="eva-input" autoFocus placeholder="Naam van de fase" value={nwFaseNaam} onChange={e => setNwFaseNaam(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleNieuweFase(); if (e.key === 'Escape') setToonNwFase(false) }} style={{ flex: 1, fontSize: 13 }} />
          <button className="eva-btn-primary" style={{ fontSize: 13 }} onClick={handleNieuweFase} disabled={savingF || !nwFaseNaam.trim()}>{savingF ? '…' : 'Aanmaken'}</button>
          <button className="eva-btn-ghost" style={{ fontSize: 13 }} onClick={() => setToonNwFase(false)}>✕</button>
        </div>
      )}

      {/* ── Gantt ── */}
      <div ref={containerRef} style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ display: 'flex', background: 'var(--bg-elev)', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, zIndex: 10 }}>
          <div style={{ width: LEFT_W, flexShrink: 0, position: 'sticky', left: 0, zIndex: 5, background: 'var(--bg-elev)', borderRight: '2px solid var(--border)' }}>
            <div style={{ height: 24, display: 'flex', alignItems: 'center', paddingLeft: 54, borderBottom: '1px solid var(--border)' }}>
              <span style={S.colHdr}>Activiteit</span>
            </div>
            <div style={{ height: 28, display: 'flex', alignItems: 'center', paddingLeft: 54 }}>
              <span style={{ ...S.colHdr, opacity: 0.5 }}>Duur</span>
            </div>
          </div>

          <div style={{ flex: 1, minWidth: totalW, overflow: 'hidden' }}>
            {/* Spans rij */}
            <div style={{ position: 'relative', height: 24, borderBottom: '1px solid var(--border)' }}>
              {spans.map(sp => (
                <div key={sp.key} style={{ position: 'absolute', top: 0, bottom: 0, left: sp.left, width: sp.width, padding: '4px 8px', fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', borderRight: '1px solid var(--border)', overflow: 'hidden', whiteSpace: 'nowrap', boxSizing: 'border-box' }}>
                  {sp.label}
                </div>
              ))}
            </div>
            {/* Cols rij */}
            <div style={{ position: 'relative', height: 28 }}>
              {cols.map(col => (
                <div key={col.key} style={{ position: 'absolute', top: 0, bottom: 0, left: col.left, width: col.width, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-mono)', color: col.isToday ? 'var(--accent)' : col.isWeekend ? 'var(--fg-muted)' : 'var(--fg-soft)', fontWeight: col.isToday ? 700 : 400, background: col.isToday ? 'rgba(31,122,58,0.08)' : col.isWeekend ? 'rgba(0,0,0,0.04)' : 'transparent', borderRight: '1px solid var(--border)', borderLeft: col.isBorder ? '1px solid var(--border)' : 'none', boxSizing: 'border-box', overflow: 'hidden' }}>
                  {col.subLabel && <span style={{ fontSize: 7, opacity: 0.6, lineHeight: 1 }}>{col.subLabel}</span>}
                  <span style={{ fontSize: 11, fontWeight: col.isToday ? 700 : 500 }}>{col.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Taken-strip */}
        {taken.length > 0 && <TakenStrip taken={taken} vs={vs} ppd={ppd} totalDays={totalDays} totalW={totalW} />}

        {/* Rijen */}
        <div ref={rowsRef} style={{ position: 'relative' }}>
          {displayRows.length === 0 && !toonNieuw ? (
            <div style={{ padding: 36, textAlign: 'center', color: 'var(--fg-muted)', fontFamily: 'var(--font-ui)', fontSize: 14, background: 'var(--bg-elev)' }}>
              Nog geen activiteiten. Klik op &ldquo;+ Nieuwe activiteit&rdquo; om te beginnen.
            </div>
          ) : displayRows.map((row, di) => {
            if (row.kind === 'fase') {
              return (
                <React.Fragment key={row.fase.id}>
                  {dropBeforeIdx === di && <div style={{ height: 2, background: 'var(--accent)', marginLeft: LEFT_W }} />}
                  <FaseRij fase={row.fase} totalW={totalW}
                    vs={vs} ppd={ppd} totalDays={totalDays}
                    faseStart={faseBereik[row.fase.id]?.start ?? null}
                    faseEind={faseBereik[row.fase.id]?.eind ?? null}
                    onEdit={async () => {
                      const naam = window.prompt('Naam van de fase:', row.fase.naam)
                      if (naam && naam.trim() && naam.trim() !== row.fase.naam) {
                        const r = await updatePlanningFase(row.fase.id, { naam: naam.trim() })
                        if (!r.ok) toast.error(r.error)
                        else { setFasen(prev => prev.map(f => f.id === row.fase.id ? { ...f, naam: naam.trim() } : f)); startT(() => router.refresh()) }
                      }
                    }}
                    onNieuweActiviteit={() => { setNieuweFId(row.fase.id); setNieuweStart(''); setToonNieuw(true) }}
                    onShift={(d) => handleFaseShift(row.fase.id, d)}
                    isDragging={draggingFaseId === row.fase.id}
                    isDropIndicatorAbove={dropBeforeFaseId === row.fase.id && draggingFaseId !== null && draggingFaseId !== row.fase.id}
                    dragHandleDown={ev => onFaseDragHandleDown(ev, row.fase.id)}
                    dragHandleMove={onFaseDragHandleMove}
                    dragHandleUp={onFaseDragHandleUp}
                  />
                </React.Fragment>
              )
            }
            if (row.kind === 'planitem') {
              return (
                <PlanitemRij key={`pi-${row.activiteit.id}-${row.medewerker.id}`}
                  activiteit={row.activiteit}
                  medewerker={row.medewerker}
                  items={row.items}
                  gridUnits={gridUnits} vs={vs} ppd={ppd} totalDays={totalDays}
                  dossier_id={dossier_id} medewerkers={medewerkers}
                  roosters={roosters} afwezigheid={afwezigheid}
                  dubbelGeplandSet={dubbelGeplandSet}
                  kleurweergave={kleurweergave}
                  medewerkerKleuren={medewerkerKleuren}
                  uursoortKleuren={uursoortKleuren}
                  onItemUpdated={handleItemUpdated}
                  onItemVerwijderd={handleItemVerwijderd}
                  onItemCreated={e => setItems(prev => [...prev, e])}
                />
              )
            }
            return (
              <ActiviteitGanttRij key={row.activiteit.id}
                nr={row.nr} activiteit={row.activiteit}
                items={itemsPerActiviteit[row.activiteit.id] ?? []}
                uitgeklapt={row.uitgeklapt}
                onToggleUitklap={() => toggleUitklap(row.activiteit.id)}
                gridUnits={gridUnits} vs={vs} ppd={ppd} totalDays={totalDays}
                uursoort={uursoortMap[row.activiteit.uursoort_id ?? '']}
                onderaannemer={oaMap[row.activiteit.onderaannemer_id ?? '']}
                medewerkers={medewerkers} dossier_id={dossier_id}
                roosters={roosters} afwezigheid={afwezigheid}
                isDragging={draggingActiviteitId === row.activiteit.id}
                isDropIndicatorAbove={dropBeforeIdx === di}
                dragHandleDown={ev => onDragHandleDown(ev, row.activiteit.id)}
                dragHandleMove={onDragHandleMove}
                dragHandleUp={onDragHandleUp}
                onEdit={() => setEditActiviteit(row.activiteit)}
                onActiviteitUpdated={patch => handleActiviteitUpdate(row.activiteit.id, patch)}
                onItemCreated={e => setItems(prev => [...prev, e])}
                onItemUpdated={handleItemUpdated}
                onItemVerwijderd={handleItemVerwijderd}
                onTimelineClick={handleTimelineClick}
              />
            )
          })}
          {dropBeforeIdx === displayRows.length && <div style={{ height: 2, background: 'var(--accent)', marginLeft: LEFT_W }} />}

          {/* SVG afhankelijkheids-pijlen */}
          <AfhankelijkheidSVG afhankelijkheden={afhankelijkheden} activiteitMap={activiteitMap} activiteitRowY={activiteitRowY} vs={vs} ppd={ppd} totalDays={totalDays} totalH={totalRowsH} />

          {/* Nieuwe activiteit inline */}
          {toonNieuw && (
            <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', background: 'var(--bg-elev)', padding: '8px 12px', gap: 8, alignItems: 'center', position: 'sticky', left: 0, flexWrap: 'wrap' }}>
              <div style={{ width: 44, flexShrink: 0 }} />
              <input className="eva-input" autoFocus placeholder="Naam activiteit" value={nieuweNaam} onChange={e => setNieuweNaam(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleNieuweActiviteit(nieuweFId || undefined); if (e.key === 'Escape') { setToonNieuw(false); setNieuweFId(''); setNieuweStart('') } }} style={{ flex: 1, minWidth: 180, fontSize: 13 }} />
              <input className="eva-input" type="date" value={nieuweStart} onChange={e => setNieuweStart(e.target.value)} title="Gewenste start" style={{ width: 140, fontSize: 13 }} />
              <select className="eva-input" value={nieuweUid} onChange={e => setNieuweUid(e.target.value)} style={{ width: 160, fontSize: 13 }}>
                <option value="">— uursoort —</option>
                {uursoortOpties.metB.length > 0 && <optgroup label="Werkbegroting">{uursoortOpties.metB.map(u => <option key={u.id} value={u.id}>{uursoortLabel(u)}</option>)}</optgroup>}
                {uursoortOpties.zB.length > 0 && <optgroup label="Overig">{uursoortOpties.zB.map(u => <option key={u.id} value={u.id}>{uursoortLabel(u)}</option>)}</optgroup>}
              </select>
              {fasen.length > 0 && (
                <select className="eva-input" value={nieuweFId} onChange={e => setNieuweFId(e.target.value)} style={{ width: 140, fontSize: 13 }}>
                  <option value="">— geen fase —</option>
                  {fasen.map(f => <option key={f.id} value={f.id}>{f.naam}</option>)}
                </select>
              )}
              <button className="eva-btn-primary" style={{ fontSize: 13 }} onClick={() => handleNieuweActiviteit(nieuweFId || undefined)} disabled={savingN || !nieuweNaam.trim()}>{savingN ? '…' : 'Opslaan'}</button>
              <button className="eva-btn-ghost" style={{ fontSize: 13 }} onClick={() => { setToonNieuw(false); setNieuweFId(''); setNieuweStart('') }}>✕</button>
            </div>
          )}
        </div>
      </div>

      {/* Legenda */}
      {items.length > 0 && (
        <div style={{ marginTop: 10, display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
          {medewerkers.filter(m => items.some(i => i.medewerker_id === m.id)).map(m => (
            <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 12, height: 12, borderRadius: 2, background: medKleur(m.id), flexShrink: 0 }} />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-muted)' }}>{[m.voornaam, m.achternaam].filter(Boolean).join(' ')}</span>
            </div>
          ))}
        </div>
      )}

      {/* Edit modal */}
      {editActiviteit && (
        <ActiviteitEditModal
          activiteit={editActiviteit}
          items={itemsPerActiviteit[editActiviteit.id] ?? []}
          uursoorten={uursoorten} onderaannemers={onderaannemers}
          medewerkers={medewerkers} fasen={fasen}
          roosters={roosters} afwezigheid={afwezigheid}
          alleActiviteiten={activiteiten}
          afhankelijkheden={afhankelijkheden.filter(a => a.van_activiteit_id === editActiviteit.id || a.naar_activiteit_id === editActiviteit.id)}
          werkbegrotingUursoortIds={werkbegrotingUursoortIds}
          dossier_id={dossier_id}
          uursoortLabel={uursoortLabel}
          onSave={patch => handleActiviteitUpdate(editActiviteit.id, patch)}
          onItemCreated={e => setItems(prev => [...prev, e])}
          onItemVerwijderd={handleItemVerwijderd}
          onAfhankelijkheidChanged={() => {
            setAfhankelijkheden([])
            startT(() => router.refresh())
          }}
          onClose={() => setEditActiviteit(null)}
        />
      )}
    </>
  )
}

// ─── Stijlen ──────────────────────────────────────────────────────────────────

const S = {
  backdrop: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 } as React.CSSProperties,
  lbl: { fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 4 } as React.CSSProperties,
  colHdr: { fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.07em' } as React.CSSProperties,
  iconBtn: { width: 26, height: 26, border: '1px solid var(--border)', borderRadius: 4, background: 'transparent', color: 'var(--fg-muted)', fontSize: 13, cursor: 'pointer', display: 'grid', placeItems: 'center', flexShrink: 0 } as React.CSSProperties,
  dlgTitle: { fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700, margin: '0 0 4px', color: 'var(--fg)' } as React.CSSProperties,
  dlgSub: { fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--fg-muted)', margin: '0 0 14px' } as React.CSSProperties,
}
