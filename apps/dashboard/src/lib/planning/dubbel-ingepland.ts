import { createAdminClient } from '@everts/database/server'
import { medewerkerAfwezigheidLabels, type MedewerkerAfwezigheidType } from '@everts/database/platform-types'
import { haalAlleRijen } from '@/lib/supabase/paginate'
import { dossierSegment } from '@/lib/dossiers/href'
import { nlDelen, nlTijdstip, plusDagen } from './nl-tijd'

const db = () => createAdminClient()

/**
 * Eén botsing: de medewerker staat op hetzelfde moment op twee plekken — een planitem van
 * dít dossier (`hier`) en een ander planitem (ook in een ánder dossier) of verlof/ziekte.
 *
 * De tekstvelden zijn al leesbaar opgemaakt (NL-tijd, want de server draait in UTC). Daarnaast
 * gaan de ruwe momenten en ids mee, zodat de detailplanning naar het planitem kan springen.
 */
export type DubbeleInplanning = {
  /** Het planitem van dit dossier. */
  item_id:        string
  medewerker_id:  string
  medewerker:     string
  hier: {
    activiteit_id: string
    /** "Schilderwerk" */
    activiteit:    string
    /** "wo 7 okt 07:00 – 16:00" */
    wanneer:       string
  }
  soort:          'planitem' | 'afwezig'
  /** "2026-041 Kozijnen Zeist · Timmerman" of "Verlof". */
  wat:            string
  /** Wanneer dat andere staat: "wo 7 okt 07:00 – 12:00" of "wo 7 okt – vr 9 okt". */
  wanneer:        string
  /** Het botsende planitem en zijn dossier (alleen bij soort 'planitem'). */
  ander_item_id:  string | null
  ander_dossier_id: string | null
  /** Planning-tab van het andere dossier; null als het dit dossier zelf is. */
  ander_href:     string | null
  /** Het stuk dat dubbel staat, als ISO-moment en als tekst: "wo 7 okt 07:00 – 12:00". */
  overlap_van:    string
  overlap_tot:    string
  overlap:        string
}

type ItemRij = { id: string; medewerker_id: string; start_dt: string; eind_dt: string; activiteit_id: string }
type AfwezigRij = {
  id: string; medewerker_id: string; type: MedewerkerAfwezigheidType
  start_datum: string; eind_datum: string; start_tijd: string | null; eind_tijd: string | null
}

const dagFmt = new Intl.DateTimeFormat('nl-NL', { timeZone: 'Europe/Amsterdam', weekday: 'short', day: 'numeric', month: 'short' })
const dag = (iso: string) => dagFmt.format(new Date(iso)).replace(/\./g, '')
const tijd = (iso: string) => nlDelen(iso).tijd.slice(0, 5)

/** Leesbaar tijdvak in NL-tijd. `heleDagen`: alleen datums, voor verlof zonder tijden. */
function tijdvak(start: string, eind: string, heleDagen = false): string {
  const s = nlDelen(start).datum
  if (heleDagen) {
    // Het eind is exclusief (middernacht van de dag erna): de laatste dag is de dag ervóór.
    const laatste = nlTijdstip(plusDagen(nlDelen(eind).datum, -1), '12:00')
    return s === nlDelen(laatste).datum ? dag(start) : `${dag(start)} – ${dag(laatste)}`
  }
  // Eindigt het om middernacht, dan hoort het bij de dag ervóór: "di 29 sep 07:30 – 24:00".
  const e = nlDelen(eind)
  const eindDatum = e.tijd.startsWith('00:00') ? plusDagen(e.datum, -1) : e.datum
  const eindTijd  = e.tijd.startsWith('00:00') ? '24:00' : tijd(eind)
  return s === eindDatum
    ? `${dag(start)} ${tijd(start)} – ${eindTijd}`
    : `${dag(start)} ${tijd(start)} – ${dag(nlTijdstip(eindDatum, '12:00'))} ${eindTijd}`
}

/** Verlof als ms-bereik in NL-tijd; zonder tijden telt de hele einddag mee. */
function afwezigInterval(a: AfwezigRij): { s: number; e: number; heleDagen: boolean } {
  if (a.start_tijd && a.eind_tijd) {
    return { s: Date.parse(nlTijdstip(a.start_datum, a.start_tijd)), e: Date.parse(nlTijdstip(a.eind_datum, a.eind_tijd)), heleDagen: false }
  }
  return {
    s: Date.parse(nlTijdstip(a.start_datum, '00:00')),
    e: Date.parse(nlTijdstip(plusDagen(a.eind_datum, 1), '00:00')),
    heleDagen: true,
  }
}

