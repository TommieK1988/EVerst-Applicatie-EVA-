'use server'

// Goedkeuren van uren die in Bouw7 zijn ingevoerd.
//
// De EVA-weekstaat heeft zijn eigen keten (lib/uren/goedkeuring.ts), maar die werkt alleen op weken
// die via EVA zijn ingediend. Alle uren die er nu zijn komen uit Bouw7 zelf. Dit bestand maakt die
// alsnog te accorderen, zodat er steeds minder in Bouw7 hoeft te gebeuren.
//
// WIE MAG WAT. Bouw7 legt niet vast wie moet goedkeuren -- het kent alleen de vlag `isApproved`, en
// achteraf wie hem omzette. Er zijn ook geen goedkeuring-endpoints voor uren (/list/approvals geeft
// 404; die bestaan alleen voor contracten en inkoopfacturen). EVA bepaalt de routering dus zelf,
// en wel in de eerste plaats uit de PROJECTROLLEN OP HET DOSSIER waarop de uren geboekt zijn --
// `dossiers.teamleider_id` en `dossiers.project_manager_id`. Wie de uren beoordeelt hangt dus af
// van het werk, niet van waar iemand organisatorisch hangt -- dus niet uit de ploeg waar de
// medewerker in zit.
//
// DE UURSOORT BEPAALT WELKE ROUTE GELDT. Een regel is óf gewerkte tijd op een project, óf niet
// gewerkte tijd (verlof, ziek, vakantie, feestdag, tijd-voor-tijd -- `uren_categorie != 'werk'`
// in `planning_uursoorten`). Dat onderscheid staat in de regel zelf en niet in het project: verlof
// wordt net zo goed op een gewoon project geboekt als op het indirecte-urenproject.
//
//   gewerkte uren op een echt project -> via het dossier, de volgorde hieronder
//   alles op een indirecte-urenproject -> naar de eigen goedkeurder van de medewerker
//                         (`uren_instellingen.indirecte_dossier_ids`); daar is geen projectwerk
//                         te beoordelen, alleen overhead
//   niet-gewerkte uren -> naar de vaste goedkeurder van de medewerker
//                         (`medewerkers.uren_goedkeurder_id`, in te stellen op zijn profiel),
//                         die dan in zijn eentje eindstation is
//   niet-gewerkte uren zonder goedkeurder -> alsnog via het dossier
//
// Waarom zo: over iemands vakantie heeft de projectleider van het project waarop die dag
// toevallig geboekt staat niets te zeggen, en over gewerkte uren op zijn project juist wel --
// dat is zijn budget. Een uursoort die EVA niet kent telt als gewerkt: dan verandert er niets
// aan het gedrag van vóór deze routering.
//
// Voor gewerkte uren geldt onverkort:
//
//   dossier heeft een teamleider    -> eerst hij, DAARNA pas de projectleider
//   dossier heeft geen teamleider   -> meteen naar de projectleider, zonder tussenstop
//   teamleider akkoord + geen projectleider -> approved = true (hij is dan eindstation)
//   teamleider is ook projectleider -> één handeling, meteen approved = true
//   projectleider akkoord           -> approved = true
//   projectleider trekt in          -> approved = false, ook het akkoord van de teamleider vervalt
//
// DE VOLGORDE IS DE REGEL, MET ÉÉN NOODUITGANG. De teamleider gaat eerst: zolang hij niet akkoord
// is, staat de regel op zijn naam en niet op die van de projectleider. Dat is een bewuste wijziging
// (sep 2026): eerder mocht de projectleider er zomaar overheen, maar dan keurt hij uren goed die de
// teamleider nog had willen bijstellen -- en de teamleider werkt op zijn telefoon, waar corrigeren
// ná goedkeuring niet meer kan.
//
// De projectleider ZIET die regels wel, en kan er in noodgevallen overheen -- een teamleider gaat
// ook met verlof, en dan mogen de uren van zijn ploeg niet wekenlang blijven hangen. Dat vraagt een
// expliciete bevestiging: `keurUrenGoed` weigert zulke regels zonder `zonderTeamleider: true` en
// geeft `bevestigingNodig` terug, zodat het scherm erom kan vragen. Dat het overslaan is gebeurd
// wordt apart vastgelegd (`tl_overgeslagen_op/-door`); `tl_akkoord_op` blijft leeg, want de
// teamleider heeft er juist niet naar gekeken.
//
// Terug omlaag mag ook nog: trekt de projectleider een goedkeuring in, dan vervalt alles en begint
// de keten opnieuw.
//
// DE TEAMLEIDERSTAP HEEFT GEEN TERUGVAL. Staat er geen teamleider op het dossier, dan gaat de
// regel rechtstreeks naar de projectleider. Er is bewust geen terugval op de ploegteamleider
// (sep 2026, op verzoek van Tom teruggedraaid): de route hangt aan het werk, en een tussenstap
// die uit de personeelsindeling komt maakt niet zichtbaar waarom uren bij iemand liggen.
//
// Staat ook de projectleider er niet, dan hoort de regel bij "niet toe te wijzen" in plaats van
// op het bureau van iemand die er niets mee te maken heeft.
//
// VOLLEDIGE BODY BIJ ELKE SCHRIJFACTIE. `POST /project/hour-log` is een upsert, en het is niet
// gedocumenteerd of niet-meegestuurde velden blijven staan of leeggemaakt worden. De bestaande
// `updateUurlogBewakingscode` stuurt alleen een handvol velden mee en is daarmee een open risico
// (in productie nooit gebruikt, dus ook nooit gebleken). Hier lezen we daarom eerst de hele regel
// en sturen die compleet terug. Dat is veilig ongeacht hoe Bouw7 het bedoelt, en kost één extra
// GET per regel -- verwaarloosbaar tegenover een leeggemaakte medewerker of een verdwenen tarief.

