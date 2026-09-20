import 'server-only'
import { createAdminClient } from '@everts/database/server'
import { haalOpenstaandeUren, verdeelNaarRol, type OpenUurRegel } from '@/lib/uren/openstaande-uren'
import { isoWeek, weekStartVan } from '@/lib/uren/rooster'
import { periodeBereik } from '@/lib/uren/types'
import { signBonnen } from '@/lib/uren/bonnen'
import type { OnkostenSoort, Vervoermiddel } from '@/lib/uren/onkosten'

/**
 * Datalaag van het mobiele fiatteerscherm (`/m/uren/keuren`).
 *
 * Dit is het enige scherm onder `/m` dat wél een Bouw7-call doet, en dat mag:
 * je opent het met de bedoeling uren te beoordelen. Het startscherm doet die call
 * bewust niet (zie `lib/mobiel/home.ts`).
 *
 * JE KEURT EEN WEEK, NIET EEN REGEL. Dat is de vorm waarin een teamleider erover denkt --
 * "heeft Jan zijn week goed geschreven" -- en het is ook de korrel waarin uren ontstaan. De
 * lijst is daarom gegroepeerd per medewerker per week, met daarbinnen een rij per dag.
 * Gemeten over 552 medewerker-weken (juni-sep 2026) is dat mediaan vijf rijen: een week past
 * op één telefoonscherm.
 *
 * DE BEWAKINGSCODE STAAT IN DE KOP, NIET IN DE TABEL. In tweederde van de weken is er maar
 * één code voor de hele week; die vijf keer herhalen maakt de afwijkende dag juist onzichtbaar.
 * De kop toont dus per dossier+code hoeveel uur er op staat -- dat is de codecontrole -- en de
 * dagrijen dragen de code alleen als de week er meer dan één heeft.
 *
 * De autorisatie zit NIET hier maar in `verdeelNaarRol` en `keurUrenGoed`: die bepalen uit de
 * routering wat jij mag. Dit bestand maakt er alleen een vorm van die op een telefoon te lezen
 * is. Regels die niet van jou zijn komen wél mee (zie `magKeuren`), maar uitsluitend voor weken
 * die je toch al beoordeelt en zonder tarief of bedrag.
 */

