// De automatische overurenregel in de weekstaat.
//
// Werkt iemand meer dan zijn contract, dan zet EVA er zelf een regel "Tijd voor tijd" met MIN de
// overuren bij. De week komt zo precies op de contracturen uit -- dat is de vierkantscontrole in
// Bouw7 en de loonadministratie -- en de overuren staan herkenbaar op het tijd-voor-tijdsaldo.
// De monteur hoeft er niets voor te doen; de rekenregel staat in `verdeelOveruren`.
//
// De regel wordt na elke wijziging in de week opnieuw bepaald, zolang de week nog van de
// medewerker is (concept of afgekeurd). Na indienen alleen nog als de medewerker zelf iets wijzigt
// (`naIndienen`): bij het openen van een ingediende week verschuift er niets meer.
//
// Na indienen kan een overurenregel al goedgekeurd zijn terwijl de rest van de week nog open
// staat (het slot zit per regel, zie ./wijzigen-na-indienen). Daarom herschrijven we alleen wat
// echt verandert (`overurenVerschil`), en weigert de weekstaat vooraf een wijziging die een
// goedgekeurde overurenregel zou laten verdwijnen (`overurenDieVervallen`).

import 'server-only'
import { createAdminClient } from '@everts/database/server'
import { getRooster, isoWeekdag, urenPerWerkdag, weekDagen } from './rooster'
import { getUrenBestemming } from './instellingen'
import { OVERUREN_BRON, overurenVerschil, verdeelOveruren, type OverurenRegel } from './rekenregel'
import { bewerkbaar } from './week-guard'
import { goedgekeurdeRegelIds, verwijderUitBouw7 } from './wijzigen-na-indienen'

const db = () => createAdminClient()

type Rij = { id: string; datum: string; uren: number | string; bron: string; bouw7_hour_log_id: number | null }
type Week = { id: string; medewerker_id: string; week_start: string; status: string; contracturen: number | string | null; extern: boolean }

async function laadWeek(weekId: string): Promise<{ week: Week; regels: Rij[] } | null> {
  const supabase = db()
  const [{ data: week }, { data: regels }] = await Promise.all([
    supabase
      .from('uren_weken')
      .select('id, medewerker_id, week_start, status, contracturen, medewerkers!uren_weken_medewerker_id_fkey(extern)')
      .eq('id', weekId)
      .maybeSingle(),
    // Eén week van één medewerker: een handvol regels.
    supabase
      .from('uren_regels')
      .select('id, datum, uren, bron, bouw7_hour_log_id')
      .eq('week_id', weekId),
  ])
  if (!week) return null
  return { week: { ...week, extern: !!week.medewerkers?.extern }, regels: (regels ?? []) as Rij[] }
}

/** De overurenregels die de week zou moeten hebben bij deze (gewone) regels. */
async function gewensteOveruren(week: Week, gewoon: OverurenRegel[]): Promise<OverurenRegel[]> {
  // Een extern heeft geen norm en geen saldo: daar hoort nooit een overurenregel.
  const contracturen = week.extern ? 0 : Number(week.contracturen ?? 0)
  const rooster = contracturen > 0 ? await getRooster(week.medewerker_id, week.week_start) : null
  const dagNormen: Record<string, number> = {}
  if (rooster) {
    const perDag = urenPerWerkdag(rooster)
    for (const d of weekDagen(week.week_start)) {
      if (rooster.werkdagen.includes(isoWeekdag(d))) dagNormen[d] = perDag
    }
  }
  return verdeelOveruren(gewoon, dagNormen, contracturen)
}

const splits = (alle: Rij[]) => ({
  bestaand: alle.filter(r => r.bron === OVERUREN_BRON).map(r => ({ ...r, uren: Number(r.uren) })),
  gewoon: alle.filter(r => r.bron !== OVERUREN_BRON).map(r => ({ id: r.id, datum: r.datum, uren: Number(r.uren) })),
})

/**
 * Welke bestaande overurenregels zouden verdwijnen als deze wijziging doorgaat: `regelId` gaat
 * eruit, `nieuw` komt erbij. Alleen bij een ingediende week van belang: daarvóór is er niets
 * goedgekeurd.
 */
