/**
 * mailintake/bouw7-gereed.ts
 *
 * Kan er van dit voorstel een net Bouw7-project gemaakt worden?
 *
 * WAAROM DIT BESTAAT
 * `maakBouw7Project` laat velden die leeg zijn gewoon weg uit de body:
 *
 *     if (input.contactBouw7Id) body.contact = { id: input.contactBouw7Id }
 *
 * Bouw7 eist formeel alleen `type` en `status`, dus het project wordt netjes
 * aangemaakt — maar zónder klant. Dat is precies de fout die niemand ziet: EVA
 * meldt "gelukt", er staat een dossiernummer, en pas weken later blijkt dat het
 * Bouw7-project aan niemand hangt. Vier van de ruim zeshonderd actieve relaties
 * hebben vandaag geen `bouw7_id`; zeldzaam genoeg om te vergeten, vaak genoeg om
 * mis te gaan.
 *
 * Hetzelfde geldt voor de branch: Bouw7 kent op basis van de vestiging het
 * projectnummer toe. Geen branch = een projectnummer uit de verkeerde reeks.
 *
 * Deze controle draait dus vóór het aanmaken. Wat niet klopt wordt benoemd in
 * gewone taal, en blokkeert de automatische route — een mens kan het oplossen,
 * een cron niet.
 */

import 'server-only'
import { createAdminClient } from '@everts/database/server'

export interface Bouw7Gereedheid {
  /** Alles wat Bouw7 nodig heeft is aanwezig. */
  gereed: boolean
  /** Wat er mist, in gewone taal. Leeg als alles klopt. */
  ontbreekt: string[]
  branchId: number | null
  klantBouw7Id: number | null
  contactpersoonBouw7Id: number | null
  categorieGeldig: boolean
}

export interface Bouw7GereedInvoer {
  titel: string | null
  relatieId: string | null
  contactpersoonId: string | null
  werkmaatschappijId: string | null
  bouw7CategorieId: number | null
}

/**
 * Controleert de gegevens die Bouw7 nodig heeft.
 *
 * Faalt zacht op de Bouw7-lijsten: is Bouw7 even niet bereikbaar, dan melden we
 * dát in plaats van te doen alsof de categorie ongeldig is. Het verschil telt —
 * "categorie bestaat niet" stuurt iemand op een verkeerd spoor.
 */
export async function controleerBouw7Gereed(inv: Bouw7GereedInvoer): Promise<Bouw7Gereedheid> {
  const supabase = createAdminClient() as any
  const ontbreekt: string[] = []

  if (!(inv.titel ?? '').trim()) ontbreekt.push('Er is geen omschrijving voor de projectnaam.')

  // ── Klant ────────────────────────────────────────────────────────────────
  let klantBouw7Id: number | null = null
  if (!inv.relatieId) {
    ontbreekt.push('Er is nog geen opdrachtgever gekozen.')
  } else {
    const { data: klant } = await supabase
      .from('relaties').select('naam, bouw7_id, actief').eq('id', inv.relatieId).maybeSingle()
    if (!klant) {
      ontbreekt.push('De gekozen opdrachtgever bestaat niet meer.')
    } else if (!klant.bouw7_id) {
      ontbreekt.push(`${klant.naam} staat nog niet in Bouw7 — het project zou zonder klant worden aangemaakt.`)
    } else {
      klantBouw7Id = Number(klant.bouw7_id)
      if (!Number.isFinite(klantBouw7Id)) {
        ontbreekt.push(`Het Bouw7-nummer van ${klant.naam} is onbruikbaar.`)
        klantBouw7Id = null
      }
    }
  }

  // ── Contactpersoon (optioneel, maar als hij er is moet hij kloppen) ──────
  let contactpersoonBouw7Id: number | null = null
  if (inv.contactpersoonId) {
    const { data: cp } = await supabase
      .from('contactpersonen').select('voornaam, achternaam, bouw7_id').eq('id', inv.contactpersoonId).maybeSingle()
    const naam = cp ? [cp.voornaam, cp.achternaam].filter(Boolean).join(' ') : 'De contactpersoon'
    if (!cp) {
      ontbreekt.push('De gekozen contactpersoon bestaat niet meer.')
    } else if (!cp.bouw7_id) {
      // Niet blokkerend: een project zonder contactpersoon is bruikbaar, een
      // project zonder klant niet. Wel melden, want het valt anders niemand op.
      ontbreekt.push(`${naam} staat nog niet in Bouw7; het project krijgt geen contactpersoon.`)
    } else {
      contactpersoonBouw7Id = Number(cp.bouw7_id)
    }
  }

  // ── Werkmaatschappij → branch ────────────────────────────────────────────
  let branchId: number | null = null
  if (!inv.werkmaatschappijId) {
    ontbreekt.push('Er is geen werkmaatschappij gekozen; Bouw7 bepaalt daarop het projectnummer.')
  } else {
    const { data: wm } = await supabase
      .from('bedrijfsgegevens').select('naam, bouw7_branch_id').eq('id', inv.werkmaatschappijId).maybeSingle()
    if (!wm) {
      ontbreekt.push('De gekozen werkmaatschappij bestaat niet meer.')
    } else if (wm.bouw7_branch_id != null) {
      branchId = Number(wm.bouw7_branch_id)
    } else {
      // Zelfde terugval als maakAanvraag: op naam matchen in Bouw7.
      try {
        const { getBouw7Branches } = await import('@/lib/bouw7/create-project')
        const branches = await getBouw7Branches()
        const hit = branches.find(b => b.name === wm.naam)
        if (hit) branchId = hit.id
        else ontbreekt.push(`Werkmaatschappij ${wm.naam} heeft geen vestiging in Bouw7.`)
      } catch {
        ontbreekt.push('Bouw7 is nu niet bereikbaar; de vestiging kon niet worden gecontroleerd.')
      }
    }
  }

  // ── Categorie ────────────────────────────────────────────────────────────
  // Meer dan een formaliteit: de categorie bepaalt of een bon als servicedesk
  // wordt herkend (isServicedeskDossier kijkt naar "Dagelijks onderhoud"/"Mutatie").
  let categorieGeldig = false
  if (inv.bouw7CategorieId == null) {
    ontbreekt.push('Er is geen categorie gekozen.')
  } else {
    try {
      const { getBouw7Categorieen } = await import('@/lib/bouw7/create-project')
      const cats = await getBouw7Categorieen()
      categorieGeldig = cats.some(c => c.id === inv.bouw7CategorieId)
      if (!categorieGeldig) ontbreekt.push('De gekozen categorie bestaat niet (meer) in Bouw7.')
    } catch {
      ontbreekt.push('Bouw7 is nu niet bereikbaar; de categorie kon niet worden gecontroleerd.')
    }
  }

  // Een ontbrekende contactpersoon is hinderlijk, geen blokkade. De rest wél.
  const blokkerend = ontbreekt.filter(m => !m.includes('krijgt geen contactpersoon'))

  return {
    gereed: blokkerend.length === 0,
    ontbreekt,
    branchId,
    klantBouw7Id,
    contactpersoonBouw7Id,
    categorieGeldig,
  }
}
