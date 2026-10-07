// Feestdagen en goedgekeurd verlof als regels in de weekstaat zetten.
//
// Gebeurt op twee momenten:
//   - bij het aanmaken van een week (`vulVoor`): alles wat dan al vaststaat;
//   - bij het goedkeuren van verlof (`vulVerlofInOpenWeken`): in weken die al bestonden. Anders
//     moest de monteur goedgekeurd verlof zelf nog eens boeken -- en tijd voor tijd ontbrak dan,
//     terwijl de aanvraag al van zijn saldo af ging.
//
// Daarna is de weekstaat van de medewerker: opnieuw voorvullen zou zijn correcties terugdraaien,
// dus bij een bestaande week komen er alleen dagen bij die nog geen verlofregel hebben.
//
// Los van `weekstaat.ts`: dat is een 'use server'-module, en alles wat daar geëxporteerd wordt is
// een aanroepbare server action. Dit hoort alleen intern aangeroepen te worden.

import 'server-only'
import { createAdminClient } from '@everts/database/server'
import { getVoorgevuldeRegels, weekStartVan } from './rooster'
import { getUrenBestemming } from './instellingen'
import { zetOverurenRegels } from './overuren'
import type { UrenCategorie } from './rekenregel'

const db = () => createAdminClient()

/**
 * Zet de vaststaande regels van een week neer. Met `bereik` alleen verlof binnen die dagen, en
 * alleen op dagen waar nog geen verlofregel staat (de week bestond al).
 */
export async function vulVoor(
  medewerkerId: string,
  weekStart: string,
  weekId: string,
  bereik?: { van: string; tot: string },
) {
  const supabase = db()
  // Externen boeken geen verlof of feestdagen: die worden hun niet uitbetaald.
  const { data: mw } = await supabase.from('medewerkers').select('extern').eq('id', medewerkerId).maybeSingle()
  if (mw?.extern) return

  let voorgevuld = await getVoorgevuldeRegels(medewerkerId, weekStart)
  if (bereik) {
    // Een dag waarop al niet-gewerkte tijd staat slaan we over: dan heeft de medewerker het verlof
    // zelf al geboekt, en een tweede regel zou de dag dubbel tellen -- en als overuren terugkomen.
    const { data: al } = await supabase
      .from('uren_regels').select('datum, planning_uursoorten(uren_categorie)').eq('week_id', weekId)
    const bezet = new Set(((al ?? []) as Array<{ datum: string; planning_uursoorten: { uren_categorie: string | null } | null }>)
      .filter(r => r.planning_uursoorten?.uren_categorie && r.planning_uursoorten.uren_categorie !== 'werk')
      .map(r => r.datum))
    voorgevuld = voorgevuld.filter(r =>
      r.bron === 'bouw7_verlof' && r.datum >= bereik.van && r.datum <= bereik.tot && !bezet.has(r.datum))
  }
  if (!voorgevuld.length) return

  const { data: soorten } = await supabase
    .from('planning_uursoorten')
    .select('id, naam, uren_categorie')
    .not('uren_categorie', 'is', null)
  type Soort = { id: string; naam: string; uren_categorie: UrenCategorie }
  const lijst = (soorten ?? []) as Soort[]

  const feestdagSoort = lijst.find(s => s.uren_categorie === 'feestdag')
  // Verlof uit Bouw7 komt binnen als type 'verlof' | 'ziek' | 'training' | 'overig' zonder uursoort.
  // Verlof dat via EVA is aangevraagd kent zijn uursoort wel (tijd voor tijd, bijzonder verlof);
  // anders mikken we op de best passende afwezigheidssoort en vallen terug op Vakantie uren.
  const afwezig = lijst.filter(s => s.uren_categorie === 'afwezig')
  const zoek = (naam: string) => afwezig.find(s => s.naam.toLowerCase().includes(naam))
  const soortVoorType = (type?: string) =>
    type === 'ziek' ? (zoek('ziek') ?? zoek('vakantie'))
    : type === 'training' ? (zoek('scholing') ?? zoek('vakantie'))
    : (zoek('vakantie') ?? afwezig[0])

  const indirectDossier = (await getUrenBestemming(medewerkerId)).nietGewerktDossierId

  const rijen = voorgevuld.flatMap(r => {
    const soort = r.bron === 'bouw7_feestdag'
      ? feestdagSoort
      : (lijst.find(s => s.id === r.uursoortId) ?? soortVoorType(r.afwezigheidType))
    if (!soort) return []
    return [{
      week_id: weekId,
      medewerker_id: medewerkerId,
      datum: r.datum,
      uren: r.uren,
      uursoort_id: soort.id,
      dossier_id: indirectDossier,
      bron: r.bron,
      opmerking: r.omschrijving,
    }]
  })
  if (rijen.length) await supabase.from('uren_regels').insert(rijen)
}

/**
 * Net goedgekeurd verlof in de weken die al bestaan en nog van de medewerker zijn. Weken die nog
 * niet bestaan krijgen het vanzelf bij het aanmaken; ingediende weken blijven onaangeroerd.
 */
export async function vulVerlofInOpenWeken(medewerkerId: string, van: string, tot: string) {
  const { data: weken } = await db()
    .from('uren_weken')
    .select('id, week_start')
    .eq('medewerker_id', medewerkerId)
    .in('status', ['concept', 'afgekeurd'])
    .gte('week_start', weekStartVan(van))
    .lte('week_start', weekStartVan(tot))
    .order('week_start')
    .limit(60)
  for (const w of (weken ?? []) as Array<{ id: string; week_start: string }>) {
    await vulVoor(medewerkerId, w.week_start, w.id, { van, tot })
    await zetOverurenRegels(w.id)
  }
}
