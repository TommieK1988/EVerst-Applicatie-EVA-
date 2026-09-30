'use server'

import { createAdminClient } from '@everts/database/server'
import { vereisRecht } from '@/lib/auth/rechten'
import { haalAlleRijen } from '@/lib/supabase/paginate'
import { nlDelen, plusDagen } from '@/lib/planning/nl-tijd'
import { NIET_INGETROKKEN } from './ingetrokken'

/**
 * Wie er op een servicedeskbon aan het werk gaat, en wanneer — voor het middenblok van het
 * Servicedesk-blok op de Bon-pagina.
 *
 * De vraag die dit beantwoordt is "wanneer gebeurt er iets op deze bon?". Het antwoord stond op
 * drie plekken: ingeplande medewerkers in de planning, onderaannemers als planningsactiviteit, en
 * opgedragen onderaannemers als OA-opdracht in de bestellingen. Hier komen die bij elkaar, op
 * datum gesorteerd, met alleen wat je op de bon nodig hebt: wie, wanneer, en of het al vaststaat.
 */

export type UitvoeringSoort = 'medewerker' | 'onderaannemer'

export type UitvoeringRegel = {
  soort: UitvoeringSoort
  naam: string
  /** ISO-datum(tijd) van de eerste dag; null als er nog niets vaststaat. */
  van: string | null
  /** ISO-datum(tijd) van de laatste dag; gelijk aan `van` bij één dag. */
  tot: string | null
  /** Aantal verschillende dagen dat iemand is ingepland (alleen bij planitems). */
  dagen: number | null
  /** Datum in woorden als er geen echte datum is ("week 34"). */
  datumTekst: string | null
  /** Wat er gebeurt: titel van de activiteit of omschrijving van de opdracht. */
  wat: string | null
  /** `ingepland` = in de planning, `opgedragen` = OA-opdracht verstuurd, `concept` = nog niet verstuurd. */
  stand: 'ingepland' | 'opgedragen' | 'concept'
}


/** Kalenderdag in NL-tijd: een planitem van 00:00 staat in UTC op de dag ervoor. */
const dagVan = (ts: string) => nlDelen(ts).datum

/** Alle kalenderdagen die een planitem raakt: één item kan over meerdere dagen lopen. */
function dagenVanItem(start: string, eind: string, in_: Set<string>) {
  const laatste = dagVan(eind)
  let dag = dagVan(start)
  for (let i = 0; i < 366 && dag <= laatste; i++, dag = plusDagen(dag, 1)) in_.add(dag)
}

