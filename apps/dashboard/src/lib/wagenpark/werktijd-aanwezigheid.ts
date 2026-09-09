/**
 * Hoe lang stond de auto van deze medewerker die dag op het werk?
 *
 * De werktijdenlijst toonde tot nu toe alleen de AFWIJKING: hoeveel minuten te
 * laat aangekomen, hoeveel te vroeg weg. Dat zegt niets over de dag als geheel —
 * iemand kan een half uur te laat komen en toch negen uur maken. Om een geboekte
 * urenstaat te kunnen naleggen is de hele dag nodig: van de aankomst op het werk
 * tot het vertrek naar huis, min de pauzes.
 *
 * DEZELFDE MEETLAT ALS R9 EN R10. De aankomst is het einde van de eerste
 * zakelijke ritketen, het vertrek is het begin van de laatste — precies de twee
 * momenten die R9 en R10 al gebruiken, inclusief de handmatig aangewezen
 * ankerritten uit `werktijd_anker_keuzes`. De functies daarvoor komen
 * ongewijzigd uit `wagenpark-core`, zodat de tijd in deze kolom per definitie
 * gelijk is aan de tijd in de kolom "Werkelijk" ernaast. Zou je hier zelf gaan
 * rekenen, dan zie je vroeg of laat twee verschillende aankomsttijden op één
 * regel staan.
 *
 * WAT DIT NIET IS: een aanwezigheidsregistratie. Gemeten wordt de auto, niet de
 * mens. Wie met een collega meerijdt, met de fiets komt of de hele dag op één
 * adres blijft, levert geen bruikbaar venster op. Zulke dagen krijgen daarom
 * geen getal maar een streepje met de reden erbij — een lege uitkomst mag hier
 * nooit als "nul uur aanwezig" op het scherm komen.
 */
import 'server-only'
import type { UluTrip } from '@everts/wagenpark-core'
import {
  bepaalKeten,
  bouwKetens,
  ankerKeuzeSleutel,
  parseHM,
} from '@everts/wagenpark-core/compliance'
import { pgQuery } from '@/lib/wagenpark/db'
import { ritTypeEffectiefSql } from '@/lib/wagenpark/privacy'

/** Standaard-ketenpauze, gelijk aan de terugval in R9/R10 zelf. */
const KETEN_PAUZE_STANDAARD = 5

/** Waarom een dag geen bruikbaar venster oplevert. Bepaalt de tooltip. */
export type GeenVensterReden = 'geen_ritten' | 'een_keten' | 'geen_tijden' | 'omgekeerd'

export const REDEN_TEKST: Record<GeenVensterReden, string> = {
  geen_ritten: 'Geen zakelijke ritten op deze dag geregistreerd.',
  een_keten:
    'Maar een ritketen op deze dag: alleen de heenreis is bekend, het vertrek van het werk niet. '
    + 'Dat gebeurt als de auto tussendoor blijft staan of als de rittensync onvolledig is.',
  geen_tijden: 'De bepalende ritten hebben geen bruikbare start- of stoptijd.',
  omgekeerd:
    'Het vertrek ligt niet na de aankomst. Dat kan bij een handmatig aangewezen rit die bij '
    + 'dezelfde verplaatsing hoort als de aankomst.',
}

/** Het aanwezigheidsvenster van een medewerker op een dag. */
export type DagAanwezigheid = {
  /** Aankomst op het werk, "07:32". Null als die niet te bepalen is. */
  aankomst: string | null
  /** Vertrek van het werk, "16:04". Null als dat niet te bepalen is. */
  vertrek: string | null
  /** Bruto minuten tussen aankomst en vertrek, voor aftrek van de pauze. */
  brutoMinuten: number | null
  /** Pauzeminuten uit het rooster die binnen het venster vallen. */
  pauzeMinuten: number
  /**
   * Staat er een pauze in het rooster van deze medewerker? Bij `false` is
   * `pauzeMinuten` nul omdat er niets bekend is, niet omdat er niet gepauzeerd
   * is — dat verschil hoort in de tooltip terug te komen.
   */
  pauzeInRooster: boolean
  /** Netto aanwezig: bruto min pauze. Null als het venster niet te bepalen is. */
  nettoMinuten: number | null
  /** Gevuld zodra `nettoMinuten` null is. */
  reden: GeenVensterReden | null
}