/** Eén te beoordelen uurregel, uitgekleed tot wat op een telefoon past. */
export type KeurRegel = {
  /** Bouw7 hour-log-id; dit gaat terug naar `keurUrenGoed`. */
  id: number
  datum: string
  uren: number
  uursoort: string | null
  opmerking: string | null
  medewerkerNaam: string
  bewakingscode: string | null
  /**
   * In welke rol jij deze regel beoordeelt. Er is er altijd maar één aan zet: een
   * regel die nog op de teamleider wacht komt niet bij de projectleider in beeld.
   * Ben je op hetzelfde dossier allebei, dan sta je hier als teamleider en handelt
   * `keurUrenGoed` beide stappen in één keer af.
   *
   * `goedkeurder` is de verlofroute: dit zijn niet-gewerkte uren (verlof, ziek, vakantie,
   * feestdag, tijd-voor-tijd) van iemand die jou als goedkeurder heeft. Dan is het dossier
   * niet in beeld -- jij bent de enige stap.
   */
  rol: 'projectleider' | 'teamleider' | 'goedkeurder'
  /**
   * Jouw akkoord is niet het laatste woord: als teamleider met een (andere)
   * projectleider op het dossier gaat de vlag in Bouw7 pas om als hij ook gekeken
   * heeft. Dat hoort op het scherm te staan, anders denk je dat je klaar bent.
   */
  wachtDaarnaOpProjectleider: boolean
  /**
   * Mag ik deze regel op mijn telefoon nog aanpassen?
   *
   * Alleen de teamleider, en alleen vóór zijn akkoord. Dat is de hele bedoeling van
   * de teamleiderstap: de uren kloppend maken vóórdat ze doorschuiven. Zodra hij
   * akkoord geeft verdwijnt de regel uit zijn lijst en is bewerken op mobiel voorbij
   * — corrigeren daarna hoort bij de projectleider, op de computer.
   */
  magBewerken: boolean
  /**
   * Deze regel ligt nog bij de teamleider; jij bent de projectleider.
   *
   * Hij staat er bewust wél tussen. De volgorde is teamleider-eerst, maar een teamleider gaat
   * ook met verlof — en dan mogen de uren van zijn ploeg niet wekenlang blijven hangen. De
   * projectleider ziet ze dus, en kan er met een bevestiging overheen.
   */
  wachtOpTeamleider: boolean
  /** Wie er nog naar moet kijken; komt terug in de bevestigingsvraag. */
  teamleiderNaam: string | null
  /** Nodig om de bewakingscodes van dit dossier op te halen in het bewerkvenster. */
  dossierId: string | null

  /** Het project; de dagrij toont het nummer als de week over meer dan één dossier loopt. */
  projectNummer: string | null
  projectNaam: string | null

  /**
   * Verlof, ziek, vakantie, feestdag, tijd-voor-tijd. Zulke uren horen geen bewakingscode te
   * hebben: ze krijgen er dus geen blok in de kop en worden nooit als "code ontbreekt"
   * gemarkeerd.
   */
  nietGewerkt: boolean

  /**
   * Mag ik deze regel afvinken?
   *
   * Vrijwel altijd waar. Onwaar voor de regels die alleen als CONTEXT meekomen: uren uit
   * dezelfde week van dezelfde medewerker die bij iemand anders liggen. Die staan erbij omdat
   * een week die 24 van de 38,5 uur toont een kloppend beeld suggereert dat er niet is -- je
   * zou een halve week goedkeuren in de veronderstelling dat het de hele was.
   */
  magKeuren: boolean
  /** Bij wie de regel dan wél ligt, in gewone taal. Alleen gevuld als `magKeuren` onwaar is. */
  ligtBij: string | null

  /**
   * Gewerkte uren zonder bewakingscode. Dat is de fout die deze stap moet vangen: 27% van alle
   * gewerkte regels (3.902 uur sinds juni 2026) heeft er geen, en zonder code zakt het uur
   * ongemerkt de projectadministratie in. Verlof en ATV horen er geen te hebben en worden
   * daarom nooit gemarkeerd.
   */
  codeOntbreekt: boolean
}

/**
 * Eén dossier+code-combinatie binnen een week, met het aantal uren dat erop staat.
 *
 * Dit is de kop van de weekstaat en tegelijk de plek waar je hercodeert: tik je hem aan, dan
 * verplaats je alle uren van dat blok in één handeling. Acht uur zonder code is zo één keuze
 * in plaats van vijf losse correcties.
 */
export type KeurCodeBlok = {
  sleutel: string
  projectNummer: string | null
  projectNaam: string | null
  dossierId: string | null
  code: string | null
  uren: number
  /** De regels in dit blok die ik mag bijstellen; leeg maakt het blok alleen-lezen. */
  regelIds: number[]
  /** Gewerkte uren zonder code — het blok dat om aandacht vraagt. */
  ontbreekt: boolean
}

/** Alle uren van één medewerker in één week: de eenheid waarin je op mobiel goedkeurt. */
export type KeurWeek = {
  /** medewerker + maandag van de week; stabiel genoeg als React-sleutel. */
  sleutel: string
  medewerkerNaam: string
  weekNr: number
  jaar: number
  /** Maandag van de week, als 'YYYY-MM-DD'. */
  weekStart: string
  /** De dossier+code-verdeling; in tweederde van de weken één regel. */
  blokken: KeurCodeBlok[]
  /** Dagrijen, op datum. Inclusief de contextregels (`magKeuren` onwaar). */
  regels: KeurRegel[]
  /** Wat ik mag afvinken. */
  mijnRegels: number
  mijnUren: number
  /** Alles wat er in deze week open staat, dus inclusief context. */
  totaalUren: number
  /**
   * Meer dan één code in de week: dan pas dragen de dagrijen hem ook. Bij één code staat hij
   * al in de kop en zou herhalen alleen ruis zijn.
   */
  toonCodePerRegel: boolean
  /** Gewerkte regels zonder code; zolang dit boven nul staat is de week niet af te vinken. */
  ontbrekendeCodes: number
}


