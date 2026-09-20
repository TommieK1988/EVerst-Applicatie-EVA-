/**
 * De goedgekeurde contactpersonen uit het beoordeelscherm in EVA zetten.
 *
 * Bron: `scratch-db/beslissingen/*.json` (de keuzes uit de artifact-database, per persoon
 * toevoegen/overslaan plus een relatie) naast `scratch-beoordelen.json` (de gegevens zelf).
 *
 * Drie soorten keuzes:
 *   - `relatieId` is een uuid  -> koppelen aan die bestaande relatie;
 *   - `relatieId` is "NIEUW"   -> relatie aanmaken op de bedrijfsnaam uit de Excel, één keer
 *                                 per naam, ook als er meerdere mensen onder hangen;
 *   - `relatieId` is leeg      -> overslaan en rapporteren; niet gokken onder welk bedrijf
 *                                 iemand hoort.
 *
 * Alleen de EVA-kant. Er wordt géén contactpersoon in Bouw7 aangemaakt, dus deze mensen
 * krijgen geen spiegelrij in `contactpersoon_bouw7_koppelingen`. Dat is veilig: stap 15 van
 * `syncContacts` deactiveert alleen personen die mínstens één spiegel hébben en waarvan er
 * geen enkele meer in Bouw7 voorkomt (`levendPerPersoon.get(id) === 0`). Iemand zonder
 * spiegels komt in die map niet voor en blijft dus staan.
 *
 * Het script is herhaalbaar: bestaat er al een contactpersoon met hetzelfde e-mailadres, of
 * met dezelfde naam onder dezelfde relatie, dan wordt die overgeslagen.
 *
 *   node scripts/kerstlijst-invoeren.mjs           -> droogloop met telling
 *   node scripts/kerstlijst-invoeren.mjs --apply   -> voert het uit
 */
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const APPLY = process.argv.includes('--apply')
// Met --losse worden ook de goedgekeurde personen zónder relatiekeuze aangemaakt, als
// contactpersoon zonder koppeling. In EVA mag dat; in Bouw7 niet (zie de kop hierboven).
const LOSSE = process.argv.includes('--losse')
const root = dirname(dirname(fileURLToPath(import.meta.url)))
const env = {}
for (const line of readFileSync(join(root, 'apps/dashboard/.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) env[m[1]] = m[2].trim().replace(/\r$/, '').replace(/^"|"$/g, '')
}
const sbHeaders = {
  apikey: env.SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
  'Content-Type': 'application/json',
}
async function sbAll(path, pageSize = 1000) {
  const alles = []
  for (let van = 0; ; van += pageSize) {
    const res = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${path}`, { headers: { ...sbHeaders, Range: `${van}-${van + pageSize - 1}` } })
    if (!res.ok) throw new Error(`GET ${path}: ${res.status} ${await res.text()}`)
    const blok = await res.json()
    alles.push(...blok)
    if (blok.length < pageSize) return alles
  }
}
async function sbInsert(tabel, body) {
  const res = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${tabel}`, {
    method: 'POST', headers: { ...sbHeaders, Prefer: 'return=representation' }, body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`POST ${tabel}: ${res.status} ${await res.text()}`)
  return res.json()
}

const normNaam = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

/* -- bronnen -------------------------------------------------------- */
const { personen } = JSON.parse(readFileSync(join(root, 'scratch-beoordelen.json'), 'utf8'))
const besluitDir = join(root, 'scratch-db/beslissingen')
const besluiten = {}
for (const bestand of readdirSync(besluitDir)) {
  const sleutel = decodeURIComponent(bestand.replace(/\.json$/, ''))
  besluiten[sleutel] = JSON.parse(readFileSync(join(besluitDir, bestand), 'utf8'))
}

const relaties = await sbAll('relaties?select=id,naam,actief,types&order=id')
const relById = new Map(relaties.map((r) => [r.id, r]))
const relOpNaam = new Map(relaties.map((r) => [normNaam(r.naam), r]))
const cps = await sbAll('contactpersonen?select=id,voornaam,tussenvoegsel,achternaam,email,samengevoegd_in&order=id')
const koppels = await sbAll('contactpersoon_organisaties?select=contactpersoon_id,organisatie_id&order=id')
const cpOpEmail = new Map()
for (const c of cps) if (c.email) cpOpEmail.set(c.email.toLowerCase().trim(), c)
const cpOpNaamOrg = new Set()
for (const k of koppels) {
  const c = cps.find((x) => x.id === k.contactpersoon_id)
  if (c) cpOpNaamOrg.add(`${normNaam([c.voornaam, c.achternaam].join(' '))}|${k.organisatie_id}`)
}

/* -- indelen -------------------------------------------------------- */
const teDoen = []
const nieuweBedrijven = new Map()   // genormaliseerde naam -> { naam, personen: [] }
const zonderRelatie = []
const overgeslagen = []
const alAanwezig = []

for (const p of personen) {
  const b = besluiten[p.sleutel]
  if (!b || b.actie !== 'toevoegen') { overgeslagen.push(p); continue }

  const bestaand = p.email ? cpOpEmail.get(p.email) : null
  if (bestaand) { alAanwezig.push({ p, reden: `e-mailadres staat al op ${bestaand.voornaam} ${bestaand.achternaam}` }); continue }

  if (b.relatieId === 'NIEUW') {
    const naam = p.bedrijven[0]
    if (!naam) { zonderRelatie.push(p); continue }
    const sleutel = normNaam(naam)
    const alBestaand = relOpNaam.get(sleutel)
    if (alBestaand) { teDoen.push({ p, relatieId: alBestaand.id, relatieNaam: alBestaand.naam, hergebruikt: true }); continue }
    if (!nieuweBedrijven.has(sleutel)) nieuweBedrijven.set(sleutel, { naam, personen: [] })
    nieuweBedrijven.get(sleutel).personen.push(p)
    continue
  }
  if (!b.relatieId) { zonderRelatie.push(p); continue }
  const rel = relById.get(b.relatieId)
  if (!rel) { zonderRelatie.push(p); continue }
  teDoen.push({ p, relatieId: rel.id, relatieNaam: rel.naam })
}

const nieuwTotaalPersonen = [...nieuweBedrijven.values()].reduce((n, b) => n + b.personen.length, 0)
console.log(`Beoordeeld ${personen.length} | toevoegen ${teDoen.length + nieuwTotaalPersonen} | overslaan ${overgeslagen.length}`)
console.log(`  bij een bestaande relatie: ${teDoen.length}`)
console.log(`  bij een nieuw aan te maken relatie: ${nieuwTotaalPersonen} personen / ${nieuweBedrijven.size} bedrijven`)
console.log(`  geen relatie gekozen, blijft liggen: ${zonderRelatie.length}`)
if (alAanwezig.length) {
  console.log(`  al in EVA aanwezig, overgeslagen: ${alAanwezig.length}`)
  for (const a of alAanwezig) console.log(`     ${a.p.volnaam} — ${a.reden}`)
}
if (nieuweBedrijven.size) {
  console.log('\nNieuwe relaties (type opdrachtgever, zonder KvK):')
  for (const b of nieuweBedrijven.values()) console.log(`  ${b.naam}  (${b.personen.length} contactpersoon${b.personen.length === 1 ? '' : 'en'})`)
}
if (zonderRelatie.length) {
  console.log('\nBlijft liggen — geen relatie gekozen:')
  for (const p of zonderRelatie) console.log(`  ${p.volnaam} / ${p.voornaam || '-'}  @ ${p.bedrijven[0] || '-'}`)
}

if (!APPLY) {
  console.log('\nDroogloop. Draai met --apply om weg te schrijven.')
  process.exit(0)
}

/* -- wegschrijven --------------------------------------------------- */
function persoonsRij(p) {
  return {
    voornaam: p.voornaam || p.voorletters || p.achternaam,
    tussenvoegsel: p.tussenvoegsel || null,
    achternaam: p.achternaam,
    voorletter: p.voorletters || null,
    email: p.email || null,
    mobiel: p.mobiel || null,
    prive_adres_straat: p.straat || null,
    prive_adres_postcode: p.postcode || null,
    prive_adres_plaats: p.plaats || null,
    soort: 'persoon',
    actief: true,
  }
}

let nieuweRelaties = 0
for (const bedrijf of nieuweBedrijven.values()) {
  const [rij] = await sbInsert('relaties', {
    naam: bedrijf.naam, types: ['opdrachtgever'], actief: true,
  })
  nieuweRelaties++
  for (const p of bedrijf.personen) teDoen.push({ p, relatieId: rij.id, relatieNaam: rij.naam })
}

let nieuwePersonen = 0
let nieuweKoppels = 0
for (const t of teDoen) {
  if (cpOpNaamOrg.has(`${normNaam([t.p.voornaam || t.p.voorletters, t.p.achternaam].join(' '))}|${t.relatieId}`)) continue
  const [rij] = await sbInsert('contactpersonen', persoonsRij(t.p))
  nieuwePersonen++
  await sbInsert('contactpersoon_organisaties', {
    contactpersoon_id: rij.id, organisatie_id: t.relatieId, is_primair: true,
  })
  nieuweKoppels++
}

let lossePersonen = 0
if (LOSSE) {
  for (const p of zonderRelatie) {
    // Het bedrijf uit de Excel gaat mee als opmerking, anders is straks niet meer te zien
    // waar deze los hangende persoon vandaan kwam.
    const rij = persoonsRij(p)
    if (p.bedrijven.length) rij.opmerkingen = `Kerstkaartlijst 2025 — stond bij: ${p.bedrijven.join(' / ')}`
    await sbInsert('contactpersonen', rij)
    lossePersonen++
  }
  console.log(`${lossePersonen} losse contactpersonen zonder relatie aangemaakt.`)
}

console.log(`\n${nieuweRelaties} relaties, ${nieuwePersonen + lossePersonen} contactpersonen en ${nieuweKoppels} koppelingen aangemaakt.`)