/** Sleutel: `${user_id_ulu}|${YYYY-MM-DD}`, gelijk aan de rest van deze module. */
export type AanwezigheidPerDag = Map<string, DagAanwezigheid>

export function aanwezigheidSleutel(userIdUlu: string, datum: string): string {
  return `${userIdUlu}|${datum}`
}

/**
 * De ankersleutel voor een bestuurder-id die als string binnenkomt.
 *
 * `UluTrip.user_id_ulu` belooft een `number`, maar de kolom is een bigint en
 * node-postgres levert die als string. `ankerKeuzeSleutel` interpoleert de
 * waarde ongewijzigd, dus de string is precies goed — alleen het type klopt
 * niet. Zelfde cast als in `werktijd-anker.ts`; een `Number(...)` ertussen zou
 * elke lookup stilletjes laten mislukken zodra een id boven 2^53 uitkomt.
 */
function ankerSleutel(userIdUlu: string, datum: string, regelCode: string): string {
  return ankerKeuzeSleutel(userIdUlu as unknown as UluTrip['user_id_ulu'], datum, regelCode)
}

/* ── Rijvormen zoals ze uit de query komen ───────────────────────────── */

type RitRij = {
  id: string
  user_id_ulu: string
  start_datum: string
  start_tijd: string
  stop_tijd: string | null
  rit_type_effectief: 'zakelijk' | 'prive' | null
}

type PauzeRij = {
  user_id_ulu: string
  geldig_vanaf: string
  geldig_tot: string | null
  pauze_start: string
  pauze_eind: string
}

type KeuzeRij = { user_id_ulu: string; datum: string; regel_code: string; trip_id: string }

/**
 * De ritten van de periode. Alleen de velden die de ketenregel aanraakt, en
 * alleen zakelijke ritten — een ritje naar de sportschool om 06:00 zou anders
 * als aankomst op het werk gelden. Zelfde filter als `zakelijkeRittenPerDag`,
 * maar hier al in SQL zodat er geen kwartaal aan priveritten mee hoeft.
 *
 * Via `pgQuery` (directe Postgres) en niet via PostgREST: dat laatste kapt stil
 * af op 1000 rijen, en een kwartaal aan ritten van het hele wagenpark zit daar
 * ruim overheen.
 */
const RITTEN_SQL = `
  select t.id::text                          as id,
         t.user_id_ulu::text                 as user_id_ulu,
         t.start_datum::text                 as start_datum,
         t.start_tijd::text                  as start_tijd,
         t.stop_tijd::text                   as stop_tijd,
         (${ritTypeEffectiefSql('t')})::text as rit_type_effectief
    from public.ulu_trips t
   where t.start_datum between $1::date and $2::date
     and ($3::text is null or t.user_id_ulu::text = $3::text)
   order by t.user_id_ulu, t.start_datum, t.start_tijd
`

/**
 * De pauzes uit het rooster, per ULU-bestuurder.
 *
 * De brug loopt via `ulu_users.medewerker_id`: de rittenregistratie kent een
 * ULU-bestuurder, het rooster een medewerker. Bestuurders zonder koppeling
 * krijgen geen pauze — en daarmee `pauzeInRooster: false`, zodat het scherm kan
 * laten zien dat er niets is afgetrokken.
 */
const PAUZES_SQL = `
  select uu.id::text          as user_id_ulu,
         r.geldig_vanaf::text as geldig_vanaf,
         r.geldig_tot::text   as geldig_tot,
         p.pauze_start::text  as pauze_start,
         p.pauze_eind::text   as pauze_eind
    from public.ulu_users uu
    join public.medewerker_roosters r on r.medewerker_id = uu.medewerker_id
    join public.medewerker_rooster_pauzes p on p.rooster_id = r.id
   where ($1::text is null or uu.id::text = $1::text)
   order by uu.id, r.geldig_vanaf desc
`

