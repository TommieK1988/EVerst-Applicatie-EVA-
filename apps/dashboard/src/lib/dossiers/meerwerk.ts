'use server'

import { createAdminClient } from '@everts/database/server'
import { revalidatePath } from 'next/cache'
import { ververSnapshotsNaSchrijven } from '@/lib/bouw7/snapshot'
import type {
  MeerwerkRegel,
  MeerwerkStatus,
  MeerwerkAfrekenwijze,
  MeerwerkStelpostGrondslag,
  MeerwerkTermijnWijze,
} from '@everts/database'
import { getServicedeskRegie } from './servicedesk'
import { bouw7VoorDossier, koppelCalculatieProject } from './actions'
import { assertDossierBewerkbaar } from './guards'
import { vereisSessie, getCurrentMedewerker } from '@/lib/auth/rechten'
import { vereisPortaalOnderdeel, portaalGebruikerNaam } from '@/lib/portaal/auth'
import { headers } from 'next/headers'
import { maakMeerwerkBewakingscodeBouw7 } from '@/app/(platform)/everts-calc/actions/werkbegroting'
import { zetMeerwerkAlsTermijn, meerwerkTermijnGeschikt } from './meerwerk-termijn'
import { leesMeerwerkOfferte, leesTermijnschemaPerOfferte } from './meerwerk-offerte'
import type { TermijnschemaRegel } from './termijnen-schema'

/** Statussen die als goedgekeurd meerwerk meetellen in het contracttotaal. */
const GOEDGEKEURD: MeerwerkStatus[] = ['akkoord', 'voltooid']

/**
 * Toegestane statusovergangen. Afgewezen en Akkoord mogen allebei terug naar Aangevraagd.
 *
 * Akkoord was tot 18 sep 2026 een eenrichtingsdeur: eenmaal goedgekeurd kon je alleen nog naar
 * Voltooid of Afgewezen. Wie per ongeluk goedkeurde, of het te vroeg deed, moest het meerwerk dus
 * *afwijzen* om er weer vanaf te komen -- en afgewezen betekent iets heel anders dan nog niet
 * besloten: het staat zo in het meerwerkoverzicht naar de klant en in de besluitvastlegging.
 * Terug naar Aangevraagd is de eerlijke weg terug.
 */
const TRANSITIES: Record<MeerwerkStatus, MeerwerkStatus[]> = {
  aangevraagd:       ['offerte_verstuurd', 'akkoord', 'afgewezen'],
  offerte_verstuurd: ['akkoord', 'afgewezen', 'aangevraagd'],
  akkoord:           ['voltooid', 'afgewezen', 'aangevraagd'],
  afgewezen:         ['aangevraagd'],
  voltooid:          [],
}

/**
 * Wie het besluit nam. Standaard de ingelogde medewerker; het klantportaal geeft
 * expliciet een klant mee, want daar is geen medewerkerssessie.
 */
export type MeerwerkBesluitActor = {
  soort: 'medewerker' | 'klant'
  id: string | null
  naam: string
  ip?: string | null
}

/** Statussen waarbij het zinvol is vast te leggen wie besliste. */
const BESLUIT_STATUSSEN: MeerwerkStatus[] = ['akkoord', 'afgewezen']

const rond = (n: number): number => Math.round(n * 100) / 100

/** Bedrag voor in een melding aan de gebruiker. */
const euro = (n: number): string =>
  new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(n)

/**
 * Rekent deze regel op werkelijke kosten af? Dan wordt hij via het nacalculatie-blok gefactureerd
 * en hoort hij nooit in een termijnstaat — een termijn veronderstelt een bedrag dat vooraf vaststaat.
 *
 * Zelfde soort-criterium als `getFactureerbareCodes`, zodat een regel niet op twee plekken tegelijk
 * kan opduiken of juist nergens. De status blijft hier buiten beschouwing: deze vlag beschrijft de
 * áárd van de regel en de aanroepers filteren zelf op goedgekeurd. `getFactureerbareCodes` eist
 * daarbovenop akkoord, want zonder akkoord bestaat de bewakingscode nog niet in Bouw7.
 */
function rekentOpNacalculatie(r: MeerwerkRegel): boolean {
  if (!r.bewakingscode) return false
  // Een verrekenregel van een stelpost draagt geen eigen code en telt hier niet mee.
  if (r.opdracht_onderdeel_id != null) return false
  return r.afrekenwijze === 'regie' || r.is_stelpost === true
}

/** Effectief bedrag (excl. btw) per regel, afhankelijk van afrekenwijze/stelpost. */
function effectiefExcl(regel: MeerwerkRegel, regiePerCode: Map<string, number>): number {
  if (regel.is_stelpost && regel.stelpost_grondslag === 'eenheidsprijzen') {
    return rond((Number(regel.eenheidsprijs) || 0) * (Number(regel.hoeveelheid_werkelijk) || 0))
  }
  const opGeboekteKosten = regel.afrekenwijze === 'regie'
    || (regel.is_stelpost && regel.stelpost_grondslag === 'geboekte_kosten')
  if (opGeboekteKosten) {
    if (!regel.bewakingscode) return 0
    return rond(regiePerCode.get(regel.bewakingscode) ?? 0)
  }
  // aangenomen / handmatig
  return rond(Number(regel.bedrag_excl_btw) || 0)
}