/**
 * Zoek voor de gegeven planitems waar de medewerker op hetzelfde moment al staat: een ander
 * planitem (in welk dossier dan ook) of afwezigheid uit `medewerker_afwezigheid`.
 *
 * Blokkeert niets: dubbel plannen mag (de planner kan er een reden voor hebben), maar hij
 * moet het wél weten. De detailplanning ziet zelf alleen de planitems van zijn eigen dossier;
 * dit is de plek die over alle dossiers heen kijkt.
 *
 * Fail-soft: een mislukte controle mag een geslaagde planningswijziging niet laten falen.
 */
export async function zoekDubbeleInplanning(
  itemIds: string[],
  opties: { dossierId?: string } = {},
): Promise<DubbeleInplanning[]> {
  if (itemIds.length === 0) return []
  try {
    return await zoek(itemIds, opties.dossierId ?? null)
  } catch (e) {
    console.error('[planning] controle op dubbele inplanning mislukt:', e)
    return []
  }
}

/**
 * Alle dubbele inplanningen van de lopende en toekomstige planitems van één dossier — voor
 * het overzicht boven de detailplanning. Wat al voorbij is, valt niet meer te verhelpen.
 */
export async function zoekDubbeleInplanningVoorDossier(dossierId: string): Promise<DubbeleInplanning[]> {
  try {
    const supabase = db()
    // Begrensd door dossier_id; een dossier heeft hooguit enkele tientallen activiteiten.
    const { data: acts } = await supabase.from('planning_activiteiten').select('id').eq('dossier_id', dossierId)
    const actIds = (acts ?? []).map(a => a.id as string)
    if (actIds.length === 0) return []
    const items = await haalAlleRijen<{ id: string }>((a, b) =>
      supabase.from('planning_items')
        .select('id')
        .in('activiteit_id', actIds)
        .gt('eind_dt', new Date().toISOString())
        .order('id')
        .range(a, b))
    return await zoekDubbeleInplanning(items.map(i => i.id), { dossierId })
  } catch (e) {
    console.error('[planning] dubbele inplanning voor dossier ophalen mislukt:', e)
    return []
  }
}

