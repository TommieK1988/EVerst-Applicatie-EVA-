'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  addDays, differenceInDays, endOfWeek, format, getISOWeek,
  isWeekend, parseISO, startOfDay, startOfWeek,
} from 'date-fns'
import type { Locale } from 'date-fns'
import { useTranslations } from 'next-intl'
import { useDateFnsLocale } from '@/i18n/client'
import VertaalbareTekst from '@/components/vertalen/VertaalbareTekst'
import BewakingscodeLabel from './BewakingscodeLabel'

/**
 * Mobiele dossierplanning — read-only.
 *
 * Portret : chronologische kaartlijst; verlopen werk staat achter een knop.
 * Liggend : versimpelde Gantt (altijd álle activiteiten, ook verlopen). Tik op de naam
 *           van een activiteit klapt de medewerkers eronder in; tik op de balk toont details.
 *
 * In beide staat de bewakingscode van de activiteit: die vult de medewerker in zijn weekstaat in.
 *
 * Bewust géén hergebruik van de desktop-Gantt (`components/planning/ActiviteitGantt`
 * + `components/planning/layout`): die leunt op drag-controllers en desktop-CSS-vars,
 * terwijl de `/m`-schermen met vaste hex-kleuren werken en alleen-lezen zijn.
 */

/**
 * LET OP — bewust géén uren hier.
 *
 * `planning_items.uren` is bij Bouw7-planning het `hours`-veld van het plan-item,
 * dat ongewijzigd op de regel van iedere toegewezen medewerker wordt gezet
 * (zie `lib/bouw7/sync-planning.ts`). Staan er vier mensen op één blok, dan
 * toont iedereen hetzelfde bloktotaal — en dat totaal is niet consequent
 * gevuld: soms is het per persoon, soms voor het hele blok. Daarom laat dit
 * scherm nergens uren zien; namen wel.
 */
export type MobielPlanitem = {
  id: string
  medewerker_id: string | null
  start_dt: string | null
  eind_dt: string | null
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
  fase_id: string | null
  fase_naam: string | null
  fase_volgorde: number | null
  /** Kale code ("BU.A") zoals op `planning_activiteiten`; de fase heeft hem bij schrijven al doorgezet. */
  bewakingscode: string | null
  /** Omschrijving uit de codelijst van het dossier; null als die niet te vinden is. */
  bewakingscode_naam: string | null
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

/** date-fns-patroon voor een korte datum ("3 jun"); de maandnaam volgt de taal. */
const KORTE_DATUM = 'd MMM'

const kleurVan = (status: string | null) => STATUS_KLEUR[status ?? ''] ?? '#9aa4ab'

/** Datum-only ISO (yyyy-MM-dd) uit een `date`-kolom (gewenste_start, deadline). */
const dagVan = (iso: string | null): string | null => (iso ? iso.slice(0, 10) : null)

/**
 * Lokale kalenderdag van een timestamptz (`planning_items.start_dt`/`eind_dt`).
 *
 * NIET `slice(0,10)` gebruiken: PostgREST levert UTC, dus 1 juni 00:00 in
 * Nederland komt binnen als `2026-05-31T22:00:00+00:00` en zou dan als 31 mei
 * op de tijdlijn belanden. `parseISO` rekent wél naar lokale tijd.
 *
 * `eindExclusief`: een planitem eindigt op middernacht ván de volgende dag, dus
 * de laatste gewerkte dag is die van (eind − 1 ms). Bij een eindtijd midden op
 * de dag (bv. 15:00) verandert dat niets.
 */
function dagVanTijdstip(iso: string | null, eindExclusief = false): string | null {
  if (!iso) return null
  try {
    const d = parseISO(iso)
    return format(new Date(eindExclusief ? d.getTime() - 1 : d.getTime()), 'yyyy-MM-dd')
  } catch { return null }
}

function datumLabel(iso: string | null, locale: Locale): string | null {
  const d = dagVan(iso)
  if (!d) return null
  try { return format(parseISO(d), KORTE_DATUM, { locale }) } catch { return null }
}

function periodeLabel(a: MobielActiviteit, locale: Locale): string {
  return [datumLabel(a.gewenste_start, locale), datumLabel(a.deadline, locale)].filter(Boolean).join(' – ')
}

function mensenVan(a: MobielActiviteit): string {
  return Array.from(new Set(a.items.map(i => i.voornaam).filter(Boolean))).join(', ')
}

/** Effectieve start/eind van een activiteit; valt terug op elkaar én op de planitems. */
function bereikVan(a: MobielActiviteit): { start: string | null; eind: string | null } {
  const dagen = [
    dagVan(a.gewenste_start), dagVan(a.deadline),
    ...a.items.flatMap(i => [dagVanTijdstip(i.start_dt), dagVanTijdstip(i.eind_dt, true)]),
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
  const t = useTranslations('dossiertabs.planning')
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
        {t('geen')}
      </div>
    )
  }

  return liggend
    ? <PlanningMiniGantt activiteiten={gesorteerd} />
    : <PlanningLijst activiteiten={gesorteerd} />
}