/**
 * Een ingediende kostenpost van iemand wiens uren jij beoordeelt.
 *
 * Alleen-lezen: onkosten hangen aan een EVA-week en niet aan een Bouw7 hour-log, dus er is
 * geen goedkeurvlag om om te zetten. Ze staan hier omdat je bij het fiatteren wilt zien wat
 * je mensen die week aan kosten hebben gedeclareerd -- inclusief het bonnetje.
 */
export type KeurOnkosten = {
  id: string
  datum: string
  medewerkerNaam: string
  soort: OnkostenSoort
  vervoermiddel: Vervoermiddel | null
  km: number | null
  bedrag: number
  omschrijving: string | null
  /** Verse signed URL; de bonnen-bucket is prive. */
  bonUrl: string | null
}

export type KeurData = {
  weken: KeurWeek[]
  totaalRegels: number
  totaalUren: number
  /**
   * Hoeveel van de getoonde regels nog bij de teamleider liggen. Ze staan gewoon in de
   * lijst — de projectleider moet er tijdens diens verlof bij kunnen — maar fiatteren
   * vraagt een bevestiging.
   */
  wachtOpTeamleider: number
  /** Gewerkte regels zonder bewakingscode, over alle weken heen. Stuurt de kop van het scherm. */
  ontbrekendeCodes: number
  /** Parkeer- en reiskosten van dezelfde mensen over dezelfde periode. Alleen-lezen. */
  onkosten: KeurOnkosten[]
  /** Bouw7 was niet bereikbaar; dan tonen we dat in plaats van "niets te doen". */
  fout: string | null
}

const rondUren = (n: number) => Math.round(n * 100) / 100