export async function getServicedeskUitvoering(dossierId: string): Promise<UitvoeringRegel[]> {
  await vereisRecht('dossiers', 'lezen')
  const supabase = createAdminClient()

  // Begrensd door dossier_id: een bon heeft een handvol activiteiten, geen duizend.
  const [{ data: activiteitenRaw }, { data: begrotingenRaw }] = await Promise.all([
    supabase.from('planning_activiteiten')
      .select('id, titel, onderaannemer_id, gewenste_start, deadline')
      .eq('dossier_id', dossierId),
    supabase.from('werkbegrotingen').select('id').eq('dossier_id', dossierId),
  ])
  const activiteiten = (activiteitenRaw ?? []) as {
    id: string; titel: string | null; onderaannemer_id: string | null
    gewenste_start: string | null; deadline: string | null
  }[]
  const begrotingIds = ((begrotingenRaw ?? []) as { id: string }[]).map(b => b.id)

  // Planitems gepagineerd: één item is één medewerker op één dag, dus ook op een bon kan dat
  // oplopen als hij lang openstaat.
  const ids = activiteiten.map(a => a.id)
  const [items, { data: bestellingenRaw }] = await Promise.all([
    ids.length
      ? haalAlleRijen<{ activiteit_id: string; medewerker_id: string | null; start_dt: string; eind_dt: string }>(
          (van, tot) => supabase.from('planning_items')
            .select('activiteit_id, medewerker_id, start_dt, eind_dt')
            .in('activiteit_id', ids)
            .order('id')
            .range(van, tot))
      : Promise.resolve([]),
    begrotingIds.length
      ? supabase.from('werkbegroting_bestellingen')
          .select('omschrijving, relatie_id, status, levering_datum, levering_tekst, oplever_datum')
          .in('werkbegroting_id', begrotingIds)
          .eq('soort', 'oa_contract')
          .is('bouw7_verwijderd_op', null)
          // Ingetrokken = niet meer opgedragen; zonder dit stond hij hier als "concept".
          .or(NIET_INGETROKKEN)
      : Promise.resolve({ data: [] }),
  ])
  const bestellingen = (bestellingenRaw ?? []) as {
    omschrijving: string | null; relatie_id: string | null; status: string | null
    levering_datum: string | null; levering_tekst: string | null; oplever_datum: string | null
  }[]

  // Namen in één keer ophalen.
  const medewerkerIds = [...new Set(items.map(i => i.medewerker_id).filter(Boolean))] as string[]
  const relatieIds = [...new Set([
    ...activiteiten.map(a => a.onderaannemer_id),
    ...bestellingen.map(b => b.relatie_id),
  ].filter(Boolean))] as string[]
  const [{ data: medewerkersRaw }, { data: relatiesRaw }] = await Promise.all([
    medewerkerIds.length
      ? supabase.from('medewerkers').select('id, voornaam, achternaam').in('id', medewerkerIds)
      : Promise.resolve({ data: [] }),
    relatieIds.length
      ? supabase.from('relaties').select('id, naam').in('id', relatieIds)
      : Promise.resolve({ data: [] }),
  ])
  const medewerkerNaam = new Map<string, string>(
    ((medewerkersRaw ?? []) as { id: string; voornaam: string | null; achternaam: string | null }[])
      .map(m => [m.id, [m.voornaam, m.achternaam].filter(Boolean).join(' ') || 'Onbekende medewerker']))
  const relatieNaam = new Map<string, string>(
    ((relatiesRaw ?? []) as { id: string; naam: string | null }[]).map(r => [r.id, r.naam || 'Onbekende relatie']))

  const regels: UitvoeringRegel[] = []

  // 1. Ingeplande medewerkers — per medewerker per activiteit samengevat tot één regel.
  const titelVan = new Map(activiteiten.map(a => [a.id, a.titel]))
  const perMedewerker = new Map<string, { medewerkerId: string; activiteitId: string; van: string; tot: string; dagen: Set<string> }>()
  const activiteitMetItems = new Set<string>()
  for (const it of items) {
    activiteitMetItems.add(it.activiteit_id)
    if (!it.medewerker_id) continue
    const sleutel = `${it.medewerker_id}|${it.activiteit_id}`
    const g = perMedewerker.get(sleutel)
    if (!g) {
      perMedewerker.set(sleutel, {
        medewerkerId: it.medewerker_id, activiteitId: it.activiteit_id,
        van: it.start_dt, tot: it.eind_dt, dagen: new Set(),
      })
      dagenVanItem(it.start_dt, it.eind_dt, perMedewerker.get(sleutel)!.dagen)
    } else {
      if (it.start_dt < g.van) g.van = it.start_dt
      if (it.eind_dt > g.tot) g.tot = it.eind_dt
      dagenVanItem(it.start_dt, it.eind_dt, g.dagen)
    }
  }
  for (const g of perMedewerker.values()) {
    regels.push({
      soort: 'medewerker',
      naam: medewerkerNaam.get(g.medewerkerId) ?? 'Onbekende medewerker',
      van: g.van, tot: g.tot, dagen: g.dagen.size, datumTekst: null,
      wat: titelVan.get(g.activiteitId) ?? null,
      stand: 'ingepland',
    })
  }

  // 2. Onderaannemers als planningsactiviteit (zonder eigen planitems: die tellen hierboven al).
  for (const a of activiteiten) {
    if (!a.onderaannemer_id || activiteitMetItems.has(a.id)) continue
    regels.push({
      soort: 'onderaannemer',
      naam: relatieNaam.get(a.onderaannemer_id) ?? 'Onbekende onderaannemer',
      van: a.gewenste_start, tot: a.deadline ?? a.gewenste_start, dagen: null, datumTekst: null,
      wat: a.titel, stand: 'ingepland',
    })
  }

  // 3. Onderaannemersopdrachten uit de bestellingen.
  for (const b of bestellingen) {
    regels.push({
      soort: 'onderaannemer',
      naam: b.relatie_id ? (relatieNaam.get(b.relatie_id) ?? 'Onbekende onderaannemer') : 'Onderaannemer nog niet gekozen',
      van: b.levering_datum, tot: b.oplever_datum ?? b.levering_datum, dagen: null,
      datumTekst: b.levering_tekst?.trim() || null,
      wat: b.omschrijving,
      stand: b.status === 'concept' ? 'concept' : 'opgedragen',
    })
  }

  // Op datum; wat nog geen datum heeft achteraan.
  return regels.sort((a, b) => {
    if (a.van && b.van) return a.van.localeCompare(b.van)
    if (a.van) return -1
    if (b.van) return 1
    return a.naam.localeCompare(b.naam, 'nl')
  })
}
