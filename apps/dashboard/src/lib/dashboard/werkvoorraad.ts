import { createAdminClient } from '@everts/database/server'
import { getInterneDossierIds } from './queries'

/**
 * Werkvoorraad-berekening: nog uit te voeren arbeidsuren (vraag) tegenover de
 * beschikbare capaciteit tot het eind van het jaar (aanbod), per uursoort.
 *
 * - Vraag: Σ max(0, arbeid_prognose_uren − arbeid_geboekte_uren) over de lopende
 *   projecten in management_projecten (kostensoort 1 uit Bouw7, gevuld door de sync).
 *   Bewust géén uursoort-split — Bouw7 levert begrote/prognose-uren alleen als totaal.
 * - Aanbod: per medewerker de resterende werkdaguren (rooster − pauzes − verlof/ziekte)
 *   van vandaag t/m 31 december, gegroepeerd op de standaard-uursoort van de medewerker,
 *   gesplitst naar intern/extern.
 */

export type WerkvoorraadUursoortRegel = {
  uursoort_id: string
  naam: string
  kleur: string | null
  beschikbaar_totaal: number
  beschikbaar_intern: number
  beschikbaar_extern: number
  aantal_medewerkers: number
}

export type WerkvoorraadProjectRegel = {
  bouw7_id: string | null
  projectnummer: string
  projectnaam: string
  filiaal: string | null
  saldo: number
}

export type WerkvoorraadData = {
  /** Peildatum (vandaag) en einddatum (31-12 huidig jaar), als YYYY-MM-DD. */
  peildatum: string
  eindDatum: string
  /** Nog uit te voeren arbeidsuren (Σ positief saldo). */
  vraagUren: number
  /** Overschrijding: som van de negatieve saldi (absolute waarde), informatief. */
  vraagOverschrijding: number
  /** Totaal beschikbare capaciteit tot eind jaar. */
  aanbodUren: number
  /** Vraag / aanbod × 100. Null als er geen aanbod is. */
  bezettingsgraad: number | null
  perUursoort: WerkvoorraadUursoortRegel[]
  /** Actieve medewerkers met rooster maar zonder standaard-uursoort (tellen niet mee). */
  nietToegewezen: number
  /** Onderbouwing vraag: lopende projecten met een positief urensaldo. */
  projecten: WerkvoorraadProjectRegel[]
}

type RoosterRow = {
  medewerker_id: string
  geldig_vanaf: string
  geldig_tot: string | null
  werkdagen: number[]
  dagstart: string
  dageind: string
  medewerker_rooster_pauzes: { pauze_start: string; pauze_eind: string }[] | null
}

type MedewerkerRow = {
  id: string
  extern: boolean
  in_dienst_vanaf: string | null
  uit_dienst_per: string | null
  standaard_uursoort_id: string | null
}

type AfwezigheidRow = {
  medewerker_id: string
  start_datum: string
  eind_datum: string
}

function toMinuten(t: string): number {
  const [h, m] = t.split(':').map(Number)
  if (Number.isNaN(h) || Number.isNaN(m)) return 0
  return h * 60 + m
}

/** Netto werkdaguren van een rooster (dageind − dagstart − pauzes), in uren. */
function dagUrenVanRooster(r: RoosterRow): number {
  const start = toMinuten(r.dagstart)
  const eind = toMinuten(r.dageind)
  if (eind <= start) return 0
  let min = eind - start
  for (const p of r.medewerker_rooster_pauzes ?? []) {
    const ps = toMinuten(p.pauze_start)
    const pe = toMinuten(p.pauze_eind)
    if (pe > ps) min -= pe - ps
  }
  return min > 0 ? min / 60 : 0
}