async function zoek(itemIds: string[], ditDossier: string | null): Promise<DubbeleInplanning[]> {
  const supabase = db()

  // Begrensd door de id-lijst (één planitem, of de items van één fase of dossier).
  const eigen: ItemRij[] = []
  for (let i = 0; i < itemIds.length; i += 200) {
    const { data, error } = await supabase
      .from('planning_items')
      .select('id, medewerker_id, start_dt, eind_dt, activiteit_id')
      .in('id', itemIds.slice(i, i + 200))
    if (error) throw new Error(error.message)
    eigen.push(...((data ?? []) as ItemRij[]))
  }
  if (eigen.length === 0) return []

  const perMed = new Map<string, ItemRij[]>()
  for (const it of eigen) perMed.set(it.medewerker_id, [...(perMed.get(it.medewerker_id) ?? []), it])
  const medIds = [...perMed.keys()]

  const { data: medData } = await supabase
    .from('medewerkers')
    .select('id, voornaam, tussenvoegsel, achternaam')
    .in('id', medIds)
  const naamVan = new Map<string, string>(((medData ?? []) as { id: string; voornaam: string | null; tussenvoegsel: string | null; achternaam: string | null }[])
    .map(m => [m.id, [m.voornaam, m.tussenvoegsel, m.achternaam].filter(Boolean).join(' ')]))

  type Botsing = { item: ItemRij; s: number; e: number } & (
    | { ander: ItemRij; afwezig?: undefined }
    | { afwezig: AfwezigRij; heleDagen: boolean; ander?: undefined }
  )
  const botsingen: Botsing[] = []
  const gezienPaar = new Set<string>()

  for (const [medId, mijn] of perMed) {
    const van = mijn.reduce((m, i) => (i.start_dt < m ? i.start_dt : m), mijn[0].start_dt)
    const tot = mijn.reduce((m, i) => (i.eind_dt > m ? i.eind_dt : m), mijn[0].eind_dt)

    // Begrensd door medewerker + tijdvenster, maar een fasekopie kan maanden beslaan:
    // gepagineerd, zodat een drukke medewerker niet stil wordt afgekapt.
    const anderen = await haalAlleRijen<ItemRij>((a, b) =>
      supabase.from('planning_items')
        .select('id, medewerker_id, start_dt, eind_dt, activiteit_id')
        .eq('medewerker_id', medId)
        .lt('start_dt', tot)
        .gt('eind_dt', van)
        .order('id')
        .range(a, b))

    const afwezig = await haalAlleRijen<AfwezigRij>((a, b) =>
      supabase.from('medewerker_afwezigheid')
        .select('id, medewerker_id, type, start_datum, eind_datum, start_tijd, eind_tijd')
        .eq('medewerker_id', medId)
        .lte('start_datum', nlDelen(tot).datum)
        .gte('eind_datum', nlDelen(van).datum)
        .order('id')
        .range(a, b))

    for (const it of mijn) {
      const s = Date.parse(it.start_dt), e = Date.parse(it.eind_dt)
      for (const o of anderen) {
        if (o.id === it.id) continue
        const os = Date.parse(o.start_dt), oe = Date.parse(o.eind_dt)
        if (!(os < e && oe > s)) continue
        // Twee items uit dezelfde set botsen onderling: één melding, niet twee.
        const paar = [it.id, o.id].sort().join('|')
        if (gezienPaar.has(paar)) continue
        gezienPaar.add(paar)
        botsingen.push({ item: it, ander: o, s: Math.max(s, os), e: Math.min(e, oe) })
      }
      for (const a of afwezig) {
        const iv = afwezigInterval(a)
        if (iv.s < e && iv.e > s) botsingen.push({ item: it, afwezig: a, heleDagen: iv.heleDagen, s: Math.max(s, iv.s), e: Math.min(e, iv.e) })
      }
    }
  }
  if (botsingen.length === 0) return []

  // Omschrijvingen: activiteit van beide kanten, dossier van de andere kant.
  const activiteitIds = [...new Set(botsingen.flatMap(b => [b.item.activiteit_id, ...(b.ander ? [b.ander.activiteit_id] : [])]))]
  const { data: actData } = await supabase.from('planning_activiteiten').select('id, titel, dossier_id').in('id', activiteitIds)
  const acts = new Map(((actData ?? []) as { id: string; titel: string | null; dossier_id: string | null }[]).map(a => [a.id, a]))
  const dossierIds = [...new Set([...acts.values()].map(a => a.dossier_id).filter((d): d is string => !!d))]
  const { data: dosData } = dossierIds.length
    ? await supabase.from('dossiers').select('id, dossiernummer, titel, hoofdstatus, servicedesk_substatus').in('id', dossierIds)
    : { data: [] }
  const dossiers = new Map(((dosData ?? []) as { id: string; dossiernummer: string | null; titel: string | null; hoofdstatus: string | null; servicedesk_substatus: string | null }[])
    .map(d => [d.id, d]))

  const uit = botsingen.map((b): DubbeleInplanning => {
    const hierAct = acts.get(b.item.activiteit_id)
    const basis = {
      item_id:       b.item.id,
      medewerker_id: b.item.medewerker_id,
      medewerker:    naamVan.get(b.item.medewerker_id) ?? 'Medewerker',
      hier: {
        activiteit_id: b.item.activiteit_id,
        activiteit:    hierAct?.titel || 'Planitem',
        wanneer:       tijdvak(b.item.start_dt, b.item.eind_dt),
      },
      overlap_van: new Date(b.s).toISOString(),
      overlap_tot: new Date(b.e).toISOString(),
      overlap:     tijdvak(new Date(b.s).toISOString(), new Date(b.e).toISOString()),
    }
    if (b.ander) {
      const act = acts.get(b.ander.activiteit_id)
      const dos = act?.dossier_id ? dossiers.get(act.dossier_id) : undefined
      const zelfde = !!dos && dos.id === (ditDossier ?? hierAct?.dossier_id)
      const seg = dos ? dossierSegment(dos.hoofdstatus, dos.servicedesk_substatus) ?? 'opdrachten' : null
      return {
        ...basis,
        soort:            'planitem',
        wat:              zelfde
          ? `${act?.titel || 'Ander planitem'} (dit dossier)`
          : [dos ? [dos.dossiernummer, dos.titel].filter(Boolean).join(' ') : null, act?.titel].filter(Boolean).join(' · ') || 'Ander planitem',
        wanneer:          tijdvak(b.ander.start_dt, b.ander.eind_dt),
        ander_item_id:    b.ander.id,
        ander_dossier_id: dos?.id ?? null,
        ander_href:       dos && !zelfde ? `/${seg}/${dos.id}/planning` : null,
      }
    }
    const a = b.afwezig
    const iv = afwezigInterval(a)
    return {
      ...basis,
      soort:            'afwezig',
      wat:              medewerkerAfwezigheidLabels[a.type] ?? 'Afwezig',
      wanneer:          tijdvak(new Date(iv.s).toISOString(), new Date(iv.e).toISOString(), iv.heleDagen),
      ander_item_id:    null,
      ander_dossier_id: null,
      ander_href:       null,
    }
  })
  return uit.sort((x, y) => x.overlap_van.localeCompare(y.overlap_van))
}
