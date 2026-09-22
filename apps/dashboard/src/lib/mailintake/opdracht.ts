/**
 * mailintake/opdracht.ts
 *
 * De route "er komt een opdracht binnen op een offerte die wij hebben uitgebracht".
 *
 * Dit is de enige route in deze module die een dossier verandert dat al loopt, en
 * de gevolgen reiken tot in Bouw7: de projectstatus schuift op naar "02. Nieuwe
 * opdracht", de werkbegroting wordt overgenomen als planningsbudget en de
 * aanneemsom gaat de deur uit. Er is geen weg terug. Vandaar de volgorde
 * hieronder, en vandaar dat stap 1 een harde poort is.
 *
 * Waarom hier geen `vereisRecht` staat: dit is een bibliotheekmodule, geen server
 * action. De rechtencontrole hoort bij de ingang — `actions.ts` doet hem voor de
 * knop. Let wel: wie `mailintake:schrijven` heeft, kan hiermee een offerte op
 * gewonnen zetten en een Bouw7-projectstatus wijzigen. Dat is de bedoelde
 * handeling, maar het is wel een recht dat verder reikt dan de mailbox.
 */

import 'server-only'
import { createAdminClient } from '@everts/database/server'
import type { Json } from '@everts/database'

import { maakTermijnschemaUitOfferte } from '@/lib/dossiers/termijnen-bron'

import { zetBijlagenInSharePoint } from './aanmaken'
import { planNabehandeling, voerNabehandelingUit } from './nabehandeling'
import { maakIntakeActie } from './taken'

export interface OpdrachtInvoer {
  berichtId: string
  /** Het dossier in de offertefase dat gewonnen wordt. */
  dossierId: string
  /** De medewerker die op de knop drukte; null bij de automatische route. */
  medewerkerId: string | null
  /** De standaard behandelaar van de postbus; krijgt de acties die hieruit volgen. */
  behandelaarId: string | null
  opdrachtReferentie?: string | null
  /** Datum van de opdracht zelf; standaard de ontvangstdatum van de mail. */
  opdrachtdatum?: string | null
  /** Opmerkingen van de klant; worden een notitie op het dossier. */
  klantOpmerkingen?: string | null
  /** Een afwijkend factuuradres bij dezelfde opdrachtgever. */
  factuuradresId?: string | null
  /**
   * Zet de uit de mail herkende contactpersoon ook op het dossier. Standaard niet:
   * de offerte heeft zijn eigen contactpersoon en die is meestal de juiste. Wie de
   * opdracht stuurt is dat lang niet altijd -- soms is het de administratie.
   */
  contactpersoonOpDossier?: boolean
  /**
   * De opdracht wordt op nacalculatie afgerekend. Zet de facturatiemethode op regie
   * en houdt de aanneemsom uit Bouw7 -- een vaste prijs zou daar een bedrag
   * suggereren dat niemand heeft afgesproken.
   */
  regie?: boolean
  relatieId?: string | null
  contactpersoonId?: string | null
  /**
   * Het werkadres zoals het in de mail stond, inclusief wie er ter plaatse te
   * bereiken is. Vult op het bestaande dossier alleen de lege velden aan.
   */
  werkadres?: {
    straat: string | null
    huisnummer: string | null
    postcode: string | null
    stad: string | null
    naam: string | null
    telefoon: string | null
    email: string | null
  } | null
  /**
   * Anderen die in de opdracht genoemd worden, met hun rol. Worden opgezocht tussen
   * de contactpersonen van de klant; wie daar niet tussen staat wordt gemeld, niet
   * aangemaakt.
   */
  betrokkenen?: { naam: string; rol: string | null; email: string | null; telefoon: string | null }[]
  /**
   * Bouw7 heeft de substatus intussen zelf omgezet. Alleen true na een expliciete
   * tweede klik van een mens — nooit vanuit de automatische route.
   */
  forceerBouw7?: boolean
}

export interface OpdrachtResultaat {
  ok: boolean
  error?: string
  /** Bouw7 gaf een conflict met de tweede app; het scherm biedt dan "toch doorzetten". */
  conflict?: { bouw7Label: string }
  dossiernummer?: string | null
  /** Wat er ná de statuswissel wel en niet lukte. Nooit blokkerend. */
  nazorg?: {
    termijnen: 'aangemaakt' | 'overgeslagen' | 'mislukt'
    termijnenReden?: string
    bijlagen: number
    notitie: boolean
  }
}