export async function haalTeKeuren(medewerkerId: string): Promise<KeurData> {
  const { van, tot } = periodeBereik('te_keuren')
  const res = await haalOpenstaandeUren(van, tot)
  if (res.fout) {
    return {
      weken: [], totaalRegels: 0, totaalUren: 0, wachtOpTeamleider: 0,
      ontbrekendeCodes: 0, onkosten: [], fout: res.fout,
    }
  }

  const rol = verdeelNaarRol(res.regels, medewerkerId)

  // Drie bronnen, oplopend in zeggenschap: eerst wat nog bij de teamleider ligt, dan wat op
  // mijn projectleider-akkoord staat, en als laatste mijn eigen teamleider-werk. Later
  // toegevoegd wint, zodat een regel waarop ik meerdere petten heb bij de sterkste belandt.
  const mijn = new Map<number, KeurRegel>()
  for (const r of rol.wachtNogOpTeamleider) mijn.set(r.id, maakRegel(r, 'projectleider', true))
  for (const r of rol.alsProjectleider) mijn.set(r.id, maakRegel(r, 'projectleider'))
  for (const r of rol.alsTeamleider) mijn.set(r.id, maakRegel(r, 'teamleider'))
  // Niet-gewerkte uren met een eigen goedkeurder staan los van de dossierroute: deze regels
  // kunnen bij niemand anders liggen, dus de volgorde hierboven raakt ze niet.
  for (const r of rol.alsVasteGoedkeurder) mijn.set(r.id, maakRegel(r, 'goedkeurder'))

  const bron = new Map<number, OpenUurRegel>(res.regels.map(r => [r.id, r]))

  // Alleen de weken waarin ík iets te doen heb. De contextregels hieronder zijn uren van
  // collega's; ze horen alleen in beeld te komen voor een week die je toch al beoordeelt.
  const mijnWeken = new Set<string>()
  for (const id of mijn.keys()) {
    const b = bron.get(id)
    if (b?.datum) mijnWeken.add(weekSleutel(b))
  }

  const perWeek = new Map<string, KeurRegel[]>()
  for (const r of res.regels) {
    if (!r.datum) continue
    const sleutel = weekSleutel(r)
    if (!mijnWeken.has(sleutel)) continue
    const rij = perWeek.get(sleutel) ?? []
    rij.push(mijn.get(r.id) ?? maakContextRegel(r))
    perWeek.set(sleutel, rij)
  }

  const weken: KeurWeek[] = []
  for (const [sleutel, regels] of perWeek) {
    // Op datum, dan op uursoort: zo lees je het als een weekstaat en niet als de willekeurige
    // volgorde waarin Bouw7 ze teruggaf.
    regels.sort((a, b) =>
      a.datum !== b.datum
        ? a.datum.localeCompare(b.datum)
        : (a.uursoort ?? '').localeCompare(b.uursoort ?? '', 'nl'))

    const eerste = regels[0]
    const { jaar, week } = isoWeek(eerste.datum)
    const mijnRegels = regels.filter(r => r.magKeuren)
    const blokken = maakBlokken(regels)

    weken.push({
      sleutel,
      medewerkerNaam: eerste.medewerkerNaam,
      weekNr: week,
      jaar,
      weekStart: weekStartVan(eerste.datum),
      blokken,
      regels,
      mijnRegels: mijnRegels.length,
      mijnUren: rondUren(mijnRegels.reduce((s, r) => s + r.uren, 0)),
      totaalUren: rondUren(regels.reduce((s, r) => s + r.uren, 0)),
      // Eén blok betekent: één dossier met één code voor de hele week. Dan staat de code al
      // in de kop en zou hij op elke dagrij herhalen alleen ruis zijn.
      toonCodePerRegel: blokken.length > 1,
      // Alleen wat ík kan rechtzetten telt als blokkade. Een contextregel zonder code is het
      // probleem van een andere beoordelaar en mag mijn week niet tegenhouden.
      ontbrekendeCodes: mijnRegels.filter(r => r.codeOntbreekt).length,
    })
  }

  // Oudste week bovenaan: wat het langst wacht hoort het eerst weggewerkt te worden.
  weken.sort((a, b) =>
    a.weekStart !== b.weekStart
      ? a.weekStart.localeCompare(b.weekStart)
      : a.medewerkerNaam.localeCompare(b.medewerkerNaam, 'nl'))

  const alles = [...mijn.values()]
  return {
    weken,
    totaalRegels: alles.length,
    totaalUren: rondUren(alles.reduce((s, r) => s + r.uren, 0)),
    wachtOpTeamleider: alles.filter(r => r.wachtOpTeamleider).length,
    ontbrekendeCodes: alles.filter(r => r.codeOntbreekt).length,
    onkosten: await haalOnkosten(
      [...mijn.keys()].map(id => bron.get(id)).filter((r): r is OpenUurRegel => !!r),
      van, tot,
    ),
    fout: null,
  }
}

/**
 * Medewerker + maandag van de week. Valt terug op de naam als Bouw7 een medewerker teruggeeft
 * die EVA niet kent: die uren horen dan nog steeds bij één persoon, en zonder terugval zouden
 * ze allemaal op één hoop belanden.
 */
function weekSleutel(r: OpenUurRegel): string {
  return `${r.medewerkerId ?? r.medewerkerNaam}|${weekStartVan(r.datum)}`
}

/**
 * De dossier+code-verdeling van een week — de kop van de weekstaat.
 *
 * Verlof en ziekte krijgen geen blok: die horen geen bewakingscode te hebben, en een blok
 * "— geen code —" voor acht uur vakantie zou een probleem suggereren dat er niet is.
 */
function maakBlokken(regels: KeurRegel[]): KeurCodeBlok[] {
  const blokken = new Map<string, KeurCodeBlok>()

  for (const r of regels) {
    if (r.nietGewerkt) continue
    const sleutel = `${r.dossierId ?? r.projectNummer ?? 'geen'}|${r.bewakingscode ?? ''}`
    const blok = blokken.get(sleutel) ?? {
      sleutel,
      projectNummer: r.projectNummer,
      projectNaam: r.projectNaam,
      dossierId: r.dossierId,
      code: r.bewakingscode,
      uren: 0,
      regelIds: [],
      ontbreekt: r.codeOntbreekt,
    }
    blok.uren = rondUren(blok.uren + r.uren)
    // Alleen regels die ik zelf mag bijstellen; anders zou hercoderen op het blok stil de
    // helft overslaan en een ander deel wél verplaatsen.
    if (r.magBewerken) blok.regelIds.push(r.id)
    blokken.set(sleutel, blok)
  }

  // Wat een code mist bovenaan: dat is waar deze stap voor bestaat. Daarna op omvang.
  return [...blokken.values()].sort((a, b) =>
    a.ontbreekt !== b.ontbreekt ? (a.ontbreekt ? -1 : 1) : b.uren - a.uren)
}