import { createAdminClient } from '@everts/database/server'
import { revalidatePath } from 'next/cache'
import { vereisSessie } from '@/lib/auth/rechten'
import { maakNotificatie } from '@/lib/notificaties/maak'
import { getBouw7Client } from '@/lib/bouw7/sync'
import { haalOpenstaandeUren, verdeelNaarRol, type OpenUurRegel, type OpenUrenResultaat } from './openstaande-uren'
import type { Bouw7Client, Bouw7EmployeeHourLog, Bouw7EmployeeHourLogResponse } from '@/lib/bouw7/client'

// De leeslaag woont in `openstaande-uren.ts` en niet hier; zie de kop van dat
// bestand voor waarom. De types gaan hier wél doorheen, zodat bestaande importen
// uit dit bestand blijven werken — types verdwijnen bij het compileren en worden
// dus geen server action.
export type { OpenUurRegel, OpenUrenResultaat }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createAdminClient() as any

const num = (v: unknown) => { const n = parseFloat(String(v ?? '')); return isNaN(n) ? 0 : n }

/* ── Ophalen ──────────────────────────────────────────────────────── */

/**
 * Alle niet-goedgekeurde uren uit Bouw7 in een periode, verrijkt met de EVA-medewerker, het
 * EVA-dossier en de tussenstand van de goedkeuring.
 *
 * Pagineren met OFFSET, niet met PAGE: dat laatste geeft op dit endpoint een 400, en een genegeerde
 * 400 leverde hier eerder stilletjes nul rijen op.
 */
export async function getOpenstaandeUren(
  van: string,
  tot: string,
  /**
   * Alleen deze hour-log-ids ophalen. Gebruikt door de goedkeur- en correctie-acties, die niet de
   * hele werkvoorraad nodig hebben maar alleen de regels die de gebruiker aanklikte: dat scheelt
   * een gepagineerde ophaal van drie jaar (tot veertig calls) per klik.
   */
  ids?: number[],
): Promise<OpenUrenResultaat> {
  await vereisSessie()
  return haalOpenstaandeUren(van, tot, ids)
}


/**
 * Wat er NU voor mij te doen is, bepaald door de projectrollen op het dossier.
 *
 * De verdeling volgt `status`, en die kent maar één wachtende tegelijk: zolang een dossier een
 * teamleider heeft die nog niet akkoord is, staat de regel op `wacht_op_teamleider` en komt hij bij
 * niemand anders in beeld. Pas daarna verschijnt hij bij de projectleider. Staat er geen teamleider
 * op het dossier, dan slaat de regel die stap over en wacht hij meteen op de projectleider.
 *
 * Ben ik op hetzelfde dossier teamleider én projectleider, dan zit de regel in `alsTeamleider`;
 * `keurUrenGoed` handelt hem dan in één keer helemaal af.
 */
export async function getMijnTeKeurenUren(van: string, tot: string, ids?: number[]): Promise<{
  alsTeamleider: OpenUurRegel[]
  alsProjectleider: OpenUurRegel[]
  /**
   * Niet-gewerkte uren (verlof, ziek, vakantie, feestdag, tijd-voor-tijd) van medewerkers die
   * MIJ als goedkeurder hebben. Die route vervangt het dossier, dus deze regels staan bij
   * niemand anders -- ook niet bij de projectleider van het project waarop ze geboekt zijn.
   * Ik ben in mijn eentje eindstation. Hun gewérkte uren zitten hier niet in: die lopen gewoon
   * via het dossier.
   */
  alsVasteGoedkeurder: OpenUurRegel[]
  /**
   * Regels waarop ik projectleider ben, maar die nog bij de teamleider liggen. Ze staan
   * NIET op mijn akkoord — ze zitten hier zodat een scherm kan uitleggen waaróm een regel
   * niet te keuren is, in plaats van hem stilletjes weg te laten of een vage fout te geven.
   */
  wachtNogOpTeamleider: OpenUurRegel[]
  nietToeTeWijzen: OpenUurRegel[]
  fout: string | null
}> {
  const ik = await vereisSessie()
  const res = await getOpenstaandeUren(van, tot, ids)
  if (res.fout) {
    return {
      alsTeamleider: [], alsProjectleider: [], alsVasteGoedkeurder: [], wachtNogOpTeamleider: [],
      nietToeTeWijzen: [], fout: res.fout,
    }
  }

  // De verdeelregels staan in de leeslaag, zodat het mobiele weekscherm ze deelt in plaats
  // van na te bouwen -- zie de toelichting bij `verdeelNaarRol`.
  return { ...verdeelNaarRol(res.regels, ik.id), fout: null }
}

