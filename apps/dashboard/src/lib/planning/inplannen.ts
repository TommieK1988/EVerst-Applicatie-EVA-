'use server'

/**
 * planning/inplannen.ts
 *
 * Direct iemand op een bon zetten, zonder eerst de detailplanning te openen.
 *
 * Op een servicedeskbon is inplannen één handeling: die man, die dag, klaar. De weg via de
 * Medewerkerplanning vraagt eerst om het juiste bord, dan om de juiste week, dan om de juiste rij
 * — drie keer navigeren voordat je bent waar je wilde zijn. Dit bestand levert wat een venster op
 * de bon nodig heeft: wie er te kiezen valt, en of die persoon op dat moment al ergens staat.
 *
 * Het aanmaken zelf gaat via `maakSnelPlanningItem`; die kent de activiteitenstructuur, de
 * budgetbewaking en de spiegel naar Bouw7. Hier wordt niets van dat alles nagebouwd.
 */

import { createAdminClient } from '@everts/database/server'
import { vereisRecht } from '@/lib/auth/rechten'
import { logFout, foutNaarInvoer } from '@/lib/fouten/log'
import type { MedewerkerAfwezigheidType } from '@everts/database/platform-types'

/** De afdeling waarvan de mensen op het planbord staan — gelijk aan de Medewerkerplanning. */
const PLANBARE_AFDELING = 'Uitvoering'

export type InplanMedewerker = { id: string; naam: string; functie: string | null }
export type InplanUursoort = { id: string; naam: string }

export type InplanGegevens = {
  medewerkers: InplanMedewerker[]
  uursoorten: InplanUursoort[]
}

/** Wie je kunt inplannen en op welke uursoort. Klein genoeg om in één keer op te halen. */
export async function haalInplanGegevens(): Promise<InplanGegevens> {
  await vereisRecht('planning', 'lezen')
  const supabase = createAdminClient()
  const [mw, us] = await Promise.all([
    supabase.from('medewerkers')
      .select('id, voornaam, tussenvoegsel, achternaam, functie, afdeling')
      .eq('actief', true).eq('afdeling', PLANBARE_AFDELING)
      .order('achternaam'),
    supabase.from('planning_uursoorten').select('id, naam').eq('actief', true).order('naam'),
  ])

  type MwRij = {
    id: string; voornaam: string | null; tussenvoegsel: string | null
    achternaam: string | null; functie: string | null
  }

  const medewerkers = ((mw.data ?? []) as MwRij[]).map(m => ({
    id: m.id,
    naam: [m.voornaam, m.tussenvoegsel, m.achternaam].filter(Boolean).join(' ').trim() || 'Naamloos',
    functie: m.functie,
  }))

  return {
    medewerkers,
    uursoorten: ((us.data ?? []) as InplanUursoort[]).map(u => ({ id: u.id, naam: u.naam })),
  }
}

export type BezetReden =
  /** Staat al op werk — op deze bon of op een andere. */
  | { soort: 'planitem'; omschrijving: string; van: string; tot: string; zelfdeBon: boolean }
  /** Verlof, ziek, training: de persoon is er niet. */
  | { soort: 'afwezig'; omschrijving: string; van: string; tot: string }

export type BezetStand = { vrij: boolean; redenen: BezetReden[] }

const AFWEZIGHEID_LABEL: Record<MedewerkerAfwezigheidType, string> = {
  verlof: 'Verlof', ziek: 'Ziek', training: 'Training', overig: 'Afwezig',
}

/**
 * Staat deze medewerker op dit moment al ergens?
 *
 * Kijkt naar twee dingen die elkaar uitsluiten met nieuw werk: bestaande planitems die in tijd
 * overlappen, en vastgelegde afwezigheid. Het antwoord **blokkeert niets** — het is een
 * waarschuwing. Dubbel inplannen komt in de praktijk bewust voor (twee korte klussen op één dag,
 * een half uur uitloop), en een bon die niet ingepland kán worden omdat het systeem iets
 * strenger is dan de werkelijkheid helpt niemand. Zien wat er al staat is genoeg.
 *
 * Een overlap met een planitem op dezelfde bon wordt apart gemarkeerd: dat is bijna altijd de
 * bedoeling (dezelfde man, dezelfde dag, tweede regel) en hoort niet als botsing te voelen.
 */
export async function haalBezetStand(invoer: {
  medewerkerId: string
  startDt: string
  eindDt: string
  /** De bon waarvoor je inplant; overlap met deze bon telt als "eigen werk". */
  dossierId: string
}): Promise<BezetStand> {
  await vereisRecht('planning', 'lezen')
  try {
    const supabase = createAdminClient()
    const start = new Date(invoer.startDt)
    const eind = new Date(invoer.eindDt)
    if (Number.isNaN(start.getTime()) || Number.isNaN(eind.getTime()) || eind <= start) {
      return { vrij: true, redenen: [] }
    }

    // Overlap = begint vóór het eind én eindigt ná het begin. Begrensd op één medewerker en een
    // tijdvak van hooguit een paar dagen, dus ruim onder de PostgREST-grens.
    const [items, afwezig] = await Promise.all([
      supabase.from('planning_items')
        .select('start_dt, eind_dt, planning_activiteiten!activiteit_id ( titel, dossier_id, dossiers!dossier_id ( titel, dossiernummer ) )')
        .eq('medewerker_id', invoer.medewerkerId)
        .lt('start_dt', eind.toISOString())
        .gt('eind_dt', start.toISOString())
        .order('start_dt')
        .limit(50),
      supabase.from('medewerker_afwezigheid')
        .select('type, start_datum, eind_datum, opmerking')
        .eq('medewerker_id', invoer.medewerkerId)
        .lte('start_datum', eind.toISOString().slice(0, 10))
        .gte('eind_datum', start.toISOString().slice(0, 10))
        .order('start_datum')
        .limit(20),
    ])

    type ItemRij = {
      start_dt: string; eind_dt: string
      planning_activiteiten: {
        titel: string | null; dossier_id: string | null
        dossiers: { titel: string | null; dossiernummer: string | null } | null
      } | null
    }
    type AfwRij = {
      type: MedewerkerAfwezigheidType; start_datum: string; eind_datum: string
      opmerking: string | null
    }

    const redenen: BezetReden[] = []

    for (const r of ((items.data ?? []) as unknown as ItemRij[])) {
      const act = r.planning_activiteiten
      const d = act?.dossiers ?? null
      const bon = d ? [d.dossiernummer, d.titel].filter(Boolean).join(' ') : null
      redenen.push({
        soort: 'planitem',
        omschrijving: [act?.titel, bon].filter(Boolean).join(' — ') || 'Ingepland werk',
        van: r.start_dt, tot: r.eind_dt,
        zelfdeBon: act?.dossier_id === invoer.dossierId,
      })
    }

    for (const a of ((afwezig.data ?? []) as AfwRij[])) {
      redenen.push({
        soort: 'afwezig',
        omschrijving: [AFWEZIGHEID_LABEL[a.type], a.opmerking].filter(Boolean).join(' — '),
        van: a.start_datum, tot: a.eind_datum,
      })
    }

    return { vrij: redenen.every(r => r.soort === 'planitem' && r.zelfdeBon), redenen }
  } catch (e) {
    // Mislukt de controle, dan is "vrij" het veilige antwoord: de waarschuwing blokkeert toch
    // niets, en een venster dat niet meer werkt omdat een bijvraag struikelde is erger.
    await logFout(foutNaarInvoer(e, { omgeving: 'server', bron: 'planning/bezet-stand' }))
    return { vrij: true, redenen: [] }
  }
}