/**
 * Rekent deze regel op een vaste prijs af, en hoort het bedrag dus in de termijnstaat?
 *
 * Bewust losstaand van `rekentOpNacalculatie`: die eist een bewakingscode, omdat hij bepaalt wélke
 * code er op de nacalculatiefactuur komt. Voor de vraag "hoort dit bedrag in een termijn" doet die
 * code niet ter zake -- regiewerk zonder code hoort er net zo min in. Zelfde criterium als
 * `meerwerkTermijnGeschikt` in meerwerk-termijn.ts, zodat de dekkingcontrole op de Verkoop-tab
 * precies de regels telt die daadwerkelijk een termijn kunnen krijgen.
 */
function rekentOpTermijn(r: MeerwerkRegel): boolean {
  return r.afrekenwijze === 'aangenomen' && r.is_stelpost !== true
}

/**
 * Leidt af hoe deze regel in de termijnstaat terechtkomt. Spiegelt `zetMeerwerkAlsTermijn`: eerst
 * de vraag óf er een termijn komt (`termijn_wijze` / afrekenwijze), dan hoevéél — en dat laatste
 * bepaalt de betalingsconditie van de meerwerkofferte, niet de meerwerkregel zelf.
 */
function termijnVerwerkingVan(
  r: MeerwerkRegel,
  opTermijn: boolean,
  schemaPerOfferte: Map<string, TermijnschemaRegel[]>,
): MeerwerkRegelView['termijnVerwerking'] {
  if (!opTermijn) return { soort: 'nacalculatie', aantal: 0, schema: [] }
  if (r.termijn_wijze === 'eigen_termijnstaat') return { soort: 'eigen_termijnstaat', aantal: 0, schema: [] }
  const schema = (r.quote_id ? schemaPerOfferte.get(r.quote_id) : null) ?? []
  return schema.length > 1
    ? { soort: 'volgt_offerte', aantal: schema.length, schema }
    : { soort: 'een_termijn', aantal: 1, schema: [] }
}

export type MeerwerkRegelView = MeerwerkRegel & {
  effectiefExcl: number
  effectiefIncl: number
  btwEffectief: number
  /**
   * Rekent op werkelijke kosten af en loopt dus via de nacalculatie. Zo'n regel krijgt nooit een
   * termijn: het bedrag staat pas vast als het werk geboekt is.
   */
  opNacalculatie: boolean
  /** Vaste prijs: dit bedrag hoort in de termijnstaat en telt mee in de termijndekking. */
  opTermijn: boolean
  /**
   * Hoe dit meerwerk daadwerkelijk in de termijnstaat terechtkomt.
   *
   * Dit is een **afleiding, geen keuze**. `termijn_wijze` zegt alleen of het meerwerk in de
   * projecttermijnstaat meeloopt of een eigen staat krijgt; hoevéél termijnen het worden volgt uit
   * de betalingsconditie van de meerwerkofferte (zie `zetMeerwerkAlsTermijn`). Een regel van
   * € 20.000 onder een 30/30/30/10-offerte wordt dus vier termijnen, ook al staat er "1 regel in
   * termijnstaat" op de regel. Die keuze als verwerking tonen liegt over wat er in Bouw7 komt.
   */
  termijnVerwerking: {
    soort: 'eigen_termijnstaat' | 'nacalculatie' | 'volgt_offerte' | 'een_termijn'
    /** Aantal termijnen dat deze regel in de staat krijgt; 0 bij een eigen staat of nacalculatie. */
    aantal: number
    /** Het schema uit de offerte, leeg als er geen betalingsconditie aan hangt. */
    schema: TermijnschemaRegel[]
  }
}

export type DossierMeerwerkData = {
  regels: MeerwerkRegelView[]
  totalen: {
    aantal: number
    /** Aantal regels dat als goedgekeurd meetelt — bepaalt óf EVA leidend is, los van het bedrag. */
    goedgekeurdAantal: number
    goedgekeurdExcl: number
    goedgekeurdIncl: number
    /**
     * Goedgekeurd meerwerk tegen een **vaste prijs** (excl. btw). Dit is het deel dat in de
     * termijnstaat hoort en dus meetelt bij de vraag of er voor de volledige opdracht termijnen
     * zijn aangemaakt.
     */
    goedgekeurdAangenomenExcl: number
    /**
     * Goedgekeurd meerwerk op **regie of stelpost** (excl. btw): wordt via de nacalculatie
     * gefactureerd en krijgt nooit een termijn. Optellen bij de termijngrondslag zou een gat in de
     * dekking suggereren dat nooit te dichten is.
     */
    goedgekeurdRegieExcl: number
    /**
     * Het deel van `goedgekeurdRegieExcl` dat óók in het nacalculatie-blok staat (excl. btw) —
     * dezelfde grens als `getFactureerbareCodes`, namelijk regel-met-bewakingscode.
     *
     * De Verkoop-tab trekt dit er weer af en telt in plaats daarvan het nacalculatie-blok op. Dat
     * blok kijkt naar dezelfde boekingen maar houdt rekening met vaste bedragen per factuurregel,
     * uitgevinkte posten en losse regels, en kent bovendien stelposten die helemaal geen
     * meerwerkregel zijn. Eén bedrag uit één bron dus, in plaats van twee tellingen van hetzelfde
     * werk. Wat hier overblijft is het meerwerk buiten de termijnstaat dat zijn eigen bedrag
     * draagt en nergens anders geteld wordt — een eenheidsprijs-stelpost zonder bewakingscode.
     */
    goedgekeurdNacalculatieExcl: number
  }
}

