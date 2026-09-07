/**
 * Eenmalige inhaalslag voor twee relatievelden die tot nu toe leeg bleven (september 2026):
 *
 *   1. `relaties.betalingstermijn_dagen`  ← Bouw7 `GET /contact/{id}`,
 *      `contactDivisions[].paymentConditionSales`
 *   2. `contactpersonen.geslacht`         ← Bouw7 `salutation` ("De heer"/"Mevrouw"),
 *      met de voornaam als terugval
 *
 * Vanaf nu doet de Bouw7-sync dit zelf — zie `syncContacts` in
 * apps/dashboard/src/lib/bouw7/sync.ts, die is hier leidend. Dit script bestaat alleen om de
 * bestaande stam in één keer bij te trekken zonder op de nachtelijke cron te wachten, en
 * gebruikt dezelfde regels:
 *
 *   - alleen een getal geldt als betalingstermijn; codes als "IN" of "00" leveren niets op;
 *   - een aanhef die zowel heer als mevrouw noemt ("Geachte heer/mevrouw") betekent onbekend;
 *   - `sync_vergrendeld` en `handmatige_velden` worden gerespecteerd — een handmatig ingevulde
 *     waarde in EVA wordt nooit overschreven;
 *   - een leeg antwoord uit Bouw7 wist nooit een bestaande waarde.
 *
 * Het script maakt géén contactpersonen aan die alleen in Bouw7 bestaan; dat doet de sync.
 *
 * Draaien vanuit de repo-root:
 *   node scripts/backfill-relatievelden.mjs            → dry-run: toont wat er zou wijzigen
 *   node scripts/backfill-relatievelden.mjs --apply    → voert de updates daadwerkelijk uit
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const APPLY = process.argv.includes('--apply')
const root = dirname(dirname(fileURLToPath(import.meta.url)))

// ── .env.local parsen (CRLF-veilig) ─────────────────────────────────
const env = {}
for (const line of readFileSync(join(root, 'apps/dashboard/.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) env[m[1]] = m[2].trim().replace(/\r$/, '').replace(/^"|"$/g, '')
}
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY  = env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SERVICE_KEY) throw new Error('Supabase env ontbreekt in apps/dashboard/.env.local')

const sbHeaders = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
}

async function sbGet(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: sbHeaders })
  if (!res.ok) throw new Error(`Supabase GET ${path}: ${res.status} ${await res.text()}`)
  return res.json()
}

/** Gepagineerd ophalen — PostgREST kapt stil af op 1000 rijen. */
async function sbAll(path, pageSize = 1000) {
  const alles = []
  for (let van = 0; ; van += pageSize) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      headers: { ...sbHeaders, Range: `${van}-${van + pageSize - 1}` },
    })
    if (!res.ok) throw new Error(`Supabase GET ${path}: ${res.status} ${await res.text()}`)
    const blok = await res.json()
    alles.push(...blok)
    if (blok.length < pageSize) return alles
  }
}

