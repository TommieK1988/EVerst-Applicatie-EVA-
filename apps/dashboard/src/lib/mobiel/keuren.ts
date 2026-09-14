import 'server-only'
import { createAdminClient } from '@everts/database/server'
import { getMijnTeKeurenUren } from '@/lib/uren/bouw7-goedkeuring'
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
 * De autorisatie zit NIET hier maar in `getMijnTeKeurenUren` en `keurUrenGoed`:
 * die bepalen uit de projectrollen op het dossier wat jij mag. Dit bestand maakt
 * er alleen een vorm van die op een telefoon te lezen is.
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
   * `goedkeurder` is de kantoorroute: jij bent de vaste goedkeurder van deze medewerker, en
   * dan is het dossier niet in beeld -- jij bent de enige stap.
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
}

/** Alle regels van één dossier bij elkaar — zo denk je erover: per project. */
export type KeurGroep = {
  /** Bouw7-project-id, of 'onbekend' als de regel geen project heeft. */
  sleutel: string
  projectNummer: string | null
  projectNaam: string | null
  /** EVA-dossier, als het gekoppeld is; maakt de kop een link. */
  dossierId: string | null
  regels: KeurRegel[]
  totaalUren: number
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
  groepen: KeurGroep[]
  totaalRegels: number
  totaalUren: number
  /**
   * Hoeveel van de getoonde regels nog bij de teamleider liggen. Ze staan gewoon in de
   * lijst — de projectleider moet er tijdens diens verlof bij kunnen — maar fiatteren
   * vraagt een bevestiging.
   */
  wachtOpTeamleider: number
  /** Parkeer- en reiskosten van dezelfde mensen over dezelfde periode. Alleen-lezen. */
  onkosten: KeurOnkosten[]
  /** Bouw7 was niet bereikbaar; dan tonen we dat in plaats van "niets te doen". */
  fout: string | null
}

const rondUren = (n: number) => Math.round(n * 100) / 100

export async function haalTeKeuren(): Promise<KeurData> {
  const { van, tot } = periodeBereik('te_keuren')
  const res = await getMijnTeKeurenUren(van, tot)
  if (res.fout) {
    return {
      groepen: [], totaalRegels: 0, totaalUren: 0, wachtOpTeamleider: 0, onkosten: [],
      fout: res.fout,
    }
  }

  // Drie bronnen, oplopend in zeggenschap: eerst wat nog bij de teamleider ligt, dan wat op
  // mijn projectleider-akkoord staat, en als laatste mijn eigen teamleider-werk. Later
  // toegevoegd wint, zodat een regel waarop ik meerdere petten heb bij de sterkste belandt.
  const perId = new Map<number, KeurRegel>()

  for (const r of res.wachtNogOpTeamleider) {
    perId.set(r.id, maakRegel(r, 'projectleider', true))
  }
  for (const r of res.alsProjectleider) {
    perId.set(r.id, maakRegel(r, 'projectleider'))
  }
  for (const r of res.alsTeamleider) {
    perId.set(r.id, maakRegel(r, 'teamleider'))
  }
  // De vaste goedkeurder staat los van de dossierroute: deze regels kunnen bij niemand anders
  // liggen, dus de volgorde hierboven raakt ze niet.
  for (const r of res.alsVasteGoedkeurder) {
    perId.set(r.id, maakRegel(r, 'goedkeurder'))
  }

  // Groeperen op project. De sleutel komt van Bouw7 en niet van het EVA-dossier:
  // niet elke Bouw7-regel is aan een dossier gekoppeld, en die regels zouden dan
  // allemaal op één hoop belanden.
  const groepen = new Map<string, KeurGroep>()
  const bron = new Map<number, (typeof res.alsProjectleider)[number]>()
  for (const r of [
    ...res.wachtNogOpTeamleider, ...res.alsProjectleider, ...res.alsTeamleider,
    ...res.alsVasteGoedkeurder,
  ]) {
    bron.set(r.id, r)
  }

  for (const regel of perId.values()) {
    const r = bron.get(regel.id)
    const sleutel = r?.bouw7ProjectId != null ? String(r.bouw7ProjectId) : 'onbekend'
    const groep = groepen.get(sleutel) ?? {
      sleutel,
      projectNummer: r?.projectNummer ?? null,
      projectNaam: r?.projectNaam ?? null,
      dossierId: r?.dossierId ?? null,
      regels: [],
      totaalUren: 0,
    }
    groep.regels.push(regel)
    groep.totaalUren = rondUren(groep.totaalUren + regel.uren)
    groepen.set(sleutel, groep)
  }

  // Binnen een groep op datum, dan op naam: zo lees je het als een weekstaat en
  // niet als de willekeurige volgorde waarin Bouw7 ze teruggaf.
  for (const groep of groepen.values()) {
    groep.regels.sort((a, b) =>
      a.datum !== b.datum
        ? a.datum.localeCompare(b.datum)
        : a.medewerkerNaam.localeCompare(b.medewerkerNaam, 'nl'))
  }

  // De grootste stapel bovenaan — daar zit het meeste werk dat je in één keer
  // kunt wegwerken.
  const lijst = [...groepen.values()].sort((a, b) => b.regels.length - a.regels.length)

  const alles = [...perId.values()]
  return {
    groepen: lijst,
    totaalRegels: alles.length,
    totaalUren: rondUren(alles.reduce((s, r) => s + r.uren, 0)),
    wachtOpTeamleider: alles.filter(r => r.wachtOpTeamleider).length,
    onkosten: await haalOnkosten([...bron.values()], van, tot),
    fout: null,
  }
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

type BronRegel = Awaited<ReturnType<typeof getMijnTeKeurenUren>>['alsProjectleider'][number]

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
    // Een vaste goedkeurder is eindstation: na zijn akkoord gaat de vlag in Bouw7 meteen om.
    wachtDaarnaOpProjectleider:
      rol === 'teamleider' && Boolean(r.projectleiderId) && !eigenProjectleider,
    // Bewerken hoort bij de laatste stap vóór goedkeuring: de teamleider, of — buiten de
    // dossierroute om — de vaste goedkeurder. Slaat de projectleider de teamleiderstap over,
    // dan corrigeert hij op de computer, niet hier.
    magBewerken: rol === 'teamleider' || rol === 'goedkeurder',
    wachtOpTeamleider,
    teamleiderNaam: r.teamleiderNaam,
    dossierId: r.dossierId,
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

  // Of er staan medewerkers die mij als vaste goedkeurder hebben; die route loopt niet via
  // een dossier, dus zonder deze vraag zou hun goedkeurder nooit een lijst te zien krijgen.
  const { count: eigen, error: fout } = await supabase
    .from('medewerkers')
    .select('id', { count: 'exact', head: true })
    .eq('uren_goedkeurder_id', medewerkerId)
  return !fout && (eigen ?? 0) > 0
}