/** YYYY-MM-DD (UTC) voor een dag-offset vanaf een basis-UTC-datum. */
function isoDatum(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export async function getWerkvoorraad(): Promise<WerkvoorraadData> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any

  const nu = new Date()
  const jaar = nu.getUTCFullYear()
  const peil = new Date(Date.UTC(nu.getUTCFullYear(), nu.getUTCMonth(), nu.getUTCDate()))
  const eind = new Date(Date.UTC(jaar, 11, 31))
  const peildatum = isoDatum(peil)
  const eindDatum = isoDatum(eind)

  const [projRes, medRes, uursoortRes, internSet] = await Promise.all([
    supabase
      .from('management_projecten')
      .select('bouw7_id, projectnummer, projectnaam, filiaal, arbeid_prognose_uren, arbeid_geboekte_uren, dossier_id')
      .eq('is_gereed', false),
    supabase
      .from('medewerkers')
      .select('id, extern, in_dienst_vanaf, uit_dienst_per, standaard_uursoort_id')
      .eq('actief', true),
    supabase
      .from('planning_uursoorten')
      .select('id, naam, kleur, volgorde')
      .order('volgorde', { ascending: true }),
    getInterneDossierIds(),
  ])

  // ── Vraag ──
  let vraagUren = 0
  let vraagOverschrijding = 0
  const projecten: WerkvoorraadProjectRegel[] = []
  for (const p of (projRes.data ?? []) as {
    bouw7_id: string | null; projectnummer: string; projectnaam: string; filiaal: string | null
    arbeid_prognose_uren: number | null; arbeid_geboekte_uren: number | null; dossier_id: string | null
  }[]) {
    if (p.dossier_id && internSet.has(p.dossier_id)) continue
    if (p.arbeid_prognose_uren == null && p.arbeid_geboekte_uren == null) continue
    const saldo = (p.arbeid_prognose_uren ?? 0) - (p.arbeid_geboekte_uren ?? 0)
    if (saldo > 0) {
      vraagUren += saldo
      projecten.push({
        bouw7_id: p.bouw7_id, projectnummer: p.projectnummer, projectnaam: p.projectnaam,
        filiaal: p.filiaal, saldo,
      })
    } else if (saldo < 0) {
      vraagOverschrijding += -saldo
    }
  }
  projecten.sort((a, b) => b.saldo - a.saldo)

  const medewerkers = (medRes.data ?? []) as MedewerkerRow[]
  const medMap = new Map(medewerkers.map(m => [m.id, m]))
  const medIds = medewerkers.map(m => m.id)

  // Roosters + verlof alleen ophalen als er medewerkers zijn.
  const [roosterRes, afwRes] = medIds.length
    ? await Promise.all([
        supabase
          .from('medewerker_roosters')
          .select('medewerker_id, geldig_vanaf, geldig_tot, werkdagen, dagstart, dageind, medewerker_rooster_pauzes(pauze_start, pauze_eind)')
          .in('medewerker_id', medIds),
        supabase
          .from('medewerker_afwezigheid')
          .select('medewerker_id, start_datum, eind_datum')
          .in('medewerker_id', medIds)
          .lte('start_datum', eindDatum)
          .gte('eind_datum', peildatum),
      ])
    : [{ data: [] }, { data: [] }]

  const roostersPerMed = new Map<string, RoosterRow[]>()
  for (const r of (roosterRes.data ?? []) as RoosterRow[]) {
    const arr = roostersPerMed.get(r.medewerker_id) ?? []
    arr.push(r)
    roostersPerMed.set(r.medewerker_id, arr)
  }
  const afwPerMed = new Map<string, AfwezigheidRow[]>()
  for (const a of (afwRes.data ?? []) as AfwezigheidRow[]) {
    const arr = afwPerMed.get(a.medewerker_id) ?? []
    arr.push(a)
    afwPerMed.set(a.medewerker_id, arr)
  }

  // ── Aanbod: capaciteit per medewerker ──
  const capMap = new Map<string, number>()          // medewerker_id → beschikbare uren
  let nietToegewezen = 0

  for (const m of medewerkers) {
    const roosters = roostersPerMed.get(m.id) ?? []
    if (roosters.length === 0) continue              // geen rooster → geen capaciteit
    if (!m.standaard_uursoort_id) { nietToegewezen++; continue }

    const afw = afwPerMed.get(m.id) ?? []
    let uren = 0
    // Itereer per dag van peildatum t/m eindDatum.
    for (let d = new Date(peil); d <= eind; d.setUTCDate(d.getUTCDate() + 1)) {
      const datum = isoDatum(d)
      // In dienst?
      if (m.in_dienst_vanaf && datum < m.in_dienst_vanaf) continue
      if (m.uit_dienst_per && datum > m.uit_dienst_per) continue
      // ISO weekdag 1=Ma … 7=Zo.
      const iso = ((d.getUTCDay() + 6) % 7) + 1
      // Geldig rooster voor deze dag?
      const rooster = roosters.find(r =>
        r.werkdagen.includes(iso) &&
        r.geldig_vanaf <= datum &&
        (r.geldig_tot == null || r.geldig_tot >= datum),
      )
      if (!rooster) continue
      // Verlof/ziekte op deze dag → volledige dag niet beschikbaar.
      const afwezig = afw.some(a => a.start_datum <= datum && a.eind_datum >= datum)
      if (afwezig) continue
      uren += dagUrenVanRooster(rooster)
    }
    capMap.set(m.id, Math.round(uren * 10) / 10)
  }

  // ── Aggregeren per uursoort ──
  type Acc = { totaal: number; intern: number; extern: number; aantal: number }
  const perUursoortAcc = new Map<string, Acc>()
  let aanbodUren = 0
  for (const [medId, uren] of capMap) {
    const m = medMap.get(medId)!
    const uid = m.standaard_uursoort_id!
    const acc = perUursoortAcc.get(uid) ?? { totaal: 0, intern: 0, extern: 0, aantal: 0 }
    acc.totaal += uren
    if (m.extern) acc.extern += uren
    else acc.intern += uren
    acc.aantal++
    perUursoortAcc.set(uid, acc)
    aanbodUren += uren
  }

  const uursoorten = (uursoortRes.data ?? []) as { id: string; naam: string; kleur: string | null; volgorde: number }[]
  const perUursoort: WerkvoorraadUursoortRegel[] = uursoorten
    .filter(u => perUursoortAcc.has(u.id))
    .map(u => {
      const a = perUursoortAcc.get(u.id)!
      return {
        uursoort_id: u.id,
        naam: u.naam,
        kleur: u.kleur,
        beschikbaar_totaal: Math.round(a.totaal * 10) / 10,
        beschikbaar_intern: Math.round(a.intern * 10) / 10,
        beschikbaar_extern: Math.round(a.extern * 10) / 10,
        aantal_medewerkers: a.aantal,
      }
    })

  return {
    peildatum,
    eindDatum,
    vraagUren: Math.round(vraagUren * 10) / 10,
    vraagOverschrijding: Math.round(vraagOverschrijding * 10) / 10,
    aanbodUren: Math.round(aanbodUren * 10) / 10,
    bezettingsgraad: aanbodUren > 0 ? Math.round((vraagUren / aanbodUren) * 1000) / 10 : null,
    perUursoort,
    nietToegewezen,
    projecten,
  }
}
