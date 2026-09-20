'use server'

/**
 * Server-actions voor gespreksnotities op een relatie.
 *
 * Model: `lib/dossiers/notities-actions.ts`. Verschil met die module is de gate — een
 * dossiernotitie hangt aan een dossier en gaat daarom door `assertDossierBewerkbaar`, een
 * relatienotitie hangt aan de relatie en gaat door het recht `relaties`.
 *
 * Alles draait op de admin-client (service-role, bypast RLS): `relatie_notities` heeft RLS
 * aan zonder policies, dus dit is de enige weg naar de tabel. De gate hieronder is dus niet
 * cosmetisch — hij is de enige beveiliging, ook tegen een kale RPC-aanroep op de action.
 *
 * LET OP: elke export in dit bestand moet `async` zijn. Types staan in `./notities-types`.
 */

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@everts/database/server'
import { vereisRecht, GeenToegangError } from '@/lib/auth/rechten'
import type { RelatieNotitie, NotitieResultaat, VerwijderResultaat } from './notities-types'

type NaamVelden = { voornaam: string | null; tussenvoegsel: string | null; achternaam: string | null }

function volledigeNaam(m: NaamVelden | null | undefined): string {
  if (!m) return 'Onbekend'
  return [m.voornaam, m.tussenvoegsel, m.achternaam].filter(Boolean).join(' ').trim() || 'Onbekend'
}

/** Naam van een contactpersoon; `null` blijft `null` (notitie zonder persoon). */
function contactpersoonNaam(c: NaamVelden | null | undefined): string | null {
  if (!c) return null
  return [c.voornaam, c.tussenvoegsel, c.achternaam].filter(Boolean).join(' ').trim() || null
}

/**
 * Beide schermen die een notitie tonen opnieuw laten renderen: de relatiepagina op de desktop
 * en het mobiele klantbeeld. Zonder de tweede zou een notitie die je op kantoor plaatst pas
 * op de telefoon verschijnen na een harde herlaadactie.
 */
function verversBeideSchermen(relatieId: string): void {
  revalidatePath(`/relaties/${relatieId}`)
  revalidatePath(`/m/commercieel/${relatieId}`)
}

/**
 * Notities van één relatie, nieuwste eerst.
 *
 * Begrensd door `.eq('relatie_id', …)`: één klant houdt ruim de 1000 rijen die PostgREST
 * stil afkapt. Groeit dat ooit tegen de grens aan, dan is `.limit()` met een "toon meer"
 * de volgende stap — niet stilzwijgend blijven vertrouwen op de omvang.
 */
export async function getRelatieNotities(relatieId: string): Promise<RelatieNotitie[]> {
  try {
    await vereisRecht('relaties', 'lezen')
  } catch (e) {
    if (e instanceof GeenToegangError) return []
    throw e
  }

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('relatie_notities')
    .select(`
      id, inhoud, created_at, medewerker_id, contactpersoon_id,
      medewerkers(voornaam, tussenvoegsel, achternaam),
      contactpersonen(voornaam, tussenvoegsel, achternaam)
    `)
    .eq('relatie_id', relatieId)
    .order('created_at', { ascending: false })

  if (error || !data) return []

  type Rij = {
    id: string
    inhoud: string
    created_at: string
    medewerker_id: string | null
    contactpersoon_id: string | null
    medewerkers: NaamVelden | null
    contactpersonen: NaamVelden | null
  }

  return (data as unknown as Rij[]).map(r => ({
    id:                  r.id,
    inhoud:              r.inhoud,
    created_at:          r.created_at,
    medewerker_id:       r.medewerker_id,
    auteur_naam:         volledigeNaam(r.medewerkers),
    contactpersoon_id:   r.contactpersoon_id,
    contactpersoon_naam: contactpersoonNaam(r.contactpersonen),
  }))
}

/**
 * Plaats een gespreksnotitie; auteur = de ingelogde medewerker.
 *
 * `contactpersoonId` is optioneel: een gesprek gaat vaak over de klant als geheel. Er wordt
 * bewust niet gecontroleerd of die contactpersoon aan déze relatie hangt — de keuzelijst in
 * de UI komt al uit `getContactpersonenVoorOrganisatie`, en een persoon die intussen naar een
 * andere organisatie is verhuisd hoort de notitie niet te blokkeren.
 */
export async function plaatsRelatieNotitie(
  relatieId: string,
  inhoud: string,
  contactpersoonId?: string | null,
): Promise<NotitieResultaat> {
  const tekst = inhoud.trim()
  if (!tekst) return { ok: false, error: 'Lege notitie' }

  let medewerker
  try {
    ({ medewerker } = await vereisRecht('relaties', 'schrijven'))
  } catch (e) {
    if (e instanceof GeenToegangError) return { ok: false, error: 'Je mag hier geen notitie plaatsen.' }
    throw e
  }

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('relatie_notities')
    .insert({
      relatie_id:        relatieId,
      medewerker_id:     medewerker.id,
      contactpersoon_id: contactpersoonId || null,
      inhoud:            tekst,
    })
    .select('id, inhoud, created_at, medewerker_id, contactpersoon_id')
    .single()

  if (error || !data) return { ok: false, error: error?.message ?? 'Plaatsen mislukt' }

  // De naam van de contactpersoon halen we hier niet nog eens op: de aanroeper koos hem uit
  // een lijst die hij al heeft en vult hem zelf aan. Scheelt een query op het moment dat
  // iemand staat te wachten tot zijn notitie verschijnt.
  verversBeideSchermen(relatieId)
  return {
    ok: true,
    notitie: {
      id:                  data.id,
      inhoud:              data.inhoud,
      created_at:          data.created_at,
      medewerker_id:       data.medewerker_id,
      auteur_naam:         volledigeNaam(medewerker),
      contactpersoon_id:   data.contactpersoon_id,
      contactpersoon_naam: null,
    },
  }
}

/** Verwijder een eigen notitie. De `.eq('medewerker_id', …)` is de handhaving, niet de UI. */
export async function verwijderRelatieNotitie(notitieId: string): Promise<VerwijderResultaat> {
  let medewerker
  try {
    ({ medewerker } = await vereisRecht('relaties', 'schrijven'))
  } catch (e) {
    if (e instanceof GeenToegangError) return { ok: false, error: 'Je mag hier geen notitie verwijderen.' }
    throw e
  }

  const supabase = createAdminClient()

  // Eerst de relatie opzoeken: na het verwijderen is er niets meer om te revalideren.
  const { data: bestaand } = await supabase
    .from('relatie_notities')
    .select('relatie_id')
    .eq('id', notitieId)
    .maybeSingle()

  const { error } = await supabase
    .from('relatie_notities')
    .delete()
    .eq('id', notitieId)
    .eq('medewerker_id', medewerker.id)

  if (error) return { ok: false, error: error.message }

  if (bestaand?.relatie_id) verversBeideSchermen(bestaand.relatie_id)
  return { ok: true }
}