/* ── Schrijven ────────────────────────────────────────────────────── */

/**
 * Leest de uurregel opnieuw uit Bouw7 en stuurt hem compleet terug met de gevraagde wijzigingen.
 *
 * Read-modify-write met de volledige veldenset, omdat niet vaststaat of Bouw7 een upsert als
 * gedeeltelijke wijziging of als volledige vervanging behandelt. Zo maakt het niet uit.
 */
async function schrijfHourLog(
  client: Bouw7Client,
  hourLogId: number,
  wijziging: {
    approved?: boolean
    logHours?: string
    hourTypeId?: number
    /** Bouw7-project waar de regel naartoe moet. Weglaten = laten staan waar hij staat. */
    projectId?: number
    pslId?: number | null
    comments?: string
  },
): Promise<{ ok: true; voor: Bouw7EmployeeHourLog } | { ok: false; error: string }> {
  const res = await client.get<Bouw7EmployeeHourLogResponse>('/list/hour-logs/employee', {
    q: `id = ${hourLogId} LIMIT 1`,
  })
  const voor = (res?.items ?? [])[0]
  if (!voor) return { ok: false, error: 'Deze uurregel bestaat niet meer in Bouw7.' }
  if (voor.isMutable === false) return { ok: false, error: 'Deze uurregel is in Bouw7 vergrendeld.' }
  if (!voor.project?.id || !voor.employee?.id || !voor.type?.id || !voor.logDate) {
    return { ok: false, error: 'De uurregel in Bouw7 mist gegevens die nodig zijn om hem bij te werken.' }
  }

  const projectId = wijziging.projectId ?? voor.project.id
  const hourTypeId = wijziging.hourTypeId ?? voor.type.id
  const naarAnderProject = projectId !== voor.project.id
  const andereUursoort = hourTypeId !== voor.type.id

  // Een bewakingscode hoort bij één project. Verhuist de regel, dan mag de oude code niet mee:
  // wie een code op het nieuwe dossier wil, stuurt die expliciet mee.
  const pslId = wijziging.pslId !== undefined ? wijziging.pslId
    : naarAnderProject ? null
    : (voor.projectSecurityLink?.id ?? null)
  const opmerking = wijziging.comments !== undefined ? wijziging.comments : (voor.comment ?? '')

  await client.post('/project/hour-log', {
    id: hourLogId,
    project: { id: projectId },
    employee: { id: voor.employee.id },
    hourType: { id: hourTypeId },
    logDate: voor.logDate.slice(0, 10),
    logHours: wijziging.logHours ?? String(voor.hours ?? '0'),
    ...(pslId ? { projectSecurityLink: { id: pslId } } : {}),
    ...(opmerking ? { comments: opmerking } : {}),
    // Het uurtarief hoort bij de combinatie project × uursoort. Verandert een van die twee, dan
    // laten we Bouw7 het opnieuw bepalen in plaats van het oude bedrag mee te slepen -- dat is
    // dezelfde route als de weekstaat, die nooit zelf een tarief meestuurt.
    ...(voor.hourlyRate != null && !naarAnderProject && !andereUursoort
      ? { hourlyRate: String(voor.hourlyRate) }
      : {}),
    approved: wijziging.approved ?? voor.isApproved === true,
  })

  // Verhuizen en van uursoort wisselen lezen we terug. Een upsert die zo'n veld stilzwijgend
  // negeert zou anders als geslaagd gemeld worden terwijl de uren op het oude project blijven --
  // en dan is er niets te zien behalve een tevreden melding.
  if (naarAnderProject || andereUursoort) {
    const na = (await client.get<Bouw7EmployeeHourLogResponse>('/list/hour-logs/employee', {
      q: `id = ${hourLogId} LIMIT 1`,
    }))?.items?.[0]
    if (!na) return { ok: false, error: 'Bouw7 gaf de bijgewerkte uurregel niet terug.' }
    if (naarAnderProject && na.project?.id !== projectId) {
      return { ok: false, error: 'Bouw7 heeft de uren niet naar het andere dossier verplaatst.' }
    }
    if (andereUursoort && na.type?.id !== hourTypeId) {
      return { ok: false, error: 'Bouw7 heeft de uursoort niet aangepast.' }
    }
  }
  return { ok: true, voor }
}