/** De handmatig aangewezen ankerritten in de periode. */
const KEUZES_SQL = `
  select user_id_ulu::text as user_id_ulu, datum::text as datum,
         regel_code, trip_id::text as trip_id
    from public.werktijd_anker_keuzes
   where datum between $1::date and $2::date
     and ($3::text is null or user_id_ulu::text = $3::text)
`

/** De ketenpauze uit de regelconfiguratie; zonder configuratie de terugval. */
const KETEN_PAUZE_SQL = `
  select code, (drempel_config->>'keten_pauze_min')::int as keten_pauze_min
    from public.handboek_regels
   where code in ('R9', 'R10')
`

/**
 * Het aanwezigheidsvenster per bestuurder-dag over een hele periode.
 *
 * `van`/`tot` zijn kale dagen (YYYY-MM-DD), beide inclusief. `userIdUlu` beperkt
 * tot een bestuurder, of `null` voor iedereen.
 *
 * Fail-soft: gaat er iets mis, dan komt er een lege map terug en toont de tabel
 * streepjes. De werktijdenlijst zelf moet bruikbaar blijven, ook zonder deze
 * extra kolommen.
 */
export async function getAanwezigheidPerDag(
  van: string,
  tot: string,
  userIdUlu: string | null = null,
): Promise<AanwezigheidPerDag> {
  const uit: AanwezigheidPerDag = new Map()
  try {
    const [ritten, pauzes, keuzes, ketenPauzes] = await Promise.all([
      pgQuery<RitRij>(RITTEN_SQL, [van, tot, userIdUlu]),
      pgQuery<PauzeRij>(PAUZES_SQL, [userIdUlu]),
      pgQuery<KeuzeRij>(KEUZES_SQL, [van, tot, userIdUlu]),
      pgQuery<{ code: string; keten_pauze_min: number | null }>(KETEN_PAUZE_SQL, []),
    ])

    const pauzeR9 = ketenPauzes.find((r) => r.code === 'R9')?.keten_pauze_min ?? KETEN_PAUZE_STANDAARD
    const pauzeR10 = ketenPauzes.find((r) => r.code === 'R10')?.keten_pauze_min ?? KETEN_PAUZE_STANDAARD

    const ankerKeuzes = new Map<string, string>()
    for (const k of keuzes) {
      ankerKeuzes.set(ankerSleutel(k.user_id_ulu, k.datum, k.regel_code), k.trip_id)
    }

    // Roosterpauzes per bestuurder, aflopend op geldig_vanaf — zodat de eerste
    // regel die de datum dekt de geldende is, net als in `verwachteTijden`.
    const pauzePerUser = new Map<string, PauzeRij[]>()
    for (const p of pauzes) {
      const lijst = pauzePerUser.get(p.user_id_ulu)
      if (lijst) lijst.push(p)
      else pauzePerUser.set(p.user_id_ulu, [p])
    }

    // Zakelijke ritten groeperen per bestuurder-dag.
    const perDag = new Map<string, RitRij[]>()
    for (const r of ritten) {
      if (r.rit_type_effectief !== 'zakelijk') continue
      const sleutel = aanwezigheidSleutel(r.user_id_ulu, r.start_datum)
      const lijst = perDag.get(sleutel)
      if (lijst) lijst.push(r)
      else perDag.set(sleutel, [r])
    }

    for (const [sleutel, dagRitten] of perDag) {
      const { user_id_ulu: userId, start_datum: datum } = dagRitten[0]
      uit.set(
        sleutel,
        bepaalVenster(dagRitten, {
          userId,
          datum,
          pauzeR9,
          pauzeR10,
          ankerKeuzes,
          roosterPauzes: pauzePerUser.get(userId) ?? [],
        }),
      )
    }
  } catch {
    return uit
  }
  return uit
}

/** Lege uitkomst voor een dag waar geen zakelijke rit van bekend is. */
export const GEEN_VENSTER: DagAanwezigheid = {
  aankomst: null,
  vertrek: null,
  brutoMinuten: null,
  pauzeMinuten: 0,
  pauzeInRooster: false,
  nettoMinuten: null,
  reden: 'geen_ritten',
}

function hm(minuten: number): string {
  const u = String(Math.floor(minuten / 60)).padStart(2, '0')
  const m = String(minuten % 60).padStart(2, '0')
  return `${u}:${m}`
}

