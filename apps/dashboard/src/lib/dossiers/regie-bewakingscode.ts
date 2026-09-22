/**
 * dossiers/regie-bewakingscode.ts
 *
 * De bewakingscode "Regiewerkzaamheden" van een servicedeskbon die op regie afrekent.
 *
 * WAAROM DIT BESTAAT
 * Servicedeskprojecten hebben in Bouw7 in de praktijk géén enkele bewakingscode: alles wat erop
 * geboekt wordt belandt onder `uncoded_costs`. Voor een aangenomen bon is dat te overzien — die
 * factureert via de aanneemsom — maar een regie-bon rekent juist op die boekingen af. Zonder code
 * is er niets om op in te kopen, niets om uren op te schrijven, en ziet de nacalculatie op de
 * Verkoop-tab een leeg dossier terwijl er wel degelijk gewerkt is. Eén opvangcode per bon lost dat
 * op zonder de calculatiestructuur van een opdracht op te tuigen.
 *
 * ÉÉN CODE, GEEN BEGROTING
 * Een regie-bon heeft geen begroot bedrag: wat het kost blijkt achteraf. De code gaat dus met nul
 * naar Bouw7 en vult zich met werkelijke kosten. Hij krijgt wél een PSL op álle kostensoorten —
 * uren, inkoop, onderaanneming, materieel, materiaal en afval — want een regie-bon kan ze alle zes
 * ontvangen en een code zonder PSL op de juiste soort is in Bouw7 niet te kiezen. Zie
 * `maakRegieBewakingscodeBouw7`.
 *
 * WAAR HIJ DAARNA OPDUIKT
 *   • werkbegroting + planning — via `leesEigenBewakingscodes` (kostengroep-/codekiezer);
 *   • verkoopfactuur — via `getFactureerbareCodes` (bron 'regie'), waarmee de nacalculatie op de
 *     Verkoop-tab de geboekte uren en kosten tot factuurregels maakt.
 *
 * Bewust géén `'use server'`: dit bestand exporteert ook constanten, en dat mag daar niet.
 */

import { createAdminClient } from '@everts/database/server'

/** De service-role-client zoals `createAdminClient()` hem teruggeeft. */
type AdminClient = ReturnType<typeof createAdminClient>
import {
  isServicedeskDossier, REGIE_BEWAKINGSCODE, REGIE_BEWAKINGSCODE_NAAM,
} from '@/components/dossiers/types'
import { maakRegieBewakingscodeBouw7 } from '@/app/(platform)/everts-calc/actions/werkbegroting'

// De code en zijn naam staan in `components/dossiers/types.ts` — leesbaar aan beide kanten van de
// client/server-grens, zonder dit bestand (en daarmee de Bouw7-write) mee te slepen.
export { REGIE_BEWAKINGSCODE, REGIE_BEWAKINGSCODE_NAAM }

/** Hoeveel bonnen één sync-run er maximaal bijwerkt — zie `zorgVoorRegieBewakingscodes`. */
const MAX_PER_RUN = 25

type DossierRij = {
  id: string
  bouw7_id: string | null
  facturatiemethode: string | null
  bouw7_projectstatus_naam: string | null
  bouw7_categorie_naam: string | null
  regie_bewakingscode: string | null
  regie_bouw7_chapter_id: number | null
}

const DOSSIER_VELDEN =
  'id, bouw7_id, facturatiemethode, bouw7_projectstatus_naam, bouw7_categorie_naam, ' +
  'regie_bewakingscode, regie_bouw7_chapter_id'

export type RegieCodeResultaat =
  /**
   * De code staat op het dossier. `nieuw` = deze aanroep heeft hem uitgedeeld; `inBouw7` = hij
   * staat er ook écht in en er kan dus op geboekt worden. Die twee lopen uiteen zodra de
   * Bouw7-write mislukt: de code is dan wel vastgelegd, maar nog nergens te kiezen.
   */
  | { ok: true; code: string; nieuw: boolean; inBouw7: boolean; waarschuwing?: string }
  /** Dit dossier hoort geen regiecode te hebben (geen servicedesk, aangenomen, geen Bouw7). */
  | { ok: true; code: null; nieuw: false; reden: string }
  | { ok: false; error: string }

/**
 * Zorgt dat dit dossier zijn regiecode heeft, en maakt hem in Bouw7 aan als dat nog niet zo is.
 *
 * Idempotent: staat de code er al mét Bouw7-hoofdstuk, dan doet deze functie niets en raakt hij
 * Bouw7 niet aan. Is de code eerder wel lokaal vastgelegd maar mislukte de Bouw7-write (chapter-id
 * leeg), dan probeert hij het opnieuw — anders blijft zo'n bon voorgoed zonder werkende code staan.
 *
 * Mislukt de write alsnog, dan wordt de code tóch lokaal bewaard met een waarschuwing. Dat is
 * dezelfde afweging als bij stelposten: de gebruiker ziet de code en de melding, in plaats van een
 * stille mislukking.
 */
