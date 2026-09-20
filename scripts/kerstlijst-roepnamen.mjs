/**
 * Roepnamen rechtzetten bij de contactpersonen die in EVA alleen initialen als voornaam hebben.
 *
 * Bouw7 levert bij een deel van de contactpersonen initialen in het voornaamveld
 * ("M.P.M. van der Steuijt"), terwijl de kerstkaartlijst de roepnaam kent ("Michel"). Dit script
 * zet de roepnaam in `voornaam` en verhuist de initialen naar `voorletter`, zodat geen gegeven
 * verloren gaat.
 *
 * `voornaam` staat in BOUW7_CONTACTPERSOON_VELDEN, dus het gaat mee in `handmatige_velden` —
 * anders zet de eerstvolgende sync de initialen terug. `voorletter` raakt de sync niet aan.
 *
 *   node scripts/kerstlijst-roepnamen.mjs           -> droogloop
 *   node scripts/kerstlijst-roepnamen.mjs --apply   -> schrijft weg
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

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

/** "M.P.M." of "K J" of "F" — een reeks initialen, geen roepnaam. */
const isInitialen = (s) => !!s && /^(?:[A-Za-z]\.\s*){1,4}$|^(?:[A-Z]\s+){0,3}[A-Z]$/.test(String(s).trim())
/** Elke schrijfwijze naar "M.P.M." */
const alsVoorletters = (s) => (String(s || '').match(/[A-Za-z]/g) || []).map((l) => `${l.toUpperCase()}.`).join('')

const { resultaat } = JSON.parse(readFileSync(join(root, 'scratch-kerstlijst.json'), 'utf8'))
const cps = await sbAll('contactpersonen?select=id,voornaam,tussenvoegsel,achternaam,voorletter,handmatige_velden,samengevoegd_in&order=id')
const cpById = new Map(cps.map((c) => [c.id, c]))

const werk = new Map()
for (const r of resultaat) {
  if (!r.match || !r.voornaam || isInitialen(r.voornaam)) continue
  const c = cpById.get(r.match.id)
  if (!c || c.samengevoegd_in) continue
  if (c.voornaam && !isInitialen(c.voornaam)) continue      // heeft al een roepnaam
  if (werk.has(c.id)) continue

  // De rijkste bron voor de initialen wint: EVA heeft vaak "M.P.M." waar de Excel "M." heeft.
  const uitEva = alsVoorletters(c.voornaam)
  const uitExcel = alsVoorletters(r.voorletters)
  const bestaand = alsVoorletters(c.voorletter)
  const letters = [bestaand, uitEva, uitExcel].sort((a, b) => b.length - a.length)[0]

  werk.set(c.id, {
    id: c.id,
    was: [c.voornaam, c.tussenvoegsel, c.achternaam].filter(Boolean).join(' ').replace(/\s+/g, ' '),
    wordt: [r.voornaam, c.tussenvoegsel, c.achternaam].filter(Boolean).join(' ').replace(/\s+/g, ' '),
    voornaam: r.voornaam,
    voorletter: letters || null,
    handmatige_velden: [...new Set([...(c.handmatige_velden || []), 'voornaam'])],
  })
}

const rijen = [...werk.values()]
for (const w of rijen) console.log(`  ${w.was}  ->  ${w.wordt}   (voorletter ${w.voorletter || '-'})`)
console.log(`\n${rijen.length} contactpersonen.`)

if (!APPLY) {
  console.log('Droogloop. Draai met --apply om weg te schrijven.')
  process.exit(0)
}
for (const w of rijen) {
  await sbPatch(`contactpersonen?id=eq.${w.id}`, {
    voornaam: w.voornaam, voorletter: w.voorletter, handmatige_velden: w.handmatige_velden,
  })
}
console.log(`${rijen.length} bijgewerkt.`)