/** Zorgt dat de tussenstand-rij bestaat en werkt hem bij. */
async function bewaarBeoordeling(
  hourLogId: number,
  regel: Pick<OpenUurRegel, 'medewerkerId' | 'dossierId' | 'datum'>,
  patch: Record<string, unknown>,
) {
  await db().from('uren_bouw7_beoordeling').upsert({
    bouw7_hour_log_id: hourLogId,
    medewerker_id: regel.medewerkerId,
    dossier_id: regel.dossierId,
    log_datum: regel.datum || null,
    ...patch,
  }, { onConflict: 'bouw7_hour_log_id' })
}

export type KeurResultaat =
  | {
      ok: true
      verwerkt: number
      naarBouw7: number
      wachtOpProjectleider: number
      /** Regels die zijn goedgekeurd terwijl de teamleider er nog niet naar had gekeken. */
      overgeslagen: number
      mislukt: number
      fouten: string[]
    }
  /**
   * Er zit werk in de selectie waar de teamleider nog niet langs is geweest. Er is NIETS
   * verwerkt -- ook de rest niet. Het scherm vraagt om bevestiging en roept opnieuw aan met
   * `zonderTeamleider: true`; dan gaat alles in één keer door.
   *
   * Bewust alles-of-niets: een deel verwerken en de rest terugmelden laat de gebruiker raden
   * wat er nu wel en niet gebeurd is.
   */
  | {
      ok: false
      bevestigingNodig: true
      /** Hoeveel van de aangeboden regels nog bij de teamleider liggen. */
      aantalZonderTeamleider: number
      /** Totaal aantal regels in de selectie. */
      totaal: number
      /** Namen van de teamleiders die overgeslagen zouden worden. */
      teamleiders: string[]
    }
  | { ok: false; error: string }

/**
 * Keurt uren goed in de rol die je op het betreffende dossier hebt.
 *
 * Bewust geen rolkeuze in de interface: welke pet je op hebt volgt uit het dossier, niet uit iets
 * wat de gebruiker moet aanvinken. Per regel:
 *
 *   niet-gewerkte uren van iemand die mij als goedkeurder heeft -> akkoord en naar Bouw7
 *   ik ben teamleider, er is een projectleider -> akkoord; de regel schuift door naar hem
 *   ik ben teamleider, er is geen projectleider -> akkoord en naar Bouw7 (ik ben eindstation)
 *   ik ben teamleider én projectleider          -> beide stempels tegelijk, en naar Bouw7
 *   ik ben projectleider (teamleider is al om)  -> akkoord en naar Bouw7
 *
 * Regels die nog op de teamleider wachten gaan alleen mee met `zonderTeamleider: true`; zonder die
 * vlag komt er `bevestigingNodig` terug en is er niets verwerkt. Zie de nooduitgang in de kop van
 * dit bestand.
 *
 * Regels waar ik geen van beide ben worden overgeslagen. De autorisatie zit hier, niet in het
 * scherm, want een meegestuurde lijst id's zegt niets over wie ze mag beoordelen.
 */