/**
 * Haalt de meerwerkregels van een dossier op met per regel het effectieve bedrag. Regie- en
 * stelpost-op-geboekte-kosten-regels worden live berekend uit de geboekte uren/kosten op de eigen
 * bewakingscode (servicedesk-regiepatroon). De som van goedgekeurde regels is leidend voor het
 * meerwerk in het contracttotaal.
 */
export async function getDossierMeerwerk(dossierId: string): Promise<DossierMeerwerkData> {
  const supabase = createAdminClient() as any
  const { data } = await supabase
    .from('meerwerk_regels')
    .select('*')
    .eq('dossier_id', dossierId)
    .order('volgnummer', { ascending: true })
  const regels = (data ?? []) as MeerwerkRegel[]

  // Regie alleen ophalen als er minstens één regie-/geboekte-kosten-regel mét code is.
  const heeftRegie = regels.some(r =>
    (r.afrekenwijze === 'regie' || (r.is_stelpost && r.stelpost_grondslag === 'geboekte_kosten')) && r.bewakingscode)
  const regiePerCode = new Map<string, number>()
  if (heeftRegie) {
    const regie = await getServicedeskRegie(dossierId)
    for (const r of regie.regels) {
      if (r.uitgesloten || !r.bewakingscode) continue
      regiePerCode.set(r.bewakingscode, (regiePerCode.get(r.bewakingscode) ?? 0) + (r.verkoopBedrag || 0))
    }
  }

  // Betalingsschema's van de meerwerkoffertes in één keer, niet per regel: dat bepaalt hoeveel
  // termijnen een regel werkelijk krijgt. Alleen ophalen als er offertes aan hangen.
  const schemaPerOfferte = await leesTermijnschemaPerOfferte(
    regels.filter(r => rekentOpTermijn(r) && r.quote_id).map(r => r.quote_id as string),
  ).catch(() => new Map<string, TermijnschemaRegel[]>())

  let goedgekeurdExcl = 0
  let goedgekeurdIncl = 0
  let goedgekeurdAantal = 0
  let goedgekeurdAangenomenExcl = 0
  let goedgekeurdRegieExcl = 0
  let goedgekeurdNacalculatieExcl = 0
  const views: MeerwerkRegelView[] = regels.map(r => {
    const excl = effectiefExcl(r, regiePerCode)
    const btwPct = r.btw_pct != null ? Number(r.btw_pct) : 21
    const incl = rond(excl * (1 + btwPct / 100))
    const opTermijn = rekentOpTermijn(r)
    if (GOEDGEKEURD.includes(r.status)) {
      goedgekeurdExcl += excl; goedgekeurdIncl += incl; goedgekeurdAantal++
      if (opTermijn) goedgekeurdAangenomenExcl += excl
      else goedgekeurdRegieExcl += excl
      if (rekentOpNacalculatie(r)) goedgekeurdNacalculatieExcl += excl
    }
    return {
      ...r, effectiefExcl: excl, effectiefIncl: incl, btwEffectief: btwPct,
      opNacalculatie: rekentOpNacalculatie(r),
      opTermijn,
      termijnVerwerking: termijnVerwerkingVan(r, opTermijn, schemaPerOfferte),
    }
  })

  return {
    regels: views,
    totalen: {
      aantal: regels.length,
      goedgekeurdAantal,
      goedgekeurdExcl: rond(goedgekeurdExcl),
      goedgekeurdIncl: rond(goedgekeurdIncl),
      goedgekeurdAangenomenExcl: rond(goedgekeurdAangenomenExcl),
      goedgekeurdRegieExcl: rond(goedgekeurdRegieExcl),
      goedgekeurdNacalculatieExcl: rond(goedgekeurdNacalculatieExcl),
    },
  }
}

/**
 * Compacte som van goedgekeurd meerwerk (excl. btw) plus het aantal regels waarop die som rust.
 *
 * Het aantal is nodig om te bepalen óf EVA leidend is boven het Bouw7-aggregaat. Op het bedrag
 * alleen afgaan gaat mis bij netto **minderwerk**: een som van bijvoorbeeld −€ 48.000 betekent niet
 * "geen EVA-regels", maar "per saldo minder werk", en dat hoort het contracttotaal te verlagen.
 */
export async function getGoedgekeurdMeerwerk(
  dossierId: string,
): Promise<{ excl: number; aantal: number }> {
  const { totalen } = await getDossierMeerwerk(dossierId)
  return { excl: totalen.goedgekeurdExcl, aantal: totalen.goedgekeurdAantal }
}

export type NieuweMeerwerkData = {
  omschrijving: string
  afrekenwijze: MeerwerkAfrekenwijze
  is_stelpost?: boolean
  stelpost_grondslag?: MeerwerkStelpostGrondslag | null
  bedrag_excl_btw?: number | null
  eenheid?: string | null
  eenheidsprijs?: number | null
  hoeveelheid_werkelijk?: number | null
  btw_pct?: number | null
  factuurreferentie?: string | null
}

