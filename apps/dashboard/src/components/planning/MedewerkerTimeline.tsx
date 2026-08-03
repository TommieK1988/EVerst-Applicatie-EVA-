'use client'

import {
  DndContext, DragEndEvent, DragOverlay, PointerSensor,
  useDraggable, useDroppable, useSensor, useSensors,
} from '@dnd-kit/core'
import {
  addDays, addMinutes, differenceInCalendarDays, differenceInMinutes,
  eachDayOfInterval, format, isWeekend, parseISO, startOfDay,
} from 'date-fns'
import { nl } from 'date-fns/locale'
import { AlertTriangle, Copy, Trash2, X } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import toast from 'react-hot-toast'

import type {
  Medewerker, MedewerkerAfwezigheid, MedewerkerAfwezigheidType, MedewerkerRooster,
  PlanningItemVerrijkt, PlanningUursoort,
  BedrijfsagendaItemMetDoelgroep, BedrijfsagendaType, BedrijfsagendaVirtueel,
} from '@everts/database/platform-types'
import { bedrijfsagendaTypeKleur, medewerkerAfwezigheidLabels } from '@everts/database/platform-types'
import {
  kopieerPlanningItem, maakSnelPlanningItem, verplaatsPlanningItem, verwijderPlanningItem,
} from '@/app/(platform)/planning/actions'
import { resolveBewakingscodes, type BewakingscodeRef } from '@/app/(platform)/everts-calc/actions/werkbegroting'
import {
  KLEUR, MIN_BAR_W, PeriodeNav, PeriodeScrubber, PlanningShell, RIJ_HOOGTE,
  usePlanningController, verschuifTs, type PlanningLayout,
} from './layout/index'
import { crewKleur } from '@/lib/utils/crew'
import VerlofModal from './VerlofModal'
import { useDialogen } from '@/components/ui'
import ConflictOplosDialog from './ConflictOplosDialog'
import {
  DAG_MS, afwezigheidInterval, berekenConflicten, buitenRooster,
  type BlokInterval, type ConflictDetail, type EntryMetDossier, type WerkInterval,
} from './conflict'

// ─── Constants ────────────────────────────────────────────────────────────────

const ITEM_H  = 28
const ROW_PAD = 6
/** Vaste rijhoogte — taken worden niet meer gestapeld in lanes (één strook). */
const RIJ_VAST = ROW_PAD * 2 + ITEM_H

const CREW_KLEUREN = ['#7c3aed', '#0f9b8e', '#2f9e44', '#1f8a5b', '#f59e0b', '#3b82f6']

const AFWEZIGHEID_KLEUR: Record<MedewerkerAfwezigheidType, string> = {
  verlof:   '#f87171',
  ziek:     '#dc2626',
  training: '#10b981',
  overig:   '#6b7280',
}

/** Dag-achtergrond per afwezigheidstype. Verlof = duidelijk licht rood — bewust een
 *  lichte achtergrond-tint zodat het niet verward wordt met verzadigde (rode) PL-balkkleuren. */
const AFWEZIGHEID_BG: Record<MedewerkerAfwezigheidType, string> = {
  verlof:   'rgba(248,113,113,0.32)',
  ziek:     'rgba(220,38,38,0.16)',
  training: 'rgba(16,185,129,0.12)',
  overig:   'rgba(107,114,128,0.12)',
}

const dialogLabelStyle: React.CSSProperties = {
  fontSize: 10, fontWeight: 700,
  color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.08em',
  display: 'block', marginBottom: 4,
}

type SortKey = 'voornaam' | 'afdeling' | 'functie' | 'ploeg'
const SORT_OPTIES: { key: SortKey; label: string }[] = [
  { key: 'voornaam', label: 'Voornaam' },
  { key: 'afdeling', label: 'Afdeling' },
  { key: 'functie',  label: 'Functie' },
  { key: 'ploeg',    label: 'Ploeg' },
]

// ─── Pure helpers ─────────────────────────────────────────────────────────────

function parseTime(timeStr: string): number {
  const [h, m] = timeStr.split(':').map(Number)
  return h * 60 + (m || 0)
}

function dossierKleur(dossier_id: string): string {
  const hues = [210, 145, 30, 280, 170, 350, 50, 200, 260, 100]
  let hash = 0
  for (let i = 0; i < dossier_id.length; i++) hash = (hash * 31 + dossier_id.charCodeAt(i)) & 0xFFFFFF
  return `hsl(${hues[hash % hues.length]}, 55%, 42%)`
}

function medKleur(id: string): string {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0xFFFFFF
  return CREW_KLEUREN[h % CREW_KLEUREN.length]
}

function volledigeNaam(m: Pick<Medewerker, 'voornaam' | 'tussenvoegsel' | 'achternaam'>): string {
  return [m.voornaam, m.tussenvoegsel, m.achternaam].filter(Boolean).join(' ')
}

// ─── PlanningItemEditDialog ───────────────────────────────────────────────────

