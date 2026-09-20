/**
 * `contactpersonen.kerstkaart` vullen vanuit de kerstkaartlijst-Excel.
 *
 * De kolom `Kerst` staat in dat bestand voor alle 363 rijen op "Ja" — het bestand ís de lijst.
 * Dit script zet de vlag op iedereen in EVA die op een van die rijen terug te voeren is, met
 * dezelfde matchlogica als `kerstlijst-analyse.mjs`.
 *
 *   node scripts/kerstlijst-vlag-zetten.mjs           -> droogloop
 *   node scripts/kerstlijst-vlag-zetten.mjs --apply   -> zet de vlag
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import XLSX from 'xlsx'

const APPLY = process.argv.includes('--apply')
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
    if (!res.ok) throw new Error(`GET ${path}: ${res.status}`)
    const blok = await res.json()
    alles.push(...blok)
    if (blok.length < pageSize) return alles
  }
}
async function sbPatch(path, body) {
  const res = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${path}`, {
    method: 'PATCH', headers: { ...sbHeaders, Prefer: 'return=minimal' }, body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`PATCH ${path}: ${res.status} ${await res.text()}`)
}

const normNaam = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/ij/g, 'y').replace(/[^a-z0-9]+/g, ' ').trim()
const normEmail = (s) => String(s || '').toLowerCase().trim()
const VOEGSELS = new Set(['van', 'de', 'der', 'den', 'ten', 'ter', 'te', 'v', 'vd', 'het', 'op', 'aan', 'in', 'du', 'le', 'la', 'del'])
function kaleAchternaam(achternaam, tussenvoegsel) {
  const delen = `${tussenvoegsel || ''} ${achternaam || ''}`.trim().split(/\s+/).filter(Boolean)
  while (delen.length > 1 && VOEGSELS.has(delen[0].toLowerCase())) delen.shift()
  return normNaam(delen.join(' '))
}
function splitsNaam(vol) {
  const delen = String(vol || '').trim().replace(/\s+/g, ' ').split(' ').filter(Boolean)
  let i = 0
  const letters = []
  while (i < delen.length && /^([A-Za-z]\.)+$|^[A-Z]$/.test(delen[i])) letters.push(delen[i++])
  const rest = delen.slice(i)
  const tv = []
  while (rest.length > 1 && VOEGSELS.has(rest[0].toLowerCase())) tv.push(rest.shift())
  return { voorletters: letters.join(''), tussenvoegsel: tv.join(' '), achternaam: rest.join(' ') }
}

const XLS = 'C:/Users/t.kamminga/OneDrive - Everts Groep/Management Team - Documenten/02 Organisatieprojecten/2025 - Exact Bouw implementatie/Import Sjablonen/2025-09-03 Contactpersonen.xlsx'
const wb = XLSX.readFile(XLS)
const excel = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '', raw: false })
  .filter((r) => String(r['Kerst'] || '').trim().toLowerCase() === 'ja')
  .map((r) => ({
    volnaam: String(r['Contactpersoon'] || '').trim(),
    voornaam: String(r['Voornaam'] || '').trim(),
    email: normEmail(r['E-mail']),
    ...splitsNaam(r['Contactpersoon']),
  }))

const cps = await sbAll('contactpersonen?select=id,voornaam,tussenvoegsel,achternaam,voorletter,email,kerstkaart,samengevoegd_in&order=id')
const levend = cps.filter((c) => !c.samengevoegd_in)

const opEmail = new Map()
for (const c of levend) if (c.email) opEmail.set(normEmail(c.email), c)
const opAchternaam = new Map()
for (const c of levend) {
  const s = kaleAchternaam(c.achternaam, c.tussenvoegsel)
  if (!opAchternaam.has(s)) opAchternaam.set(s, [])
  opAchternaam.get(s).push(c)
}

const raak = new Set()
const nietGevonden = []
for (const e of excel) {
  const viaMail = e.email ? opEmail.get(e.email) : null
  if (viaMail) { raak.add(viaMail.id); continue }
  const kandidaten = (opAchternaam.get(kaleAchternaam(e.achternaam, e.tussenvoegsel)) || []).filter((c) => {
    const vn = normNaam(c.voornaam)
    const evn = normNaam(e.voornaam)
    if (evn && vn) return vn === evn || vn.startsWith(evn) || evn.startsWith(vn)
    const vl = String(c.voorletter || '').replace(/[^A-Za-z]/g, '').toLowerCase()
    const evl = e.voorletters.replace(/[^A-Za-z]/g, '').toLowerCase()
    return !!(vl && evl && vl[0] === evl[0])
  })
  if (kandidaten.length === 1) raak.add(kandidaten[0].id)
  else nietGevonden.push(`${e.volnaam} / ${e.voornaam || '-'}${kandidaten.length > 1 ? ` (${kandidaten.length} kandidaten)` : ''}`)
}

const teZetten = [...raak].filter((id) => !levend.find((c) => c.id === id).kerstkaart)
console.log(`Excel-rijen met Kerst=Ja: ${excel.length}`)
console.log(`Herkend in EVA: ${raak.size} personen | vlag nog te zetten: ${teZetten.length}`)
console.log(`Niet eenduidig te herleiden: ${nietGevonden.length}`)
for (const n of nietGevonden) console.log(`  ${n}`)

if (!APPLY) {
  console.log('\nDroogloop. Draai met --apply om de vlag te zetten.')
  process.exit(0)
}
for (let i = 0; i < teZetten.length; i += 100) {
  const blok = teZetten.slice(i, i + 100)
  await sbPatch(`contactpersonen?id=in.(${blok.join(',')})`, { kerstkaart: true })
}
console.log(`\n${teZetten.length} contactpersonen op de kerstkaartlijst gezet.`)
