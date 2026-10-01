'use server'

/**
 * Wat een bestaand dossier aan het intakeformulier kan geven.
 *
 * WAAROM DIT BESTAAT
 * Zodra de mail bij een bestaand dossier hoort -- meerwerk op een lopende opdracht,
 * of een opdracht op een offerte -- staan opdrachtgever, werkadres, categorie,
 * werkmaatschappij en de rollen daar allang in. Het scherm vond dat dossier wel,
 * maar deed er niets mee: je zat velden na te lopen die het dossier zelf had kunnen
 * invullen, en liep het risico er iets anders in te zetten dan er op het dossier
 * staat.
 *
 * Dit is leeswerk. Het dossier blijft leidend: wat hier binnenkomt vult het scherm,
 * maar bevestigen schrijft die waarden niet terug. Wijkt de mail af, dan kleurt het
 * veld oranje met beide waarden -- dat is een signaal om naar te kijken, geen stille
 * overschrijving van een lopend dossier.
 */

import { createAdminClient } from '@everts/database/server'

import { vereisRecht } from '@/lib/auth/rechten'

export interface DossierOvername {
  dossierId: string
  dossiernummer: string | null
  titel: string | null
  hoofdstatus: string | null

  klantId: string | null
  klantNaam: string | null
  contactpersoonId: string | null
  contactpersoonNaam: string | null

  werkadresStraat: string | null
  werkadresHuisnummer: string | null
  werkadresPostcode: string | null
  werkadresStad: string | null
  werkadresNaam: string | null
  werkadresTelefoon: string | null
  werkadresEmail: string | null

  categorieId: number | null
  categorieNaam: string | null
  werkmaatschappijId: string | null
  vveCode: string | null
  referentie: string | null
  deadline: string | null
  objectId: string | null

  rollen: {
    project_manager_id: string | null
    teamleider_id: string | null
    werkvoorbereider_id: string | null
    calculator_id: string | null
    uitvoerder_id: string | null
    controller_id: string | null
  }
}

/**
 * Haalt de gegevens van een dossier op om het formulier mee te vullen.
 *
 * Leest alleen; `null` als het dossier niet bestaat. Bewust zonder embeds op
 * `relaties`: tussen die tabellen lopen meerdere sleutels en een dubbelzinnige embed
 * geeft een PostgREST-fout die er als "niets gevonden" uitziet.
 */
export async function getDossierOvername(dossierId: string): Promise<DossierOvername | null> {
  await vereisRecht('mailintake', 'lezen')
  const supabase = createAdminClient()

  const { data: d } = await supabase
    .from('dossiers')
    .select('id, dossiernummer, titel, hoofdstatus, klant_id, contactpersoon_id, object_id, werkadres_straat, werkadres_huisnummer, werkadres_postcode, werkadres_stad, werkadres_naam, werkadres_telefoon, werkadres_email, bouw7_categorie_id, bouw7_categorie_naam, werkmaatschappij_id, vve_code, referentie, deadline, project_manager_id, teamleider_id, werkvoorbereider_id, calculator_id, uitvoerder_id, controller_id')
    .eq('id', dossierId)
    .maybeSingle()

  if (!d) return null

  const [klant, cp] = await Promise.all([
    d.klant_id
      ? supabase.from('relaties').select('naam').eq('id', d.klant_id).maybeSingle()
      : Promise.resolve({ data: null }),
    d.contactpersoon_id
      ? supabase.from('contactpersonen')
          .select('voornaam, achternaam').eq('id', d.contactpersoon_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  return {
    dossierId: d.id,
    dossiernummer: d.dossiernummer ?? null,
    titel: d.titel ?? null,
    hoofdstatus: d.hoofdstatus ?? null,

    klantId: d.klant_id ?? null,
    klantNaam: (klant.data as { naam?: string } | null)?.naam ?? null,
    contactpersoonId: d.contactpersoon_id ?? null,
    contactpersoonNaam: cp.data
      ? [(cp.data as { voornaam?: string }).voornaam, (cp.data as { achternaam?: string }).achternaam]
          .filter(Boolean).join(' ') || null
      : null,

    werkadresStraat: d.werkadres_straat ?? null,
    werkadresHuisnummer: d.werkadres_huisnummer ?? null,
    werkadresPostcode: d.werkadres_postcode ?? null,
    werkadresStad: d.werkadres_stad ?? null,
    werkadresNaam: d.werkadres_naam ?? null,
    werkadresTelefoon: d.werkadres_telefoon ?? null,
    werkadresEmail: d.werkadres_email ?? null,

    categorieId: d.bouw7_categorie_id ?? null,
    categorieNaam: d.bouw7_categorie_naam ?? null,
    werkmaatschappijId: d.werkmaatschappij_id ?? null,
    vveCode: d.vve_code ?? null,
    referentie: d.referentie ?? null,
    deadline: d.deadline ?? null,
    objectId: d.object_id ?? null,

    rollen: {
      project_manager_id: d.project_manager_id ?? null,
      teamleider_id: d.teamleider_id ?? null,
      werkvoorbereider_id: d.werkvoorbereider_id ?? null,
      calculator_id: d.calculator_id ?? null,
      uitvoerder_id: d.uitvoerder_id ?? null,
      controller_id: d.controller_id ?? null,
    },
  }
}