export async function zorgVoorRegieBewakingscode(dossierId: string): Promise<RegieCodeResultaat> {
  const supabase = createAdminClient()
  const { data } = await supabase.from('dossiers').select(DOSSIER_VELDEN).eq('id', dossierId).maybeSingle()
  const d = data as DossierRij | null
  if (!d) return { ok: false, error: 'Dossier niet gevonden.' }
  return zorgVoorCodeOpRij(supabase, d)
}

/** De kern, gedeeld door de losse aanroep en de bulkronde; verwacht een al gelezen dossierrij. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function zorgVoorCodeOpRij(supabase: AdminClient, d: DossierRij): Promise<RegieCodeResultaat> {
  // Strikt afbakenen op servicedesk. `facturatiemethode` staat bedrijfsbreed standaard op 'regie'
  // en wordt alleen op een servicedeskbon bewust gezet; op een opdracht is de waarde betekenisloos
  // en zou dit honderden opdrachten een code geven die daar niets betekent.
  if (!isServicedeskDossier(d)) {
    return { ok: true, code: null, nieuw: false, reden: 'Geen servicedeskbon.' }
  }
  if (d.facturatiemethode !== 'regie') {
    return { ok: true, code: null, nieuw: false, reden: 'Deze bon rekent aangenomen af.' }
  }
  if (!d.bouw7_id) {
    return { ok: true, code: null, nieuw: false, reden: 'Deze bon is niet aan een Bouw7-project gekoppeld.' }
  }

  const bestaand = (d.regie_bewakingscode ?? '').trim()
  if (bestaand && d.regie_bouw7_chapter_id != null) {
    return { ok: true, code: bestaand, nieuw: false, inBouw7: true }
  }

  // Een vaste code, en géén zoektocht naar een vrij nummer zoals bij stelposten. Dat zoeken haalt
  // de hele projectbewaking live op (drie calls per bon) om een botsing te vermijden die hier niet
  // bestaat: servicedeskprojecten hebben geen enkele bewakingscode. En zou `RW01` er tóch al staan,
  // dan hangt de bon zich aan die bestaande code — `zorgVoorOntbrekendePsls` hergebruikt hem en
  // maakt geen tweede aan. Voor een opvangcode is dat precies de bedoeling.
  const code = bestaand || REGIE_BEWAKINGSCODE
  const res = await maakRegieBewakingscodeBouw7(d.id, { code, naam: REGIE_BEWAKINGSCODE_NAAM })

  const velden = {
    regie_bewakingscode: code,
    // Chapter- en psl-id alleen zetten als de Bouw7-write slaagde; anders blijven ze leeg en
    // is aan het dossier te zien dat de code nog nergens staat.
    ...(res.ok ? { regie_bouw7_chapter_id: res.chapterId, regie_bouw7_security_code_id: res.pslId } : {}),
  }
  let waarschuwing: string | undefined
  if (res.ok) {
    waarschuwing = res.waarschuwing
  } else {
    waarschuwing = `Kostengroep ${code} in Bouw7 aanmaken mislukt (${res.error}). `
      + 'Er kan nog niets op geboekt worden.'
  }

  const { error } = await supabase.from('dossiers').update(velden).eq('id', d.id)
  if (error) return { ok: false, error: error.message }
  return { ok: true, code, nieuw: true, inBouw7: res.ok && res.chapterId != null, waarschuwing }
}

export type RegieCodeSyncResultaat = {
  nieuw: number
  fouten: number
  /** True als er meer bonnen wachten dan deze ronde aankon; de volgende sync pakt de rest. */
  meerTeDoen: boolean
  foutMelding?: string
}