export async function keurUrenGoed(
  hourLogIds: number[],
  opties?: {
    /**
     * De teamleiderstap overslaan voor regels die nog bij hem liggen. Alleen zetten nadat de
     * gebruiker het bevestigd heeft -- dit is de nooduitgang voor verlof, geen standaardroute.
     */
    zonderTeamleider?: boolean
  },
): Promise<KeurResultaat> {
  const ik = await vereisSessie()
  if (!hourLogIds.length) return { ok: false, error: 'Geen uren geselecteerd.' }

  // Alleen de aangeklikte regels ophalen. De autorisatie blijft hier staan (het scherm mag niet
  // bepalen wie wat mag goedkeuren), maar daarvoor is de hele werkvoorraad niet nodig.
  const jaar = new Date().getFullYear()
  const mijn = await getMijnTeKeurenUren(`${jaar - 1}-01-01`, `${jaar + 1}-12-31`, hourLogIds)
  if (mijn.fout) return { ok: false, error: mijn.fout }

  const gevraagd = new Set(hourLogIds)
  // De vaste goedkeurder is eindstation, net als de projectleider, en gaat door dezelfde molen.
  const alsVg = mijn.alsVasteGoedkeurder.filter(r => gevraagd.has(r.id))
  const alsPl = mijn.alsProjectleider.filter(r => gevraagd.has(r.id))
  const plIds = new Set([...alsPl, ...alsVg].map(r => r.id))
  // De lijsten sluiten elkaar uit (één rol tegelijk aan zet), maar het filter blijft staan:
  // een regel twee keer verwerken zou twee Bouw7-schrijfacties opleveren.
  const alsTl = mijn.alsTeamleider.filter(r => gevraagd.has(r.id) && !plIds.has(r.id))
  // Regels waar ik projectleider van ben maar de teamleider nog niet naar gekeken heeft.
  const zonderTl = mijn.wachtNogOpTeamleider.filter(r => gevraagd.has(r.id) && !plIds.has(r.id))

  // De nooduitgang zit achter een bevestiging, en die vragen we vóórdat er iets gebeurt: een
  // deel verwerken en voor de rest terugkomen laat de gebruiker raden wat er nu al gedaan is.
  if (zonderTl.length && !opties?.zonderTeamleider) {
    return {
      ok: false,
      bevestigingNodig: true,
      aantalZonderTeamleider: zonderTl.length,
      totaal: alsPl.length + alsTl.length + zonderTl.length,
      teamleiders: [...new Set(zonderTl.map(r => r.teamleiderNaam).filter((n): n is string => !!n))],
    }
  }

  const overslaan = opties?.zonderTeamleider ? zonderTl : []

  if (!alsPl.length && !alsVg.length && !alsTl.length && !overslaan.length) {
    return { ok: false, error: 'Geen van deze uren staat op jouw akkoord.' }
  }

  const client = await getBouw7Client()
  const nu = new Date().toISOString()
  let naarBouw7 = 0, wachtOpProjectleider = 0, mislukt = 0
  const fouten: string[] = []

  const stuur = async (r: OpenUurRegel) => {
    const res = await schrijfHourLog(client, r.id, { approved: true }).catch(e => ({
      ok: false as const, error: e instanceof Error ? e.message : 'Bouw7-update mislukt.',
    }))
    if (!res.ok) {
      mislukt++
      fouten.push(`${r.datum} ${r.medewerkerNaam}: ${res.error}`)
    } else naarBouw7++
    return res.ok
  }

  // De projectleider is eindstation, of hij nu op zijn beurt wachtte of de teamleiderstap
  // oversloeg. Het verschil zit alleen in wat we erbij vastleggen. De goedkeurder van iemands
  // niet-gewerkte uren loopt hier ook doorheen: hij is de enige stap, en zijn akkoord krijgt
  // hetzelfde eindstempel (`pl_akkoord_*`) -- wie het was staat in `pl_akkoord_door`.
  for (const r of [...alsPl, ...alsVg, ...overslaan]) {
    const overgeslagen = overslaan.includes(r)
    const gelukt = await stuur(r)
    await bewaarBeoordeling(r.id, r, gelukt ? {
      pl_akkoord_op: nu, pl_akkoord_door: ik.id,
      // `tl_akkoord_op` blijft bewust leeg: de teamleider heeft er niet naar gekeken. Wie de
      // stap oversloeg en wanneer staat apart, zodat de historie eerlijk blijft.
      ...(overgeslagen ? { tl_overgeslagen_op: nu, tl_overgeslagen_door: ik.id } : {}),
      ingetrokken_op: null, ingetrokken_door: null, ingetrokken_reden: null,
      bouw7_status: 'verzonden', bouw7_fout: null,
    } : { bouw7_status: 'fout', bouw7_fout: fouten[fouten.length - 1] ?? null })
  }

  for (const r of alsTl) {
    // De teamleider is eindstation als er geen projectleider op het dossier staat, én als hij
    // die projectleider zélf is -- twee keer hetzelfde vinkje van dezelfde persoon vragen is
    // geen controle maar een extra klik.
    const ookProjectleider = r.projectleiderId === ik.id
    const eindstation = !r.projectleiderId || ookProjectleider
    const gelukt = eindstation ? await stuur(r) : true
    if (!eindstation) wachtOpProjectleider++
    await bewaarBeoordeling(r.id, r, {
      tl_akkoord_op: nu, tl_akkoord_door: ik.id,
      // Zet ook meteen het projectleider-stempel als ik dat zelf ben; anders blijft de regel
      // daarna bij mezelf terugkomen terwijl hij in Bouw7 al goedgekeurd is.
      ...(ookProjectleider && gelukt ? {
        pl_akkoord_op: nu, pl_akkoord_door: ik.id,
        ingetrokken_op: null, ingetrokken_door: null, ingetrokken_reden: null,
      } : {}),
      bouw7_status: eindstation ? (gelukt ? 'verzonden' : 'fout') : 'niet_verzonden',
      bouw7_fout: eindstation && !gelukt ? (fouten[fouten.length - 1] ?? null) : null,
    })
  }

  revalidatePath('/uren')
  // De goedkeurvlaggen zijn in Bouw7 gewijzigd; /uren leest die uit het bewaarde urenvenster.
  // Op de achtergrond, want de goedkeurder hoeft daar niet op te wachten.
  if (naarBouw7 > 0) {
    try {
      const { after } = await import('next/server')
      after(async () => {
        const { ververseGlobaleBron } = await import('@/lib/bouw7/snapshot')
        await ververseGlobaleBron('uren_venster').catch(() => {})
      })
    } catch { /* buiten een request-context bestaat `after` niet */ }
  }

  return {
    ok: true,
    verwerkt: alsPl.length + alsVg.length + alsTl.length + overslaan.length,
    naarBouw7,
    wachtOpProjectleider,
    overgeslagen: overslaan.length,
    mislukt,
    fouten,
  }
}

/**
 * De projectleider trekt een goedkeuring in. Ook een akkoord van de teamleider vervalt daarmee --
 * de projectleider overruled in beide richtingen.
 *
 * Gaat het om niet-gewerkte uren van iemand met een eigen goedkeurder, dan is dat de enige die kan
 * intrekken: hij keurde de regel ook als enige goed, en de projectleider van het dossier staat in
 * die route buitenspel.
 */
