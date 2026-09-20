/**
 * READ-ONLY: welke contactpersonen staan in EVA maar niet meer in Bouw7?
 *
 * `syncContacts` (apps/dashboard/src/lib/bouw7/sync.ts) ruimt wél relaties op die uit Bouw7
 * verdwijnen, maar contactpersonen niet. Daardoor blijven verwijderde contactpersonen in EVA
 * staan — in september 2026 waren dat er 65, waaronder tientallen VvE's die ooit als
 * "contactpersoon" onder hun beheerder waren aangemaakt in plaats van als eigen relatie.
 *
 * Dit script schrijft niets. Het levert de lijst die vóór het opruimen ter beoordeling gaat:
 * per verdwenen contactpersoon de dossiers die er nog naar wijzen, want dáár kost verwijderen
 * historie. De rest kan zonder nadenken op inactief.
 *
 * Leest de Bouw7-sleutel uit Supabase (tabel `integraties`), net als de andere scripts hier;
 * de sleutel staat niet in .env.local.
 *
 * Draaien vanuit de repo-root:
 *   node scripts/onderzoek-contactpersonen-verdwenen.mjs
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = dirname(dirname(fileURLToPath(import.meta.url)))

// ── .env.local parsen (CRLF-veilig) ─────────────────────────────────
const env = {}
for (const line of readFileSync(join(root, 'apps/dashboard/.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) env[m[1]] = m[2].trim().replace(/\r$/, '').replace(/^"|"$/g, '')
}
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SERVICE_KEY) throw new Error('Supabase env ontbreekt in apps/dashboard/.env.local')

const sbHeaders = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' }

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

// ── Bouw7 ───────────────────────────────────────────────────────────
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

async function b7(path, q) {
  const url = new URL(path, HEIMDALL)
  if (q) url.searchParams.set('q', q)
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error(`Bouw7 GET ${path} (${res.status}): ${(await res.text()).slice(0, 200)}`)
  return res.json()
}

/** Naam zoals hij in EVA is opgebouwd; dubbele spaties zijn in deze stam eerder regel dan uitzondering. */
const volledigeNaam = cp =>
  [cp.voornaam, cp.tussenvoegsel, cp.achternaam].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim()

/**
 * Lijkt deze "contactpersoon" op een rechtspersoon in plaats van een mens? Dit is precies de
 * groep die als eigen relatie in Bouw7 hoort te staan, niet als contactpersoon.
 */
const lijktRechtspersoon = naam =>
  /^\s*(vve\b|v\.v\.e|stichting\b|st\.\s|nationaal\b|p\/a\b|\d{3,}\s|porseleinen|synchroon|unilmmo|capitalisers)/i.test(naam)
  || /\b(b\.?v\.?|vve|stichting|fonds|woningmaatschap)\s*$/i.test(naam)

