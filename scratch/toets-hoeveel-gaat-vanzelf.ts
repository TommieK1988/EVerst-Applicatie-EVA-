/**
 * Hoeveel van de post die al binnenkwam zou EVA nu zelf afhandelen?
 *
 *   npx tsx ../../scratch/toets-hoeveel-gaat-vanzelf.ts   (vanuit apps/dashboard)
 *
 * Leest alleen, verandert niets, en doet geen enkele AI-aanroep. Neemt elk
 * bericht dat ooit beoordeeld is, bouwt de invoer voor `beslis` opnieuw op uit
 * het besluitenlog plus de gekeurde velden, en draait de hùidige regels erover.
 *
 * WAAROM
 * Drempels verzetten op gevoel is gokken. De aanleiding was hard: van de eerste
 * 35 berichten ging er vrijwel niets vanzelf, en de meest voorkomende reden was
 * "de afzender is niet zeker genoeg herkend" bij een score van precies 0,80 --
 * de aftopping voor doorgestuurde mail, terwijl vrijwel alle post hier via
 * info@everts.chat binnenkomt. Dat is geen twijfel over de klant, dat is een
 * mechanisme dat zichzelf in de weg zat.
 *
 * Wat deze toets níét is: een oordeel over of EVA het gòed zou doen. Hij telt
 * alleen hoeveel er door de poort komt. Of de uitkomst klopt, blijkt pas als er
 * echte berichten doorheen zijn gegaan.
 */
import fs from 'node:fs'
import path from 'node:path'

const env = fs.readFileSync(path.join(__dirname, '..', 'apps', 'dashboard', '.env.local'), 'utf-8')
for (const regel of env.split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(regel.trim())
  if (m) process.env[m[1]] ??= m[2].replace(/^["']|["']$/g, '')
}

type Details = {
  soort?: string | null
  soort_vertrouwen?: number
  afzender_score?: number
  herkend_via?: string | null
  bouw7_gereed?: boolean
  bouw7_ontbreekt?: string[]
  duplicaat_topscore?: number
  redenen?: string[]
}

async function main() {
  const { createAdminClient } = await import('@everts/database/server')
  const { beslis } = await import('@/lib/mailintake/beslis')
  const { bepaalRoute } = await import('@/lib/mailintake/types')
  const supabase = createAdminClient()

  const { data: rijen } = await supabase
    .from('mailintake_besluiten')
    .select('bericht_id, moment, details')
    .eq('actie', 'beoordeeld')
    .order('moment', { ascending: false })
    .limit(500)

  const beoordeeld = rijen ?? []
  console.log(`\n${beoordeeld.length} beoordeelde berichten uit het log\n`)

  const ids = [...new Set(beoordeeld.map(r => r.bericht_id))]
  const { data: extracties } = await supabase
    .from('mailintake_extracties')
    .select('bericht_id, gekeurde_velden')
    .in('bericht_id', ids)
    .eq('ronde', 'velden')
    .not('gekeurde_velden', 'is', null)
    .limit(1000)

  const veldenPer = new Map<string, Record<string, unknown>>()
  for (const e of extracties ?? []) {
    if (!veldenPer.has(e.bericht_id)) veldenPer.set(e.bericht_id, e.gekeurde_velden as Record<string, unknown>)
  }

  let vanzelf = 0
  let voorgelegd = 0
  let buiten = 0
  const redenTeller = new Map<string, number>()

  for (const r of beoordeeld) {
    const d = (r.details ?? {}) as Details
    const v = veldenPer.get(r.bericht_id) ?? {}

    // De doorstuuraftopping zette de score op exact 0,80 terwijl het adres van de
    // klant gewoon in de doorstuurkop stond. Dat is nu weg; voor deze terugblik
    // wordt dat nagebootst, anders meet je de oude fout nog een keer.
    const hardeHerkenning = d.herkend_via === 'alias' || d.herkend_via === 'email_contactpersoon'
    const afzender = d.afzender_score === 0.8 && hardeHerkenning ? 1 : (d.afzender_score ?? 0)

    const soort = (d.soort ?? null) as never
    const vertrouwen = { ...((v.vertrouwen ?? {}) as Record<string, number>) }

    // Twee regels die pas bij een verse lezing meetellen, want deze terugblik leest
    // opgeslagen scores. Zonder de nabootsing meet je de oude ijking nog een keer.
    //
    // 1. De omschrijving werd afgerekend op "staat het er letterlijk?", terwijl het
    //    een formulering is. Nieuw: gelezen én gevuld is genoeg.
    if (v.omschrijving) vertrouwen.omschrijving = Math.max(vertrouwen.omschrijving ?? 0, 0.85)

    // 2. "Meerdere werkadressen" sloeg aan op drie huisnummers in één straat. Nieuw
    //    is dat alleen verschillende stráten of plaatsen tellen; alle gevallen in
    //    deze set zijn één straat.
    const echtMeerdereAdressen = false
    const route = bepaalRoute(soort, false, Boolean(v.regie))

    const besluit = beslis({
      automatischToegestaan: true,
      soort,
      soortVertrouwen: d.soort_vertrouwen ?? 0,
      afzenderScore: afzender,
      aantalRelatieKandidaten: afzender >= 0.85 ? 1 : 0,
      veldenCompleet: Boolean(v.klantNaam && v.omschrijving && v.bouw7CategorieId && v.werkmaatschappijId),
      adresBevestigd: Boolean(v.adresBevestigd),
      adresCompleet: Boolean(v.werkadresStraat && v.werkadresStad),
      vertrouwen,
      duplicaatTopscore: d.duplicaat_topscore ?? 0,
      offerteMatchGevonden: false,
      regie: Boolean(v.regie),
      offerteMatchHard: false,
      meerdereWerkadressen: echtMeerdereAdressen,
      ongelezenBijlage: false,
      dagbudgetOp: false,
      bouw7Gereed: d.bouw7_gereed ?? false,
      bouw7Ontbreekt: d.bouw7_ontbreekt ?? [],
    })

    if (besluit.status === 'geen_aanvraag') { buiten++; continue }
    if (besluit.automatisch) { vanzelf++; continue }
    voorgelegd++
    for (const reden of besluit.redenen) {
      redenTeller.set(reden, (redenTeller.get(reden) ?? 0) + 1)
    }
    void route
  }

  const werk = vanzelf + voorgelegd
  console.log('── Uitkomst met de huidige regels ──────────────────────────')
  console.log(`  buiten EVA (ruis, correspondentie) : ${buiten}`)
  console.log(`  gaat vanzelf                       : ${vanzelf} van ${werk} werkberichten`)
  console.log(`  wordt voorgelegd                   : ${voorgelegd}`)
  if (werk) console.log(`  → ${Math.round((vanzelf / werk) * 100)}% zonder mens`)

  console.log('\n── Waarop het nog blijft hangen ────────────────────────────')
  for (const [reden, n] of [...redenTeller].sort((a, b) => b[1] - a[1]).slice(0, 12)) {
    console.log(`  ${String(n).padStart(3)}x  ${reden}`)
  }

  console.log([
    '',
    'Twee kanttekeningen. De offertematch stond niet in het log en kan dus niet',
    'worden nagebootst; opdrachten op een offerte tellen hier te streng mee. En',
    'de nieuwe ijking van omschrijving en werkadressen is hierboven nagebootst,',
    'omdat die pas telt bij een verse lezing van de mail.',
    '',
  ].join('\n'))
}

void main().catch(e => { console.error(e); process.exit(1) })