// ─── Portret: kaartlijst ──────────────────────────────────────────────────────

function PlanningLijst({ activiteiten }: { activiteiten: MobielActiviteit[] }) {
  const t = useTranslations('dossiertabs.planning')
  const [toonVerlopen, setToonVerlopen] = useState(false)
  const vandaag = format(new Date(), 'yyyy-MM-dd')

  const actueel = activiteiten.filter(a => !isVerlopen(a, vandaag))
  const verlopen = activiteiten.filter(a => isVerlopen(a, vandaag))

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {actueel.length === 0 ? (
        <div style={{ textAlign: 'center', color: GRIJS, padding: '32px 8px', fontSize: 14 }}>
          {t('alleAfgerond')}
        </div>
      ) : (
        actueel.map(a => <ActiviteitKaart key={a.id} a={a} />)
      )}

      {verlopen.length > 0 && (
        <>
          <button
            onClick={() => setToonVerlopen(v => !v)}
            style={{
              marginTop: 4, padding: '10px 14px', background: 'var(--bg-elev)',
              border: `1px solid ${RAND}`, borderRadius: 12, color: GRIJS,
              fontSize: 13, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
              width: '100%', textAlign: 'center',
            }}
          >
            {t(toonVerlopen ? 'verbergVerlopen' : 'toonVerlopen', { aantal: verlopen.length })}
          </button>

          {toonVerlopen && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: GRIJS, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                {t('verlopen')}
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
  const locale = useDateFnsLocale()
  const kleur = kleurVan(a.status)
  const periode = periodeLabel(a, locale)
  const mensen = mensenVan(a)

  return (
    <div style={{
      padding: '12px 14px', background: 'var(--bg-elev)',
      border: `1px solid ${RAND}`, borderRadius: 12,
      borderLeft: `4px solid ${kleur}`,
      opacity: gedimd ? 0.6 : 1,
    }}>
      <VertaalbareTekst tekst={a.titel} label={false} as="div" style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg)' }} />
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
      {a.bewakingscode && <BewakingscodeLabel code={a.bewakingscode} naam={a.bewakingscode_naam} />}
    </div>
  )
}

// ─── Liggend: versimpelde Gantt ───────────────────────────────────────────────

const LABEL_W  = 120
const RIJ_H    = 34
const SUBRIJ_H = 22
const FASE_H   = 22
const WEEK_H   = 18   // headerrij met weeknummers
const DAG_H    = 16   // headerrij met dagnummers (alleen in weekweergave)

const LIJN_DAG  = '#e8edee'
const LIJN_WEEK = '#c6d0d3'

/** Vaste dagbreedte: weekweergave. De tijdlijn is een doorlopende, horizontaal
 *  scrollbare strook (net als de desktop-Gantt), géén fit-to-screen. */
const PPD = 30

type GanttRij =
  | { kind: 'fase'; key: string; naam: string }
  | { kind: 'activiteit'; key: string; a: MobielActiviteit }
  /** Eén rij per medewerker binnen een activiteit; `items` zijn al zijn blokken. */
  | { kind: 'planitem'; key: string; a: MobielActiviteit; naam: string; items: MobielPlanitem[] }

function PlanningMiniGantt({ activiteiten }: { activiteiten: MobielActiviteit[] }) {
  const t = useTranslations('dossiertabs.planning')
  const locale = useDateFnsLocale()
  const scrollRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState<string | null>(null)
  /** Activiteiten waarvan de medewerkerrijen verborgen zijn. Standaard alles uitgeklapt. */
  const [ingeklapt, setIngeklapt] = useState<Set<string>>(() => new Set())
  const klapIn = (id: string) => setIngeklapt(huidig => {
    const nieuw = new Set(huidig)
    if (nieuw.has(id)) nieuw.delete(id); else nieuw.add(id)
    return nieuw
  })
  /** Activiteiten die überhaupt medewerkers op de tijdlijn hebben — alleen die zijn in te klappen. */
  const metMensen = useMemo(
    () => new Set(activiteiten.filter(a => a.items.some(i => i.start_dt || i.eind_dt)).map(a => a.id)),
    [activiteiten],
  )
  const allesIngeklapt = metMensen.size > 0 && [...metMensen].every(id => ingeklapt.has(id))
  const klapAllesIn = () => setIngeklapt(allesIngeklapt ? new Set() : new Set(metMensen))

  const ppd = PPD
  const headerH = WEEK_H + DAG_H

  const vandaag = startOfDay(new Date())

  // Bereik: alle datums + vandaag, afgerond op hele weken (maandag t/m zondag).
  // Op een maandag beginnen houdt de weekstrepen en de weekendtint in de pas.
  const { start, dagen } = useMemo(() => {
    const alle: string[] = []
    for (const a of activiteiten) {
      const b = bereikVan(a)
      if (b.start) alle.push(b.start)
      if (b.eind) alle.push(b.eind)
    }
    alle.push(format(vandaag, 'yyyy-MM-dd'))
    alle.sort()
    const s = startOfWeek(parseISO(alle[0]), { weekStartsOn: 1 })
    const e = endOfWeek(parseISO(alle[alle.length - 1]), { weekStartsOn: 1 })
    return { start: s, dagen: Math.max(7, differenceInDays(e, s) + 1) }
  }, [activiteiten])

  const tijdlijnW = dagen * ppd

  // Bij openen (en bij het wisselen van zoomniveau) naar vandaag scrollen —
  // vandaag landt op ~1/6 van de zichtbare breedte, zoals de desktop-planning.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const zichtbaar = Math.max(0, el.clientWidth - LABEL_W)
    const x = differenceInDays(vandaag, start) * ppd
    el.scrollLeft = Math.max(0, x - zichtbaar / 6)
  }, [ppd, dagen, start])

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
        if (ingeklapt.has(a.id)) continue

        // Alle blokken van dezelfde medewerker binnen deze activiteit op ÉÉN rij,
        // anders krijg je dezelfde naam vijf keer onder elkaar. Sleutel op
        // medewerker_id; valt terug op de naam voor rijen zonder koppeling.
        const perMedewerker = new Map<string, { naam: string; items: MobielPlanitem[] }>()
        for (const item of a.items) {
          if (!item.start_dt && !item.eind_dt) continue
          const sleutel = item.medewerker_id ?? item.naam ?? item.id
          const naam = item.voornaam ?? item.naam ?? '—'
          const rij = perMedewerker.get(sleutel)
          if (rij) rij.items.push(item)
          else perMedewerker.set(sleutel, { naam, items: [item] })
        }
        for (const [sleutel, rij] of perMedewerker) {
          out.push({ kind: 'planitem', key: `item-${a.id}-${sleutel}`, a, naam: rij.naam, items: rij.items })
        }
      }
    }
    return out
  }, [activiteiten, ingeklapt])

  const weken = useMemo(() => {
    const uit: { i: number; datum: Date }[] = []
    for (let i = 0; i < dagen; i += 7) uit.push({ i, datum: addDays(start, i) })
    return uit
  }, [start, dagen])

  const vandaagX = differenceInDays(vandaag, start) * ppd

  /** Verticale rasterlijnen: dagstreep per dag, zwaardere streep per week,
   *  weekendkolommen getint. Als CSS-gradients i.p.v. duizenden losse divs —
   *  scheelt bij een lange planning enorm veel DOM-knopen. */
  const raster: React.CSSProperties = {
    backgroundImage: [
      `repeating-linear-gradient(90deg, transparent 0 ${5 * ppd}px, rgba(0,0,0,0.045) ${5 * ppd}px ${7 * ppd}px)`,
      `repeating-linear-gradient(90deg, ${LIJN_DAG} 0 1px, transparent 1px ${ppd}px)`,
      `repeating-linear-gradient(90deg, ${LIJN_WEEK} 0 1px, transparent 1px ${7 * ppd}px)`,
    ].join(','),
  }

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', background: 'var(--bg-elev)' }}>
      <div ref={scrollRef} style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        <div style={{ width: LABEL_W + tijdlijnW, minWidth: '100%', position: 'relative' }}>

        {/* Vandaag-lijn over de volle hoogte; onder de labelkolom (z-index 3) door. */}
        {vandaagX >= 0 && vandaagX <= tijdlijnW && (
          <div style={{
            position: 'absolute', left: LABEL_W + vandaagX, top: 0, bottom: 0,
            width: 2, background: GROEN, opacity: 0.5, zIndex: 2, pointerEvents: 'none',
          }} />
        )}

        {/* Header: weeknummers, en in de weekweergave ook de dagnummers */}
        <div style={{
          display: 'flex', position: 'sticky', top: 0, zIndex: 5,
          background: 'var(--bg-elev)', borderBottom: `1px solid ${LIJN_WEEK}`, height: headerH,
        }}>
          {/* Kopcel: alles in- of uitklappen in één tik. */}
          <button
            type="button"
            onClick={klapAllesIn}
            disabled={metMensen.size === 0}
            aria-label={t(allesIngeklapt ? 'allesUitklappen' : 'allesInklappen')}
            style={{
              width: LABEL_W, flexShrink: 0, position: 'sticky', left: 0, zIndex: 6,
              background: 'var(--bg-elev)', border: 'none', borderRight: `1px solid ${RAND}`,
              display: 'flex', alignItems: 'center', gap: 4, padding: '0 6px',
              fontSize: 10, fontWeight: 700, color: GRIJS, fontFamily: 'inherit',
              textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'left',
              cursor: metMensen.size > 0 ? 'pointer' : 'default',
            }}
          >
            {metMensen.size > 0 && <Chevron open={!allesIngeklapt} />}
            {t('kop')}
          </button>
          <div style={{ position: 'relative', width: tijdlijnW, flexShrink: 0 }}>
            {/* Weekbalk */}
            {weken.map(w => (
              <div key={w.i} style={{
                position: 'absolute', left: w.i * ppd, top: 0, width: 7 * ppd, height: WEEK_H,
                borderLeft: `1px solid ${LIJN_WEEK}`,
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '0 4px', overflow: 'hidden',
              }}>
                <span style={{ fontSize: 9.5, fontWeight: 700, color: GRIJS, whiteSpace: 'nowrap' }}>
                  {t('week', { nummer: getISOWeek(w.datum) })}
                </span>
                <span style={{ fontSize: 9.5, color: '#9aa4ab', whiteSpace: 'nowrap' }}>
                  {format(w.datum, KORTE_DATUM, { locale })}
                </span>
              </div>
            ))}
            {/* Dagnummers */}
            {Array.from({ length: dagen }, (_, i) => {
              const d = addDays(start, i)
              return (
                <div key={i} style={{
                  position: 'absolute', left: i * ppd, top: WEEK_H, width: ppd, height: DAG_H,
                  borderLeft: `1px solid ${i % 7 === 0 ? LIJN_WEEK : LIJN_DAG}`,
                  display: 'grid', placeItems: 'center',
                  background: isWeekend(d) ? 'rgba(0,0,0,0.045)' : undefined,
                  fontSize: 9, color: isWeekend(d) ? '#9aa4ab' : GRIJS,
                }}>
                  {d.getDate()}
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
                <div style={{ width: tijdlijnW, flexShrink: 0, ...raster, opacity: 0.6 }} />
              </div>
            )
          }

          const isAct = rij.kind === 'activiteit'
          const kanKlappen = isAct && metMensen.has(rij.a.id)
          const isIngeklapt = isAct && ingeklapt.has(rij.a.id)
          const hoogte = isAct ? RIJ_H : SUBRIJ_H
          const kleur = kleurVan(rij.a.status)

          // Een activiteitrij heeft één balk; een medewerkerrij er zoveel als die
          // persoon blokken heeft binnen deze activiteit.
          const perioden = isAct
            ? [{
                sleutel: rij.a.id,
                s: dagVan(rij.a.gewenste_start) ?? dagVan(rij.a.deadline),
                e: dagVan(rij.a.deadline) ?? dagVan(rij.a.gewenste_start),
              }]
            : rij.items.map(item => ({
                sleutel: item.id,
                s: dagVanTijdstip(item.start_dt) ?? dagVanTijdstip(item.eind_dt, true),
                e: dagVanTijdstip(item.eind_dt, true) ?? dagVanTijdstip(item.start_dt),
              }))

          const balken = perioden
            .filter(p => p.s && p.e)
            .map(p => ({
              sleutel: p.sleutel,
              left: Math.max(0, offset(p.s!)),
              width: Math.max(ppd, offset(p.e!) + ppd - offset(p.s!)),
            }))

          return (
            <div key={rij.key}>
              <div
                style={{
                  display: 'flex', height: hoogte,
                  borderBottom: `1px solid ${isAct ? RAND : '#f0f3f4'}`,
                }}
              >
                {/* Labelkolom: een tik klapt de medewerkers onder deze activiteit in of uit. */}
                <div
                  onClick={kanKlappen ? () => klapIn(rij.a.id) : undefined}
                  role={kanKlappen ? 'button' : undefined}
                  aria-expanded={kanKlappen ? !isIngeklapt : undefined}
                  style={{
                    width: LABEL_W, flexShrink: 0, position: 'sticky', left: 0, zIndex: 3,
                    background: 'var(--bg-elev)', borderRight: `1px solid ${RAND}`,
                    display: 'flex', alignItems: 'center', gap: 4,
                    padding: isAct ? '0 6px' : '0 8px 0 18px',
                    cursor: kanKlappen ? 'pointer' : 'default',
                  }}
                >
                  {isAct && (kanKlappen
                    ? <Chevron open={!isIngeklapt} />
                    : <span style={{ width: 10, flexShrink: 0 }} />)}
                  {isAct && <div style={{ width: 3, height: 14, borderRadius: 2, background: kleur, flexShrink: 0 }} />}
                  <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{
                      fontSize: isAct ? 12 : 10.5,
                      fontWeight: isAct ? 600 : 400,
                      color: isAct ? '#161b20' : GRIJS,
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>
                      {isAct ? <VertaalbareTekst tekst={rij.a.titel} label={false} /> : rij.naam}
                    </span>
                    {isAct && rij.a.bewakingscode && (
                      <span style={{ display: 'flex', lineHeight: 1.2, overflow: 'hidden' }}>
                        <BewakingscodeLabel code={rij.a.bewakingscode} naam={null} compact />
                      </span>
                    )}
                  </div>
                </div>

                {/* Tijdlijn: een tik op de activiteitrij toont de detailregel. */}
                <div
                  onClick={isAct ? () => setOpen(o => (o === rij.a.id ? null : rij.a.id)) : undefined}
                  style={{ position: 'relative', width: tijdlijnW, flexShrink: 0, cursor: isAct ? 'pointer' : 'default', ...raster }}
                >
                  {balken.map(balk => (
                    <div key={balk.sleutel} style={{
                      position: 'absolute', left: balk.left, width: balk.width,
                      top: isAct ? 7 : 5, bottom: isAct ? 7 : 5,
                      borderRadius: 4,
                      background: isAct ? `${kleur}26` : kleur,
                      border: isAct ? `1.5px solid ${kleur}` : 'none',
                    }}/>
                  ))}
                </div>
              </div>

              {/* Detailregel bij tik op een activiteitbalk */}
              {isAct && open === rij.a.id && (
                <div style={{
                  display: 'flex', borderBottom: `1px solid ${RAND}`, background: 'var(--bg)',
                }}>
                  <div style={{
                    width: LABEL_W, flexShrink: 0, position: 'sticky', left: 0, zIndex: 3,
                    background: 'var(--bg)', borderRight: `1px solid ${RAND}`,
                  }} />
                  <div style={{ padding: '8px 10px', fontSize: 11, color: GRIJS, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    {periodeLabel(rij.a, locale) && <span>📅 {periodeLabel(rij.a, locale)}</span>}
                    {mensenVan(rij.a) && <span>👤 {mensenVan(rij.a)}</span>}
                    {rij.a.bewakingscode && (
                      <span style={{ marginTop: -6 }}>
                        <BewakingscodeLabel code={rij.a.bewakingscode} naam={rij.a.bewakingscode_naam} />
                      </span>
                    )}
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
    </div>
  )
}

/** Klein pijltje bij een in te klappen rij: open wijst omlaag, dicht naar rechts. */
function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="10" height="10" viewBox="0 0 10 10" aria-hidden
      style={{ flexShrink: 0, transition: 'transform 120ms', transform: open ? 'rotate(90deg)' : 'none' }}
    >
      <path d="M3.5 2 L7 5 L3.5 8" fill="none" stroke={GRIJS} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
