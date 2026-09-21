import 'server-only'
import { createAdminClient } from '@everts/database/server'

import { controleerBouw7Gereed } from './bouw7-gereed'
import { bouwOmschrijvingHtml, bouwTitel } from './omschrijving'
import { splitsBijlagen } from './bijlagen-filter'
import { PLAATSING_NIEUWE_AANVRAAG } from './types'
import type { GekeurdeVelden } from './extractie'

/**
 * mailintake/proef.ts
 *
 * De droogloop: laat zien wat er zou gebeuren, en schrijft niets.
 *
 * De volgorde van de intake is bewust bronnen lezen -> voorvertoning en proef ->
 * expliciet akkoord -> aanmaken -> teruglezen. Die middelste twee stappen
 * ontbraken: EVA maakte aan en keek er daarna niet meer naar om. Drie keer deze
 * week bleek pas op het scherm van de behandelaar dat er iets niet klopte, en één
 * keer stond het al in Bouw7.
 *
 * Wat hier terugkomt is precies wat er verstuurd gaat worden -- dezelfde titel,
 * dezelfde omschrijving, dezelfde bestandenlijst -- zodat de voorvertoning geen
 * benadering is maar het werkelijke voorstel. Na het aanmaken wordt er tegen
 * ditzelfde voorstel teruggelezen; zie `controle.ts`.
 *
 * Alleen leesvragen. Geen enkele schrijfactie, ook niet naar Bouw7.
 */

export interface ProefBestand {
  id: string
  bestandsnaam: string
  grootteBytes: number | null
  contentType: string | null
}

export interface ProefResultaat {
  /** Wat er in het dossier komt te staan, veld voor veld. */
  voorstel: {
    titel: string
    opdrachtgever: { id: string; naam: string | null; bouw7Id: string | null } | null
    contactpersoon: { id: string; naam: string | null } | null
    werkmaatschappij: { id: string; naam: string | null } | null
    categorie: { id: number | null; naam: string | null }
    werkadres: string | null
    aanvraagdatum: string | null
    deadline: string | null
    vveCode: string | null
    referentie: string | null
    mandaatBedrag: number | null
    omschrijvingHtml: string
    /**
     * Waar het dossier terechtkomt, in de woorden van het scherm.
     *
     * Vast voor deze route -- `maakAanvraag` zet altijd Aanvraag/Nieuw en Bouw7
     * altijd "01. Offerte" -- maar daarom juist hier en niet verspreid als losse
     * tekst: de voorvertoning, de terugleescontrole en het beoordeelscherm moeten
     * het over dezelfde plek hebben. Wie beoordeelt hoort te zien waar het heen
     * gaat vóórdat hij klikt.
     */
    plaatsing: { fase: string; substatus: string; bouw7Status: string }
  }
  /** Bestanden die naar de dossiermap gaan. */
  bestanden: ProefBestand[]
  /** Bijlagen die bewust worden overgeslagen, met reden. */
  uitgeslotenBestanden: { bestandsnaam: string; reden: string }[]
  /**
   * Waarom dit niet aangemaakt kan worden. Niet leeg betekent: knop uit. Dit zijn
   * dingen die Bouw7 nodig heeft en die stil een half project zouden opleveren.
   */
  blokkades: string[]
  /**
   * Wat wel kan maar aandacht vraagt. Een mens mag hier doorheen, maar hij moet het
   * gezien hebben -- daar is de voorvertoning voor.
   */
  openPunten: string[]
}

/**
 * Bereidt het aanmaken voor en controleert alles wat vooraf te controleren is.
 *
 * `velden` is wat er op het scherm staat, niet wat de AI oorspronkelijk voorstelde:
 * de behandelaar heeft het laatste woord en de proef hoort over zíjn versie te gaan.
 */