/**
 * De onkosten van de mensen wier uren ik beoordeel, over dezelfde periode.
 *
 * De kring komt uit de Bouw7-regels die we toch al hadden: zie ik jouw uren, dan zie ik ook
 * wat je die periode aan kosten indiende. Er is geen aparte rol voor -- een kostenpost hangt
 * aan een week en niet aan een dossier, dus hem per project toewijzen kan niet.
 *
 * De query is begrensd door de medewerkerslijst en het datumbereik en blijft daarmee ruim
 * onder de PostgREST-grens van 1000 rijen.
 */
/** De kolommen die `haalOnkosten` opvraagt; los benoemd zodat er geen any aan te pas komt. */
type OnkostenRij = {
  id: string
  datum: string
  medewerker_id: string
  soort: string
  vervoermiddel: string | null
  km: number | string | null
  bedrag: number | string
  omschrijving: string | null
  bon_pad: string | null
}

async function haalOnkosten(
  regels: { medewerkerId: string | null; medewerkerNaam: string }[],
  van: string,
  tot: string,
): Promise<KeurOnkosten[]> {
  const namen = new Map<string, string>()
  for (const r of regels) if (r.medewerkerId) namen.set(r.medewerkerId, r.medewerkerNaam)
  if (namen.size === 0) return []

  const { data, error } = await createAdminClient()
    .from('uren_onkosten')
    .select('id, datum, medewerker_id, soort, vervoermiddel, km, bedrag, omschrijving, bon_pad')
    .in('medewerker_id', [...namen.keys()])
    .gte('datum', van)
    .lte('datum', tot)
    .order('datum')
  if (error || !data) return []

  const rijen = data as OnkostenRij[]
  const bonLinks = await signBonnen(rijen.map(r => r.bon_pad))

  return rijen.map(r => ({
    id: r.id,
    datum: r.datum,
    medewerkerNaam: namen.get(r.medewerker_id) ?? '-',
    soort: r.soort as OnkostenSoort,
    vervoermiddel: (r.vervoermiddel as Vervoermiddel) ?? null,
    km: r.km == null ? null : Number(r.km),
    bedrag: Number(r.bedrag),
    omschrijving: r.omschrijving ?? null,
    bonUrl: bonLinks.get(r.bon_pad ?? '') ?? null,
  }))
}

type BronRegel = OpenUurRegel

/**
 * Gewerkte uren op een echt project zonder bewakingscode: die mogen niet door, want in Bouw7
 * belanden ze op de ongecodeerde hoop. Verlof en ATV horen geen code te hebben, en op een
 * indirecte-urendossier valt niets te bewaken -- daar houdt de code dus niemand tegen.
 */
const mistCode = (r: BronRegel) => !r.nietGewerkt && !r.indirectDossier && !r.bewakingscode

