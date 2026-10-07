// De automatische overurenregel in de weekstaat.
//
// Werkt iemand meer dan zijn contract, dan zet EVA er zelf een regel "Tijd voor tijd" met MIN de
// overuren bij. De week komt zo precies op de contracturen uit -- dat is de vierkantscontrole in
// Bouw7 en de loonadministratie -- en de overuren staan herkenbaar op het tijd-voor-tijdsaldo.
// De monteur hoeft er niets voor te doen; de rekenregel staat in `verdeelOveruren`.
//
// De regel wordt na elke wijziging in de week opnieuw bepaald, en alleen zolang de week nog van de
// medewerker is (concept of afgekeurd). Na indienen ligt hij vast, net als de rest van de week.

import 'server-only'
import { createAdminClient } from '@everts/database/server'
import { getRooster, isoWeekdag, urenPerWerkdag, weekDagen } from './rooster'
import { getUrenBestemming } from './instellingen'
import { OVERUREN_BRON, rondUren, verdeelOveruren } from './rekenregel'
import { bewerkbaar } from './week-guard'

const db = () => createAdminClient()

/** Zet de automatische overurenregels van een week goed. Doet niets als er niets verandert. */
export async function zetOverurenRegels(weekId: string): Promise<void> {
  const supabase = db()
  const { data: week } = await supabase
    .from('uren_weken')
    .select('id, medewerker_id, week_start, status, contracturen, medewerkers!uren_weken_medewerker_id_fkey(extern)')
    .eq('id', weekId)
    .maybeSingle()
  if (!week || !bewerkbaar(week.status)) return

  // Eén week van één medewerker: een handvol regels.
  const { data: regels } = await supabase
    .from('uren_regels')
    .select('id, datum, uren, bron')
    .eq('week_id', weekId)
  type Rij = { id: string; datum: string; uren: number | string; bron: string }
  const alle = (regels ?? []) as Rij[]
  const bestaand = alle.filter(r => r.bron === OVERUREN_BRON)
  const gewoon = alle
    .filter(r => r.bron !== OVERUREN_BRON)
    .map(r => ({ datum: r.datum, uren: Number(r.uren) }))

  // Een extern heeft geen norm en geen saldo: daar hoort nooit een overurenregel.
  const contracturen = week.medewerkers?.extern ? 0 : Number(week.contracturen ?? 0)
  const rooster = contracturen > 0 ? await getRooster(week.medewerker_id, week.week_start) : null
  const dagNormen: Record<string, number> = {}
  if (rooster) {
    const perDag = urenPerWerkdag(rooster)
    for (const d of weekDagen(week.week_start)) {
      if (rooster.werkdagen.includes(isoWeekdag(d))) dagNormen[d] = perDag
    }
  }
  const gewenst = verdeelOveruren(gewoon, dagNormen, contracturen)

  // Hetzelfde als wat er al staat? Dan niets herschrijven: dit draait bij elke weergave.
  const sleutel = (rs: Array<{ datum: string; uren: number }>) =>
    rs.map(r => `${r.datum}:${rondUren(r.uren)}`).sort().join('|')
  if (sleutel(gewenst) === sleutel(bestaand.map(r => ({ datum: r.datum, uren: Number(r.uren) })))) return

  if (bestaand.length) {
    await supabase.from('uren_regels').delete().in('id', bestaand.map(r => r.id))
  }
  if (!gewenst.length) return

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

  const { error } = await supabase.from('uren_regels').insert(gewenst.map(r => ({
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
