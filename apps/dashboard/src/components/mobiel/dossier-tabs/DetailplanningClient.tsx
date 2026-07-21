'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { addDays, differenceInDays, format, isWeekend, parseISO, startOfDay } from 'date-fns'
import { nl } from 'date-fns/locale'

/**
 * Mobiele dossierplanning — read-only.
 *
 * Portret : chronologische kaartlijst; verlopen werk staat achter een knop.
 * Liggend : versimpelde Gantt (altijd álle activiteiten, ook verlopen).
 *
 * Bewust géén hergebruik van de desktop-Gantt (`components/planning/ActiviteitGantt`
 * + `components/planning/layout`): die leunt op drag-controllers en desktop-CSS-vars,
 * terwijl de `/m`-schermen met vaste hex-kleuren werken en alleen-lezen zijn.
 */

export type MobielPlanitem = {
  id: string
  medewerker_id: string | null
  start_dt: string | null
  eind_dt: string | null
  uren: number | null
  naam: string | null
  voornaam: string | null
}

export type MobielActiviteit = {
  id: string
  titel: string
  status: string | null
  gewenste_start: string | null
  deadline: string | null
  locatie_adres: string | null
  volgorde: number
  geschatte_uren: number | null
  fase_id: string | null
  fase_naam: string | null
  fase_volgorde: number | null
  items: MobielPlanitem[]
}

/** Waarden van enum `planning_activiteit_status` (zie ActiviteitBacklog voor de labels). */
const STATUS_KLEUR: Record<string, string> = {
  backlog: '#9aa4ab', gepland: '#009439', in_uitvoering: '#009439',
  opgeleverd: '#6b757c', on_hold: '#b8860b',
}

const GROEN = '#009439'
const RAND  = '#e3e8ea'
const GRIJS = '#6b757c'

const kleurVan = (status: string | null) => STATUS_KLEUR[status ?? ''] ?? '#9aa4ab'

/** Datum-only ISO (yyyy-MM-dd) uit een date- of timestamp-kolom. */
const dagVan = (iso: string | null): string | null => (iso ? iso.slice(0, 10) : null)

function datumLabel(iso: string | null): string | null {
  const d = dagVan(iso)
  if (!d) return null
  try { return format(parseISO(d), 'd MMM', { locale: nl }) } catch { return null }
}

function periodeLabel(a: MobielActiviteit): string {
  return [datumLabel(a.gewenste_start), datumLabel(a.deadline)].filter(Boolean).join(' – ')
}

function mensenVan(a: MobielActiviteit): string {
  return Array.from(new Set(a.items.map(i => i.voornaam).filter(Boolean))).join(', ')
}

/** Effectieve start/eind van een activiteit; valt terug op elkaar én op de planitems. */
function bereikVan(a: MobielActiviteit): { start: string | null; eind: string | null } {
  const dagen = [
    dagVan(a.gewenste_start), dagVan(a.deadline),
    ...a.items.flatMap(i => [dagVan(i.start_dt), dagVan(i.eind_dt)]),
  ].filter(Boolean) as string[]
  if (dagen.length === 0) return { start: null, eind: null }
  dagen.sort()
  return { start: dagen[0], eind: dagen[dagen.length - 1] }
}

/**
 * Verlopen = einddatum vóór vandaag, óf status `opgeleverd` (= gereed).
 * Zonder enige datum is een activiteit niet verlopen (tenzij opgeleverd).
 */
function isVerlopen(a: MobielActiviteit, vandaag: string): boolean {
  if (a.status === 'opgeleverd') return true
  const eind = dagVan(a.deadline) ?? dagVan(a.gewenste_start)
  return eind != null && eind < vandaag
}