/**
 * Deelt de regiecode uit aan de servicedeskbonnen die er nog geen (werkende) hebben.
 *
 * WAAROM IN DE SYNC EN NIET IN HET SCHERM — dezelfde reden als bij de stelpostcodes: een bon komt
 * niet door een handeling in EVA op regie te staan maar staat er standaard al op, en een
 * Bouw7-write op een renderpad zou bij elke paginaweergave kunnen vuren. Het zetten van de
 * schakelaar op de Informatie-tab doet het wél meteen; dit is de inhaalslag voor wat er al stond.
 *
 * AFBAKENING = HET SERVICEDESK-BORD. Alleen bonnen waar nog aan gewerkt wordt: geen afgewezen
 * projecten, en niets dat langer geleden financieel gereed is gemeld. Een code aanmaken op een bon
 * die al afgerekend is levert niets op en zou honderden schrijfacties op stilstaande
 * Bouw7-projecten betekenen.
 *
 * GETEMPERD OP {@link MAX_PER_RUN}. Elke bon kost een handvol Bouw7-calls; de sync draait vier keer
 * per dag, dus een achterstand is binnen een dag ingelopen zonder dat één ronde zijn tijdslimiet
 * raakt. Fouten per dossier worden geteld en niet doorgegooid — één bon zonder hoofdstuk mag de
 * hele sync niet stilzetten.
 *
 * ÉÉN POGING PER BON, en dat is een bewuste grens. Mislukt de Bouw7-write ná het aanmaken van de
 * code zelf, dan blijft die code als losse stamdata achter — Bouw7 maakt er per project een eigen
 * rij van (`.A` staat er 50×, `MW01` 4×). Zou de sync het elke ronde opnieuw proberen, dan levert
 * één kapotte bon vier verweesde codes per dag op. De bulk pakt daarom alleen bonnen die nog
 * helemaal geen code hebben; opnieuw proberen gebeurt op verzoek, via "Verversen" op het dossier
 * (`opties.dossierId`) — en dat is precies waar het regiepaneel naar verwijst als de code er niet in staat.
 */
export async function zorgVoorRegieBewakingscodes(
  opties?: { dossierId?: string },
): Promise<RegieCodeSyncResultaat> {
  const supabase = createAdminClient()
  const uit: RegieCodeSyncResultaat = { nieuw: 0, fouten: 0, meerTeDoen: false }
  const meldingen: string[] = []

  let query = supabase
    .from('dossiers')
    .select(DOSSIER_VELDEN)
    .eq('facturatiemethode', 'regie')
    .not('bouw7_id', 'is', null)

  if (opties?.dossierId) {
    // Op verzoek van één dossier: ook een eerdere mislukking (code wel, hoofdstuk niet) opnieuw
    // proberen. Dit is een handeling van een mens, dus hier mag het wél herhaald worden.
    query = query.eq('id', opties.dossierId).is('regie_bouw7_chapter_id', null)
  } else {
    // In de bulk alleen bonnen die nog nergens staan — zie de uitleg hierboven over verweesde codes.
    query = query.is('regie_bewakingscode', null)
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    query = query
      .or('bouw7_projectstatus_naam.ilike.LB.%,bouw7_categorie_naam.in.(Dagelijks onderhoud,Mutatie)')
      .neq('bouw7_projectstatus_naam', '08. Afgewezen')
      // Losse .or()-aanroepen worden door PostgREST met AND verbonden; dit is dezelfde knijp als
      // in `getDossiersVoorServicedesk`.
      .or(`servicedesk_substatus.is.null,servicedesk_substatus.neq.financieel_gereed,financieel_gereed_op.gte.${cutoff}`)
      // Eén bon meer ophalen dan we verwerken: daarmee weten we of er nog een ronde nodig is.
      .order('created_at', { ascending: false })
      .limit(MAX_PER_RUN + 1)
  }

  const { data, error } = await query
  if (error) return { ...uit, fouten: 1, foutMelding: `dossiers ophalen mislukt: ${error.message}` }

  const rijen = (data ?? []) as unknown as DossierRij[]
  uit.meerTeDoen = !opties?.dossierId && rijen.length > MAX_PER_RUN
  for (const d of rijen.slice(0, opties?.dossierId ? rijen.length : MAX_PER_RUN)) {
    try {
      const res = await zorgVoorCodeOpRij(supabase, d)
      if (!res.ok) { uit.fouten++; meldingen.push(`${d.id}: ${res.error}`); continue }
      if (res.code == null) continue // hoorde geen code te krijgen (geen servicedesk / aangenomen)
      // Alleen tellen wat er werkelijk in Bouw7 staat. Een code die alleen lokaal is vastgelegd
      // levert nog niets op, en als "nieuw" gerapporteerd zou hij een geslaagde ronde voorwenden.
      if (res.nieuw && res.inBouw7) uit.nieuw++
      else if (res.nieuw) uit.fouten++
      if (res.waarschuwing) meldingen.push(`${d.id}: ${res.waarschuwing}`)
    } catch (e) {
      uit.fouten++
      meldingen.push(`${d.id}: ${e instanceof Error ? e.message : 'onbekende fout'}`)
    }
  }

  return { ...uit, foutMelding: meldingen.length ? meldingen.join(' · ').slice(0, 900) : undefined }
}