async function sbPatch(path, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: 'PATCH',
    headers: { ...sbHeaders, Prefer: 'return=minimal' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Supabase PATCH ${path}: ${res.status} ${await res.text()}`)
}

// ── Bouw7 client (zelfde auth als lib/bouw7/client.ts) ──────────────
const HEIMDALL = 'https://heimdall.bouw7.nl'
let token = null

async function bouw7Login(apiKey, appName) {
  const res = await fetch(`${HEIMDALL}/auth/login/${appName}/apiKey`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `apiKey=${encodeURIComponent(apiKey)}`,
  })
  if (!res.ok) throw new Error(`Bouw7 login mislukt (${res.status}): ${await res.text()}`)
  const data = await res.json()
  token = data.token ?? data.access_token ?? data
  if (typeof token !== 'string') throw new Error('Bouw7 login: geen geldig token')
}

async function b7(path, params) {
  const url = new URL(path, HEIMDALL)
  if (params) for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error(`Bouw7 GET ${path} (${res.status}): ${(await res.text()).slice(0, 200)}`)
  return res.json()
}

async function b7All(path, pageSize = 100) {
  const first = await b7(path)
  const all = [...(first.items ?? [])]
  while (all.length < first.count) {
    const raw = await b7(path, { limit: String(pageSize), offset: String(all.length) })
    if (!raw.items?.length) break
    all.push(...raw.items)
  }
  return all
}

// ── Mapping-helpers (gelijk aan lib/bouw7/sync.ts) ──────────────────
function betaaltermijnUitDivisions(detail) {
  const dagen = (detail?.contactDivisions ?? [])
    .map(d => (d.paymentConditionSales ?? '').trim())
    .filter(v => /^\d+$/.test(v))
    .map(Number)
    .filter(n => n > 0)
  return dagen.length ? Math.min(...dagen) : null
}

function geslachtUitAanhef(aanhef) {
  const s = (aanhef ?? '').toLowerCase().replace(/[^a-z]+/g, ' ').trim()
  if (!s) return null
  const vrouw = /\b(mevrouw|mevr|mw)\b/.test(s)
  const man = /\b(heer|dhr|meneer)\b/.test(s)
  if (vrouw && man) return null
  return vrouw ? 'vrouw' : man ? 'man' : null
}

/**
 * De namenlijst wordt uit de TypeScript-bron gelezen in plaats van hier overgetypt, zodat
 * script en sync gegarandeerd hetzelfde oordeel vellen.
 */
function laadNamenlijst() {
  const bron = readFileSync(join(root, 'apps/dashboard/src/lib/relaties/geslacht.ts'), 'utf8')
  const namen = naam => {
    const blok = bron.split(`const ${naam} = new Set([`)[1]?.split('])')[0]
    if (!blok) throw new Error(`Namenlijst ${naam} niet gevonden in geslacht.ts`)
    return new Set([...blok.matchAll(/'([^']+)'/g)].map(m => m[1]))
  }
  return { MAN: namen('MAN'), VROUW: namen('VROUW') }
}
const { MAN, VROUW } = laadNamenlijst()

function geslachtUitVoornaam(voornaam) {
  const eerste = (voornaam ?? '')
    .toLowerCase()
    .split(/[\s.\-_/]+/)
    .map(deel => deel.replace(/[^a-zà-ÿ]/g, ''))
    .find(deel => deel.length >= 2)
  if (!eerste) return null
  if (MAN.has(eerste)) return 'man'
  if (VROUW.has(eerste)) return 'vrouw'
  return null
}

// ── Main ────────────────────────────────────────────────────────────
const [integratie] = await sbGet('integraties?naam=eq.bouw7&select=config')
if (!integratie?.config?.api_key) throw new Error('Bouw7 api_key niet gevonden in integraties')
await bouw7Login(integratie.config.api_key, integratie.config.app_name ?? 'everts-platform')

console.log(APPLY ? '── UITVOEREN ──' : '── DRY-RUN (niets wordt geschreven) ──')

/* 1. Betalingstermijn per relatie ---------------------------------- */
const relaties = await sbAll(
  'relaties?bouw7_id=not.is.null&select=id,naam,bouw7_id,betalingstermijn_dagen,sync_vergrendeld,handmatige_velden&order=id',
)
console.log(`\nRelaties met bouw7_id: ${relaties.length}`)

const details = new Map()
{
  const CONC = 10
  let i = 0
  await Promise.all(Array.from({ length: CONC }, async () => {
    while (i < relaties.length) {
      const r = relaties[i++]
      try { details.set(r.bouw7_id, await b7(`/contact/${r.bouw7_id}`)) } catch { /* overslaan */ }
    }
  }))
}
console.log(`Detailrecords opgehaald: ${details.size}`)

const relatieUpdates = []
let relOvergeslagen = 0
for (const r of relaties) {
  const termijn = betaaltermijnUitDivisions(details.get(r.bouw7_id))
  if (termijn == null || termijn === r.betalingstermijn_dagen) continue
  if (r.sync_vergrendeld || (r.handmatige_velden ?? []).includes('betalingstermijn_dagen')) {
    relOvergeslagen++
    continue
  }
  relatieUpdates.push({ id: r.id, naam: r.naam, van: r.betalingstermijn_dagen, naar: termijn })
}
console.log(`Te wijzigen: ${relatieUpdates.length}  (overgeslagen wegens handmatig/vergrendeld: ${relOvergeslagen})`)
for (const u of relatieUpdates.slice(0, 15)) console.log(`   ${u.naam}: ${u.van ?? '—'} → ${u.naar} dagen`)
if (relatieUpdates.length > 15) console.log(`   … en nog ${relatieUpdates.length - 15}`)

/* 2. Geslacht per contactpersoon ----------------------------------- */
const b7Cps = await b7All('/list/contact-persons')
const b7CpById = new Map(b7Cps.map(c => [String(c.id), c]))
const evaCps = await sbAll(
  'contactpersonen?select=id,voornaam,achternaam,geslacht,bouw7_id,sync_vergrendeld,handmatige_velden&order=id',
)
console.log(`\nContactpersonen — Bouw7: ${b7Cps.length}, EVA: ${evaCps.length}`)

const cpUpdates = []
let cpOvergeslagen = 0
const bron = { aanhef: 0, voornaam: 0 }
for (const cp of evaCps) {
  const b7Cp = cp.bouw7_id ? b7CpById.get(cp.bouw7_id) : null
  const uitAanhef = geslachtUitAanhef(b7Cp?.salutation)
  const geslacht = uitAanhef ?? geslachtUitVoornaam(b7Cp?.firstName ?? cp.voornaam)
  if (geslacht == null || geslacht === cp.geslacht) continue
  if (cp.sync_vergrendeld || (cp.handmatige_velden ?? []).includes('geslacht')) {
    cpOvergeslagen++
    continue
  }
  if (uitAanhef) bron.aanhef++; else bron.voornaam++
  cpUpdates.push({ id: cp.id, naam: `${cp.voornaam} ${cp.achternaam}`.trim(), van: cp.geslacht, naar: geslacht })
}
console.log(`Te wijzigen: ${cpUpdates.length}  (uit aanhef: ${bron.aanhef}, uit voornaam: ${bron.voornaam};`
  + ` overgeslagen wegens handmatig/vergrendeld: ${cpOvergeslagen})`)
for (const u of cpUpdates.slice(0, 15)) console.log(`   ${u.naam}: ${u.van ?? '—'} → ${u.naar}`)
if (cpUpdates.length > 15) console.log(`   … en nog ${cpUpdates.length - 15}`)

const zonder = evaCps.filter(cp => {
  const b7Cp = cp.bouw7_id ? b7CpById.get(cp.bouw7_id) : null
  return !cp.geslacht
    && !geslachtUitAanhef(b7Cp?.salutation)
    && !geslachtUitVoornaam(b7Cp?.firstName ?? cp.voornaam)
})
console.log(`Blijft zonder geslacht: ${zonder.length} (meestal VvE's, beheerkantoren en servicedesks)`)

/* 3. Schrijven ------------------------------------------------------ */
if (!APPLY) {
  console.log('\nDry-run klaar. Draai opnieuw met --apply om te schrijven.')
  process.exit(0)
}

for (const u of relatieUpdates) {
  await sbPatch(`relaties?id=eq.${u.id}`, { betalingstermijn_dagen: u.naar })
}
for (const u of cpUpdates) {
  await sbPatch(`contactpersonen?id=eq.${u.id}`, { geslacht: u.naar })
}
console.log(`\nKlaar: ${relatieUpdates.length} relaties en ${cpUpdates.length} contactpersonen bijgewerkt.`)