function PlanningItemEditDialog({
  entry, medewerkers, dossierMap, onClose, onSaved, onKopieer,
}: {
  entry:       PlanningItemVerrijkt & { dossier_id?: string }
  medewerkers: Medewerker[]
  dossierMap:  Record<string, string>
  onClose:     () => void
  onSaved:     () => void
  onKopieer:   () => void
}) {
  const [isPending, startTransition] = useTransition()
  const { bevestig } = useDialogen()
  const startDt = parseISO(entry.start_dt)
  const eindDt  = parseISO(entry.eind_dt)

  const [form, setForm] = useState({
    medewerker_id: entry.medewerker_id,
    start_datum:   format(startDt, 'yyyy-MM-dd'),
    start_tijd:    format(startDt, 'HH:mm'),
    eind_datum:    format(eindDt,  'yyyy-MM-dd'),
    eind_tijd:     format(eindDt,  'HH:mm'),
    uren:          String(entry.uren),
  })

  function handleSave(e: React.FormEvent) {
    e.preventDefault()
    startTransition(async () => {
      const result = await verplaatsPlanningItem(entry.id, {
        start_dt:      new Date(`${form.start_datum}T${form.start_tijd}`).toISOString(),
        eind_dt:       new Date(`${form.eind_datum}T${form.eind_tijd}`).toISOString(),
        medewerker_id: form.medewerker_id,
        dossier_id:    entry.dossier_id ?? '',
        uursoort_id:   entry.planning_activiteiten?.uursoort_id ?? null,
        uren:          Number(form.uren),
      })
      if (!result.ok) { toast.error(result.error); return }
      toast.success('Planitem bijgewerkt')
      onSaved()
    })
  }

  async function handleDelete() {
    if (!await bevestig({ titel: 'Planitem verwijderen?', bevestigLabel: 'Verwijderen', destructief: true })) return
    startTransition(async () => {
      const result = await verwijderPlanningItem(entry.id)
      if (!result.ok) { toast.error(result.error); return }
      toast.success('Planitem verwijderd')
      onSaved()
    })
  }

  const dossierNaam = dossierMap[entry.dossier_id ?? ''] ?? '—'
  const taakNaam    = entry.planning_activiteiten?.titel ?? '—'

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        background: 'var(--bg-elev)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        width: 'min(480px, calc(100vw - 32px))',
        maxHeight: '90vh',
        overflowY: 'auto',
        boxShadow: '0 24px 64px rgba(0,0,0,0.3)',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px', borderBottom: '1px solid var(--border)',
        }}>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700, color: 'var(--fg)' }}>
              {dossierNaam}
            </div>
            <div style={{ fontSize: 10, color: 'var(--fg-muted)', marginTop: 2 }}>
              {taakNaam}
            </div>
          </div>
          <button type="button" onClick={onClose} className="eva-btn-ghost" style={{ padding: 4 }}>
            <X size={16} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSave} style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Medewerker */}
          <div>
            <label style={dialogLabelStyle}>Medewerker</label>
            <select
              className="eva-input"
              value={form.medewerker_id}
              onChange={e => setForm(f => ({ ...f, medewerker_id: e.target.value }))}
            >
              {medewerkers.map(m => (
                <option key={m.id} value={m.id}>
                  {volledigeNaam(m)}
                </option>
              ))}
            </select>
          </div>

          {/* Start */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={dialogLabelStyle}>Startdatum</label>
              <input type="date" className="eva-input" value={form.start_datum}
                onChange={e => setForm(f => ({ ...f, start_datum: e.target.value }))} required />
            </div>
            <div>
              <label style={dialogLabelStyle}>Starttijd</label>
              <input type="time" className="eva-input" value={form.start_tijd}
                onChange={e => setForm(f => ({ ...f, start_tijd: e.target.value }))} required />
            </div>
          </div>

          {/* Eind */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={dialogLabelStyle}>Einddatum</label>
              <input type="date" className="eva-input" value={form.eind_datum}
                onChange={e => setForm(f => ({ ...f, eind_datum: e.target.value }))} required />
            </div>
            <div>
              <label style={dialogLabelStyle}>Eindtijd</label>
              <input type="time" className="eva-input" value={form.eind_tijd}
                onChange={e => setForm(f => ({ ...f, eind_tijd: e.target.value }))} required />
            </div>
          </div>

          {/* Uren */}
          <div>
            <label style={dialogLabelStyle}>Uren</label>
            <input type="number" className="eva-input" value={form.uren}
              min="0" max="24" step="0.5"
              onChange={e => setForm(f => ({ ...f, uren: e.target.value }))} required />
          </div>

          {/* Actions — mag wrappen zodat de knoppen nooit buiten de modal vallen (rechter groep
              blijft rechts uitgelijnd via marginLeft:auto, ook wanneer hij naar een 2e regel wrapt). */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginTop: 4 }}>
            <div style={{ display: 'flex', gap: 4 }}>
              <button
                type="button"
                onClick={handleDelete}
                disabled={isPending}
                className="eva-btn-ghost"
                style={{ color: '#ef4444', display: 'flex', alignItems: 'center', gap: 4 }}
              >
                <Trash2 size={13} />
                Verwijderen
              </button>
              <button
                type="button"
                onClick={onKopieer}
                disabled={isPending}
                className="eva-btn-ghost"
                style={{ display: 'flex', alignItems: 'center', gap: 4 }}
                title="Start kopieermodus: klik daarna op één of meer dagen om dit planitem te plakken"
              >
                <Copy size={13} />
                Kopiëren
              </button>
            </div>
            <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
              <button type="button" onClick={onClose} className="eva-btn-ghost">Annuleren</button>
              <button type="submit" disabled={isPending} className="eva-btn-primary">
                {isPending ? 'Bezig…' : 'Opslaan'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── ConflictDialog ───────────────────────────────────────────────────────────

function ConflictDialog({
  medewerker, conflicten, dossierMap, onClose, onOplossen,
}: {
  medewerker: Medewerker
  conflicten: ConflictDetail[]
  dossierMap: Record<string, string>
  onClose:    () => void
  onOplossen: (conflict: ConflictDetail) => void
}) {
  const titelVan = (e: EntryMetDossier) => {
    const dossier = dossierMap[e.dossier_id ?? ''] ?? 'Onbekend dossier'
    const taak    = e.planning_activiteiten?.titel
    return taak && taak !== dossier ? `${dossier} — ${taak}` : dossier
  }
  const fmt = (ms: number) => format(new Date(ms), 'EEE d MMM HH:mm', { locale: nl })
  const gesorteerd = [...conflicten].sort((a, b) => a.s - b.s)

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        background: 'var(--bg-elev)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        width: 480,
        maxHeight: '80vh',
        overflowY: 'auto',
        boxShadow: '0 24px 64px rgba(0,0,0,0.3)',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px', borderBottom: '1px solid var(--border)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertTriangle size={16} color="#ef4444" />
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700, color: 'var(--fg)' }}>
              Conflicten — {volledigeNaam(medewerker)}
            </div>
          </div>
          <button type="button" onClick={onClose} className="eva-btn-ghost" style={{ padding: 4 }}>
            <X size={16} />
          </button>
        </div>

        <div style={{ padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {gesorteerd.map((c, i) => (
            <div key={i} style={{
              border: '1px solid rgba(239,68,68,0.35)',
              background: 'rgba(239,68,68,0.06)',
              borderRadius: 8, padding: '10px 12px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#b91c1c' }}>
                  {fmt(c.s)} – {fmt(c.e)}
                </div>
                <button
                  type="button"
                  onClick={() => onOplossen(c)}
                  className="eva-btn-ghost"
                  style={{ padding: '2px 8px', fontSize: 10, fontWeight: 700, flexShrink: 0 }}
                >
                  Oplossen →
                </button>
              </div>
              <div style={{ fontSize: 12, color: 'var(--fg)', lineHeight: 1.5 }}>
                {c.soort === 'overlap' ? (
                  <>
                    <strong>{titelVan(c.a)}</strong>
                    {' overlapt met '}
                    <strong>{titelVan(c.b)}</strong>
                  </>
                ) : (
                  <>
                    <strong>{titelVan(c.a)}</strong>
                    {' valt tijdens '}
                    <strong>{c.blokLabel}</strong>
                  </>
                )}
              </div>
            </div>
          ))}
          {gesorteerd.length === 0 && (
            <div style={{ fontSize: 12, color: 'var(--fg-muted)' }}>Geen conflicten gevonden.</div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── NieuwPlanItemDialog ──────────────────────────────────────────────────────

function NieuwPlanItemDialog({
  medewerker_id, datum, medewerkers, dossierMap, uursoorten, onClose, onSaved,
}: {
  medewerker_id: string
  datum:         string
  medewerkers:   Medewerker[]
  dossierMap:    Record<string, string>
  uursoorten:    PlanningUursoort[]
  onClose:       () => void
  onSaved:       () => void
}) {
  const [isPending, startTransition] = useTransition()

  const [form, setForm] = useState({
    medewerker_id,
    dossier_id:    '',
    bewakingscode: '',
    titel:         '',
    uursoort_id:   '',
    start_datum:   datum,
    start_tijd:    '07:00',
    eind_datum:    datum,
    eind_tijd:     '16:00',
    uren:          '8',
  })

  const [codes, setCodes]           = useState<BewakingscodeRef[] | null>(null)
  const [codesLaden, setCodesLaden] = useState(false)
  const [codesFout, setCodesFout]   = useState<string | null>(null)
  const [overschrijding, setOverschrijding] = useState<string | null>(null)

  // Bewakingscodes van het gekozen dossier live uit Bouw7 ophalen.
  useEffect(() => {
    if (!form.dossier_id) { setCodes(null); setCodesFout(null); return }
    let actief = true
    setCodesLaden(true)
    setCodes(null)
    setCodesFout(null)
    resolveBewakingscodes(form.dossier_id).then(res => {
      if (!actief) return
      setCodesLaden(false)
      if (res.ok) setCodes([...res.codes].sort((a, b) => a.code.localeCompare(b.code, 'nl')))
      else setCodesFout(res.error)
    }).catch(e => {
      if (!actief) return
      setCodesLaden(false)
      setCodesFout(e instanceof Error ? e.message : 'Ophalen bewakingscodes mislukt')
    })
    return () => { actief = false }
  }, [form.dossier_id])

  const dossierOpties = useMemo(
    () => Object.entries(dossierMap).sort((a, b) => a[1].localeCompare(b[1], 'nl')),
    [dossierMap],
  )

  const geselecteerdeCode = codes?.find(c => c.code === form.bewakingscode) ?? null

  function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!form.dossier_id)    { toast.error('Kies een dossier'); return }
    if (!form.bewakingscode) { toast.error('Kies een bewakingscode — een planitem staat altijd op een bewakingscode'); return }
    startTransition(async () => {
      const result = await maakSnelPlanningItem({
        dossier_id:         form.dossier_id,
        medewerker_id:      form.medewerker_id,
        bewakingscode:      form.bewakingscode,
        bewakingscode_naam: geselecteerdeCode?.naam ?? null,
        titel:              form.titel.trim() || undefined,
        uursoort_id:        form.uursoort_id || null,
        start_dt:           new Date(`${form.start_datum}T${form.start_tijd}`).toISOString(),
        eind_dt:            new Date(`${form.eind_datum}T${form.eind_tijd}`).toISOString(),
        uren:               Number(form.uren),
        overrule:           overschrijding != null, // tweede poging = bewust overrulen
      })
      if (!result.ok) {
        if (result.overschrijding) {
          setOverschrijding(result.error)
          return
        }
        toast.error(result.error)
        return
      }
      toast.success('Planitem ingepland')
      onSaved()
    })
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        background: 'var(--bg-elev)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        width: 440,
        maxHeight: '90vh',
        overflowY: 'auto',
        boxShadow: '0 24px 64px rgba(0,0,0,0.3)',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px', borderBottom: '1px solid var(--border)',
        }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700, color: 'var(--fg)' }}>
            Nieuw planitem
          </div>
          <button type="button" onClick={onClose} className="eva-btn-ghost" style={{ padding: 4 }}>
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSave} style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Medewerker */}
          <div>
            <label style={dialogLabelStyle}>Medewerker *</label>
            <select
              className="eva-input"
              value={form.medewerker_id}
              onChange={e => setForm(f => ({ ...f, medewerker_id: e.target.value }))}
              required
            >
              {medewerkers.map(m => (
                <option key={m.id} value={m.id}>{volledigeNaam(m)}</option>
              ))}
            </select>
          </div>

          {/* Dossier */}
          <div>
            <label style={dialogLabelStyle}>Dossier *</label>
            <select
              className="eva-input"
              value={form.dossier_id}
              onChange={e => setForm(f => ({ ...f, dossier_id: e.target.value, bewakingscode: '' }))}
              required
            >
              <option value="">— Kies dossier —</option>
              {dossierOpties.map(([id, label]) => (
                <option key={id} value={id}>{label}</option>
              ))}
            </select>
          </div>

          {/* Bewakingscode */}
          <div>
            <label style={dialogLabelStyle}>Bewakingscode *</label>
            <select
              className="eva-input"
              value={form.bewakingscode}
              onChange={e => setForm(f => ({ ...f, bewakingscode: e.target.value }))}
              disabled={!form.dossier_id || codesLaden || !!codesFout}
              required
            >
              <option value="">
                {!form.dossier_id ? '— Kies eerst een dossier —'
                  : codesLaden ? 'Bewakingscodes laden…'
                  : '— Kies bewakingscode —'}
              </option>
              {(codes ?? []).map(c => (
                <option key={c.code} value={c.code}>
                  {c.code}{c.naam ? ` — ${c.naam}` : ''}{c.hoofdstuk ? ` (${c.hoofdstuk})` : ''}
                </option>
              ))}
            </select>
            {codesFout && (
              <div style={{ fontSize: 11, color: '#b91c1c', marginTop: 4 }}>{codesFout}</div>
            )}
            {codes && codes.length === 0 && (
              <div style={{ fontSize: 11, color: '#b91c1c', marginTop: 4 }}>
                Dit dossier heeft (nog) geen bewakingscodes in Bouw7.
              </div>
            )}
          </div>

          {/* Omschrijving */}
          <div>
            <label style={dialogLabelStyle}>Omschrijving</label>
            <input
              type="text" className="eva-input" value={form.titel}
              placeholder={geselecteerdeCode?.naam ?? 'Naam van de taak (optioneel)'}
              maxLength={200}
              onChange={e => setForm(f => ({ ...f, titel: e.target.value }))}
            />
          </div>

          {/* Uursoort */}
          {uursoorten.length > 0 && (
            <div>
              <label style={dialogLabelStyle}>Uursoort</label>
              <select
                className="eva-input"
                value={form.uursoort_id}
                onChange={e => setForm(f => ({ ...f, uursoort_id: e.target.value }))}
              >
                <option value="">— Geen —</option>
                {uursoorten.map(u => (
                  <option key={u.id} value={u.id}>{u.naam}</option>
                ))}
              </select>
            </div>
          )}

          {/* Start */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={dialogLabelStyle}>Startdatum *</label>
              <input type="date" className="eva-input" value={form.start_datum}
                onChange={e => setForm(f => ({ ...f, start_datum: e.target.value, eind_datum: f.eind_datum < e.target.value ? e.target.value : f.eind_datum }))} required />
            </div>
            <div>
              <label style={dialogLabelStyle}>Starttijd *</label>
              <input type="time" className="eva-input" value={form.start_tijd}
                onChange={e => setForm(f => ({ ...f, start_tijd: e.target.value }))} required />
            </div>
          </div>

          {/* Eind */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={dialogLabelStyle}>Einddatum *</label>
              <input type="date" className="eva-input" value={form.eind_datum}
                onChange={e => setForm(f => ({ ...f, eind_datum: e.target.value }))} required />
            </div>
            <div>
              <label style={dialogLabelStyle}>Eindtijd *</label>
              <input type="time" className="eva-input" value={form.eind_tijd}
                onChange={e => setForm(f => ({ ...f, eind_tijd: e.target.value }))} required />
            </div>
          </div>

          {/* Uren */}
          <div>
            <label style={dialogLabelStyle}>Uren *</label>
            <input type="number" className="eva-input" value={form.uren}
              min="0" step="0.5"
              onChange={e => { setOverschrijding(null); setForm(f => ({ ...f, uren: e.target.value })) }} required />
          </div>

          {overschrijding && (
            <div style={{
              border: '1px solid rgba(245,158,11,0.5)', background: 'rgba(245,158,11,0.08)',
              borderRadius: 8, padding: '8px 12px', fontSize: 11, color: 'var(--fg)',
            }}>
              <strong>Werkbegroting overschreden:</strong> {overschrijding}
              <br />Klik nogmaals op opslaan om tóch in te plannen.
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
            <button type="button" onClick={onClose} className="eva-btn-ghost">Annuleren</button>
            <button type="submit" disabled={isPending} className="eva-btn-primary">
              {isPending ? 'Bezig…' : overschrijding ? 'Toch inplannen' : 'Inplannen'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── TimelineEntry ────────────────────────────────────────────────────────────

const hdlStyle: React.CSSProperties = {
  position: 'absolute', top: 0, bottom: 0, width: 8,
  cursor: 'ew-resize', zIndex: 5,
  background: 'rgba(255,255,255,0.20)', borderRadius: 2,
}

function TimelineEntry({
  entry, left, width, top, dossier_id, dossier_titel, kleur: kleurOverride, ppd,
  onEdit, onResized, onOpenDossier, onStartKopie,
}: {
  entry:         PlanningItemVerrijkt
  left:          number
  width:         number
  top:           number
  dossier_id:    string
  dossier_titel: string
  kleur?:        string
  ppd:           number
  onEdit:        () => void
  onResized:     (id: string, newStartDt: string, newEindDt: string) => void
  onOpenDossier: () => void
  onStartKopie:  () => void
}) {
  const kleur = kleurOverride ?? dossierKleur(dossier_id)
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `timeline-entry-${entry.id}`,
    data: { type: 'timeline-entry', entry, dossier_id },
  })
  const taakTitel = entry.planning_activiteiten?.titel ?? '—'

  const resizeRef        = useRef<{ type: 'left' | 'right'; startX: number } | null>(null)
  const suppressClickRef = useRef(false)
  // Enkelklik licht vertraagd zodat een dubbelklik (→ dossier) hem kan annuleren.
  const clickTimerRef    = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (clickTimerRef.current) clearTimeout(clickTimerRef.current) }, [])

  function startResize(ev: React.PointerEvent, type: 'left' | 'right') {
    ev.stopPropagation()
    ev.preventDefault()
    ;(ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId)
    resizeRef.current = { type, startX: ev.clientX }
    suppressClickRef.current = true
  }

  function onResizeMove(ev: React.PointerEvent) {
    if (!resizeRef.current) return
    ev.stopPropagation()
  }

  function onResizeUp(ev: React.PointerEvent) {
    if (!resizeRef.current) return
    const dx   = ev.clientX - resizeRef.current.startX
    const type = resizeRef.current.type
    resizeRef.current = null
    const days = Math.round(dx / ppd)
    if (days === 0) return
    let ns = entry.start_dt, ne = entry.eind_dt
    if (type === 'left')  { ns = verschuifTs(entry.start_dt, days); if (ns >= ne) return }
    if (type === 'right') { ne = verschuifTs(entry.eind_dt,  days); if (ne <= ns) return }
    onResized(entry.id, ns, ne)
  }

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={() => {
        if (suppressClickRef.current) { suppressClickRef.current = false; return }
        if (clickTimerRef.current) clearTimeout(clickTimerRef.current)
        clickTimerRef.current = setTimeout(() => { clickTimerRef.current = null; onEdit() }, 250)
      }}
      onDoubleClick={() => {
        if (clickTimerRef.current) { clearTimeout(clickTimerRef.current); clickTimerRef.current = null }
        onOpenDossier()
      }}
      onContextMenu={e => {
        e.preventDefault()
        onStartKopie()
      }}
      style={{
        position: 'absolute',
        top, height: ITEM_H,
        left, width: Math.max(0, width - 2),
        borderRadius: 5,
        background: kleur,
        opacity: isDragging ? 0.35 : 1,
        cursor: 'grab',
        display: 'flex', alignItems: 'center',
        paddingLeft: 7,
        overflow: 'hidden',
        userSelect: 'none',
        zIndex: 4,
        boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
      }}
      title={`${dossier_titel} — ${taakTitel} (${entry.uren}u)\nKlik = bewerken · dubbelklik = dossier openen · rechtsklik = kopiëren · Ctrl+slepen = kopie`}
    >
      {/* DS white left-highlight strip */}
      <div style={{
        position: 'absolute', left: 0, top: 0, bottom: 0, width: 3,
        background: 'rgba(255,255,255,0.45)',
        borderRadius: '2px 0 0 2px',
        pointerEvents: 'none',
      }} />
      <div style={{ ...hdlStyle, left: 0 }}
        onPointerDown={ev => startResize(ev, 'left')}
        onPointerMove={onResizeMove}
        onPointerUp={onResizeUp}
      />
      {width > 40 && (
        <span style={{
          fontFamily: 'var(--font-ui)', fontSize: 10, fontWeight: 600,
          color: 'white',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {width > 80 ? dossier_titel : taakTitel}
        </span>
      )}
      <div style={{ ...hdlStyle, right: 0 }}
        onPointerDown={ev => startResize(ev, 'right')}
        onPointerMove={onResizeMove}
        onPointerUp={onResizeUp}
      />
    </div>
  )
}

// ─── DroppableTimelineCell ────────────────────────────────────────────────────

function DroppableTimelineCell({
  id, medewerker_id, datum, left, width, top, hoogte, background, isOver, geblokkeerd, title,
  kopieerModus, onCelKlik,
}: {
  id:            string
  medewerker_id: string
  datum:         string
  left:          number
  width:         number
  top:           number
  hoogte:        number
  background:    string
  isOver:        boolean
  geblokkeerd?:  boolean
  title?:        string
  kopieerModus:  boolean
  onCelKlik:     (medewerker_id: string, datum: string) => void
}) {
  const { setNodeRef } = useDroppable({ id, data: { medewerker_id, datum } })
  return (
    <div
      ref={geblokkeerd ? undefined : setNodeRef}
      title={title ?? (kopieerModus ? 'Klik om het gekopieerde planitem hier te plakken' : 'Klik om een planitem in te plannen')}
      onClick={() => { if (!geblokkeerd) onCelKlik(medewerker_id, datum) }}
      style={{
        position: 'absolute',
        top, height: hoogte,
        left, width,
        background: isOver && !geblokkeerd ? 'rgba(31,122,58,0.15)' : background,
        transition: 'background 0.1s',
        cursor: geblokkeerd ? 'not-allowed' : kopieerModus ? 'copy' : 'pointer',
      }}
    />
  )
}

// ─── AgendaTimelineRij (bedrijfsagenda-rij bovenaan) ─────────────────────────

function AgendaTimelineRij({
  items, feestdagen, layout, dagen,
}: {
  items:      BedrijfsagendaItemMetDoelgroep[]
  feestdagen: BedrijfsagendaVirtueel[]
  layout:     PlanningLayout
  dagen:      Date[]
}) {
  const { totalW, xVoor, breedteVoor } = layout
  const top = 0

  function renderBar(
    id: string, titel: string, start_datum: string, eind_datum: string, kleur: string,
    start_tijd?: string | null, eind_tijd?: string | null,
  ) {
    let left: number, width: number
    if (start_tijd && eind_tijd) {
      left  = xVoor(`${start_datum}T${start_tijd}`)
      width = Math.max(MIN_BAR_W, xVoor(`${start_datum}T${eind_tijd}`) - left)
    } else {
      left  = xVoor(start_datum)
      width = breedteVoor(start_datum, addDays(parseISO(eind_datum), 1).toISOString())
    }
    if (left + width <= 0 || left >= totalW) return null
    const cLeft  = Math.max(0, left)
    const cWidth = Math.min(width, totalW - cLeft) - 2
    return (
      <div
        key={id}
        title={`${titel} · ${start_datum}${eind_datum !== start_datum ? ` – ${eind_datum}` : ''}${start_tijd ? ` ${start_tijd}–${eind_tijd}` : ''}`}
        style={{
          position: 'absolute',
          top: top + 5, height: RIJ_HOOGTE - 10,
          left: cLeft, width: cWidth,
          borderRadius: 5, background: kleur, opacity: 0.85,
          display: 'flex', alignItems: 'center',
          paddingLeft: 7, overflow: 'hidden',
          zIndex: 4, pointerEvents: 'auto',
        }}
      >
        {cWidth > 40 && (
          <span style={{
            fontFamily: 'var(--font-ui)', fontSize: 10, fontWeight: 600,
            color: 'white', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {titel}
          </span>
        )}
      </div>
    )
  }

  return (
    <>
      <div style={{
        position: 'absolute', top, left: 0, right: 0, height: RIJ_HOOGTE,
        background: 'rgba(var(--accent-rgb, 59,130,246), 0.04)',
        pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute', top: top + RIJ_HOOGTE - 1,
        left: 0, right: 0, height: 1, background: KLEUR.border,
        pointerEvents: 'none',
      }} />
      {items.map(item =>
        renderBar(
          item.id, item.titel, item.start_datum, item.eind_datum,
          item.kleur ?? bedrijfsagendaTypeKleur[item.type as BedrijfsagendaType] ?? '#64748b',
          item.start_tijd, item.eind_tijd,
        )
      )}
      {feestdagen.map(f =>
        renderBar(f.id, f.titel, f.start_datum, f.eind_datum, f.kleur ?? '#f97316')
      )}
    </>
  )
}

// ─── TimelineRij ──────────────────────────────────────────────────────────────

function TimelineRij({
  medewerker, top, dagen, layout, entries, conflicten, roosters, afwezigheid,
  overCellId, dossierMap, projectleiders,
  feestdagenDagen, feestdagenNamen, atvDagen, onEditEntry, onResizedEntry,
  onOpenDossier, onStartKopie, onCelKlik, onConflictKlik, kopieerModus,
}: {
  medewerker:        Medewerker
  top:               number
  dagen:             Date[]
  layout:            PlanningLayout
  entries:           EntryMetDossier[]
  conflicten:        ConflictDetail[]
  roosters:          MedewerkerRooster[]
  afwezigheid:       MedewerkerAfwezigheid[]
  overCellId:        string | null
  dossierMap:        Record<string, string>
  projectleiders:    Record<string, { kleur: string | null; naam: string | null }>
  feestdagenDagen:   Set<string>
  feestdagenNamen:   Record<string, string>
  atvDagen:          Set<string>
  onEditEntry:       (entry: EntryMetDossier) => void
  onResizedEntry:    (id: string, ns: string, ne: string) => void
  onOpenDossier:     (entry: EntryMetDossier) => void
  onStartKopie:      (entry: EntryMetDossier) => void
  onCelKlik:         (medewerker_id: string, datum: string) => void
  onConflictKlik:    (conflict: ConflictDetail) => void
  kopieerModus:      boolean
}) {
  const { ppd, totalW, xVoor, breedteVoor } = layout
  const dagLenW = totalW

  function afwezigheidOpDag(dag: Date): MedewerkerAfwezigheid | undefined {
    const iso = format(dag, 'yyyy-MM-dd')
    return afwezigheid.find(a => iso >= a.start_datum && iso <= a.eind_datum)
  }

  return (
    <>
      {/* Drop-cells + dag-achtergrond (verlof/afwezigheid/feestdag/ATV als shading) */}
      {dagen.map((dag, i) => {
        // Lokale datum: de cel die visueel op dag X ligt moet ook datum X dragen
        // (toISOString() is UTC en gaf de vorige dag → verlof-shading 1 dag verschoven).
        const iso    = format(dag, 'yyyy-MM-dd')
        const buiten = buitenRooster(dag, roosters)
        const afwez  = afwezigheidOpDag(dag)
        const feest  = feestdagenDagen.has(iso)
        const atv    = atvDagen.has(iso)
        const cellId = `tcell-${medewerker.id}-${iso}`
        const bg     = feest ? 'rgba(251,146,60,0.12)'
                     : atv   ? 'rgba(8,145,178,0.10)'
                     : afwez ? AFWEZIGHEID_BG[afwez.type]
                     : (buiten && !isWeekend(dag)) ? 'rgba(0,0,0,0.04)'
                     : 'transparent'
        const geblokkeerd = feest || atv
        const cellTitle   = feest ? feestdagenNamen[iso]
                          : atv   ? 'ATV-dag'
                          : afwez ? medewerkerAfwezigheidLabels[afwez.type]
                          : undefined
        return (
          <DroppableTimelineCell
            key={cellId}
            id={cellId}
            medewerker_id={medewerker.id}
            datum={iso}
            left={xVoor(dag.toISOString())}
            width={breedteVoor(dag.toISOString(), addDays(dag, 1).toISOString())}
            top={top}
            hoogte={RIJ_VAST}
            background={bg}
            isOver={overCellId === cellId}
            geblokkeerd={geblokkeerd}
            title={cellTitle}
            kopieerModus={kopieerModus}
            onCelKlik={onCelKlik}
          />
        )
      })}

      {/* Rij-onderlijn */}
      <div style={{
        position: 'absolute', top: top + RIJ_VAST - 1,
        left: 0, right: 0, height: 1, background: KLEUR.border,
        pointerEvents: 'none',
      }} />

      {/* Werk-taken op één strook (geen stapeling) */}
      {entries.map(entry => {
        const left  = xVoor(entry.start_dt)
        const rawW  = breedteVoor(entry.start_dt, entry.eind_dt)
        const width = Math.max(MIN_BAR_W, rawW)
        if (left + width <= 0 || left >= dagLenW) return null
        const cLeft  = Math.max(0, left)
        const cWidth = Math.min(width, dagLenW - cLeft)
        if (cWidth <= 0) return null

        const dossier_id = entry.dossier_id ?? ''
        const titel      = dossierMap[dossier_id] ?? dossier_id
        // Balkkleur = kleur van de projectleider van het dossier.
        const pl         = projectleiders[dossier_id]
        const entryKleur = pl?.kleur ?? crewKleur(pl?.naam ?? titel ?? '—')
        return (
          <TimelineEntry
            key={`entry-${entry.id}`}
            entry={entry}
            left={cLeft}
            width={cWidth}
            top={top + ROW_PAD}
            dossier_id={dossier_id}
            dossier_titel={titel}
            kleur={entryKleur}
            ppd={ppd}
            onEdit={() => onEditEntry(entry)}
            onResized={onResizedEntry}
            onOpenDossier={() => onOpenDossier(entry)}
            onStartKopie={() => onStartKopie(entry)}
          />
        )
      })}

      {/* Conflict-gloed — overlappend werk of werk tijdens verlof/feestdag/ATV */}
      {conflicten.map((seg, i) => {
        const left  = xVoor(new Date(seg.s).toISOString())
        const rawW  = xVoor(new Date(seg.e).toISOString()) - left
        const width = Math.max(MIN_BAR_W, rawW)
        if (left + width <= 0 || left >= dagLenW) return null
        const cLeft  = Math.max(0, left)
        const cWidth = Math.min(width, dagLenW - cLeft)
        if (cWidth <= 0) return null
        return (
          <div
            key={`conflict-${i}`}
            title="Dubbel ingepland — klik om op te lossen"
            onClick={e => { e.stopPropagation(); onConflictKlik(seg) }}
            style={{
              position: 'absolute',
              top: top + 2, height: RIJ_VAST - 4,
              left: cLeft, width: cWidth,
              borderRadius: 5,
              background: 'rgba(239,68,68,0.22)',
              border: '1px solid rgba(239,68,68,0.75)',
              boxShadow: '0 0 7px 1px rgba(239,68,68,0.55)',
              cursor: 'pointer', zIndex: 7,
            }}
          />
        )
      })}
    </>
  )
}

// ─── Props ────────────────────────────────────────────────────────────────────

type Props = {
  medewerkers:  Medewerker[]
  entries:      (PlanningItemVerrijkt & { dossier_id?: string })[]
  roosters:     MedewerkerRooster[]
  afwezigheid:  MedewerkerAfwezigheid[]
  dossierMap:   Record<string, string>
  projectleiders?: Record<string, { kleur: string | null; naam: string | null }>
  ploegNamen?:  Record<string, string>
  uursoorten?:  PlanningUursoort[]
  agendaItems?: BedrijfsagendaItemMetDoelgroep[]
  feestdagen?:  BedrijfsagendaVirtueel[]
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function MedewerkerTimeline({
  medewerkers, entries: initialEntries, roosters, afwezigheid, dossierMap,
  projectleiders = {}, ploegNamen = {}, uursoorten = [], agendaItems = [], feestdagen = [],
}: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()

  const {
    view, peildatum, layout, wrapRef, scrollRef,
    handlePeildatum, handleView, handleVandaag, handleScrub,
  } = usePlanningController({ defaultView: 'maand' })
  const { vs, ve, ppd } = layout

  const [entries,   setEntries]   = useState(initialEntries)
  const [activeItem,    setActiveItem]    = useState<{ entry: PlanningItemVerrijkt; dossier_id: string } | null>(null)
  const [overCellId,    setOverCellId]    = useState<string | null>(null)
  const [verlofModalOpen, setVerlofModalOpen] = useState(false)
  const [editingEntry,  setEditingEntry]  = useState<EntryMetDossier | null>(null)
  const [nieuwItem,     setNieuwItem]     = useState<{ medewerker_id: string; datum: string } | null>(null)
  const [kopieerBron,   setKopieerBron]   = useState<EntryMetDossier | null>(null)
  const [conflictInfo,  setConflictInfo]  = useState<{ medewerker: Medewerker; conflicten: ConflictDetail[] } | null>(null)
  const [oplosConflict, setOplosConflict] = useState<{ medewerkerId: string; conflict: ConflictDetail } | null>(null)

  const [selAfdelingen, setSelAfdelingen] = useState<string[]>([])
  const [sortBy, setSortBy] = useState<SortKey>('voornaam')

  useEffect(() => { setEntries(initialEntries) }, [initialEntries])

  // Ctrl/Alt ingedrukt tijdens slepen → kopie i.p.v. verplaatsen.
  const kopieToetsRef = useRef(false)
  useEffect(() => {
    const bijwerken = (e: KeyboardEvent) => { kopieToetsRef.current = e.ctrlKey || e.altKey || e.metaKey }
    window.addEventListener('keydown', bijwerken)
    window.addEventListener('keyup', bijwerken)
    return () => {
      window.removeEventListener('keydown', bijwerken)
      window.removeEventListener('keyup', bijwerken)
    }
  }, [])

  // Esc beëindigt de kopieermodus.
  useEffect(() => {
    if (!kopieerBron) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setKopieerBron(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [kopieerBron])

  const dagen = useMemo(() => eachDayOfInterval({ start: vs, end: ve }), [vs, ve])

  const afdelingOpties = useMemo(
    () => [...new Set(medewerkers.map(m => m.afdeling).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, 'nl')),
    [medewerkers],
  )

  const zichtbareMedewerkers = useMemo(() => {
    let list = medewerkers
    if (selAfdelingen.length > 0) list = list.filter(m => m.afdeling && selAfdelingen.includes(m.afdeling))
    const cmp = (a: string | null, b: string | null) => (a ?? '').localeCompare(b ?? '', 'nl')
    // Lege sorteerwaarde (geen afdeling/functie/ploeg) onderaan, dan op voornaam.
    const opWaarde = (a: Medewerker, b: Medewerker, get: (m: Medewerker) => string) => {
      const av = get(a).trim()
      const bv = get(b).trim()
      if (!av && !bv) return cmp(a.voornaam, b.voornaam)
      if (!av) return 1
      if (!bv) return -1
      return cmp(av, bv) || cmp(a.voornaam, b.voornaam)
    }
    return [...list].sort((a, b) => {
      if (sortBy === 'afdeling') return opWaarde(a, b, m => m.afdeling ?? '')
      if (sortBy === 'functie')  return opWaarde(a, b, m => m.functie ?? '')
      if (sortBy === 'ploeg')    return opWaarde(a, b, m => ploegNamen[m.ploeg_id ?? ''] ?? '')
      return cmp(a.voornaam, b.voornaam) || cmp(a.achternaam, b.achternaam)
    })
  }, [medewerkers, selAfdelingen, sortBy, ploegNamen])

  const medewerkerKleuren = useMemo(() => Object.fromEntries(medewerkers.map(m => [m.id, m.kleur])), [medewerkers])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  )

  const entriesPerMedewerker = useMemo(() => {
    const map: Record<string, typeof entries> = {}
    for (const e of entries) {
      if (!map[e.medewerker_id]) map[e.medewerker_id] = []
      map[e.medewerker_id].push(e)
    }
    return map
  }, [entries])

  const afwezigheidPerMedewerker = useMemo(() => groupBy(afwezigheid, a => a.medewerker_id), [afwezigheid])

  const feestdagenDagen = useMemo(() => new Set(feestdagen.map(f => f.start_datum)), [feestdagen])
  const feestdagenNamen = useMemo(
    () => Object.fromEntries(feestdagen.map(f => [f.start_datum, f.titel])),
    [feestdagen],
  )
  const atvDagen = useMemo(() => {
    const set = new Set<string>()
    for (const item of agendaItems) {
      if (item.type === 'atv_dag') {
        // Lokale dag-iteratie: parseISO (lokale middernacht) + format, geen UTC-mix.
        const e = parseISO(item.eind_datum)
        for (let d = parseISO(item.start_datum); d <= e; d = addDays(d, 1))
          set.add(format(d, 'yyyy-MM-dd'))
      }
    }
    return set
  }, [agendaItems])

  // Blok-intervallen die voor iedereen gelden (feestdag/ATV) — voor conflictdetectie.
  const feestAtvIntervals = useMemo<BlokInterval[]>(() => {
    const arr: BlokInterval[] = []
    for (const iso of feestdagenDagen) {
      const t = parseISO(iso).getTime()
      const naam = feestdagenNamen[iso]
      arr.push({ s: t, e: t + DAG_MS, label: naam ? `feestdag (${naam})` : 'een feestdag' })
    }
    for (const iso of atvDagen) {
      const t = parseISO(iso).getTime()
      arr.push({ s: t, e: t + DAG_MS, label: 'een ATV-dag' })
    }
    return arr
  }, [feestdagenDagen, feestdagenNamen, atvDagen])

  const agendaItemsInBereik = useMemo(() => {
    const start = format(vs, 'yyyy-MM-dd')
    const einde = format(ve, 'yyyy-MM-dd')
    return agendaItems.filter(a => a.eind_datum >= start && a.start_datum <= einde)
  }, [agendaItems, vs, ve])

  const feestdagenInBereik = useMemo(() => {
    const start = format(vs, 'yyyy-MM-dd')
    const einde = format(ve, 'yyyy-MM-dd')
    return feestdagen.filter(f => f.eind_datum >= start && f.start_datum <= einde)
  }, [feestdagen, vs, ve])

  const heeftAgendaRij = agendaItems.length > 0 || feestdagen.length > 0

  // Per-medewerker layout: zichtbare entries + conflictsegmenten + vaste rijhoogte + top.
  const medewerkerLayout = useMemo(() => {
    const vsMs = vs.getTime()
    const veMs = ve.getTime() + DAG_MS
    let accTop = heeftAgendaRij ? RIJ_HOOGTE : 0
    return zichtbareMedewerkers.map(m => {
      const alle    = entriesPerMedewerker[m.id] ?? []
      const myEntries = alle.filter(e => {
        const s = parseISO(e.start_dt).getTime()
        const en = parseISO(e.eind_dt).getTime()
        return en >= vsMs && s <= veMs
      })
      const myAfw = afwezigheidPerMedewerker[m.id] ?? []
      const work: WerkInterval[] = myEntries.map(e => ({
        s: parseISO(e.start_dt).getTime(), e: parseISO(e.eind_dt).getTime(), entry: e,
      }))
      const blokken: BlokInterval[] = [
        ...feestAtvIntervals,
        ...myAfw.map(a => ({ ...afwezigheidInterval(a), label: medewerkerAfwezigheidLabels[a.type].toLowerCase() })),
      ]
      const conflicten = berekenConflicten(work, blokken)
      const row = { medewerker: m, top: accTop, entries: myEntries, conflicten, blokken, heeftConflict: conflicten.length > 0 }
      accTop += RIJ_VAST
      return row
    })
  }, [zichtbareMedewerkers, entriesPerMedewerker, afwezigheidPerMedewerker, feestAtvIntervals, vs, ve, heeftAgendaRij])

  const bodyHoogte = (heeftAgendaRij ? RIJ_HOOGTE : 0) + zichtbareMedewerkers.length * RIJ_VAST

  /** Nieuwe start/eind voor een entry op een doel-dag: tijdstip + duur blijven gelijk. */
  function verplaatsNaarDag(entry: PlanningItemVerrijkt, datum: string): { start: Date; eind: Date } {
    const origStart = parseISO(entry.start_dt)
    const origEind  = parseISO(entry.eind_dt)
    const duur      = differenceInMinutes(origEind, origStart)
    const start     = new Date(`${datum}T${format(origStart, 'HH:mm:ss')}`)
    return { start, eind: addMinutes(start, duur) }
  }

  /** Plak een kopie van `bron` op (medewerker, dag). Gebruikt door kopieermodus én Ctrl+slepen. */
  async function plakKopie(bron: EntryMetDossier, medewerker_id: string, datum: string) {
    const { start, eind } = verplaatsNaarDag(bron, datum)
    const result = await kopieerPlanningItem(bron.id, {
      medewerker_id,
      start_dt: start.toISOString(),
      eind_dt:  eind.toISOString(),
    })
    if (!result.ok) { toast.error(result.error); return }
    toast.success('Planitem gekopieerd')
    setEntries(prev => [...prev, {
      ...result.data,
      medewerkers: null,
      planning_activiteiten: bron.planning_activiteiten,
      dossier_id: bron.dossier_id,
    }])
    startTransition(() => router.refresh())
  }

  function handleCelKlik(medewerker_id: string, datum: string) {
    if (kopieerBron) {
      void plakKopie(kopieerBron, medewerker_id, datum)
      return
    }
    setNieuwItem({ medewerker_id, datum })
  }

  function openDossier(entry: EntryMetDossier) {
    if (!entry.dossier_id) { toast.error('Geen dossier gekoppeld aan dit planitem'); return }
    router.push(`/opdrachten/${entry.dossier_id}/informatie`)
  }

  async function onDragEnd(event: DragEndEvent) {
    setActiveItem(null)
    setOverCellId(null)
    const cellData = event.over?.data.current as { medewerker_id: string; datum: string } | undefined
    if (!cellData) return
    const active = event.active.data.current
    if (!active?.type?.startsWith('timeline')) return

    const entry      = active.entry as PlanningItemVerrijkt
    const dossier_id = active.dossier_id as string

    // Ctrl/Alt/Cmd + slepen = kopie i.p.v. verplaatsen.
    if (kopieToetsRef.current) {
      await plakKopie({ ...entry, dossier_id }, cellData.medewerker_id, cellData.datum)
      return
    }

    const origStart  = parseISO(entry.start_dt)
    const origEind   = parseISO(entry.eind_dt)
    const duur       = differenceInMinutes(origEind, origStart)
    const nieuwStart = new Date(`${cellData.datum}T${format(origStart, 'HH:mm:ss')}`)
    const nieuwEind  = addMinutes(nieuwStart, duur)

    const result = await verplaatsPlanningItem(entry.id, {
      start_dt:      nieuwStart.toISOString(),
      eind_dt:       nieuwEind.toISOString(),
      medewerker_id: cellData.medewerker_id !== entry.medewerker_id ? cellData.medewerker_id : undefined,
      dossier_id,
      uursoort_id:   entry.planning_activiteiten?.uursoort_id ?? null,
      uren:          entry.uren,
    })

    if (!result.ok) { toast.error(result.error); return }

    setEntries(prev => prev.map(e => {
      if (e.id !== entry.id) return e
      return { ...e, start_dt: nieuwStart.toISOString(), eind_dt: nieuwEind.toISOString(), medewerker_id: cellData.medewerker_id }
    }))
    startTransition(() => router.refresh())
  }

  async function onResizedEntry(id: string, ns: string, ne: string) {
    const entry = entries.find(e => e.id === id)
    if (!entry) return
    const result = await verplaatsPlanningItem(id, {
      start_dt:    ns,
      eind_dt:     ne,
      medewerker_id: entry.medewerker_id,
      dossier_id:  entry.dossier_id ?? '',
      uursoort_id: entry.planning_activiteiten?.uursoort_id ?? null,
      uren:        entry.uren,
    })
    if (!result.ok) { toast.error(result.error); return }
    setEntries(prev => prev.map(e => e.id === id ? { ...e, start_dt: ns, eind_dt: ne } : e))
    startTransition(() => router.refresh())
  }

  const labelKolom = (
    <div>
      {heeftAgendaRij && (
        <div style={{
          height: RIJ_HOOGTE, display: 'flex', alignItems: 'center',
          paddingLeft: 12, borderBottom: `1px solid ${KLEUR.border}`,
          background: 'rgba(var(--accent-rgb, 59,130,246), 0.06)',
        }}>
          <span style={{
            fontSize: 9, fontWeight: 700,
            color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.1em',
          }}>Bedrijfsagenda</span>
        </div>
      )}
      {medewerkerLayout.map(({ medewerker: m, heeftConflict, conflicten }) => (
        <Link key={m.id} href={`/medewerkers/${m.id}`} style={{ textDecoration: 'none', display: 'block' }}>
          <div style={{
            height: RIJ_VAST, display: 'flex', alignItems: 'center',
            paddingLeft: 12, paddingRight: 8, gap: 8, borderBottom: `1px solid ${KLEUR.border}`,
            background: KLEUR.bgElev,
          }}>
            <div style={{
              width: 26, height: 26, borderRadius: '50%', background: medewerkerKleuren[m.id] ?? medKleur(m.id),
              display: 'grid', placeItems: 'center', color: 'white',
              fontFamily: 'var(--font-display)', fontSize: 9, fontWeight: 700, flexShrink: 0,
            }}>
              {[m.voornaam[0], m.achternaam[0]].join('').toUpperCase()}
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{
                fontFamily: 'var(--font-ui)', fontSize: 11, fontWeight: 600, color: KLEUR.fg,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {volledigeNaam(m)}
              </div>
              {(m.functie || m.afdeling) && (
                <div style={{
                  fontSize: 9, color: KLEUR.fgMuted,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                  {[m.functie, m.afdeling].filter(Boolean).join(' · ')}
                </div>
              )}
            </div>
            {heeftConflict && (
              <button
                type="button"
                title="Dubbel ingepland / conflict — klik voor details"
                onClick={e => {
                  e.preventDefault()
                  e.stopPropagation()
                  setConflictInfo({ medewerker: m, conflicten })
                }}
                style={{
                  display: 'inline-flex', color: '#ef4444', flexShrink: 0,
                  background: 'transparent', border: 'none', padding: 2, cursor: 'pointer',
                }}
              >
                <AlertTriangle size={15} />
              </button>
            )}
          </div>
        </Link>
      ))}
    </div>
  )

  const body = (
    <>
      {heeftAgendaRij && (
        <AgendaTimelineRij
          items={agendaItemsInBereik}
          feestdagen={feestdagenInBereik}
          layout={layout}
          dagen={dagen}
        />
      )}
      {medewerkerLayout.map(({ medewerker: m, top, entries: rijEntries, conflicten }) => (
        <TimelineRij
          key={m.id}
          medewerker={m}
          top={top}
          dagen={dagen}
          layout={layout}
          entries={rijEntries}
          conflicten={conflicten}
          roosters={roosters.filter(r => r.medewerker_id === m.id)}
          afwezigheid={afwezigheidPerMedewerker[m.id] ?? []}
          overCellId={overCellId}
          dossierMap={dossierMap}
          projectleiders={projectleiders}
          feestdagenDagen={feestdagenDagen}
          feestdagenNamen={feestdagenNamen}
          atvDagen={atvDagen}
          onEditEntry={entry => setEditingEntry(entry)}
          onResizedEntry={onResizedEntry}
          onOpenDossier={openDossier}
          onStartKopie={entry => setKopieerBron(entry)}
          onCelKlik={handleCelKlik}
          onConflictKlik={conflict => setOplosConflict({ medewerkerId: m.id, conflict })}
          kopieerModus={!!kopieerBron}
        />
      ))}
    </>
  )

  // Legenda — verklaart de dag-achtergronden (m.n. verlof = licht rood).
  const legenda = (
    <div style={{ marginTop: 10, display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
      {([
        ['Verlof',    AFWEZIGHEID_BG.verlof],
        ['Ziek',      AFWEZIGHEID_BG.ziek],
        ['Training',  AFWEZIGHEID_BG.training],
        ['Overig',    AFWEZIGHEID_BG.overig],
        ['Feestdag',  'rgba(251,146,60,0.25)'],
        ['ATV',       'rgba(8,145,178,0.20)'],
      ] as const).map(([label, kleur]) => (
        <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{ width: 12, height: 12, borderRadius: 2, background: kleur, border: '1px solid var(--border)' }} />
          <span style={{ fontSize: 10, color: KLEUR.fgMuted }}>{label}</span>
        </div>
      ))}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <AlertTriangle size={12} color="#ef4444" />
        <span style={{ fontSize: 10, color: KLEUR.fgMuted }}>Conflict — klik op de rode gloed om op te lossen</span>
      </div>
    </div>
  )

  // ─── Slicer + sorteer-balk (bovenin) ─────────────────────────────────────────
  const segGroep = (children: React.ReactNode) => (
    <div style={{ display: 'flex', gap: 2, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, padding: 2 }}>
      {children}
    </div>
  )
  const sortControl = segGroep(
    SORT_OPTIES.map(o => (
      <button key={o.key} onClick={() => setSortBy(o.key)} style={{
        padding: '3px 10px', borderRadius: 4, border: 'none', cursor: 'pointer',
        background: sortBy === o.key ? 'var(--accent)' : 'transparent',
        color: sortBy === o.key ? 'white' : 'var(--fg-muted)',
        fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap',
      }}>
        {o.label}
      </button>
    )),
  )

  const slicerBalk = (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
      {afdelingOpties.length >= 2 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Afdeling</span>
          {afdelingOpties.map(afd => {
            const actief = selAfdelingen.includes(afd)
            return (
              <button key={afd} onClick={() => setSelAfdelingen(prev =>
                actief ? prev.filter(a => a !== afd) : [...prev, afd]
              )} style={{
                padding: '3px 10px', borderRadius: 20, border: `1px solid ${actief ? 'var(--accent)' : 'var(--border)'}`,
                background: actief ? 'var(--accent)' : 'transparent',
                color: actief ? 'white' : 'var(--fg-muted)',
                fontSize: 10, fontWeight: 600, cursor: 'pointer',
              }}>
                {afd}
              </button>
            )
          })}
          {selAfdelingen.length > 0 && (
            <button onClick={() => setSelAfdelingen([])} style={{
              padding: '3px 8px', borderRadius: 20, border: '1px solid var(--border)',
              background: 'transparent', color: 'var(--fg-muted)', fontSize: 10, cursor: 'pointer',
            }}>
              × wis
            </button>
          )}
        </div>
      )}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginLeft: 'auto' }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Sorteer</span>
        {sortControl}
      </div>
    </div>
  )

  return (
    <DndContext
      sensors={sensors}
      onDragStart={e => {
        const d = e.active.data.current
        if (d?.type?.startsWith('timeline')) setActiveItem({ entry: d.entry, dossier_id: d.dossier_id })
      }}
      onDragOver={e => setOverCellId(e.over ? String(e.over.id) : null)}
      onDragEnd={onDragEnd}
      onDragCancel={() => { setActiveItem(null); setOverCellId(null) }}
    >
      <div ref={wrapRef}>
        {slicerBalk}
        <PlanningShell
          layout={layout}
          scrollRef={scrollRef}
          toolbar={
            <PeriodeNav
              peildatum={peildatum}
              view={view}
              onPeildatum={handlePeildatum}
              onView={handleView}
              onVandaag={handleVandaag}
              rightSlot={
                <button
                  type="button"
                  onClick={() => setVerlofModalOpen(true)}
                  className="eva-btn-ghost"
                >
                  + Verlof
                </button>
              }
            />
          }
          scrubber={<PeriodeScrubber view={view} peildatum={peildatum} vs={layout.periodeVs} onChange={handleScrub} />}
          labelHeader="Medewerker"
          labelKolom={labelKolom}
          body={body}
          bodyHoogte={bodyHoogte}
          legenda={legenda}
          maxHoogte="calc(100dvh - 150px)"
        />
      </div>

      {/* Kopieermodus-hint */}
      {kopieerBron && (
        <div style={{
          position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)',
          zIndex: 1100,
          background: 'var(--fg)', color: 'var(--bg)',
          borderRadius: 10, padding: '10px 16px',
          display: 'flex', alignItems: 'center', gap: 10,
          boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
          fontSize: 12, fontWeight: 600, maxWidth: '90vw',
        }}>
          <Copy size={14} style={{ flexShrink: 0 }} />
          <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            Kopieermodus — klik op een dag om &ldquo;{dossierMap[kopieerBron.dossier_id ?? ''] ?? 'planitem'}&rdquo; te plakken (meerdere keren kan) · Esc om te stoppen
          </span>
          <button
            type="button"
            onClick={() => setKopieerBron(null)}
            style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', display: 'inline-flex', padding: 2, flexShrink: 0 }}
          >
            <X size={14} />
          </button>
        </div>
      )}

      <DragOverlay>
        {activeItem && (
          <div style={{
            height: ITEM_H, width: 160,
            background: dossierKleur(activeItem.dossier_id),
            borderRadius: 5, opacity: 0.9,
            display: 'flex', alignItems: 'center', paddingLeft: 8,
            boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
          }}>
            <span style={{ fontFamily: 'var(--font-ui)', fontSize: 11, fontWeight: 600, color: 'white' }}>
              {dossierMap[activeItem.dossier_id] ?? '—'}
            </span>
          </div>
        )}
      </DragOverlay>

      {verlofModalOpen && (
        <VerlofModal
          medewerkers={medewerkers}
          periodeStart={format(vs, 'yyyy-MM-dd')}
          periodeEinde={format(ve, 'yyyy-MM-dd')}
          onClose={() => setVerlofModalOpen(false)}
          onSaved={() => {
            setVerlofModalOpen(false)
            startTransition(() => router.refresh())
          }}
        />
      )}

      {editingEntry && (
        <PlanningItemEditDialog
          entry={editingEntry}
          medewerkers={medewerkers}
          dossierMap={dossierMap}
          onClose={() => setEditingEntry(null)}
          onSaved={() => {
            setEditingEntry(null)
            startTransition(() => router.refresh())
          }}
          onKopieer={() => {
            setKopieerBron(editingEntry)
            setEditingEntry(null)
          }}
        />
      )}

      {nieuwItem && (
        <NieuwPlanItemDialog
          medewerker_id={nieuwItem.medewerker_id}
          datum={nieuwItem.datum}
          medewerkers={medewerkers}
          dossierMap={dossierMap}
          uursoorten={uursoorten}
          onClose={() => setNieuwItem(null)}
          onSaved={() => {
            setNieuwItem(null)
            startTransition(() => router.refresh())
          }}
        />
      )}

      {conflictInfo && (
        <ConflictDialog
          medewerker={conflictInfo.medewerker}
          conflicten={conflictInfo.conflicten}
          dossierMap={dossierMap}
          onClose={() => setConflictInfo(null)}
          onOplossen={conflict => {
            setOplosConflict({ medewerkerId: conflictInfo.medewerker.id, conflict })
            setConflictInfo(null)
          }}
        />
      )}

      {oplosConflict && (() => {
        const row = medewerkerLayout.find(r => r.medewerker.id === oplosConflict.medewerkerId)
        if (!row) return null
        return (
          <ConflictOplosDialog
            medewerker={row.medewerker}
            conflict={oplosConflict.conflict}
            conflicten={row.conflicten}
            entriesRij={row.entries}
            blokken={row.blokken}
            roosters={roosters.filter(r => r.medewerker_id === row.medewerker.id)}
            dossierMap={dossierMap}
            projectleiders={projectleiders}
            zichtbaar={{ van: vs.getTime(), tot: ve.getTime() + DAG_MS }}
            onApplied={wijzigingen => {
              setEntries(prev => prev.map(e => {
                const w = wijzigingen.find(x => x.id === e.id)
                return w ? { ...e, start_dt: w.start_dt, eind_dt: w.eind_dt } : e
              }))
              startTransition(() => router.refresh())
            }}
            onClose={() => setOplosConflict(null)}
          />
        )
      })()}
    </DndContext>
  )
}

function groupBy<T>(arr: T[], key: (item: T) => string): Record<string, T[]> {
  const result: Record<string, T[]> = {}
  for (const item of arr) {
    const k = key(item)
    if (!result[k]) result[k] = []
    result[k].push(item)
  }
  return result
}