async function main() {
  const [integratie] = await sbGet('integraties?naam=eq.bouw7&select=config')
  if (!integratie?.config?.api_key) throw new Error('Geen Bouw7-sleutel in de tabel integraties')
  await bouw7Login(integratie.config.api_key, integratie.config.app_name ?? 'everts-platform')

  // 1. Wat kent Bouw7 nog? `/list/contact-persons` — mét koppelteken, zonder is het een 404.
  const bouw7Cps = (await b7('/list/contact-persons', 'LIMIT 1000')).items ?? []
  if (bouw7Cps.length === 0) throw new Error('Bouw7 gaf geen enkele contactpersoon terug — afgebroken')
  const levend = new Set(bouw7Cps.map(c => String(c.id)))

  // 2. EVA-kant
  const evaCps = await sbAll('contactpersonen?select=id,voornaam,tussenvoegsel,achternaam,email,bouw7_id,actief&order=id')
  const koppels = await sbAll('contactpersoon_organisaties?select=contactpersoon_id,organisatie_id,functie')
  const relaties = await sbAll('relaties?select=id,naam,bouw7_id')
  const dossiers = await sbAll(
    'dossiers?select=id,dossiernummer,titel,hoofdstatus,klant_id,contactpersoon_id&contactpersoon_id=not.is.null'
  )

  const relatieById = new Map(relaties.map(r => [r.id, r]))
  const orgVanCp = new Map(koppels.map(k => [k.contactpersoon_id, relatieById.get(k.organisatie_id)]))
  const dossiersVanCp = new Map()
  for (const d of dossiers) {
    if (!dossiersVanCp.has(d.contactpersoon_id)) dossiersVanCp.set(d.contactpersoon_id, [])
    dossiersVanCp.get(d.contactpersoon_id).push(d)
  }

  // 3. Indelen. Een pseudo-id (`c_<contact>_primary`) is door EVA zelf verzonnen en telt niet
  //    als Bouw7-herkomst; die rijen zijn nooit in Bouw7 aangekomen en blijven buiten scope.
  const echt = cp => cp.bouw7_id && !/^c_/.test(cp.bouw7_id)
  const verdwenen = evaCps.filter(cp => echt(cp) && !levend.has(cp.bouw7_id))
  const nogLevend = evaCps.filter(cp => echt(cp) && levend.has(cp.bouw7_id))
  const alleenEva = evaCps.filter(cp => !echt(cp))

  console.log('═══ Stand ═══')
  console.log(`Bouw7 kent           : ${bouw7Cps.length} contactpersonen`)
  console.log(`EVA kent             : ${evaCps.length}`)
  console.log(`  nog in Bouw7       : ${nogLevend.length}`)
  console.log(`  verdwenen in Bouw7 : ${verdwenen.length}   ← op te ruimen`)
  console.log(`  alleen in EVA      : ${alleenEva.length}   (buiten scope)`)

  const metDossier = verdwenen.filter(cp => dossiersVanCp.has(cp.id))
  const zonder = verdwenen.filter(cp => !dossiersVanCp.has(cp.id))

  console.log(`\n═══ ${metDossier.length} verdwenen contactpersonen die nog aan dossiers hangen ═══`)
  console.log('Deze eerst beoordelen: het dossier blijft ernaar wijzen.\n')
  for (const cp of metDossier.sort((a, b) => dossiersVanCp.get(b.id).length - dossiersVanCp.get(a.id).length)) {
    const org = orgVanCp.get(cp.id)
    console.log(`${volledigeNaam(cp)}  [bouw7 ${cp.bouw7_id}]${lijktRechtspersoon(volledigeNaam(cp)) ? '  ← rechtspersoon' : ''}`)
    console.log(`  onder      : ${org?.naam ?? '(geen organisatie)'}`)
    console.log(`  e-mail     : ${cp.email ?? '-'}`)
    for (const d of dossiersVanCp.get(cp.id)) {
      const klant = relatieById.get(d.klant_id)
      console.log(`  dossier    : ${d.dossiernummer ?? '?'}  ${d.titel ?? ''}  [${d.hoofdstatus}]  opdrachtgever: ${klant?.naam ?? '?'}`)
    }
    console.log('')
  }

  console.log(`═══ ${zonder.length} verdwenen contactpersonen zonder dossier ═══`)
  console.log('Deze kunnen zonder bezwaar op inactief.\n')
  for (const cp of zonder) {
    const org = orgVanCp.get(cp.id)
    const naam = volledigeNaam(cp)
    console.log(`  ${lijktRechtspersoon(naam) ? '[rechtspersoon] ' : ''}${naam}  [bouw7 ${cp.bouw7_id}]  onder ${org?.naam ?? '-'}`)
  }

  // 4. Wat er in Bouw7 zelf nog scheef staat: contactpersonen die een rechtspersoon zijn.
  const teZetten = bouw7Cps.filter(c => lijktRechtspersoon(`${c.firstName ?? ''} ${c.lastName ?? ''}`.trim()))
  console.log(`\n═══ ${teZetten.length} rechtspersonen die in Bouw7 nog contactpersoon zijn ═══`)
  const contacten = (await b7('/list/contacts', 'LIMIT 2000')).items ?? []
  for (const c of teZetten) {
    const naam = `${c.firstName ?? ''} ${c.lastName ?? ''}`.replace(/\s+/g, ' ').trim()
    const adres = [c.streetName, c.houseNumber, c.zipCode, c.city].filter(Boolean).join(' ')
    const bestaat = contacten.find(x => sleutel(x.name) === sleutel(naam))
    console.log(`  ${c.id}  ${naam}`)
    console.log(`      onder ${c.contact?.name ?? '?'} (${c.contact?.id})`)
    console.log(`      adres ${adres || '— geen —'}   e-mail ${c.emailAddress ?? '-'}`)
    console.log(`      bestaat al als contact: ${bestaat ? `${bestaat.id} ${bestaat.name} (${bestaat.type?.name})` : 'nee'}`)
  }
}

/** Naamsleutel voor de dedupcheck: zonder rechtsvorm-ruis, administratienummers en leestekens. */
function sleutel(naam) {
  return (naam ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/^\s*p\/a\s+/, '')
    .replace(/^\s*\d{3,}\s*-?\s*/, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

main().catch(e => { console.error('FOUT:', e.message); process.exit(1) })
