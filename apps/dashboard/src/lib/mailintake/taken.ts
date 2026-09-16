/**
 * mailintake/taken.ts
 *
 * De actie die ontstaat als EVA iets voorlegt of zelf iets heeft aangemaakt.
 *
 * WAAROM DIT NAAST maakTaak BESTAAT
 * `maakTaak` (taken/actions/taken.ts) haalt de ingelogde gebruiker op en gooit
 * "Niet ingelogd" zonder sessie. De verwerking draait in een cron en heeft er
 * geen. De bestaande aanroep in aanmaken.ts stond dan ook achter een
 * `.catch(() => {})`: de beloofde controletaak werd nooit aangemaakt en niemand
 * merkte het. Dit bestand is dezelfde handeling op de admin-client, naar het
 * voorbeeld van `maakBeoordeelTaak` in lib/goedkeuring/taken.ts.
 *
 * WAAROM DE ONTDUBBELING OP HET BERICHT ZIT
 * `maakBeoordeelTaak` ontdubbelt op `dossier_id`. Een voorgelegd bericht heeft
 * nog geen dossier, en PostgREST matcht met `eq` geen NULL — elke ronde zou dus
 * een nieuwe taak opleveren voor hetzelfde bericht. Vandaar de eigen kolom
 * `tasks.mailintake_bericht_id`.
 */

import 'server-only'
import { createAdminClient } from '@everts/database/server'
import type { Json } from '@everts/database'

import { meldTaakToegewezen } from '@/lib/taken/meldingen'

export interface IntakeActieInvoer {
  berichtId: string
  titel: string
  /** De medewerker die hem krijgt; meestal de standaard behandelaar van de postbus. */
  medewerkerId: string | null
  /** Alleen gevuld als er al een dossier is. */
  dossierId?: string | null
  prioriteit?: 'laag' | 'normaal' | 'hoog'
  /** Werkdagen vanaf vandaag; standaard 1. */
  dagen?: number
  /** Korte toelichting; komt in de beschrijving van de taak. */
  toelichting?: string | null
}

export interface IntakeActieResultaat {
  taakId: string | null
  /** De taak bestaat, maar hangt aan niemand omdat de medewerker geen EVA-login heeft. */
  zonderOntvanger: boolean
  toegewezenAan: string | null
  bestond: boolean
}

const LEEG: IntakeActieResultaat = {
  taakId: null, zonderOntvanger: true, toegewezenAan: null, bestond: false,
}

/**
 * Maakt één actie voor een intake-bericht. Gooit nooit: een mislukte actie mag
 * een aangemaakt dossier niet onderuithalen. Wat er misging komt terug in het
 * resultaat en hoort in `mailintake_besluiten` te landen.
 */
export async function maakIntakeActie(inv: IntakeActieInvoer): Promise<IntakeActieResultaat> {
  const supabase = createAdminClient()

  try {
    // ── Bestaat hij al? ──────────────────────────────────────────────────────
    const { data: bestaand } = await supabase
      .from('tasks')
      .select('id')
      .eq('mailintake_bericht_id', inv.berichtId)
      .eq('titel', inv.titel)
      .not('status', 'in', '("gereed","vervallen")')
      .limit(1)
      .maybeSingle()

    if (bestaand) {
      return { taakId: bestaand.id, zonderOntvanger: false, toegewezenAan: null, bestond: true }
    }

    // ── Wie krijgt hem? ──────────────────────────────────────────────────────
    let naam: string | null = null
    let authUserId: string | null = null
    if (inv.medewerkerId) {
      const { data: m } = await supabase
        .from('medewerkers')
        .select('voornaam, tussenvoegsel, achternaam, auth_user_id')
        .eq('id', inv.medewerkerId)
        .maybeSingle()
      if (m) {
        naam = [m.voornaam, m.tussenvoegsel, m.achternaam].filter(Boolean).join(' ')
        authUserId = m.auth_user_id ?? null
      }
    }

    const deadline = new Date()
    deadline.setDate(deadline.getDate() + (inv.dagen ?? 1))

    const { data: taak, error } = await supabase
      .from('tasks')
      .insert({
        titel: inv.titel,
        // Zonder dossier is `medewerker_id` de groepskop in de actielijst; laat je
        // hem leeg, dan landt de taak in een naamloze groep.
        medewerker_id: inv.medewerkerId,
        dossier_id: inv.dossierId ?? null,
        mailintake_bericht_id: inv.berichtId,
        status: 'open',
        prioriteit: inv.prioriteit ?? 'normaal',
        deadline: deadline.toISOString().slice(0, 10),
        deadline_handmatig: true,
        assignee_type: 'direct',
        dossier_rollen: [],
        omschrijving: (inv.toelichting
          ? { tekst: inv.toelichting, bron: 'mailintake' }
          : { bron: 'mailintake' }) as Json,
      })
      .select('id')
      .single()

    if (error || !taak) return { ...LEEG, toegewezenAan: naam }

    // ── Toewijzen ────────────────────────────────────────────────────────────
    // Zonder auth-account kan dat niet. De taak blijft wél bestaan: zodra de
    // medewerker een login krijgt, is hij terug te vinden en alsnog toe te wijzen.
    if (authUserId) {
      await supabase.from('task_assignees').insert({
        task_id: taak.id, user_id: authUserId, rol: 'verantwoordelijke',
      })
      await meldTaakToegewezen(taak.id, [authUserId])
    }

    return {
      taakId: taak.id,
      zonderOntvanger: authUserId == null,
      toegewezenAan: naam,
      bestond: false,
    }
  } catch {
    return LEEG
  }
}

/**
 * De standaard behandelaar van een postbus, met de vraag of hij bereikbaar is.
 * Apart, omdat het scherm en de verwerking allebei moeten weten of de actie
 * ergens aankomt.
 */
export async function haalBehandelaar(
  postbusId: string,
): Promise<{ medewerkerId: string | null; naam: string | null; heeftLogin: boolean }> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('mailintake_postbussen')
    .select('standaard_behandelaar_id, behandelaar:medewerkers!mailintake_postbussen_standaard_behandelaar_id_fkey(voornaam, tussenvoegsel, achternaam, auth_user_id)')
    .eq('id', postbusId)
    .maybeSingle()

  const b = (data as { behandelaar?: { voornaam: string | null; tussenvoegsel: string | null; achternaam: string | null; auth_user_id: string | null } | null } | null)?.behandelaar
  return {
    medewerkerId: data?.standaard_behandelaar_id ?? null,
    naam: b ? [b.voornaam, b.tussenvoegsel, b.achternaam].filter(Boolean).join(' ') : null,
    heeftLogin: b?.auth_user_id != null,
  }
}