/**
 * Controleert of dit dossier gewonnen kán worden.
 *
 * `aanvraag_substatus` is een enum zonder waarde 'gewonnen'. Zonder deze poort zou
 * een opdracht op een dossier dat nog in de aanvraagfase staat een rauwe
 * databasefout opleveren in plaats van een leesbare melding.
 */
export async function toetsOfferteDossier(dossierId: string): Promise<
  {
    ok: true
    dossiernummer: string | null
    titel: string | null
    /** Wat er nú op dit dossier staat -- het scherm zet dat naast wat de mail zegt. */
    contactpersoonId: string | null
    contactpersoonNaam: string | null
    factuuradresLabel: string | null
    werkadres: string | null
  }
  | { ok: false; error: string }
> {
  const supabase = createAdminClient()
  // Bewust zonder embeds: tussen deze tabellen lopen meerdere sleutels, en een
  // dubbelzinnige embed geeft PostgREST-fout 300 die er als "niets gevonden" uitziet.
  // Twee losse lookups op een id zijn hier goedkoper dan die valkuil.
  const { data: d } = await supabase
    .from('dossiers')
    .select('dossiernummer, titel, hoofdstatus, offerte_substatus, opdracht_substatus, werkadres_straat, werkadres_postcode, werkadres_stad, contactpersoon_id, factuuradres_id')
    .eq('id', dossierId)
    .maybeSingle()

  if (!d) return { ok: false, error: 'Dat dossier bestaat niet (meer).' }

  if (d.hoofdstatus === 'opdracht') {
    return {
      ok: false,
      error: `${d.dossiernummer ?? 'Dit dossier'} staat al op opdracht. Koppel de mail eraan in plaats van hem opnieuw te winnen.`,
    }
  }
  if (d.hoofdstatus !== 'offerte') {
    return {
      ok: false,
      error: `${d.dossiernummer ?? 'Dit dossier'} staat nog in de aanvraagfase. Er is nog geen offerte om te winnen — zet hem eerst op verzonden.`,
    }
  }
  const cp = d.contactpersoon_id
    ? (await supabase.from('contactpersonen')
        .select('voornaam, achternaam').eq('id', d.contactpersoon_id).maybeSingle()).data
    : null
  const fa = d.factuuradres_id
    ? (await supabase.from('relatie_factuuradressen')
        .select('label, straat, plaats').eq('id', d.factuuradres_id).maybeSingle()).data
    : null
  return {
    ok: true,
    dossiernummer: d.dossiernummer ?? null,
    titel: d.titel ?? null,
    contactpersoonId: d.contactpersoon_id ?? null,
    contactpersoonNaam: cp ? [cp.voornaam, cp.achternaam].filter(Boolean).join(' ') || null : null,
    factuuradresLabel: fa
      ? [fa.label, fa.straat, fa.plaats].filter(Boolean).join(' · ') || null
      : null,
    werkadres: [d.werkadres_straat, d.werkadres_postcode, d.werkadres_stad].filter(Boolean).join(', ') || null,
  }
}

/**
 * Zet de offerte op gewonnen en maakt de opdracht compleet.
 *
 * Volgorde is bewust: eerst de poort, dan de statuswissel (het enige dat écht moet
 * slagen), daarna de aanvullingen. Alles ná de statuswissel is best-effort — een
 * mislukte notitie of een ontbrekend termijnschema mag een gewonnen opdracht niet
 * terugdraaien, want dat kán ook niet: de Bouw7-write is dan al gedaan.
 */
