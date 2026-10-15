// ─── MEETSTAAT SPIEGELEN NAAR EIGEN TABELLEN (fase 1a) ──────────────────────
// De meetstaat leeft nog in de calculatie-snapshot (JSONB). Fase 1a schrijft hem bij
// elke opslag óók naar eigen tabellen, zodat hij later los van de calculatie kan
// bestaan: bij het dossier, en zodra er een object is bij het object (moeder-meetstaat).
//
// Dit bestand is puur: snapshot in, rijen uit. Het schrijven zit in spiegel-schrijven.ts.
// Bewust geen 'use server': synchrone exports mogen daar niet.
//
// Delen: de meetstaat gebruikt nu de groepen van de calculatie als indeling. Elke
// gebruikte groep wordt een gebouwdeel met hetzelfde id, zodat opnieuw spiegelen
// dezelfde rij raakt. Maximaal twee niveaus: een groep met een bovenliggende groep
// wordt deel › subdeel; diepere voorouders vallen weg.

import type { Groep, Meetregel, Meetstaat } from '@/lib/everts-calc/types'

export interface SpiegelContext {
  projectId: string
  dossierId: string
  objectId: string | null
  /** ISO-tijdstip van deze opslag; vult opgemeten_op als een regel geen eigen datum heeft. */
  nu: string
}

export interface SpiegelInvoer {
  groepen: Groep[]
  meetstaten?: Meetstaat[]
  meetregels?: Meetregel[]
}

export interface MeetstaatRij {
  id: string
  dossier_id: string
  object_id: string | null
  naam: string
  code: string
  bron: 'eva'
}

export interface GebouwDeelRij {
  id: string
  dossier_id: string
  object_id: string | null
  parent_id: string | null
  naam: string
  volgorde: number
}

export interface MeetstaatRegelRij {
  id: string
  meetstaat_id: string
  soort: 'schilderwerk'
  deel_id: string | null
  volgorde: number
  element: string | null
  onderdeel_id: string | null
  type_id: string | null
  behandeling_id: string | null
  onderdeel: string | null
  type: string | null
  behandeling: string | null
  bestekcode: string | null
  bestek_kenmerk: string | null
  opmerking: string | null
  breedte: number | null
  hoogte: number | null
  breedte_aantal: number | null
  hoogte_aantal: number | null
  factor: number | null
  aantal: number
  eenheid: string
  hoeveelheid_override: number | null
  opgemeten_op: string
  vervallen_op: null
}

export interface MeetstaatGebruikRij {
  meetstaat_id: string
  project_id: string
  scenario_id: string
}

export interface SpiegelRijen {
  meetstaten: MeetstaatRij[]
  delen: GebouwDeelRij[]
  regels: MeetstaatRegelRij[]
  gebruik: MeetstaatGebruikRij[]
}

const tekst = (v: string | undefined | null): string | null => {
  const t = v?.trim()
  return t ? t : null
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** Bibliotheek-ids zijn uuid-kolommen; iets anders zou de hele opslag laten mislukken. */
const uuid = (v: string | undefined | null): string | null => {
  const t = tekst(v)
  return t && UUID.test(t) ? t : null
}

const getal = (v: number | undefined | null): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null

export function spiegelRijen(invoer: SpiegelInvoer, ctx: SpiegelContext): SpiegelRijen {
  const meetstaten = invoer.meetstaten ?? []
  const meetstaatIds = new Set(meetstaten.map(m => m.id))
  // Lege invoerregels bestaan alleen in de browser; regels van een verdwenen meetstaat
  // horen nergens bij.
  const regels = (invoer.meetregels ?? []).filter(r => !r.is_leeg && meetstaatIds.has(r.meetstaat_id))
  const groepOpId = new Map(invoer.groepen.map(g => [g.id, g]))

  const delen = new Map<string, GebouwDeelRij>()
  const voegDeelToe = (g: Groep, parentId: string | null) => {
    const bestaand = delen.get(g.id)
    // Een deel dat ergens als bovenliggend deel dient, blijft bovenaan: zo komt de
    // indeling nooit dieper dan twee niveaus, ongeacht de volgorde van de regels.
    if (bestaand && bestaand.parent_id === null) return
    delen.set(g.id, {
      id: g.id,
      dossier_id: ctx.dossierId,
      object_id: ctx.objectId,
      parent_id: parentId,
      naam: tekst(g.naam) ?? 'Zonder naam',
      volgorde: g.volgorde ?? 0,
    })
  }

  for (const r of regels) {
    const g = groepOpId.get(r.groep_id)
    if (!g) continue
    const ouder = g.parent_id ? groepOpId.get(g.parent_id) : undefined
    if (ouder) {
      voegDeelToe(ouder, null)
      voegDeelToe(g, ouder.id)
    } else {
      voegDeelToe(g, null)
    }
  }

  return {
    meetstaten: meetstaten.map(m => ({
      id: m.id,
      dossier_id: ctx.dossierId,
      object_id: ctx.objectId,
      naam: tekst(m.naam) ?? 'Meetstaat',
      code: m.code ?? '',
      bron: 'eva' as const,
    })),
    delen: [...delen.values()],
    regels: regels.map(r => ({
      id: r.id,
      meetstaat_id: r.meetstaat_id,
      soort: 'schilderwerk' as const,
      deel_id: groepOpId.has(r.groep_id) ? r.groep_id : null,
      volgorde: r.volgorde ?? 0,
      element: tekst(r.element),
      onderdeel_id: uuid(r.onderdeel_id),
      type_id: uuid(r.type_id),
      behandeling_id: uuid(r.behandeling_id),
      onderdeel: tekst(r.onderdeel),
      type: tekst(r.type),
      behandeling: tekst(r.behandeling),
      bestekcode: tekst(r.bestekcode),
      bestek_kenmerk: tekst(r.bestek_kenmerk),
      // `omschrijving` is de oude naam van `opmerking`.
      opmerking: tekst(r.opmerking) ?? tekst(r.omschrijving),
      breedte: getal(r.breedte),
      hoogte: getal(r.hoogte),
      breedte_aantal: getal(r.breedte_aantal),
      hoogte_aantal: getal(r.hoogte_aantal),
      factor: getal(r.factor),
      aantal: getal(r.aantal) ?? 0,
      eenheid: r.eenheid ?? '',
      hoeveelheid_override: getal(r.hoeveelheid_override),
      opgemeten_op: r.aangepast_op || ctx.nu,
      vervallen_op: null,
    })),
    gebruik: meetstaten.map(m => ({
      meetstaat_id: m.id,
      project_id: ctx.projectId,
      scenario_id: m.scenario_id,
    })),
  }
}