export async function maakMeerwerkRegel(
  dossierId: string,
  data: NieuweMeerwerkData,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  // Muterende actie op de admin-client: zonder deze gate is dit een publiek
  // aanroepbaar endpoint voor iedereen met een sessie -- sinds het klantportaal
  // ook voor opdrachtgevers. vereisSessie en niet vereisRecht('dossiers'): die
  // module staat niet in AFGEDWONGEN_MODULES, dus een rechtencheck zou collega's
  // buitensluiten die dat recht nooit expliciet hebben gekregen. Een
  // portaalgebruiker heeft geen medewerkersrij en komt er hoe dan ook niet door.
  await vereisSessie()
  await assertDossierBewerkbaar(dossierId)
  const supabase = createAdminClient() as any
  const { data: maxRow } = await supabase
    .from('meerwerk_regels')
    .select('volgnummer')
    .eq('dossier_id', dossierId)
    .order('volgnummer', { ascending: false })
    .limit(1)
    .maybeSingle()
  const volgnummer = (maxRow?.volgnummer ?? 0) + 1

  // Bewakingscode wordt bewust NIET hier aangemaakt — dat gebeurt pas bij status 'akkoord'
  // (zie setMeerwerkStatus). Zo staan er geen losse codes in Bouw7 voor nog niet goedgekeurd meerwerk.
  const { data: ins, error } = await supabase
    .from('meerwerk_regels')
    .insert({
      dossier_id: dossierId,
      volgnummer,
      omschrijving: data.omschrijving,
      afrekenwijze: data.afrekenwijze,
      is_stelpost: data.is_stelpost ?? false,
      stelpost_grondslag: data.is_stelpost ? (data.stelpost_grondslag ?? null) : null,
      bedrag_excl_btw: data.bedrag_excl_btw ?? null,
      eenheid: data.eenheid ?? null,
      eenheidsprijs: data.eenheidsprijs ?? null,
      hoeveelheid_werkelijk: data.hoeveelheid_werkelijk ?? null,
      btw_pct: data.btw_pct ?? null,
      factuurreferentie: data.factuurreferentie ?? null,
    })
    .select('id')
    .single()
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/opdrachten/${dossierId}/meerwerk`)
  return { ok: true, id: ins.id }
}

export async function updateMeerwerkRegel(
  id: string,
  patch: Partial<NieuweMeerwerkData> & { termijn_wijze?: MeerwerkTermijnWijze | null },
): Promise<{ ok: true; waarschuwing?: string } | { ok: false; error: string }> {
  // Muterende actie op de admin-client: zonder deze gate is dit een publiek
  // aanroepbaar endpoint voor iedereen met een sessie -- sinds het klantportaal
  // ook voor opdrachtgevers. vereisSessie en niet vereisRecht('dossiers'): die
  // module staat niet in AFGEDWONGEN_MODULES, dus een rechtencheck zou collega's
  // buitensluiten die dat recht nooit expliciet hebben gekregen. Een
  // portaalgebruiker heeft geen medewerkersrij en komt er hoe dan ook niet door.
  await vereisSessie()
  const supabase = createAdminClient() as any
  const { data: bestaand } = await supabase.from('meerwerk_regels').select('*').eq('id', id).single()
  if (bestaand?.dossier_id) await assertDossierBewerkbaar(bestaand.dossier_id)
  const velden: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const k of ['omschrijving', 'afrekenwijze', 'is_stelpost', 'stelpost_grondslag', 'bedrag_excl_btw',
    'eenheid', 'eenheidsprijs', 'hoeveelheid_werkelijk', 'btw_pct', 'factuurreferentie', 'termijn_wijze'] as const) {
    if (k in patch) velden[k] = (patch as any)[k]
  }
  // Stelpost-grondslag alleen relevant bij stelpost.
  if (velden.is_stelpost === false) velden.stelpost_grondslag = null

  const { data: row, error } = await supabase
    .from('meerwerk_regels')
    .update(velden)
    .eq('id', id)
    .select('dossier_id')
    .single()
  if (error) return { ok: false, error: error.message }

  // Twee-weg: een bewerkte EVA-eigen regel die aan een Bouw7-meerwerkregel hangt terugschrijven naar Bouw7.
  // Geïmporteerde regels (bron='bouw7_line') niet — daar is Bouw7 leidend en de sync overschrijft toch.
  let waarschuwing: string | undefined
  if (bestaand?.bron === 'eva' && bestaand.bouw7_line_id != null) {
    const res = await updateMeerwerkInBouw7({ ...(bestaand as MeerwerkRegel), ...(velden as Partial<MeerwerkRegel>) })
    if (!res.ok) waarschuwing = `Wijziging in EVA opgeslagen, maar terugschrijven naar Bouw7 mislukt: ${res.error}`
  }

  // Aangenomen meerwerk dat al als termijn in de Bouw7-termijnstaat staat: bedrag, btw of
  // omschrijving gewijzigd → termijn bijwerken, zodat de factuur straks het juiste bedrag heeft.
  const raaktTermijn = ['bedrag_excl_btw', 'omschrijving', 'btw_pct'].some(k => k in velden)
  if (bestaand?.bouw7_term_id != null && raaktTermijn) {
    const t = await zetMeerwerkAlsTermijn(id)
    if (!t.ok) waarschuwing = [waarschuwing, `Termijn in Bouw7 niet bijgewerkt: ${t.error}`].filter(Boolean).join(' ')
  }

  revalidatePath(`/opdrachten/${row.dossier_id}/meerwerk`)
  return { ok: true, waarschuwing }
}

export async function verwijderMeerwerkRegel(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  // Muterende actie op de admin-client: zonder deze gate is dit een publiek
  // aanroepbaar endpoint voor iedereen met een sessie -- sinds het klantportaal
  // ook voor opdrachtgevers. vereisSessie en niet vereisRecht('dossiers'): die
  // module staat niet in AFGEDWONGEN_MODULES, dus een rechtencheck zou collega's
  // buitensluiten die dat recht nooit expliciet hebben gekregen. Een
  // portaalgebruiker heeft geen medewerkersrij en komt er hoe dan ook niet door.
  await vereisSessie()
  const supabase = createAdminClient() as any
  const { data: row } = await supabase.from('meerwerk_regels').select('dossier_id').eq('id', id).single()
  if (row?.dossier_id) await assertDossierBewerkbaar(row.dossier_id)
  const { error } = await supabase.from('meerwerk_regels').delete().eq('id', id)
  if (error) return { ok: false, error: error.message }
  if (row?.dossier_id) revalidatePath(`/opdrachten/${row.dossier_id}/meerwerk`)
  return { ok: true }
}

/**
 * Statusovergang met validatie. Bij 'akkoord' wordt automatisch een eigen bewakingscode in Bouw7
 * aangemaakt (best effort — een Bouw7-fout blokkeert de statuswijziging niet, maar geeft een
 * waarschuwing terug). Bij 'afgewezen' kan een reden worden vastgelegd.
 */
/**
 * Wie mag hier een besluit nemen, en onder welke naam.
 *
 * Bepaalt de identiteit aan de hand van de sessie en dwingt meteen de bijbehorende
 * rechten af. Gooit als de aanroeper geen van beide is -- dat is de enige gate op
 * deze statuswijziging.
 */
async function bepaalBesluitActor(dossierId: string): Promise<MeerwerkBesluitActor> {
  const mw = await getCurrentMedewerker()
  if (mw) {
    // Een medewerkerssessie volstaat; zie de toelichting bij de andere gates.
    return {
      soort: 'medewerker',
      id: mw.id,
      naam: [mw.voornaam, mw.tussenvoegsel, mw.achternaam].filter(Boolean).join(' ') || 'Onbekend',
    }
  }

  // Geen medewerker: dan moet dit een opdrachtgever zijn die dit dossier in zijn
  // portaal heeft, met meerwerk aangezet. vereisPortaalOnderdeel controleert
  // sessie, eigendom en de vlag in een keer.
  const { gebruiker } = await vereisPortaalOnderdeel(dossierId, 'meerwerk')
  const kop = await headers()
  return {
    soort: 'klant',
    id: gebruiker.id,
    naam: await portaalGebruikerNaam(gebruiker),
    // Vercel zet het echte adres in x-forwarded-for; de eerste is de bezoeker.
    ip: (kop.get('x-forwarded-for') ?? '').split(',')[0].trim() || null,
  }
}

export async function setMeerwerkStatus(
  id: string,
  status: MeerwerkStatus,
  opts?: {
    termijnWijze?: MeerwerkTermijnWijze | null
    afgewezenReden?: string | null
    /** Toelichting van de besluitnemer zelf; los van de interne afgewezen_reden. */
    besluitOpmerking?: string | null
  },
): Promise<{ ok: true; waarschuwing?: string; melding?: string } | { ok: false; error: string }> {
  const supabase = createAdminClient() as any
  const { data: regel, error: leesFout } = await supabase
    .from('meerwerk_regels')
    .select('*')
    .eq('id', id)
    .single()
  if (leesFout || !regel) return { ok: false, error: leesFout?.message ?? 'Meerwerkregel niet gevonden.' }
  const r = regel as MeerwerkRegel
  await assertDossierBewerkbaar(r.dossier_id)

  // Wie is dit? Uit de sessie, nooit uit de aanroep. Een meegegeven actor zou
  // deze functie -- een publiek aanroepbare server-action -- veranderen in een
  // sleutel die iedereen kan omdraaien door zelf een naam mee te sturen.
  //
  // Twee legitieme aanroepers: een medewerker met schrijfrecht op dossiers, of
  // een opdrachtgever die dit dossier in zijn portaal heeft staan met meerwerk
  // aan. Wie geen van beide is, komt hier niet voorbij.
  const actor = await bepaalBesluitActor(r.dossier_id)

  if (r.status !== status && !TRANSITIES[r.status].includes(status)) {
    return { ok: false, error: `Ongeldige statusovergang: ${r.status} → ${status}.` }
  }

  const velden: Record<string, unknown> = { status, updated_at: new Date().toISOString() }
  if (status === 'afgewezen') velden.afgewezen_reden = opts?.afgewezenReden ?? null
  if (opts?.termijnWijze !== undefined) velden.termijn_wijze = opts.termijnWijze

  // Vastleggen wie goedkeurde of afwees. In dezelfde update als de status zelf,
  // zodat besluit en vastlegging niet uit elkaar kunnen lopen. Alleen bij akkoord
  // en afgewezen -- bij de andere statussen valt er niets te verantwoorden.
  if (BESLUIT_STATUSSEN.includes(status)) {
    velden.besluit_op = new Date().toISOString()
    velden.besluit_door_soort = actor.soort
    velden.besluit_door_id = actor.id
    velden.besluit_door_naam = actor.naam
    velden.besluit_ip = actor.ip ?? null
    velden.besluit_opmerking = opts?.besluitOpmerking ?? null
  }

  let waarschuwing: string | undefined

  /*
   * Terug van Akkoord naar Aangevraagd: de gevolgen die het akkoord in Bouw7 had, draaien niet
   * mee terug. De bewakingscode blijft staan (daar kan al op geboekt zijn) en de termijn blijft
   * in de termijnstaat (die kan al gefactureerd zijn). Beide stil weghalen zou erger zijn dan
   * ze laten staan; wel zeggen wat er nog open staat.
   */
  if (r.status === 'akkoord' && status === 'aangevraagd') {
    const blijft = [
      r.bewakingscode ? `bewakingscode ${r.bewakingscode}` : null,
      r.bouw7_term_id != null ? 'de termijn in de termijnstaat' : null,
    ].filter(Boolean)
    if (blijft.length > 0) {
      waarschuwing = `Teruggezet op Aangevraagd. Let op: ${blijft.join(' en ')} blijft in Bouw7 staan — `
        + 'haal dat daar zelf weg als het meerwerk niet doorgaat.'
    }
  }

  /*
   * Akkoord op een meerwerkregel met een eigen offerte: het bedrag van die offerte wordt het
   * bedrag van de regel.
   *
   * Zonder dit bleef `bedrag_excl_btw` leeg bij precies het meerwerk dat het zorgvuldigst is
   * onderbouwd -- je rekent het uit in de calculatie, stuurt de offerte, de klant tekent, en in
   * EVA staat het meerwerk dan nog steeds op niets. Het telde niet mee in het contracttotaal, er
   * ging geen budget naar de bewakingscode, en er kwam geen termijn in de termijnstaat
   * ("geen bedrag"). Dat is precies wat er op dossier "herstellen gevel" gebeurde: offerte van
   * EUR 19.225,35 akkoord, meerwerk in EVA EUR 0,00.
   *
   * Alleen bij `aangenomen` en geen stelpost: regie en stelposten leiden hun bedrag af uit de
   * geboekte kosten of een werkelijke hoeveelheid, en een offertebedrag zou dat overschrijven met
   * een waarde die daarna niet meer meebeweegt. Het btw-percentage vullen we alleen aan als de
   * regel er nog geen heeft -- een handmatig gekozen tarief is een beslissing, geen leeg veld.
   */
  const neemtOfferteOver = status === 'akkoord'
    && r.quote_id != null
    && r.afrekenwijze === 'aangenomen'
    && !r.is_stelpost
  const offerte = neemtOfferteOver ? await leesMeerwerkOfferte(r.quote_id as string).catch(() => null) : null
  const meldingen: string[] = []
  if (offerte && offerte.verkoopExclBtw > 0) {
    const oud = r.bedrag_excl_btw != null ? rond(Number(r.bedrag_excl_btw)) : null
    velden.bedrag_excl_btw = offerte.verkoopExclBtw
    if (r.btw_pct == null && offerte.btwPct != null) velden.btw_pct = offerte.btwPct
    meldingen.push(oud != null && oud !== offerte.verkoopExclBtw
      ? `Bedrag uit de offerte overgenomen: ${euro(offerte.verkoopExclBtw)} (stond op ${euro(oud)})`
      : `Bedrag uit de offerte overgenomen: ${euro(offerte.verkoopExclBtw)}`)
  }

  // Fallback/retry bij akkoord: normaal is de bewakingscode al bij het aanmaken van de regel gezet.
  // De guard bouw7_chapter_id == null voorkomt dubbel aanmaken; alleen voor EVA-native regels zonder
  // Bouw7-koppeling (geïmporteerde/teruggeschreven Bouw7-meerwerkregels krijgen er geen).
  if (status === 'akkoord' && r.bron === 'eva' && r.bouw7_line_id == null && r.bouw7_chapter_id == null) {
    const code = `MW${String(r.volgnummer).padStart(2, '0')}`
    // Wat er als verwachte kosten naar Bouw7 gaat. Is er een offerte, dan de KOSTPRIJS daarvan --
    // nooit het verkoopbedrag: dat draagt AK en winst en zou de verwachte kosten opblazen (zelfde
    // regel als bij stelposten). Zonder offerte blijft het oude gedrag staan: het handmatig
    // ingevoerde bedrag, dat bij gebrek aan beter de enige indicatie is.
    const bedrag = offerte
      ? (offerte.kostprijs || null)
      : (r.afrekenwijze === 'aangenomen' && !r.is_stelpost ? (Number(r.bedrag_excl_btw) || null) : null)
    const res = await maakMeerwerkBewakingscodeBouw7(r.dossier_id, { code, naam: r.omschrijving, bedrag })
    if (res.ok) {
      velden.bewakingscode = code
      velden.bouw7_chapter_id = res.chapterId
      velden.bouw7_security_code_id = res.pslId
      if (res.waarschuwing) waarschuwing = res.waarschuwing
    } else {
      // Bouw7-write mislukt → statuswijziging gaat door; code lokaal vastleggen zodat EVA hem toont.
      velden.bewakingscode = code
      waarschuwing = `Status op Akkoord gezet, maar bewakingscode in Bouw7 aanmaken mislukt: ${res.error}`
    }
  }

  const { error } = await supabase.from('meerwerk_regels').update(velden).eq('id', id)
  if (error) return { ok: false, error: error.message }

  // Statuswijziging terugschrijven naar Bouw7 als de regel aan een Bouw7-meerwerkregel hangt.
  if (r.bouw7_line_id != null) {
    const res = await updateMeerwerkInBouw7({ ...r, ...(velden as Partial<MeerwerkRegel>), status })
    if (!res.ok) {
      waarschuwing = [waarschuwing, `Status in EVA bijgewerkt, maar terugschrijven naar Bouw7 mislukt: ${res.error}`]
        .filter(Boolean).join(' ')
    }
  }

  // Aangenomen meerwerk (vaste prijs, geen stelpost) bij akkoord als termijn in de Bouw7-
  // termijnstaat zetten, zodat het vanuit de Verkoop-tab te factureren is. Regie en stelposten
  // gaan via de nacalculatie. Mislukt het, dan blijft `bouw7_term_id` leeg en probeert de cron
  // het opnieuw.
  const naStatus = { ...(r as Regelvelden), ...(velden as Partial<Regelvelden>), status } as Regelvelden
  let termijnGezet = false
  if (status === 'akkoord' && meerwerkTermijnGeschikt(naStatus).ok && r.bouw7_term_id == null) {
    const t = await zetMeerwerkAlsTermijn(id)
    termijnGezet = t.ok
    if (t.ok) {
      meldingen.push(t.termIds.length > 1
        ? `${t.termIds.length} termijnen in de termijnstaat gezet, volgens het betalingsschema van de offerte`
        : 'Als termijn in de termijnstaat gezet')
    }
    if (!t.ok) {
      waarschuwing = [waarschuwing, `Nog niet als termijn in Bouw7: ${t.error}`].filter(Boolean).join(' ')
      // Herkansing via de cron — alleen voor déze regel, niet voor historisch meerwerk.
      await supabase.from('meerwerk_regels').update({ bouw7_term_pending: true }).eq('id', id)
    }
  }

  // Akkoord meerwerk krijgt een bewakingscode en telt mee in de projectcijfers; die kant komt
  // uit Bouw7 en moet dus opnieuw opgehaald worden. De meerwerklijst zelf is EVA-eigen en klopt al.
  // Is er zojuist een termijn bijgekomen, dan moet de termijnstaat er ook meteen kloppen: daar
  // kijkt de gebruiker op de Verkoop-tab naar en daar zet hij de factuur mee klaar.
  if ((r.bouw7_line_id != null || termijnGezet) && r.dossier_id) {
    await ververSnapshotsNaSchrijven(
      r.dossier_id,
      termijnGezet ? ['termijnen', 'athena_control'] : ['athena_control'],
      ['athena_financial', 'security_links'],
    )
  }
  revalidatePath(`/opdrachten/${r.dossier_id}/meerwerk`)
  return { ok: true, waarschuwing, melding: meldingen.length ? meldingen.join(' · ') : undefined }
}

/** De velden die `meerwerkTermijnGeschikt` beoordeelt (subset van MeerwerkRegel + bouw7_term_id). */
type Regelvelden = Parameters<typeof meerwerkTermijnGeschikt>[0]

/**
 * Zorgt dat het **dossier-calculatieproject** bestaat en geeft het project-id terug — géén apart
 * project en géén offerte. De meerwerk-calculatie is een scenario ín dit dossier-project (gemarkeerd
 * met meerwerk_regel_id, zie `maakMeerwerkScenario`), zodat hij onder het Calculatie-tab terugkomt.
 * De client maakt/opent dat scenario en maakt er via de normale flow (lay-out-keuze) de offerte van.
 */
export async function maakMeerwerkCalculatie(
  regelId: string,
): Promise<{ ok: true; projectId: string; dossierId: string; omschrijving: string } | { ok: false; error: string }> {
  // Muterende actie op de admin-client: zonder deze gate is dit een publiek
  // aanroepbaar endpoint voor iedereen met een sessie -- sinds het klantportaal
  // ook voor opdrachtgevers. vereisSessie en niet vereisRecht('dossiers'): die
  // module staat niet in AFGEDWONGEN_MODULES, dus een rechtencheck zou collega's
  // buitensluiten die dat recht nooit expliciet hebben gekregen. Een
  // portaalgebruiker heeft geen medewerkersrij en komt er hoe dan ook niet door.
  await vereisSessie()
  const supabase = createAdminClient() as any
  const { data: regel } = await supabase
    .from('meerwerk_regels')
    .select('id, dossier_id, omschrijving')
    .eq('id', regelId)
    .single()
  if (!regel) return { ok: false, error: 'Meerwerkregel niet gevonden.' }
  await assertDossierBewerkbaar(regel.dossier_id)

  const { data: dossier } = await supabase
    .from('dossiers')
    .select('everts_calc_project_id')
    .eq('id', regel.dossier_id)
    .single()
  let projectId: string | null = dossier?.everts_calc_project_id ?? null
  if (!projectId) {
    // Geen dossier-calculatieproject? Zelf aanmaken en koppelen (idempotent).
    const kp = await koppelCalculatieProject(regel.dossier_id)
    if (!kp.ok) return { ok: false, error: kp.error }
    projectId = kp.projectId
  }

  return { ok: true, projectId, dossierId: regel.dossier_id, omschrijving: regel.omschrijving }
}

// ─── Nieuwe meerwerkregel naar Bouw7 schrijven (POST additional-work-line) ─────

/** EVA-status → Bouw7-meerwerkstatus. */
const EVA_STATUS_NAAR_BOUW7: Record<MeerwerkStatus, number> = {
  aangevraagd: 0,        // Geregistreerd
  offerte_verstuurd: 0,  // (geen Bouw7-equivalent) → Geregistreerd
  akkoord: 1,            // Akkoord
  afgewezen: 2,          // Niet akkoord
  voltooid: 3,           // Opgeleverd
}

/**
 * Bouwt de Bouw7 additional-work-line-body uit een EVA-regel. `executor` (Aangevraagd door) = de
 * Bouw7-klant van het dossier; ontbreekt die, dan wordt het veld weggelaten (leeg in Bouw7).
 * `id` wordt door de aanroeper toegevoegd bij een update.
 */
async function bouwBouw7MeerwerkBody(regel: MeerwerkRegel): Promise<Record<string, unknown>> {
  const supabase = createAdminClient() as any
  const { data: dossier } = await supabase
    .from('dossiers')
    .select('klant:relaties(bouw7_id)')
    .eq('id', regel.dossier_id)
    .single()
  const executorId = dossier?.klant?.bouw7_id

  const mw = await getDossierMeerwerk(regel.dossier_id)
  const view = mw.regels.find(r => r.id === regel.id)
  const verkoop = rond(view?.effectiefExcl ?? (Number(regel.bedrag_excl_btw) || 0))
  const begroot = rond(regel.begroot_bedrag != null ? Number(regel.begroot_bedrag) : 0)

  const body: Record<string, unknown> = {
    description: regel.omschrijving,
    cost: String(verkoop),
    budgetAmount: String(begroot),
    date: (regel.created_at ? String(regel.created_at) : new Date().toISOString()).slice(0, 10),
    // Bouw7 valideert `note` als NotBlank (leeg/ontbrekend => 400). Zonder factuurreferentie
    // vullen we daarom de omschrijving in.
    note: regel.factuurreferentie?.trim() || regel.omschrijving?.trim() || 'Meerwerk',
    status: EVA_STATUS_NAAR_BOUW7[regel.status] ?? 0,
    isProvisional: !!regel.is_stelpost,
  }
  if (executorId) body.executor = { id: Number(executorId) }
  return body
}

/**
 * Schrijft een EVA-meerwerkregel als echte meerwerkregel naar Bouw7
 * (`POST /project/{projectId}/additional-work-line`, Heimdall — upsert; `id` weggelaten = create).
 * Na aanmaken worden het teruggegeven Bouw7-id + MW-nummer op de EVA-regel vastgelegd (en de
 * bronsleutel, tegen dubbele import). Regels die al aan een Bouw7-regel hangen worden overgeslagen.
 */
export async function stuurMeerwerkNaarBouw7(
  regelId: string,
): Promise<{ ok: true; nummer: string | null } | { ok: false; error: string }> {
  // Muterende actie op de admin-client: zonder deze gate is dit een publiek
  // aanroepbaar endpoint voor iedereen met een sessie -- sinds het klantportaal
  // ook voor opdrachtgevers. vereisSessie en niet vereisRecht('dossiers'): die
  // module staat niet in AFGEDWONGEN_MODULES, dus een rechtencheck zou collega's
  // buitensluiten die dat recht nooit expliciet hebben gekregen. Een
  // portaalgebruiker heeft geen medewerkersrij en komt er hoe dan ook niet door.
  await vereisSessie()
  const supabase = createAdminClient() as any
  const { data: regel } = await supabase.from('meerwerk_regels').select('*').eq('id', regelId).single()
  if (!regel) return { ok: false, error: 'Meerwerkregel niet gevonden.' }
  await assertDossierBewerkbaar(regel.dossier_id)
  if (regel.bouw7_line_id) return { ok: true, nummer: regel.bouw7_nummer ?? null }

  const ctx = await bouw7VoorDossier(regel.dossier_id)
  if (!ctx) return { ok: false, error: 'Dossier is niet aan een Bouw7-project gekoppeld.' }
  const { client, bouw7Id } = ctx

  const body = await bouwBouw7MeerwerkBody(regel as MeerwerkRegel)

  let created: { id?: number; number?: string }
  try {
    created = await client.post<{ id?: number; number?: string }>(`/project/${bouw7Id}/additional-work-line`, body)
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Aanmaken in Bouw7 mislukt.' }
  }
  if (!created?.id) return { ok: false, error: 'Bouw7 gaf geen meerwerkregel-id terug.' }

  await supabase
    .from('meerwerk_regels')
    .update({
      bouw7_line_id: created.id,
      bouw7_nummer: created.number ?? null,
      bouw7_bron_sleutel: `line:${created.id}`,
      updated_at: new Date().toISOString(),
    })
    .eq('id', regelId)

  // De regel bestaat nu ook in Bouw7 en telt daar mee in de projectcijfers.
  if (regel.dossier_id) {
    await ververSnapshotsNaSchrijven(regel.dossier_id, ['athena_control'], ['athena_financial'])
  }
  revalidatePath(`/opdrachten/${regel.dossier_id}/meerwerk`)
  return { ok: true, nummer: created.number ?? null }
}

/**
 * Werkt een al aan Bouw7 gekoppelde meerwerkregel bij (zelfde POST-endpoint mét `id` = update in het
 * Bouw7-upsertpatroon). Gebruikt voor het terugschrijven van o.a. statuswijzigingen. Best effort.
 */
async function updateMeerwerkInBouw7(regel: MeerwerkRegel): Promise<{ ok: boolean; error?: string }> {
  if (regel.bouw7_line_id == null) return { ok: true }
  const ctx = await bouw7VoorDossier(regel.dossier_id)
  if (!ctx) return { ok: false, error: 'Geen Bouw7-koppeling.' }
  const body = await bouwBouw7MeerwerkBody(regel)
  body.id = regel.bouw7_line_id
  try {
    await ctx.client.post(`/project/${ctx.bouw7Id}/additional-work-line`, body)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Bouw7-update mislukt.' }
  }
}