export async function zetOfferteGewonnenUitBericht(inv: OpdrachtInvoer): Promise<OpdrachtResultaat> {
  const supabase = createAdminClient()

  // ── 1. Poort ──────────────────────────────────────────────────────────────
  const toets = await toetsOfferteDossier(inv.dossierId)
  if (!toets.ok) return { ok: false, error: toets.error }

  // ── 2. De statuswissel ────────────────────────────────────────────────────
  // `updateDossierSubstatus` gooit bij een afgesloten dossier (assertDossierBewerkbaar)
  // in plaats van een resultaat terug te geven. Zonder deze try zou dat als een
  // onbegrijpelijke fout in de cron belanden.
  const { updateDossierSubstatus } = await import('@/lib/dossiers/actions')
  let wissel: Awaited<ReturnType<typeof updateDossierSubstatus>>
  try {
    wissel = await updateDossierSubstatus(inv.dossierId, 'gewonnen', {
      schrijfBouw7: true,
      forceerBouw7: inv.forceerBouw7 === true,
      slaAanneemsomOver: inv.regie === true,
    })
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }

  if (!wissel.ok) {
    await logBesluit(inv, 'offerte_winnen_mislukt', {
      fout: wissel.error, conflict: wissel.conflict?.bouw7Label ?? null,
    })
    return { ok: false, error: wissel.error, conflict: wissel.conflict }
  }

  // Vanaf hier staat het dossier op opdracht. Wat hierna misgaat wordt gemeld,
  // niet teruggedraaid.
  const nazorg: NonNullable<OpdrachtResultaat['nazorg']> = {
    termijnen: 'overgeslagen', bijlagen: 0, notitie: false,
  }

  // ── 2b. Regie ─────────────────────────────────────────────────────────────
  if (inv.regie) {
    const { updateServicedeskInstellingen } = await import('@/lib/dossiers/servicedesk')
    await updateServicedeskInstellingen(inv.dossierId, { facturatiemethode: 'regie' })
      .catch(() => undefined)
  }

  // ── 3. Opdrachtdatum ──────────────────────────────────────────────────────
  // De trigger zet hem op nu; de opdracht is meestal eerder gedateerd.
  if (inv.opdrachtdatum) {
    await supabase.from('dossiers')
      .update({ opdrachtdatum: inv.opdrachtdatum })
      .eq('id', inv.dossierId)
      .then(() => undefined, () => undefined)
  }

  // ── 4. Referentie en factuuradres ─────────────────────────────────────────
  const velden: Record<string, string | null> = {}
  if (inv.opdrachtReferentie) velden.opdracht_referentie = inv.opdrachtReferentie
  if (inv.factuuradresId !== undefined) velden.factuuradres_id = inv.factuuradresId ?? null
  if (inv.contactpersoonOpDossier && inv.contactpersoonId) {
    velden.contactpersoon_id = inv.contactpersoonId
  }
  if (Object.keys(velden).length) {
    const { updateDossierInfo } = await import('@/lib/dossiers/actions')
    await updateDossierInfo(inv.dossierId, velden).catch(() => undefined)
  }

  // ── 4b. Werkadres aanvullen ──────────────────────────────────
  // Een opdrachtbon noemt bijna altijd wie je ter plaatse moet hebben, en dat stond
  // nergens in het dossier. Vult alleen lege velden; een adres dat er al staat
  // blijft staan, want een afwijkend adres in de mail is vaker een tweede locatie
  // dan een correctie. Zie `werkadres-aanvullen.ts`.
  const { vulWerkadresAan } = await import('./werkadres-aanvullen')
  const adres = inv.werkadres
    ? await vulWerkadresAan(inv.dossierId, inv.werkadres)
        .catch(() => ({ gevuld: {}, overgeslagen: ['aanvullen mislukt'] }))
    : { gevuld: {}, overgeslagen: [] }

  if (Object.keys(adres.gevuld).length || adres.overgeslagen.length) {
    await supabase.from('mailintake_besluiten').insert({
      bericht_id: inv.berichtId, actor: 'systeem', actie: 'werkadres_aangevuld',
      details: { dossier_id: inv.dossierId, ...adres } as unknown as Json,
    })
  }

  // ── 4c. Betrokkenen aanvullen ─────────────────────────────
  // Dezelfde bon noemt meestal nog een paar mensen met een rol: de technisch
  // manager van de VvE, de opzichter, de melder. Alleen wie al contactpersoon is
  // bij deze klant wordt toegevoegd; EVA maakt niemand aan.
  const { vulBetrokkenenAan } = await import('./betrokkenen-aanvullen')
  const betrokkenen = inv.betrokkenen?.length
    ? await vulBetrokkenenAan({
        dossierId: inv.dossierId,
        relatieId: inv.relatieId ?? null,
        genoemd: inv.betrokkenen,
      }).catch(() => null)
    : null

  if (betrokkenen && (betrokkenen.toegevoegd.length || betrokkenen.nietGevonden.length)) {
    await supabase.from('mailintake_besluiten').insert({
      bericht_id: inv.berichtId, actor: 'systeem', actie: 'betrokkenen_aangevuld',
      details: { dossier_id: inv.dossierId, ...betrokkenen } as unknown as Json,
    })
  }

  // ── 5. Notitie met wat de klant erbij schreef ─────────────────────────────
  // Rechtstreekse insert: `plaatsDossierNotitie` eist een sessie, en die is er in
  // de automatische route niet. `medewerker_id` blijft leeg, net als bij de sync.
  const opmerking = (inv.klantOpmerkingen ?? '').trim()
  if (opmerking) {
    const { error } = await supabase.from('dossier_notities').insert({
      dossier_id: inv.dossierId,
      medewerker_id: inv.medewerkerId,
      inhoud: `Opmerking van de opdrachtgever bij de opdracht:\n\n${opmerking.slice(0, 4000)}`,
    })
    nazorg.notitie = !error
  }

  // ── 6. Bijlagen naar de dossiermap ────────────────────────────────────────
  const bijlagen = await zetBijlagenInSharePoint(inv.berichtId, inv.dossierId)
    .catch(() => ({ geuploaded: 0, mislukt: 0, fout: 'onbekend' }))
  nazorg.bijlagen = bijlagen.geuploaded

  // ── 7. Verkooptermijnen ───────────────────────────────────────────────────
  const termijnen = await maakTermijnschemaUitOfferte(inv.dossierId)
  if (termijnen.ok) {
    nazorg.termijnen = 'aangemaakt'
  } else if (termijnen.reden === 'bestaat_al') {
    nazorg.termijnen = 'overgeslagen'
    nazorg.termijnenReden = termijnen.error
  } else {
    nazorg.termijnen = 'mislukt'
    nazorg.termijnenReden = termijnen.error
    // Geen termijnen betekent dat er later niet gefactureerd kan worden. Dat mag
    // niet alleen in een logboek belanden.
    //
    // Op de rol van projectleider en niet op een persoon. Bij een verse opdracht is
    // die rol vaak nog leeg -- de actie staat dan gewoon op het dossier, en zodra er
    // een projectleider aan wordt gekoppeld komt hij vanzelf op diens naam. Hem nu
    // aan de intakebehandelaar geven zou betekenen dat de termijnen blijven liggen
    // bij iemand die het dossier daarna niet meer ziet.
    await maakIntakeActie({
      berichtId: inv.berichtId,
      dossierId: inv.dossierId,
      medewerkerId: inv.behandelaarId,
      rollen: ['project_manager_id'],
      titel: `Verkooptermijnen instellen voor ${toets.dossiernummer ?? 'deze opdracht'}`,
      toelichting: [
        `EVA kon de termijnen niet zelf aanmaken: ${termijnen.error}`,
        '',
        'Zonder termijnschema kan er op deze opdracht niet gefactureerd worden.',
        'Stel het in op het tabblad Financieel zodra de betalingsafspraak bekend is.',
      ].join('\n'),
      prioriteit: 'hoog',
      dagen: 2,
    })
  }

  // ── 8. Het bericht afronden ───────────────────────────────────────────────
  await supabase.from('mailintake_berichten').update({
    status: 'verwerkt',
    besluit: 'offerte_gewonnen',
    dossier_id: inv.dossierId,
    // koppelAanDossier liet deze twee leeg, waardoor een afgehandeld opdrachtbericht
    // achteraf geen klant meer toonde.
    relatie_id: inv.relatieId ?? null,
    contactpersoon_id: inv.contactpersoonId ?? null,
    behandeld_door: inv.medewerkerId,
    behandeld_op: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('id', inv.berichtId)

  await supabase.from('mailintake_duplicaat_kandidaten')
    .update({ gekozen: true })
    .eq('bericht_id', inv.berichtId)
    .eq('dossier_id', inv.dossierId)

  await logBesluit(inv, 'offerte_gewonnen', {
    dossier_id: inv.dossierId,
    dossiernummer: toets.dossiernummer,
    bouw7: wissel.bouw7?.ok ?? null,
    aanneemsom: wissel.aanneemsom?.ok ?? null,
    automatisch: inv.medewerkerId == null,
    nazorg,
  })

  // ── 9. Outlook ────────────────────────────────────────────────────────────
  await planNabehandeling(inv.berichtId)
  await voerNabehandelingUit(inv.berichtId).catch(() => undefined)

  return { ok: true, dossiernummer: toets.dossiernummer, nazorg }
}

async function logBesluit(
  inv: OpdrachtInvoer,
  actie: string,
  details: Record<string, unknown>,
): Promise<void> {
  const supabase = createAdminClient()
  await supabase.from('mailintake_besluiten').insert({
    bericht_id: inv.berichtId,
    actor: inv.medewerkerId ? 'medewerker' : 'systeem',
    medewerker_id: inv.medewerkerId,
    actie,
    details: details as Json,
  }).then(() => undefined, () => undefined)
}