/** Chronologisch oplopend; activiteiten zonder datum achteraan. */
function sorteerChronologisch(activiteiten: MobielActiviteit[]): MobielActiviteit[] {
  return [...activiteiten].sort((a, b) => {
    const as = dagVan(a.gewenste_start) ?? dagVan(a.deadline)
    const bs = dagVan(b.gewenste_start) ?? dagVan(b.deadline)
    if (as && bs && as !== bs) return as < bs ? -1 : 1
    if (as && !bs) return -1
    if (!as && bs) return 1
    const ae = dagVan(a.deadline) ?? ''
    const be = dagVan(b.deadline) ?? ''
    if (ae !== be) return ae < be ? -1 : 1
    return a.volgorde - b.volgorde
  })
}

// ─── Hoofdcomponent ───────────────────────────────────────────────────────────

export default function DetailplanningClient({ activiteiten }: { activiteiten: MobielActiviteit[] }) {
  const [liggend, setLiggend] = useState(false)

  // Eerste render (SSR + hydratie) is altijd portret; pas daarna meten we.
  useEffect(() => {
    const meet = () => setLiggend(
      window.matchMedia('(orientation: landscape)').matches && window.innerWidth >= 520
    )
    meet()
    const mq = window.matchMedia('(orientation: landscape)')
    mq.addEventListener('change', meet)
    window.addEventListener('resize', meet)
    return () => { mq.removeEventListener('change', meet); window.removeEventListener('resize', meet) }
  }, [])

  const gesorteerd = useMemo(() => sorteerChronologisch(activiteiten), [activiteiten])

  if (gesorteerd.length === 0) {
    return (
      <div style={{ textAlign: 'center', color: GRIJS, padding: '40px 16px', fontSize: 14 }}>
        Geen planning voor dit dossier.
      </div>
    )
  }

  return liggend
    ? <PlanningMiniGantt activiteiten={gesorteerd} />
    : <PlanningLijst activiteiten={gesorteerd} />
}

// ─── Portret: kaartlijst ──────────────────────────────────────────────────────