export async function overurenDieVervallen(
  weekId: string,
  wijziging: { regelId?: string; nieuw?: OverurenRegel },
): Promise<string[]> {
  const geladen = await laadWeek(weekId)
  if (!geladen || geladen.week.status !== 'ingediend') return []
  const { bestaand, gewoon } = splits(geladen.regels)
  const na: OverurenRegel[] = gewoon.filter(r => r.id !== wijziging.regelId)
  if (wijziging.nieuw) na.push({ datum: wijziging.nieuw.datum, uren: Number(wijziging.nieuw.uren) })
  return overurenVerschil(bestaand, await gewensteOveruren(geladen.week, na)).weg.map(r => r.id)
}

/** Zet de automatische overurenregels van een week goed. Doet niets als er niets verandert. */
export async function zetOverurenRegels(
  weekId: string,
  /** Vanuit een wijziging die al langs `vereisWijzigbaar` ging: dan mag het ook na indienen. */
  opties: { naIndienen?: boolean } = {},
): Promise<void> {
  const supabase = db()
  const geladen = await laadWeek(weekId)
  if (!geladen) return
  const { week } = geladen
  if (!(bewerkbaar(week.status) || (opties.naIndienen && week.status === 'ingediend'))) return

  const { bestaand, gewoon } = splits(geladen.regels)
  // Hetzelfde als wat er al staat? Dan niets herschrijven: dit draait bij elke weergave.
  const { weg, erbij } = overurenVerschil(bestaand, await gewensteOveruren(week, gewoon))
  if (!weg.length && !erbij.length) return

  if (weg.length) {
    // Vangnet: de weekstaat weigert zo'n wijziging al vooraf. Een goedgekeurde regel halen we
    // nooit weg -- liever een overurenregel die even niet klopt dan een stille ongedaan gemaakte
    // goedkeuring.
    if (week.status === 'ingediend') {
      const akkoord = await goedgekeurdeRegelIds(weekId)
      if (weg.some(r => akkoord.has(r.id))) {
        console.error('[uren] overurenregel is al goedgekeurd; niet herschreven', weekId)
        return
      }
    }
    // Al naar Bouw7 gestuurd (ingediende week): daar eerst weg, anders staan de overuren er dubbel.
    try {
      await verwijderUitBouw7(weg.map(r => r.bouw7_hour_log_id).filter((id): id is number => id != null))
    } catch (e) {
      console.error('[uren] oude overurenregel niet uit Bouw7 verwijderd', weekId, e)
      return
    }
    await supabase.from('uren_regels').delete().in('id', weg.map(r => r.id))
  }
  if (!erbij.length) return

  const [{ data: soort }, bestemming] = await Promise.all([
    supabase
      .from('planning_uursoorten')
      .select('id')
      .eq('uren_categorie', 'tijd_voor_tijd')
      .eq('actief', true)
      .order('bouw7_id')
      .limit(1)
      .maybeSingle(),
    getUrenBestemming(week.medewerker_id),
  ])
  // Zonder uursoort of indirect project kan de regel niet naar Bouw7. De week blijft dan zoals
  // vroeger (overuren alleen op het saldo); de weekstaat meldt het ontbrekende project al zelf.
  if (!soort || !bestemming.nietGewerktDossierId) return

  const { error } = await supabase.from('uren_regels').insert(erbij.map(r => ({
    week_id: weekId,
    medewerker_id: week.medewerker_id,
    datum: r.datum,
    uren: r.uren,
    uursoort_id: soort.id,
    dossier_id: bestemming.nietGewerktDossierId,
    bron: OVERUREN_BRON,
    opmerking: 'Overuren naar tijd-voor-tijdsaldo',
  })))
  // Niet gooien: dit draait ook bij het openen van de weekstaat, en een mislukte overurenregel mag
  // de monteur zijn week niet afpakken. Hij valt dan terug op het oude gedrag (alleen saldo).
  if (error) console.error('[uren] overurenregel niet opgeslagen', weekId, error.message)
}
