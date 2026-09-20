/**
 * De contactpersonen uit de kerstkaartlijst alsnog in Bouw7 aanmaken.
 *
 * Ze zijn met `kerstlijst-invoeren.mjs` rechtstreeks in de database gezet, buiten
 * `createContactpersoon` om, dus er is nooit een Bouw7-record van gemaakt. Er is ook geen
 * achtergrondjob die dat alsnog doet: `syncContacts` leest alleen Bouw7 → EVA. Dit script haalt
 * die inhaalslag in één keer.
 *
 * Bouw7 hangt elke contactpersoon onder precies één contact — het parent-id zit in het pad van
 * `POST /contact/{contact}/contact-person`. Iemand zonder relatie kan er dus niet in; die blijven
 * hier buiten beschouwing.
 *
 * Per persoon: aanmaken in Bouw7, terugleescontrole met `GET /contact-person/{id}`, en pas dan
 * de spiegelrij in `contactpersoon_bouw7_koppelingen` plus `contactpersonen.bouw7_id`. Die
 * volgorde is niet vrijblijvend: een spiegel zonder Bouw7-record laat de volgende sync denken dat
 * de persoon uit Bouw7 verwijderd is en zet hem op inactief.
 *
 * Herhaalbaar: wie al een spiegel heeft wordt overgeslagen.
 *
 *   node scripts/kerstlijst-naar-bouw7.mjs                    -> droogloop
 *   node scripts/kerstlijst-naar-bouw7.mjs --apply            -> voert het uit
 *   node scripts/kerstlijst-naar-bouw7.mjs --apply --max=5    -> eerst een kleine proef
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const APPLY = process.argv.includes('--apply')
const MAX = Number((process.argv.find((a) => a.startsWith('--max=')) || '').split('=')[1] || 0) || Infinity
/** Alleen de personen die deze inhaalslag aanmaakte; oudere EVA-only rijen blijven buiten schot. */
const VANAF = '2026-09-20'

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
async function sbGet(path) {
  const res = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${path}`, { headers: sbHeaders })
  if (!res.ok) throw new Error(`GET ${path}: ${res.status} ${await res.text()}`)
  return res.json()
}
async function sbPost(tabel, body) {
  const res = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${tabel}`, {
    method: 'POST', headers: { ...sbHeaders, Prefer: 'return=minimal' }, body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`POST ${tabel}: ${res.status} ${await res.text()}`)
}
async function sbPatch(path, body) {
  const res = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${path}`, {
    method: 'PATCH', headers: { ...sbHeaders, Prefer: 'return=minimal' }, body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`PATCH ${path}: ${res.status} ${await res.text()}`)
}

/* -- Bouw7 ---------------------------------------------------------- */
const HEIMDALL = 'https://heimdall.bouw7.nl'
const [integratie] = await sbGet('integraties?select=config&naam=eq.bouw7')
const cfg = integratie?.config
if (!cfg?.api_key || !cfg?.app_name) throw new Error('Bouw7-integratie is niet geconfigureerd')

const login = await fetch(`${HEIMDALL}/auth/login/${cfg.app_name}/apiKey`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: `apiKey=${encodeURIComponent(cfg.api_key)}`,
})
if (!login.ok) throw new Error(`Bouw7-login mislukt (${login.status}): ${await login.text()}`)
const loginData = await login.json()
const token = loginData.token ?? loginData.access_token ?? loginData
if (typeof token !== 'string') throw new Error('Bouw7-login gaf geen bruikbaar token')

async function b7Get(path) {
  const res = await fetch(new URL(path, HEIMDALL), { headers: { Authorization: `Bearer ${token}` } })
  return { ok: res.ok, status: res.status, body: res.ok ? await res.json() : await res.text() }
}
async function b7Post(path, body) {
  const res = await fetch(new URL(path, HEIMDALL), {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`POST ${path} (${res.status}): ${(await res.text()).slice(0, 300)}`)
  return res.json()
}

/* -- selectie ------------------------------------------------------- */
const cps = await sbGet(
  'contactpersonen?select=id,voornaam,tussenvoegsel,achternaam,email,telefoon,aanhef,created_at,'
  + 'contactpersoon_organisaties(organisatie_id,functie,relaties(id,naam,bouw7_id))'
  + `&bouw7_id=is.null&samengevoegd_in=is.null&actief=is.true&created_at=gte.${VANAF}&order=created_at`
)
const spiegels = await sbGet('contactpersoon_bouw7_koppelingen?select=contactpersoon_id')
const heeftSpiegel = new Set(spiegels.map((s) => s.contactpersoon_id))

const teDoen = []
const zonderRelatie = []
const relatieNietInBouw7 = new Map()
for (const cp of cps) {
  if (heeftSpiegel.has(cp.id)) continue
  const koppels = cp.contactpersoon_organisaties ?? []
  if (!koppels.length) { zonderRelatie.push(cp); continue }
  // Bouw7 kent maar één moeder per contactpersoon: de eerste koppeling is de primaire.
  const k = koppels[0]
  const rel = k.relaties
  if (!rel?.bouw7_id) {
    if (!relatieNietInBouw7.has(rel?.naam ?? '?')) relatieNietInBouw7.set(rel?.naam ?? '?', 0)
    relatieNietInBouw7.set(rel?.naam ?? '?', relatieNietInBouw7.get(rel?.naam ?? '?') + 1)
    continue
  }
  teDoen.push({ cp, organisatieId: rel.id, parent: Number(rel.bouw7_id), relatieNaam: rel.naam, functie: k.functie })
}

console.log(`Kandidaten vanaf ${VANAF}: ${cps.length}`)
console.log(`  naar Bouw7: ${teDoen.length}`)
console.log(`  zonder relatie (kan niet in Bouw7): ${zonderRelatie.length}`)
console.log(`  relatie bestaat niet in Bouw7: ${[...relatieNietInBouw7.values()].reduce((a, b) => a + b, 0)} personen bij ${relatieNietInBouw7.size} relaties`)
for (const [naam, n] of relatieNietInBouw7) console.log(`     ${naam} (${n})`)

if (!APPLY) {
  console.log('\nDroogloop. Draai met --apply om aan te maken.')
  process.exit(0)
}

/* -- uitvoeren ------------------------------------------------------ */
let gelukt = 0
const mislukt = []
for (const t of teDoen.slice(0, MAX === Infinity ? teDoen.length : MAX)) {
  const naam = [t.cp.voornaam, t.cp.tussenvoegsel, t.cp.achternaam].filter(Boolean).join(' ')
  try {
    const body = { firstName: t.cp.voornaam, lastName: [t.cp.tussenvoegsel, t.cp.achternaam].filter(Boolean).join(' ') }
    if (t.cp.email)    body.email = t.cp.email
    if (t.cp.telefoon) body.phoneNumber = t.cp.telefoon
    if (t.functie)     body.jobTitle = t.functie
    if (t.cp.aanhef)   body.salutation = t.cp.aanhef

    const gemaakt = await b7Post(`/contact/${t.parent}/contact-person`, body)
    const bouw7Id = gemaakt?.id
    if (!bouw7Id) throw new Error('Bouw7 gaf geen id terug')

    // Terugleescontrole vóór de spiegel: een spiegel zonder Bouw7-record laat de sync denken
    // dat de persoon daar verwijderd is.
    const check = await b7Get(`/contact-person/${bouw7Id}`)
    if (!check.ok) throw new Error(`aangemaakt als ${bouw7Id} maar niet terug te lezen (${check.status})`)

    await sbPost('contactpersoon_bouw7_koppelingen', {
      contactpersoon_id: t.cp.id,
      bouw7_id: String(bouw7Id),
      bouw7_contact_id: String(t.parent),
      organisatie_id: t.organisatieId,
      bouw7_laatst_sync: new Date().toISOString(),
      is_primair: true,
    })
    await sbPatch(`contactpersonen?id=eq.${t.cp.id}`, { bouw7_id: String(bouw7Id), bouw7_sync_status: 'synced' })
    gelukt++
    if (gelukt % 25 === 0) console.log(`  ${gelukt}/${teDoen.length}…`)
  } catch (e) {
    mislukt.push({ naam, relatie: t.relatieNaam, fout: String(e.message || e).slice(0, 200) })
  }
  await new Promise((r) => setTimeout(r, 120))
}

console.log(`\n${gelukt} contactpersonen aangemaakt in Bouw7.`)
if (mislukt.length) {
  console.log(`${mislukt.length} mislukt:`)
  for (const m of mislukt) console.log(`  ${m.naam} @ ${m.relatie} — ${m.fout}`)
}