export async function trekGoedkeuringIn(
  hourLogId: number, reden: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ik = await vereisSessie()
  if (!reden.trim()) return { ok: false, error: 'Geef aan waarom je de goedkeuring intrekt.' }

  // De regel staat op goedgekeurd en valt dus buiten de openstaande lijst; los ophalen dus.
  const client = await getBouw7Client()
  const res = await client.get<Bouw7EmployeeHourLogResponse>('/list/hour-logs/employee', {
    q: `id = ${hourLogId} LIMIT 1`,
  })
  const log = (res?.items ?? [])[0]
  if (!log) return { ok: false, error: 'Deze uurregel bestaat niet meer in Bouw7.' }

  const supabase = db()
  const { data: dossier } = await supabase
    .from('dossiers').select('id, project_manager_id').eq('bouw7_id', String(log.project?.id)).maybeSingle()
  const { data: medewerker } = await supabase
    .from('medewerkers').select('id, auth_user_id, uren_goedkeurder_id')
    .eq('bouw7_id', String(log.employee?.id)).maybeSingle()

  // Welke route gold voor deze regel? Dat hangt aan de uursoort, niet aan de medewerker alleen:
  // zijn gewerkte uren lopen via het dossier en die trekt de projectleider in.
  const { data: soort } = await supabase
    .from('planning_uursoorten').select('uren_categorie')
    .eq('bouw7_id', String(log.type?.id)).maybeSingle()
  const nietGewerkt = ['afwezig', 'feestdag', 'tijd_voor_tijd'].includes(soort?.uren_categorie ?? '')
  // Zelfde route als bij het keuren: niet-gewerkte uren én alles op een indirecte-urenproject
  // gaan naar de eigen goedkeurder (of de standaard), en die is dan ook de enige die het akkoord
  // kan intrekken.
  const { getUrenInstellingen } = await import('./instellingen')
  const instellingen = await getUrenInstellingen()
  const indirectDossier = dossier?.id != null && instellingen.indirecte_dossier_ids.includes(dossier.id)
  const goedkeurderId = nietGewerkt || indirectDossier
    ? (medewerker?.uren_goedkeurder_id ?? instellingen.niet_gewerkt_goedkeurder_id ?? null)
    : null
  const viaVasteGoedkeurder = goedkeurderId != null
  if (viaVasteGoedkeurder) {
    if (goedkeurderId !== ik.id) {
      return {
        ok: false,
        error: 'Deze uren lopen niet via het dossier; alleen de goedkeurder van deze medewerker kan dat akkoord intrekken.',
      }
    }
  } else if (!dossier || dossier.project_manager_id !== ik.id) {
    return { ok: false, error: 'Alleen de projectleider van dit project kan een goedkeuring intrekken.' }
  }

  const schrijf = await schrijfHourLog(client, hourLogId, { approved: false }).catch(e => ({
    ok: false as const, error: e instanceof Error ? e.message : 'Bouw7-update mislukt.',
  }))
  if (!schrijf.ok) return { ok: false, error: schrijf.error }

  const mw = medewerker

  await bewaarBeoordeling(hourLogId, {
    medewerkerId: mw?.id ?? null,
    // Via de vaste goedkeurder kan de regel op een project staan dat EVA niet als dossier kent.
    dossierId: dossier?.id ?? null,
    datum: log.logDate?.slice(0, 10) ?? '',
  }, {
    tl_akkoord_op: null, tl_akkoord_door: null,
    pl_akkoord_op: null, pl_akkoord_door: null,
    // Ook een overgeslagen teamleiderstap vervalt: de keten begint helemaal opnieuw, dus de
    // teamleider is gewoon weer als eerste aan zet.
    tl_overgeslagen_op: null, tl_overgeslagen_door: null,
    ingetrokken_op: new Date().toISOString(), ingetrokken_door: ik.id, ingetrokken_reden: reden.trim(),
    bouw7_status: 'verzonden', bouw7_fout: null,
  })

  if (mw?.auth_user_id) {
    await maakNotificatie({
      user_id: mw.auth_user_id,
      type: 'uren',
      titel: 'Goedkeuring van je uren ingetrokken',
      body: `${log.logDate?.slice(0, 10)} · ${log.hours} uur — ${reden.trim()}`,
      url: '/m/uren',
    }).catch(() => { /* melding is bijzaak */ })
  }

  return { ok: true }
}

/**
 * De goedkeurder past de regel zelf aan in plaats van hem af te keuren -- Bouw7 kent geen
 * afgekeurd-status, en heen-en-weer sturen kost alleen tijd. De medewerker krijgt bericht van wat
 * er is gewijzigd en door wie; de oude waarden blijven bewaard, want Bouw7 houdt alleen de nieuwe
 * stand bij.
 */
