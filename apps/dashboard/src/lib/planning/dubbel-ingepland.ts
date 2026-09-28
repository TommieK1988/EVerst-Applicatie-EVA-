import { createAdminClient } from '@everts/database/server'
import { medewerkerAfwezigheidLabels, type MedewerkerAfwezigheidType } from '@everts/database/platform-types'
import { haalAlleRijen } from '@/lib/supabase/paginate'
import { nlDelen, nlTijdstip, plusDagen } from './nl-tijd'

const db = () => createAdminClient()

/**
 * Eén botsing van een zojuist aangemaakt of verschoven planitem: de medewerker staat op
 * datzelfde moment al elders ingepland (ook in een ánder dossier) of heeft verlof/ziekte.
 * `wat` en `wanneer` zijn al leesbare tekst, zodat elk scherm ze zo kan tonen.
 */
export type DubbeleInplanning = {
  item_id:       string
  medewerker:    string
  soort:         'planitem' | 'afwezig'
  /** "2026-041 Kozijnen Zeist · Schilderwerk" of "Verlof". */
  wat:           string
  /** "6 okt 07:00 – 16:00" of "6 okt – 8 okt". */
  wanneer:       string
}

type ItemRij = { id: string; medewerker_id: string; start_dt: string; eind_dt: string; activiteit_id: string }
type AfwezigRij = {
  id: string; medewerker_id: string; type: MedewerkerAfwezigheidType
  start_datum: string; eind_datum: string; start_tijd: string | null; eind_tijd: string | null
}

const dagFmt = new Intl.DateTimeFormat('nl-NL', { timeZone: 'Europe/Amsterdam', day: 'numeric', month: 'short' })
const dag = (d: string | Date) => dagFmt.format(typeof d === 'string' ? new Date(d) : d).replace('.', '')

function wanneerPlanitem(start: string, eind: string): string {
  const s = nlDelen(start), e = nlDelen(eind)
  const tijd = (t: string) => t.slice(0, 5)
  return s.datum === e.datum
    ? `${dag(start)} ${tijd(s.tijd)} – ${tijd(e.tijd)}`
    : `${dag(start)} ${tijd(s.tijd)} – ${dag(eind)} ${tijd(e.tijd)}`
}

/** Verlof als ms-bereik in NL-tijd; zonder tijden telt de hele einddag mee. */
function afwezigInterval(a: AfwezigRij): { s: number; e: number } {
  if (a.start_tijd && a.eind_tijd) {
    return { s: Date.parse(nlTijdstip(a.start_datum, a.start_tijd)), e: Date.parse(nlTijdstip(a.eind_datum, a.eind_tijd)) }
  }
  return { s: Date.parse(nlTijdstip(a.start_datum, '00:00')), e: Date.parse(nlTijdstip(plusDagen(a.eind_datum, 1), '00:00')) }
}

/**
 * Zoek voor de gegeven planitems waar de medewerker op hetzelfde moment al staat: een ander
 * planitem (in welk dossier dan ook) of afwezigheid uit `medewerker_afwezigheid`.
 *
 * Draait ná het opslaan en blokkeert niets: dubbel plannen mag (de planner kan er een reden
 * voor hebben), maar hij moet het wél weten. De detailplanning ziet zelf alleen de planitems
 * van zijn eigen dossier; dit is de enige plek die over alle dossiers heen kijkt.
 *
 * Fail-soft: een mislukte controle mag een geslaagde planningswijziging niet laten falen.
 */
export async function zoekDubbeleInplanning(itemIds: string[]): Promise<DubbeleInplanning[]> {
  if (itemIds.length === 0) return []
  try {
    return await zoek(itemIds)
  } catch (e) {
    console.error('[planning] controle op dubbele inplanning mislukt:', e)
    return []
  }
}

async function zoek(itemIds: string[]): Promise<DubbeleInplanning[]> {
  const supabase = db()

  // Begrensd door de id-lijst (één planitem, of de items van één fase).
  const { data: eigenData, error } = await supabase
    .from('planning_items')
    .select('id, medewerker_id, start_dt, eind_dt, activiteit_id')
    .in('id', itemIds)
  if (error) throw new Error(error.message)
  const eigen = (eigenData ?? []) as ItemRij[]
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

  const botsingen: { item: ItemRij; ander?: ItemRij; afwezig?: AfwezigRij }[] = []
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
        if (!(Date.parse(o.start_dt) < e && Date.parse(o.eind_dt) > s)) continue
        // Twee items uit dezelfde batch botsen onderling: één melding, niet twee.
        const paar = [it.id, o.id].sort().join('|')
        if (gezienPaar.has(paar)) continue
        gezienPaar.add(paar)
        botsingen.push({ item: it, ander: o })
      }
      for (const a of afwezig) {
        const iv = afwezigInterval(a)
        if (iv.s < e && iv.e > s) botsingen.push({ item: it, afwezig: a })
      }
    }
  }
  if (botsingen.length === 0) return []

  // Omschrijving van de botsende planitems: dossier + activiteit.
  const activiteitIds = [...new Set(botsingen.flatMap(b => (b.ander ? [b.ander.activiteit_id] : [])))]
  const { data: actData } = activiteitIds.length
    ? await supabase.from('planning_activiteiten').select('id, titel, dossier_id').in('id', activiteitIds)
    : { data: [] }
  const acts = (actData ?? []) as { id: string; titel: string | null; dossier_id: string | null }[]
  const dossierIds = [...new Set(acts.map(a => a.dossier_id).filter((d): d is string => !!d))]
  const { data: dosData } = dossierIds.length
    ? await supabase.from('dossiers').select('id, dossiernummer, titel').in('id', dossierIds)
    : { data: [] }
  const dossierNaam = new Map<string, string>(((dosData ?? []) as { id: string; dossiernummer: string | null; titel: string | null }[])
    .map(d => [d.id, [d.dossiernummer, d.titel].filter(Boolean).join(' ')]))
  const actOmschrijving = new Map(acts.map(a => [
    a.id,
    [a.dossier_id ? dossierNaam.get(a.dossier_id) : null, a.titel].filter(Boolean).join(' · ') || 'Ander planitem',
  ]))

  return botsingen.map(b => ({
    item_id:    b.item.id,
    medewerker: naamVan.get(b.item.medewerker_id) ?? 'Medewerker',
    ...(b.ander
      ? {
          soort:   'planitem' as const,
          wat:     actOmschrijving.get(b.ander.activiteit_id) ?? 'Ander planitem',
          wanneer: wanneerPlanitem(b.ander.start_dt, b.ander.eind_dt),
        }
      : {
          soort:   'afwezig' as const,
          wat:     medewerkerAfwezigheidLabels[b.afwezig!.type] ?? 'Afwezig',
          wanneer: b.afwezig!.start_tijd && b.afwezig!.eind_tijd
            ? wanneerPlanitem(nlTijdstip(b.afwezig!.start_datum, b.afwezig!.start_tijd), nlTijdstip(b.afwezig!.eind_datum, b.afwezig!.eind_tijd))
            : b.afwezig!.start_datum === b.afwezig!.eind_datum
              ? dag(nlTijdstip(b.afwezig!.start_datum, '12:00'))
              : `${dag(nlTijdstip(b.afwezig!.start_datum, '12:00'))} – ${dag(nlTijdstip(b.afwezig!.eind_datum, '12:00'))}`,
        }),
  }))
}