export async function proefAanmaak(
  berichtId: string,
  velden: GekeurdeVelden & {
    relatieId: string | null
    contactpersoonId: string | null
  },
  omschrijving: { scope: string | null; buitenScope: string | null; aandachtspunten: string | null },
): Promise<ProefResultaat> {
  const supabase = createAdminClient()

  const titel = bouwTitel(velden)
  const blokkades: string[] = []
  const openPunten: string[] = []

  // ── Bouw7-gereedheid ───────────────────────────────────────────────────────
  // Deze controle bestond al en is de reden dat er geen projecten zonder klant in
  // Bouw7 belanden. Hij hoort in de voorvertoning te staan, niet alleen in de cron.
  const bouw7 = await controleerBouw7Gereed({
    titel,
    relatieId: velden.relatieId,
    contactpersoonId: velden.contactpersoonId,
    werkmaatschappijId: velden.werkmaatschappijId,
    bouw7CategorieId: velden.bouw7CategorieId,
  })
  blokkades.push(...bouw7.ontbreekt)
  openPunten.push(...bouw7.waarschuwingen)

  // ── De partijen erbij zoeken, zodat de voorvertoning namen toont ───────────
  const [klant, cp, wm] = await Promise.all([
    velden.relatieId
      ? supabase.from('relaties').select('id, naam, bouw7_id').eq('id', velden.relatieId).maybeSingle()
      : Promise.resolve({ data: null }),
    velden.contactpersoonId
      ? supabase.from('contactpersonen').select('id, voornaam, achternaam')
          .eq('id', velden.contactpersoonId).maybeSingle()
      : Promise.resolve({ data: null }),
    velden.werkmaatschappijId
      ? supabase.from('bedrijfsgegevens').select('id, naam').eq('id', velden.werkmaatschappijId).maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  // ── Open punten: wat mag ontbreken, maar wel gezien moet zijn ──────────────
  if (!velden.contactpersoonId) {
    openPunten.push('Er is geen contactpersoon gekoppeld.')
  }
  if (!velden.deadline) {
    openPunten.push('Er staat geen uiterste datum in de aanvraag; het veld blijft leeg.')
  }
  if (!velden.adresBevestigd) {
    openPunten.push('Het werkadres is niet door PDOK bevestigd — controleer straat, postcode en plaats.')
  }
  if (!velden.werkmaatschappijId) {
    openPunten.push('De werkmaatschappij is niet bepaald; kies zelf tussen de schilders en bouw.')
  }
  if (!omschrijving.scope?.trim()) {
    openPunten.push('De scope is leeg — dan komt er geen omschrijving in Bouw7 te staan.')
  }
  if (!omschrijving.buitenScope?.trim()) {
    openPunten.push('Er is niets uitgesloten. Dat is geen fout; het betekent dat de stukken er niets over zeggen.')
  }

  // ── Bestanden ──────────────────────────────────────────────────────────────
  const { data: bijlagen } = await supabase
    .from('mailintake_bijlagen')
    .select('id, bestandsnaam, content_type, grootte_bytes, is_inline, opslag_pad, te_groot')
    .eq('bericht_id', berichtId)
    .order('bestandsnaam')
    .limit(100)

  const kandidaten = (bijlagen ?? []).map(r => ({
    id: r.id,
    bestandsnaam: r.bestandsnaam,
    contentType: r.content_type,
    grootteBytes: r.grootte_bytes,
    isInline: Boolean(r.is_inline),
    opslagPad: r.opslag_pad,
    teGroot: Boolean(r.te_groot),
  }))

  const gesplitst = splitsBijlagen(kandidaten)
  const uitgeslotenBestanden = gesplitst.uitgesloten.map(u => ({
    bestandsnaam: u.bijlage.bestandsnaam,
    reden: u.reden,
  }))

  const bestanden: ProefBestand[] = []
  for (const k of gesplitst.mee) {
    // Zonder opslagpad is er niets te uploaden; dat is geen keuze maar een gebrek,
    // en het hoort daarom bij de open punten en niet bij de uitsluitingen.
    if (!k.opslagPad) {
      openPunten.push(`"${k.bestandsnaam}" is niet opgeslagen en gaat niet mee naar de dossiermap.`)
      continue
    }
    bestanden.push({
      id: k.id,
      bestandsnaam: k.bestandsnaam,
      grootteBytes: k.grootteBytes,
      contentType: k.contentType,
    })
  }

  return {
    voorstel: {
      titel,
      opdrachtgever: klant.data
        ? { id: klant.data.id, naam: klant.data.naam, bouw7Id: klant.data.bouw7_id ?? null }
        : null,
      contactpersoon: cp.data
        ? {
            id: cp.data.id,
            naam: [cp.data.voornaam, cp.data.achternaam].filter(Boolean).join(' ') || null,
          }
        : null,
      werkmaatschappij: wm.data ? { id: wm.data.id, naam: wm.data.naam } : null,
      categorie: { id: velden.bouw7CategorieId, naam: velden.categorieNaam },
      werkadres: [
        [velden.werkadresStraat, velden.werkadresHuisnummer].filter(Boolean).join(' '),
        velden.werkadresPostcode, velden.werkadresStad,
      ].filter(Boolean).join(', ') || null,
      aanvraagdatum: velden.aanvraagdatum,
      deadline: velden.deadline,
      vveCode: velden.vveCode,
      referentie: velden.referentie,
      mandaatBedrag: velden.mandaatBedrag,
      plaatsing: PLAATSING_NIEUWE_AANVRAAG,
      omschrijvingHtml: bouwOmschrijvingHtml({
        scope: omschrijving.scope,
        buitenScope: omschrijving.buitenScope,
        aandachtspunten: [omschrijving.aandachtspunten, velden.opmerkingen]
          .filter(Boolean).join('\n') || null,
      }),
    },
    bestanden,
    uitgeslotenBestanden,
    blokkades,
    openPunten,
  }
}
