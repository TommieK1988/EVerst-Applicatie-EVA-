/**
 * mailintake/duplicaten.ts
 *
 * "Staat dit al ingeschreven?" — de controle die vóór elk aanmaken draait, ook
 * wanneer een mens het doet.
 *
 * De aanleiding is een reëel probleem: dezelfde klus komt twee keer binnen (de
 * beheerder mailt, de VvE mailt ook), of iemand stuurt een herinnering op een
 * aanvraag die al loopt. Zonder deze controle staan er dan twee dossiers, twee
 * Bouw7-projecten en twee calculaties.
 *
 * BEGRENSDE QUERIES
 * Dit is precies het soort zoekopdracht dat ongemerkt tegen de PostgREST-grens van
 * 1000 rijen loopt. Daarom wordt er nooit breed geselecteerd: er zijn drie smalle
 * ingangen (klant, adres, referentie) die elk apart worden opgehaald en daarna
 * samengevoegd. Wie hier een filter weghaalt, krijgt stil een half antwoord.
 */

import 'server-only'
import { createAdminClient } from '@everts/database/server'

import { gelijkenis, normaliseerNaam } from './afzender'
import { adresOvereenkomst } from './regels'
import { DUPLICAAT_HARD, DUPLICAAT_TWIJFEL, type DuplicaatSoort } from './types'

export interface DuplicaatInvoer {
  berichtId: string
  relatieId: string | null
  onderwerp: string | null
  omschrijving: string | null
  straat: string | null
  postcode: string | null
  huisnummer: string | null
  referentie: string | null
  onzeReferentie: string | null
  bedrag: number | null
  bodyTekst: string | null
  conversationId: string | null
  /** sha256 van de niet-inline bijlagen. */
  bijlageHashes: string[]
}

export interface DuplicaatResultaat {
  score: number
  soort: DuplicaatSoort
  dossierId: string
  dossiernummer: string | null
  titel: string | null
  klantnaam: string | null
  hoofdstatus: string | null
  substatus: string | null
  redenen: string[]
}

const DOSSIER_SELECT =
  'id, dossiernummer, titel, klant_id, referentie, hoofdstatus, aanvraag_substatus, ' +
  'offerte_substatus, opdracht_substatus, werkadres_straat, werkadres_postcode, werkadres_huisnummer, ' +
  'bedrag_excl_btw, created_at, klant:relaties!dossiers_klant_id_fkey(naam)'

/** 18 maanden terug; ouder werk is geen lopende aanvraag meer. */
function vensterVanaf(): string {
  const d = new Date()
  d.setMonth(d.getMonth() - 18)
  return d.toISOString()
}

function normaliseerPostcode(pc: string | null | undefined): string | null {
  const m = (pc ?? '').replace(/\s+/g, '').toUpperCase().match(/^(\d{4})([A-Z]{2})$/)
  return m ? `${m[1]} ${m[2]}` : null
}

/**
 * Maakt een waarde veilig voor een PostgREST-`or`-filter. Alleen tekens die in een
 * referentie of dossiernummer voorkomen blijven staan; de rest verdwijnt. Levert
 * null als er te weinig overblijft om nog onderscheidend te zijn.
 */
function veiligeFilterwaarde(ruw: string | null | undefined): string | null {
  const v = (ruw ?? '').trim().replace(/[^A-Za-z0-9./-]/g, '').slice(0, 40)
  return v.length >= 3 ? v : null
}

function huisnummerKern(hn: string | null | undefined): string | null {
  const m = (hn ?? '').match(/\d+/)
  return m ? m[0] : null
}

/**
 * Zoekt mogelijke duplicaten en scoort ze. De score is een gewogen som, afgetopt
 * op 1,0 — geen kansberekening, maar een rangschikking die een mens moet kunnen
 * navertellen. Vandaar dat elke bijdrage ook als leesbare reden terugkomt.
 */