function maakRegel(r: BronRegel, rol: KeurRegel['rol'], wachtOpTeamleider = false): KeurRegel {
  // Ben ik zelf ook de projectleider, dan schuift er niets door en handelt
  // `keurUrenGoed` beide stappen in één keer af — dan hoort het badge er niet.
  const eigenProjectleider = r.projectleiderId != null && r.projectleiderId === r.teamleiderId

  return {
    id: r.id,
    datum: r.datum,
    uren: r.uren,
    uursoort: r.uursoort,
    opmerking: r.opmerking,
    medewerkerNaam: r.medewerkerNaam,
    bewakingscode: r.bewakingscode,
    rol,
    // De goedkeurder van niet-gewerkte uren is eindstation: na zijn akkoord gaat de vlag in
    // Bouw7 meteen om.
    wachtDaarnaOpProjectleider:
      rol === 'teamleider' && Boolean(r.projectleiderId) && !eigenProjectleider,
    // Bewerken hoort bij de laatste stap vóór goedkeuring: de teamleider, of -- bij verlof en
    // ziekte -- de goedkeurder van die medewerker. Slaat de projectleider de teamleiderstap
    // over, dan corrigeert hij op de computer, niet hier.
    magBewerken: rol === 'teamleider' || rol === 'goedkeurder',
    wachtOpTeamleider,
    teamleiderNaam: r.teamleiderNaam,
    dossierId: r.dossierId,
    projectNummer: r.projectNummer,
    projectNaam: r.projectNaam,
    nietGewerkt: r.nietGewerkt,
    magKeuren: true,
    ligtBij: null,
    codeOntbreekt: mistCode(r),
  }
}

/**
 * Een regel die NIET van mij is, maar wel in een week staat die ik beoordeel.
 *
 * Alleen-lezen en zonder tarief: het is context, geen werkvoorraad. Zonder deze rijen zou een
 * week van 38,5 uur als 24 uur op het scherm staan en zou je een halve week goedkeuren in de
 * veronderstelling dat het de hele was.
 */
function maakContextRegel(r: BronRegel): KeurRegel {
  const ligtBij =
    r.status === 'wacht_op_vaste_goedkeurder' ? r.vasteGoedkeurderNaam
    : r.status === 'wacht_op_teamleider' ? r.teamleiderNaam
    : r.status === 'niet_toe_te_wijzen' ? null
    : r.projectleiderNaam

  return {
    id: r.id,
    datum: r.datum,
    uren: r.uren,
    uursoort: r.uursoort,
    opmerking: r.opmerking,
    medewerkerNaam: r.medewerkerNaam,
    bewakingscode: r.bewakingscode,
    // De rol slaat op wie er aan zet is; voor een contextregel is dat per definitie niet ik.
    // 'projectleider' is hier alleen de rustigste weergave — het scherm kijkt naar `magKeuren`.
    rol: 'projectleider',
    wachtDaarnaOpProjectleider: false,
    magBewerken: false,
    wachtOpTeamleider: false,
    teamleiderNaam: r.teamleiderNaam,
    dossierId: r.dossierId,
    projectNummer: r.projectNummer,
    projectNaam: r.projectNaam,
    nietGewerkt: r.nietGewerkt,
    magKeuren: false,
    ligtBij: ligtBij ?? 'niemand — rollen ontbreken',
    codeOntbreekt: mistCode(r),
  }
}

/**
 * Sta ik op minstens één dossier als teamleider of projectleider?
 *
 * Dit is géén afscherming — `getMijnTeKeurenUren` en `keurUrenGoed` bepalen zelf wat
 * jij mag — maar een goedkope voorvraag uit de eigen database. Hij bepaalt of het zin
 * heeft om de dúre telling te doen: die kost een gepagineerde Bouw7-ophaal, en voor de
 * meeste medewerkers is het antwoord altijd nul. Zonder deze vraag zou elke telefoon
 * die `/m` opent Bouw7 aanroepen voor niets.
 */
export async function isFiatteerder(medewerkerId: string): Promise<boolean> {
  const supabase = createAdminClient()
  const { count, error } = await supabase
    .from('dossiers')
    .select('id', { count: 'exact', head: true })
    .or(`teamleider_id.eq.${medewerkerId},project_manager_id.eq.${medewerkerId}`)
  if (!error && (count ?? 0) > 0) return true

  // Of er staan medewerkers die mij als goedkeurder van hun verlof en ziekte hebben; die route
  // loopt niet via een dossier, dus zonder deze vraag zou hij nooit een lijst te zien krijgen.
  const { count: eigen, error: fout } = await supabase
    .from('medewerkers')
    .select('id', { count: 'exact', head: true })
    .eq('uren_goedkeurder_id', medewerkerId)
  return !fout && (eigen ?? 0) > 0
}