function bepaalVenster(
  dagRitten: RitRij[],
  ctx: {
    userId: string
    datum: string
    pauzeR9: number
    pauzeR10: number
    ankerKeuzes: Map<string, string>
    roosterPauzes: PauzeRij[]
  },
): DagAanwezigheid {
  // De ketenregel werkt op `UluTrip`; de query levert alleen de velden die hij
  // aanraakt (id, start_tijd, stop_tijd). De cast houdt de query klein — een
  // kwartaal aan volledige ritrijen hoeft hier niet doorheen.
  const trips = dagRitten as unknown as UluTrip[]

  const ketensAankomst = bouwKetens(trips, ctx.pauzeR9)
  const ketensVertrek =
    ctx.pauzeR10 === ctx.pauzeR9 ? ketensAankomst : bouwKetens(trips, ctx.pauzeR10)

  const aankomst = bepaalKeten(
    ketensAankomst,
    'aankomst',
    ctx.ankerKeuzes.get(ankerSleutel(ctx.userId, ctx.datum, 'R9')),
  )
  const vertrek = bepaalKeten(
    ketensVertrek,
    'vertrek',
    ctx.ankerKeuzes.get(ankerSleutel(ctx.userId, ctx.datum, 'R10')),
  )

  const pauzeInRooster = ctx.roosterPauzes.some(
    (p) => p.geldig_vanaf <= ctx.datum && (p.geldig_tot == null || p.geldig_tot >= ctx.datum),
  )
  const leeg = (reden: GeenVensterReden): DagAanwezigheid => ({
    aankomst: aankomst?.minuten != null ? hm(aankomst.minuten) : null,
    vertrek: vertrek?.minuten != null ? hm(vertrek.minuten) : null,
    brutoMinuten: null,
    pauzeMinuten: 0,
    pauzeInRooster,
    nettoMinuten: null,
    reden,
  })

  if (!aankomst || !vertrek) return leeg('geen_ritten')
  if (aankomst.minuten == null || vertrek.minuten == null) return leeg('geen_tijden')

  // Een keten = alleen de heenreis bekend. Zonder deze uitzondering leest R10's
  // terugval (het begin van diezelfde keten) als een vertrek van voor de
  // aankomst, en zou een dag van min tien uur op het scherm komen. Zelfde
  // uitzondering als R10 zelf maakt; wees iemand de rit handmatig aan, dan telt
  // die keuze wel.
  if (ketensVertrek.length < 2 && !vertrek.handmatig) return leeg('een_keten')

  const bruto = vertrek.minuten - aankomst.minuten
  if (bruto <= 0) return leeg('omgekeerd')

  const pauzeMinuten = pauzeOverlap(ctx.roosterPauzes, ctx.datum, aankomst.minuten, vertrek.minuten)

  return {
    aankomst: hm(aankomst.minuten),
    vertrek: hm(vertrek.minuten),
    brutoMinuten: bruto,
    pauzeMinuten,
    pauzeInRooster,
    nettoMinuten: Math.max(0, bruto - pauzeMinuten),
    reden: null,
  }
}

/**
 * De pauzeminuten die binnen het aanwezigheidsvenster vallen.
 *
 * Overlap en niet de volle pauzeduur: wie om 12:15 vertrekt heeft van de
 * schaftpauze van 12:00-12:30 maar een kwartier gehad. Een pauze die helemaal
 * buiten het venster valt telt niet mee — anders krijgt iemand die 's ochtends
 * al weg is alsnog een halfuur afgetrokken.
 */
function pauzeOverlap(pauzes: PauzeRij[], datum: string, vanaf: number, tot: number): number {
  let som = 0
  for (const p of pauzes) {
    if (p.geldig_vanaf > datum) continue
    if (p.geldig_tot != null && p.geldig_tot < datum) continue
    const start = parseHM(p.pauze_start)
    const eind = parseHM(p.pauze_eind)
    if (start == null || eind == null || eind <= start) continue
    som += Math.max(0, Math.min(eind, tot) - Math.max(start, vanaf))
  }
  return som
}