export async function zoekDuplicaten(invoer: DuplicaatInvoer): Promise<DuplicaatResultaat[]> {
  const supabase = createAdminClient()
  const vanaf = vensterVanaf()
  const kandidaten = new Map<string, any>()

  const voegToe = (rijen: any[] | null) => {
    for (const r of rijen ?? []) if (r?.id) kandidaten.set(r.id, r)
  }

  /** Dossiers die zijn gevonden doordat ons eigen offertenummer in hun mail staat. */
  const viaOnsOffertenummer = new Set<string>()

  // ── Ingang 1: zelfde klant ────────────────────────────────────────────────
  if (invoer.relatieId) {
    const { data } = await supabase
      .from('dossiers').select(DOSSIER_SELECT)
      .eq('klant_id', invoer.relatieId)
      .gte('created_at', vanaf)
      .order('created_at', { ascending: false })
      .limit(200)
    voegToe(data)
  }

  // ── Ingang 2: zelfde adres ────────────────────────────────────────────────
  const pc = normaliseerPostcode(invoer.postcode)
  if (pc) {
    const { data } = await supabase
      .from('dossiers').select(DOSSIER_SELECT)
      .eq('werkadres_postcode', pc)
      .gte('created_at', vanaf)
      .order('created_at', { ascending: false })
      .limit(200)
    voegToe(data)
  }

  // ── Ingang 3: referentie van de klant, of ons eigen nummer in hun mail ────
  // De waarde komt uit het taalmodel en gaat een PostgREST-filterstring in. Een
  // komma of haakje zou de betekenis van dat filter veranderen, dus eerst langs
  // een tekenwitlijst. Dit is de ingang waar de opdrachtroute op leunt.
  for (const ref of [invoer.referentie, invoer.onzeReferentie]) {
    const v = veiligeFilterwaarde(ref)
    if (!v) continue
    const { data } = await supabase
      .from('dossiers').select(DOSSIER_SELECT)
      .or(`referentie.eq.${v},dossiernummer.eq.${v}`)
      .limit(50)
    voegToe(data)

    // Klanten schrijven ons nummer zelden over zoals wij het noteren: "2026-1234",
    // "20261234" en "offerte 1234" horen hetzelfde dossier te vinden. Zoek daarom
    // ook op alleen de cijfers, zolang dat er genoeg zijn om onderscheidend te zijn.
    const cijfers = v.replace(/\D/g, '')
    if (cijfers.length >= 6) {
      const { data: opNummer } = await supabase
        .from('dossiers').select(DOSSIER_SELECT)
        .ilike('dossiernummer', `%${cijfers}%`)
        .limit(20)
      voegToe(opNummer)
    }

    // ONS OFFERTENUMMER LEEFT NIET OP HET DOSSIER
    // Hierboven wordt gezocht in `referentie` en `dossiernummer`, maar het nummer
    // dat wíj op een offerte zetten staat in `quotes.quote_nummer` -- een heel
    // andere reeks dan het dossiernummer. "OFT-2026-171" hoort bij dossier
    // 20267.00682; op naam of cijfers is daar niets van te vinden.
    //
    // Dat is precies het sterkste signaal dat er is: een klant die ons eigen
    // offertenummer in zijn opdracht noemt, wijst het dossier zelf aan. Bij Van
    // Herk zat onze offerte zelfs als OFT-2026-171.pdf bij de inkooporder, het
    // model las het nummer met vertrouwen 1,0 -- en er werd niets mee gedaan.
    const { data: viaOfferte } = await supabase
      .from('quotes').select('dossier_id')
      .ilike('quote_nummer', v)
      .not('dossier_id', 'is', null)
      .limit(20)
    const offerteDossiers = [...new Set((viaOfferte ?? [])
      .map(q => q.dossier_id).filter(Boolean) as string[])]
    if (offerteDossiers.length) {
      const { data } = await supabase
        .from('dossiers').select(DOSSIER_SELECT).in('id', offerteDossiers).limit(20)
      voegToe(data)
      for (const id of offerteDossiers) viaOnsOffertenummer.add(id)
    }
  }

  // ── Ingang 4: eerder bericht in dezelfde conversatie ──────────────────────
  const conversatieDossiers = new Set<string>()
  if (invoer.conversationId) {
    const { data } = await supabase
      .from('mailintake_berichten')
      .select('dossier_id')
      .eq('conversation_id', invoer.conversationId)
      .not('dossier_id', 'is', null)
      .neq('id', invoer.berichtId)
      .limit(20)
    for (const r of data ?? []) if (r.dossier_id) conversatieDossiers.add(r.dossier_id)
    if (conversatieDossiers.size) {
      const { data: d } = await supabase
        .from('dossiers').select(DOSSIER_SELECT).in('id', [...conversatieDossiers]).limit(20)
      voegToe(d)
    }
  }

  // ── Ingang 5: een bijlage die al ergens aan hangt ─────────────────────────
  const hashDossiers = new Set<string>()
  if (invoer.bijlageHashes.length) {
    const { data } = await supabase
      .from('mailintake_bijlagen')
      .select('sha256, bericht:mailintake_berichten!inner(dossier_id)')
      .in('sha256', invoer.bijlageHashes.slice(0, 20))
      // Het eigen bericht niet: bij opnieuw verwerken hangt het al aan zijn dossier
      // en zou het zichzelf terugvinden.
      .neq('bericht_id', invoer.berichtId)
      .not('bericht.dossier_id', 'is', null)
      .limit(50)
    // Een bestand dat al aan meerdere dossiers hangt is geen projectstuk maar
    // huisstijl (een banner of logo dat de bijlagenzeef ontglipte). Het zegt dan
    // niets meer over wélk dossier dit is, dus telt het niet mee.
    const dossiersPerHash = new Map<string, Set<string>>()
    for (const r of data ?? []) {
      const did = (r as any).bericht?.dossier_id
      if (!did || !r.sha256) continue
      const set = dossiersPerHash.get(r.sha256) ?? new Set<string>()
      set.add(did)
      dossiersPerHash.set(r.sha256, set)
    }
    for (const set of dossiersPerHash.values()) {
      if (set.size === 1) hashDossiers.add([...set][0])
    }
    if (hashDossiers.size) {
      const { data: d } = await supabase
        .from('dossiers').select(DOSSIER_SELECT).in('id', [...hashDossiers]).limit(20)
      voegToe(d)
    }
  }

  // Welke kandidaten dragen een verzonden offerte? De hoofdstatus is daar niet
  // altijd mee meegelopen: dossier 20267.00682 stond op `aanvraag` terwijl
  // OFT-2026-171 allang verzonden was. Wie alleen op hoofdstatus kijkt, noemt zo'n
  // dossier een gewone duplicaat en meldt "er is geen offerte gevonden" -- terwijl
  // het de offerte ís. Van de dossiers met een offerte staan er vijf zo.
  const metVerzondenOfferte = new Set<string>()
  if (kandidaten.size) {
    const { data: q } = await supabase
      .from('quotes').select('dossier_id')
      .in('dossier_id', [...kandidaten.keys()])
      .eq('status', 'verzonden')
      .limit(200)
    for (const r of q ?? []) if (r.dossier_id) metVerzondenOfferte.add(r.dossier_id)
  }

  // ── Scoren ────────────────────────────────────────────────────────────────
  const hn = huisnummerKern(invoer.huisnummer)
  const tekst = `${invoer.onderwerp ?? ''} ${invoer.bodyTekst ?? ''}`.toLowerCase()
  const eigenOmschrijving = normaliseerNaam(invoer.omschrijving ?? invoer.onderwerp ?? '')

  const resultaten: DuplicaatResultaat[] = []

  for (const d of kandidaten.values()) {
    let score = 0
    const redenen: string[] = []
    let soort: DuplicaatSoort = 'duplicaat'

    if (conversatieDossiers.has(d.id)) {
      score += 1
      redenen.push('Eerdere mail in dezelfde conversatie hangt al aan dit dossier')
    }
    if (hashDossiers.has(d.id)) {
      score += 0.9
      redenen.push('Een identieke bijlage hangt al aan dit dossier')
    }
    // Ons eigen nummer in hun mail is het sterkste signaal dat er is, op de
    // conversatie na. Een dossiernummer als 20261.00293 komt nergens anders voor:
    // wie het noemt, verwijst naar dít dossier. Stond op 0,5 -- net te weinig om
    // op zichzelf een treffer te zijn, waardoor een opdracht die keurig ons
    // offertenummer noemde alsnog werd voorgelegd met de vraag welk dossier het is.
    const onsNummer = (invoer.onzeReferentie ?? '').trim().toLowerCase()
    const nummerGenoemd =
      (d.dossiernummer && tekst.includes(String(d.dossiernummer).toLowerCase()))
      || (onsNummer.length >= 4 && (
        String(d.dossiernummer ?? '').toLowerCase() === onsNummer
        || String(d.referentie ?? '').trim().toLowerCase() === onsNummer))
    if (nummerGenoemd) {
      score += 0.9
      redenen.push(`Ons eigen nummer ${d.dossiernummer ?? onsNummer} wordt in de mail genoemd`)
    } else if (viaOnsOffertenummer.has(d.id)) {
      // Even sterk, maar via de offerte in plaats van het dossier: de klant noemt
      // het nummer dat op ónze offerte stond, en dat hoort bij precies één dossier.
      score += 0.9
      redenen.push(`Onze offerte ${invoer.onzeReferentie} hoort bij dit dossier`)
    }
    /**
     * HETZELFDE ADRES TELT ÉÉN KEER
     *
     * Er zijn twee manieren om een adres te matchen: op postcode plus huisnummer uit
     * de velden, en op straat plus huisnummer in de tekst. Die tweede is er als
     * terugval -- voor als de postcode ontbreekt of het huisnummer in het straatveld
     * is beland. Een terugval, dus geen tweede bewijs.
     *
     * Ze werden wél opgeteld, en het klantbonusje daarbovenop twee keer: 0,45 + 0,40
     * + 0,15 + 0,10 = 1,10, afgetopt op 1,00. Eén adres, vier keer geteld, en dan
     * precies de maximale score -- terwijl er niets anders was dan "zelfde klant,
     * zelfde pand". In productie hield dat acht van de vijfenveertig berichten tegen
     * met "dit lijkt op iets dat al is ingeschreven". Een vochtplek is geen lekkend
     * dak, ook niet als het hetzelfde gebouw is.
     *
     * De drempel was hier al eens voor opgetrokken (zie `DUPLICAAT_TWIJFEL`: van 0,55
     * naar 0,65, "bij een beheerder die vaker op hetzelfde complex werkt is dat de
     * normale toestand"). Dat hielp niet zolang dezelfde waarneming vier keer
     * meetelde.
     *
     * De harde signalen staan hier los van en blijven onaangetast: dezelfde
     * mailconversatie, een identieke bijlage, ons eigen nummer in de mail. Die wijzen
     * één dossier aan; een adres wijst een gebouw aan.
     */
    const adresTekst = [d.werkadres_straat, d.werkadres_huisnummer, d.titel]
      .filter(Boolean).join(' ')
    const adresMatch = adresOvereenkomst(invoer.straat, invoer.huisnummer, adresTekst)
    const zelfdePostcodeHuisnummer =
      Boolean(pc && d.werkadres_postcode === pc && hn && huisnummerKern(d.werkadres_huisnummer) === hn)

    if (zelfdePostcodeHuisnummer) {
      score += 0.45
      redenen.push('Zelfde werkadres')
    } else if (adresMatch === 'straat_en_nummer') {
      score += 0.4
      redenen.push('Zelfde straat en huisnummer')
    } else if (adresMatch === 'straat') {
      score += 0.15
      redenen.push('Zelfde straat')
    }

    // Dezelfde opdrachtgever op dat adres: één keer, en alleen als het adres ook
    // werkelijk tot het huisnummer klopt. Alleen dezelfde straat zegt te weinig.
    const zelfdeKlant = Boolean(invoer.relatieId && d.klant_id === invoer.relatieId)
    if (zelfdeKlant && (zelfdePostcodeHuisnummer || adresMatch === 'straat_en_nummer')) {
      score += 0.15
      redenen.push('Zelfde opdrachtgever op dit adres')
    }
    const ref = (invoer.referentie ?? '').trim()
    if (ref.length >= 3 && d.referentie && String(d.referentie).trim() === ref) {
      score += 0.4
      redenen.push(`Zelfde referentie (${ref})`)
    }
    if (eigenOmschrijving && d.titel) {
      const s = gelijkenis(eigenOmschrijving, normaliseerNaam(d.titel))
      if (s >= 0.6) {
        score += 0.2 * s
        redenen.push('De omschrijving lijkt sterk op de titel van dit dossier')
      }
    }
    if (invoer.bedrag != null && d.bedrag_excl_btw != null && Number(d.bedrag_excl_btw) > 0) {
      const afwijking = Math.abs(Number(d.bedrag_excl_btw) - invoer.bedrag) / Number(d.bedrag_excl_btw)
      if (afwijking <= 0.01) {
        score += 0.1
        redenen.push('Zelfde bedrag')
      }
    }

    if (score <= 0) continue

    // Waar hoort deze kandidaat thuis? Dat bepaalt welke knop het scherm aanbiedt.
    // Opdracht eerst: een dossier dat al loopt draagt vaak nog zijn verzonden
    // offerte, en dat is dan meerwerk -- geen offerte die nog gewonnen moet worden.
    if (d.hoofdstatus === 'opdracht') {
      if (d.opdracht_substatus !== 'financieel_afgesloten') soort = 'meerwerk_kandidaat'
    } else if (d.hoofdstatus === 'offerte' || metVerzondenOfferte.has(d.id)) {
      soort = 'offerte_match'
    }

    resultaten.push({
      score: Math.min(1, Math.round(score * 100) / 100),
      soort,
      dossierId: d.id,
      dossiernummer: d.dossiernummer ?? null,
      titel: d.titel ?? null,
      klantnaam: d.klant?.naam ?? null,
      hoofdstatus: d.hoofdstatus ?? null,
      substatus: d.opdracht_substatus ?? d.offerte_substatus ?? d.aanvraag_substatus ?? null,
      redenen,
    })
  }

  return resultaten.sort((a, b) => b.score - a.score).slice(0, 10)
}

export function isHardeDuplicaat(score: number | null | undefined): boolean {
  return (score ?? 0) >= DUPLICAAT_HARD
}

export function vraagtOmBevestiging(score: number | null | undefined): boolean {
  return (score ?? 0) >= DUPLICAAT_TWIJFEL
}