export async function corrigeerUurregel(
  hourLogId: number,
  wijziging: {
    uren?: number
    bewakingscodePslId?: number | null
    opmerking?: string
    /** Bouw7 hourType-id van de nieuwe uursoort; moet in `planning_uursoorten` staan. */
    uursoortHourTypeId?: number
    /** EVA-dossier waar de uren naartoe moeten. Moet aan een Bouw7-project gekoppeld zijn. */
    naarDossierId?: string
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ik = await vereisSessie()
  const jaar = new Date().getFullYear()
  // Alleen deze ene regel; de autorisatiecontrole hieronder heeft niet meer nodig.
  const mijn = await getMijnTeKeurenUren(`${jaar - 1}-01-01`, `${jaar + 1}-12-31`, [hourLogId])
  if (mijn.fout) return { ok: false, error: mijn.fout }

  const regel = [...mijn.alsTeamleider, ...mijn.alsProjectleider, ...mijn.alsVasteGoedkeurder]
    .find(r => r.id === hourLogId)
  if (!regel) return { ok: false, error: 'Deze uurregel staat niet op jouw akkoord.' }
  if (wijziging.uren !== undefined && !(wijziging.uren > 0 && wijziging.uren <= 24)) {
    return { ok: false, error: 'Vul een aantal uren tussen 0 en 24 in.' }
  }

  const supabase = db()

  // De uursoort komt als Bouw7-id binnen. Toetsen aan de stamlijst: een meegestuurd id uit de
  // browser mag geen willekeurige uursoort in Bouw7 kunnen aanwijzen.
  let uursoortNaam: string | null = null
  if (wijziging.uursoortHourTypeId !== undefined) {
    const { data: soort } = await supabase
      .from('planning_uursoorten').select('naam')
      .eq('bouw7_id', String(wijziging.uursoortHourTypeId)).maybeSingle()
    if (!soort) return { ok: false, error: 'Deze uursoort bestaat niet in EVA.' }
    uursoortNaam = soort.naam as string
  }

  // Verhuizen kan alleen naar een dossier dat Bouw7 kent -- daar moet de urenregel landen. Het
  // doeldossier hoeft NIET van mij te zijn: ik corrigeer een regel die op mijn project staat, en
  // waar hij thuishoort bepaalt het werk, niet mijn rollenlijst.
  let naarProjectId: number | undefined
  let naarDossierLabel: string | null = null
  const verhuist = wijziging.naarDossierId !== undefined && wijziging.naarDossierId !== regel.dossierId
  if (verhuist) {
    const { data: doel } = await supabase
      .from('dossiers').select('id, bouw7_id, dossiernummer, titel')
      .eq('id', wijziging.naarDossierId).maybeSingle()
    if (!doel) return { ok: false, error: 'Het gekozen dossier bestaat niet.' }
    const pid = Number(doel.bouw7_id)
    if (!doel.bouw7_id || Number.isNaN(pid)) {
      return { ok: false, error: 'Dit dossier is niet aan Bouw7 gekoppeld; daar kunnen geen uren op.' }
    }
    naarProjectId = pid
    naarDossierLabel = [doel.dossiernummer, doel.titel].filter(Boolean).join(' · ') || null
  }

  const client = await getBouw7Client()
  const res = await schrijfHourLog(client, hourLogId, {
    ...(wijziging.uren !== undefined ? { logHours: String(wijziging.uren) } : {}),
    ...(wijziging.bewakingscodePslId !== undefined ? { pslId: wijziging.bewakingscodePslId } : {}),
    ...(wijziging.opmerking !== undefined ? { comments: wijziging.opmerking } : {}),
    ...(wijziging.uursoortHourTypeId !== undefined ? { hourTypeId: wijziging.uursoortHourTypeId } : {}),
    ...(naarProjectId !== undefined ? { projectId: naarProjectId } : {}),
  }).catch(e => ({ ok: false as const, error: e instanceof Error ? e.message : 'Bouw7-update mislukt.' }))
  if (!res.ok) return { ok: false, error: res.error }

  await bewaarBeoordeling(
    hourLogId,
    // Na een verhuizing hoort de tussenstand bij het nieuwe dossier; anders blijft de regel in de
    // werkvoorraad van het oude project hangen.
    verhuist ? { ...regel, dossierId: wijziging.naarDossierId ?? null } : regel,
    {
      gecorrigeerd_op: new Date().toISOString(),
      gecorrigeerd_door: ik.id,
      oorspronkelijke_waarden: {
        uren: num(res.voor.hours),
        bewakingscode: res.voor.projectSecurityLink?.code ?? null,
        opmerking: res.voor.comment ?? null,
        uursoort: res.voor.type?.name ?? null,
        dossier: [regel.projectNummer, regel.projectNaam].filter(Boolean).join(' · ') || null,
      },
      // Een verhuisde regel begint de keten opnieuw: het nieuwe dossier heeft zijn eigen
      // teamleider en projectleider, en die hebben er nog niet naar gekeken.
      ...(verhuist ? {
        tl_akkoord_op: null, tl_akkoord_door: null,
        pl_akkoord_op: null, pl_akkoord_door: null,
        tl_overgeslagen_op: null, tl_overgeslagen_door: null,
      } : {}),
      bouw7_status: 'verzonden', bouw7_fout: null,
    },
  )

  if (regel.medewerkerId) {
    const { data: mw } = await supabase
      .from('medewerkers').select('auth_user_id').eq('id', regel.medewerkerId).maybeSingle()
    if (mw?.auth_user_id) {
      const wat: string[] = []
      if (wijziging.uren !== undefined && wijziging.uren !== num(res.voor.hours)) {
        wat.push(`uren ${num(res.voor.hours)} → ${wijziging.uren}`)
      }
      if (uursoortNaam && uursoortNaam !== (res.voor.type?.name ?? null)) {
        wat.push(`uursoort → ${uursoortNaam}`)
      }
      if (naarDossierLabel) wat.push(`verplaatst naar ${naarDossierLabel}`)
      if (wijziging.bewakingscodePslId !== undefined && !naarDossierLabel) wat.push('bewakingscode aangepast')
      if (wijziging.opmerking !== undefined) wat.push('opmerking aangepast')
      await maakNotificatie({
        user_id: mw.auth_user_id,
        type: 'uren',
        titel: 'Je uren zijn aangepast',
        body: `${regel.datum} · ${regel.projectNummer ?? regel.projectNaam ?? ''} — ${wat.join(', ') || 'gecorrigeerd'}`,
        url: '/m/uren',
      }).catch(() => { /* melding is bijzaak */ })
    }
  }

  revalidatePath('/uren')
  // /uren leest niet live uit Bouw7 maar uit het bewaarde urenvenster; zonder deze verversing
  // toont het scherm na een correctie nog de oude waarde. Op de achtergrond, want de goedkeurder
  // hoeft daar niet op te wachten -- zelfde route als `keurUrenGoed`.
  try {
    const { after } = await import('next/server')
    after(async () => {
      const { ververseGlobaleBron } = await import('@/lib/bouw7/snapshot')
      await ververseGlobaleBron('uren_venster').catch(() => {})
    })
  } catch { /* buiten een request-context bestaat `after` niet */ }

  return { ok: true }
}

/* ── Keuzelijsten voor het correctievenster ───────────────── */

export type UursoortOptie = {
  /** Bouw7 hourType-id -- dat is wat de urenregel bewaart. */
  hourTypeId: number
  naam: string
  /** 'werk' | 'afwezig' | 'tijd_voor_tijd' | 'feestdag' | null; groepeert de keuzelijst. */
  categorie: string | null
}

/**
 * De uursoorten waar een geboekt uur naartoe kan. Alleen soorten die aan Bouw7 gekoppeld zijn:
 * een EVA-eigen soort zonder `bouw7_id` kan daar niet op een urenregel staan.
 */
export async function getUursoortenVoorCorrectie(): Promise<UursoortOptie[]> {
  await vereisSessie()
  const { data } = await db()
    .from('planning_uursoorten')
    .select('naam, bouw7_id, uren_categorie, volgorde')
    .not('bouw7_id', 'is', null)
    .eq('actief', true)
    .order('volgorde')
  const lijst: UursoortOptie[] = []
  for (const r of (data ?? []) as { naam: string; bouw7_id: string; uren_categorie: string | null }[]) {
    const id = Number(r.bouw7_id)
    if (!Number.isNaN(id)) lijst.push({ hourTypeId: id, naam: r.naam, categorie: r.uren_categorie })
  }
  return lijst
}

export type DossierTreffer = {
  id: string
  nummer: string | null
  titel: string | null
  hoofdstatus: string | null
}

/**
 * Dossiers zoeken om uren naartoe te verplaatsen, op nummer of titel.
 *
 * Alleen dossiers met een Bouw7-koppeling: op een dossier dat daar niet bestaat kan geen urenregel
 * landen, en zo'n dossier in de lijst laten zou alleen een mislukte verhuizing opleveren.
 */
export async function zoekDossierVoorUren(term: string): Promise<DossierTreffer[]> {
  await vereisSessie()
  // Komma's, haakjes en sterretjes zijn scheidingstekens in de PostgREST-`or`-syntaxis. Eruit
  // halen in plaats van escapen: als zoekterm voegen ze hier niets toe.
  const schoon = term.trim().replace(/[,()*]/g, ' ').trim()
  if (schoon.length < 2) return []
  const { data } = await db()
    .from('dossiers')
    .select('id, dossiernummer, titel, hoofdstatus')
    .not('bouw7_id', 'is', null)
    .or(`dossiernummer.ilike.%${schoon}%,titel.ilike.%${schoon}%`)
    .order('updated_at', { ascending: false })
    .limit(15)
  return ((data ?? []) as { id: string; dossiernummer: string | null; titel: string | null; hoofdstatus: string | null }[])
    .map(d => ({ id: d.id, nummer: d.dossiernummer, titel: d.titel, hoofdstatus: d.hoofdstatus }))
}