function PlanningLijst({ activiteiten }: { activiteiten: MobielActiviteit[] }) {
  const [toonVerlopen, setToonVerlopen] = useState(false)
  const vandaag = format(new Date(), 'yyyy-MM-dd')

  const actueel = activiteiten.filter(a => !isVerlopen(a, vandaag))
  const verlopen = activiteiten.filter(a => isVerlopen(a, vandaag))

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {actueel.length === 0 ? (
        <div style={{ textAlign: 'center', color: GRIJS, padding: '32px 8px', fontSize: 14 }}>
          Alle planning voor dit dossier is afgerond.
        </div>
      ) : (
        actueel.map(a => <ActiviteitKaart key={a.id} a={a} />)
      )}

      {verlopen.length > 0 && (
        <>
          <button
            onClick={() => setToonVerlopen(v => !v)}
            style={{
              marginTop: 4, padding: '10px 14px', background: '#fff',
              border: `1px solid ${RAND}`, borderRadius: 12, color: GRIJS,
              fontSize: 13, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
              width: '100%', textAlign: 'center',
            }}
          >
            {toonVerlopen ? 'Verberg verlopen' : 'Toon verlopen'} ({verlopen.length})
          </button>

          {toonVerlopen && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: GRIJS, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Verlopen
              </div>
              {verlopen.map(a => <ActiviteitKaart key={a.id} a={a} gedimd />)}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function ActiviteitKaart({ a, gedimd }: { a: MobielActiviteit; gedimd?: boolean }) {
  const kleur = kleurVan(a.status)
  const periode = periodeLabel(a)
  const mensen = mensenVan(a)

  return (
    <div style={{
      padding: '12px 14px', background: '#fff',
      border: `1px solid ${RAND}`, borderRadius: 12,
      borderLeft: `4px solid ${kleur}`,
      opacity: gedimd ? 0.6 : 1,
    }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: '#161b20' }}>{a.titel}</div>
      <div style={{ fontSize: 12, color: GRIJS, marginTop: 3, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {periode && <span>📅 {periode}</span>}
        {mensen && <span>👤 {mensen}</span>}
      </div>
      {a.locatie_adres && (
        <a
          href={`https://maps.google.com/?q=${encodeURIComponent(a.locatie_adres)}`}
          target="_blank" rel="noopener noreferrer"
          style={{ fontSize: 12, color: GROEN, textDecoration: 'none', marginTop: 4, display: 'inline-block' }}
        >
          📍 {a.locatie_adres}
        </a>
      )}
    </div>
  )
}

// ─── Liggend: versimpelde Gantt ───────────────────────────────────────────────

const LABEL_W  = 120
const RIJ_H    = 34
const SUBRIJ_H = 22
const FASE_H   = 22
const HEADER_H = 34
const PPD_MIN  = 6
const PPD_MAX  = 28

type GanttRij =
  | { kind: 'fase'; key: string; naam: string }
  | { kind: 'activiteit'; key: string; a: MobielActiviteit }
  | { kind: 'planitem'; key: string; a: MobielActiviteit; item: MobielPlanitem }

function PlanningMiniGantt({ activiteiten }: { activiteiten: MobielActiviteit[] }) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [breedte, setBreedte] = useState(0)
  const [open, setOpen] = useState<string | null>(null)

  useEffect(() => {
    const meet = () => setBreedte(scrollRef.current?.clientWidth ?? 0)
    meet()
    window.addEventListener('resize', meet)
    return () => window.removeEventListener('resize', meet)
  }, [])

  const vandaag = startOfDay(new Date())

  // Bereik: alle datums + vandaag, met een paar dagen marge.
  const { start, dagen } = useMemo(() => {
    const alle: string[] = []
    for (const a of activiteiten) {
      const b = bereikVan(a)
      if (b.start) alle.push(b.start)
      if (b.eind) alle.push(b.eind)
    }
    alle.push(format(vandaag, 'yyyy-MM-dd'))
    alle.sort()
    const s = addDays(parseISO(alle[0]), -2)
    const e = addDays(parseISO(alle[alle.length - 1]), 2)
    return { start: s, dagen: Math.max(1, differenceInDays(e, s) + 1) }
  }, [activiteiten])

  const beschikbaar = Math.max(0, breedte - LABEL_W)
  const ppd = beschikbaar > 0
    ? Math.min(PPD_MAX, Math.max(PPD_MIN, beschikbaar / dagen))
    : PPD_MIN
  const tijdlijnW = dagen * ppd

  // Bij openen naar vandaag scrollen (vandaag op ~1/6 van de zichtbare breedte).
  useEffect(() => {
    const el = scrollRef.current
    if (!el || beschikbaar <= 0) return
    const x = differenceInDays(vandaag, start) * ppd
    el.scrollLeft = Math.max(0, x - beschikbaar / 6)
  }, [ppd, beschikbaar, dagen])

  const offset = (iso: string) => differenceInDays(parseISO(iso), start) * ppd

  // Rijen opbouwen: per fase één kopregel → activiteit → sub-rij per medewerker.
  // Gegroepeerd op fase (zoals de desktop-Gantt), binnen een fase chronologisch —
  // anders zou dezelfde fasekop steeds opnieuw tussen de activiteiten opduiken.
  const rijen = useMemo(() => {
    // Op fase_id groeperen, niet op naam: één dossier kan twee verschillende
    // fasen met dezelfde naam hebben (bv. Bouw7-import naast een EVA-fase).
    const groepen: { id: string | null; naam: string | null; volgorde: number; activiteiten: MobielActiviteit[] }[] = []
    for (const a of activiteiten) {
      let groep = groepen.find(g => g.id === a.fase_id)
      if (!groep) {
        groep = {
          id: a.fase_id, naam: a.fase_naam,
          volgorde: a.fase_id ? (a.fase_volgorde ?? 9998) : 9999,
          activiteiten: [],
        }
        groepen.push(groep)
      }
      groep.activiteiten.push(a)
    }
    groepen.sort((a, b) => a.volgorde - b.volgorde)

    const out: GanttRij[] = []
    for (const groep of groepen) {
      if (groep.naam) out.push({ kind: 'fase', key: `fase-${groep.id}`, naam: groep.naam })
      for (const a of groep.activiteiten) {
        out.push({ kind: 'activiteit', key: `act-${a.id}`, a })
        for (const item of a.items) {
          if (!item.start_dt && !item.eind_dt) continue
          out.push({ kind: 'planitem', key: `item-${item.id}`, a, item })
        }
      }
    }
    return out
  }, [activiteiten])

  const dagKolommen = useMemo(
    () => Array.from({ length: dagen }, (_, i) => addDays(start, i)),
    [start, dagen]
  )
  const vandaagX = differenceInDays(vandaag, start) * ppd

  return (
    <div ref={scrollRef} style={{ flex: 1, minHeight: 0, overflow: 'auto', background: '#fff' }}>
      <div style={{ width: LABEL_W + tijdlijnW, minWidth: '100%' }}>

        {/* Header: maandlabels + dagnummers */}
        <div style={{
          display: 'flex', position: 'sticky', top: 0, zIndex: 5,
          background: '#fff', borderBottom: `1px solid ${RAND}`, height: HEADER_H,
        }}>
          <div style={{
            width: LABEL_W, flexShrink: 0, position: 'sticky', left: 0, zIndex: 6,
            background: '#fff', borderRight: `1px solid ${RAND}`,
            display: 'flex', alignItems: 'center', padding: '0 8px',
            fontSize: 10, fontWeight: 700, color: GRIJS,
            textTransform: 'uppercase', letterSpacing: '0.06em',
          }}>
            Planning
          </div>
          <div style={{ position: 'relative', width: tijdlijnW, flexShrink: 0 }}>
            {dagKolommen.map((d, i) => {
              const eersteVanMaand = d.getDate() === 1 || i === 0
              return (
                <div key={i} style={{
                  position: 'absolute', left: i * ppd, top: 0, bottom: 0, width: ppd,
                  borderLeft: eersteVanMaand ? `1px solid ${RAND}` : 'none',
                  display: 'flex', flexDirection: 'column', justifyContent: 'center',
                  paddingLeft: 2, overflow: 'hidden',
                }}>
                  {eersteVanMaand && (
                    <span style={{ fontSize: 9, fontWeight: 700, color: GRIJS, whiteSpace: 'nowrap' }}>
                      {format(d, 'MMM', { locale: nl })}
                    </span>
                  )}
                  {ppd >= 16 && (
                    <span style={{ fontSize: 9, color: '#9aa4ab' }}>{d.getDate()}</span>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Rijen */}
        {rijen.map(rij => {
          if (rij.kind === 'fase') {
            return (
              <div key={rij.key} style={{ display: 'flex', height: FASE_H, background: '#f4f7f7', borderBottom: `1px solid ${RAND}` }}>
                <div style={{
                  width: LABEL_W, flexShrink: 0, position: 'sticky', left: 0, zIndex: 3,
                  background: '#f4f7f7', borderRight: `1px solid ${RAND}`,
                  display: 'flex', alignItems: 'center', padding: '0 8px',
                  fontSize: 9, fontWeight: 700, color: GRIJS,
                  textTransform: 'uppercase', letterSpacing: '0.08em',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                  {rij.naam}
                </div>
                <div style={{ width: tijdlijnW, flexShrink: 0 }} />
              </div>
            )
          }

          const isAct = rij.kind === 'activiteit'
          const hoogte = isAct ? RIJ_H : SUBRIJ_H
          const kleur = kleurVan(rij.a.status)

          const b = isAct
            ? { s: dagVan(rij.a.gewenste_start) ?? dagVan(rij.a.deadline), e: dagVan(rij.a.deadline) ?? dagVan(rij.a.gewenste_start) }
            : { s: dagVan(rij.item.start_dt) ?? dagVan(rij.item.eind_dt), e: dagVan(rij.item.eind_dt) ?? dagVan(rij.item.start_dt) }

          const left = b.s ? Math.max(0, offset(b.s)) : null
          const width = b.s && b.e ? Math.max(ppd, offset(b.e) + ppd - offset(b.s)) : null

          return (
            <div key={rij.key}>
              <div
                onClick={isAct ? () => setOpen(o => (o === rij.a.id ? null : rij.a.id)) : undefined}
                style={{
                  display: 'flex', height: hoogte,
                  borderBottom: `1px solid ${isAct ? RAND : '#f0f3f4'}`,
                  cursor: isAct ? 'pointer' : 'default',
                }}
              >
                <div style={{
                  width: LABEL_W, flexShrink: 0, position: 'sticky', left: 0, zIndex: 3,
                  background: '#fff', borderRight: `1px solid ${RAND}`,
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: isAct ? '0 8px' : '0 8px 0 18px',
                }}>
                  {isAct && <div style={{ width: 3, height: 14, borderRadius: 2, background: kleur, flexShrink: 0 }} />}
                  <span style={{
                    fontSize: isAct ? 12 : 10.5,
                    fontWeight: isAct ? 600 : 400,
                    color: isAct ? '#161b20' : GRIJS,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    {isAct ? rij.a.titel : (rij.item.voornaam ?? rij.item.naam ?? '—')}
                  </span>
                </div>

                <div style={{ position: 'relative', width: tijdlijnW, flexShrink: 0 }}>
                  {/* Weekendtint */}
                  {dagKolommen.map((d, i) => isWeekend(d) ? (
                    <div key={i} style={{ position: 'absolute', left: i * ppd, top: 0, bottom: 0, width: ppd, background: 'rgba(0,0,0,0.035)' }} />
                  ) : null)}

                  {/* Vandaag-lijn */}
                  {vandaagX >= 0 && vandaagX <= tijdlijnW && (
                    <div style={{ position: 'absolute', left: vandaagX, top: 0, bottom: 0, width: 2, background: GROEN, opacity: 0.55 }} />
                  )}

                  {left != null && width != null && (
                    <div style={{
                      position: 'absolute', left, width,
                      top: isAct ? 7 : 5, bottom: isAct ? 7 : 5,
                      borderRadius: 4,
                      background: isAct ? `${kleur}26` : kleur,
                      border: isAct ? `1.5px solid ${kleur}` : 'none',
                      display: 'flex', alignItems: 'center', paddingLeft: 5, overflow: 'hidden',
                    }}>
                      {!isAct && rij.item.uren != null && width > 34 && (
                        <span style={{ fontSize: 9, fontWeight: 600, color: '#fff', whiteSpace: 'nowrap' }}>
                          {rij.item.uren}u
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Detailregel bij tik op een activiteitbalk */}
              {isAct && open === rij.a.id && (
                <div style={{
                  display: 'flex', borderBottom: `1px solid ${RAND}`, background: '#f8fafa',
                }}>
                  <div style={{
                    width: LABEL_W, flexShrink: 0, position: 'sticky', left: 0, zIndex: 3,
                    background: '#f8fafa', borderRight: `1px solid ${RAND}`,
                  }} />
                  <div style={{ padding: '8px 10px', fontSize: 11, color: GRIJS, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    {periodeLabel(rij.a) && <span>📅 {periodeLabel(rij.a)}</span>}
                    {rij.a.geschatte_uren != null && <span>⏱ {rij.a.geschatte_uren}u</span>}
                    {mensenVan(rij.a) && <span>👤 {mensenVan(rij.a)}</span>}
                    {rij.a.locatie_adres && (
                      <a
                        href={`https://maps.google.com/?q=${encodeURIComponent(rij.a.locatie_adres)}`}
                        target="_blank" rel="noopener noreferrer"
                        style={{ color: GROEN, textDecoration: 'none' }}
                      >
                        📍 {rij.a.locatie_adres}
                      </a>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
