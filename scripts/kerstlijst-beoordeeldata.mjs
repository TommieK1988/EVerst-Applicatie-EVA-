/**
 * Zet de uitkomst van kerstlijst-analyse.mjs om in de data voor het beoordeelscherm:
 * de contactpersonen uit de Excel die nog niet in EVA staan, ontdubbeld, met per persoon
 * de kandidaat-relaties uit EVA.
 *
 *   node scripts/kerstlijst-beoordeeldata.mjs   -> scratch-beoordelen.json
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const env = {}
for (const line of readFileSync(join(root, 'apps/dashboard/.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) env[m[1]] = m[2].trim().replace(/\r$/, '').replace(/^"|"$/g, '')
}
const sbHeaders = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` }
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

const { resultaat } = JSON.parse(readFileSync(join(root, 'scratch-kerstlijst.json'), 'utf8'))
const relaties = await sbAll('relaties?select=id,naam,actief,types&order=naam')

const normMobiel = (nr) => {
  const c = String(nr || '').replace(/\D/g, '').replace(/^0031/, '0').replace(/^31(?=6)/, '0')
  return /^06\d{8}$/.test(c) ? `06-${c.slice(2)}` : String(nr || '').trim()
}
const normPlaats = (p) => String(p || '').trim().toLowerCase()
  .replace(/(^|[\s'\-])([a-z])/g, (_, pre, l) => pre + l.toUpperCase())
  .replace(/^'S-/, "'s-").replace(/\b(Zh|Nh|Nb|Gld|Ov|Ut)\b/g, (m) => m.toUpperCase())

// Alles wat niet gematcht is, plus de twijfelgevallen (die legt Tom ook zelf af).
const open = resultaat.filter((r) => !r.match)

const perPersoon = new Map()
for (const r of open) {
  const sleutel = (r.email || `naam:${r.volnaam.toLowerCase().replace(/\s+/g, '')}`)
  if (!perPersoon.has(sleutel)) {
    perPersoon.set(sleutel, {
      sleutel: sleutel.replace(/[^a-zA-Z0-9_.~:@+-]/g, '_').slice(0, 180),
      volnaam: r.volnaam,
      voornaam: r.voornaam,
      achternaam: r.achternaam,
      tussenvoegsel: r.tussenvoegsel,
      voorletters: r.voorletters,
      email: r.email,
      emailIsPostbus: r.emailIsPostbus,
      mobiel: normMobiel(r.mobiel),
      straat: r.straat,
      postcode: r.postcode.toUpperCase(),
      plaats: normPlaats(r.plaats),
      bedrijven: [],
      kandidaten: [],
      twijfel: r.twijfel,
      rijen: [],
    })
  }
  const p = perPersoon.get(sleutel)
  p.rijen.push(r.rij)
  if (r.bedrijf && !p.bedrijven.includes(r.bedrijf)) p.bedrijven.push(r.bedrijf)
  if (!p.mobiel && r.mobiel) p.mobiel = normMobiel(r.mobiel)
  if (!p.straat && r.straat) { p.straat = r.straat; p.postcode = r.postcode.toUpperCase(); p.plaats = normPlaats(r.plaats) }
  for (const h of r.relatieHits) if (!p.kandidaten.some((k) => k.id === h.id)) p.kandidaten.push({ id: h.id, naam: h.naam, actief: h.actief })
}

const personen = [...perPersoon.values()].sort((a, b) => {
  const ga = a.kandidaten[0] ? a.kandidaten[0].naam : (a.bedrijven[0] || 'zzz')
  const gb = b.kandidaten[0] ? b.kandidaten[0].naam : (b.bedrijven[0] || 'zzz')
  return ga.localeCompare(gb, 'nl') || a.volnaam.localeCompare(b.volnaam, 'nl')
})

writeFileSync(join(root, 'scratch-beoordelen.json'), JSON.stringify({
  gegenereerd: new Date().toISOString().slice(0, 10),
  personen,
  relaties: relaties.map((r) => ({ id: r.id, naam: r.naam, actief: r.actief })),
}, null, 1))

console.log(`personen ${personen.length} | relaties ${relaties.length}`)
console.log(`met 1 kandidaat-relatie ${personen.filter((p) => p.kandidaten.length === 1).length}`)
console.log(`met meerdere ${personen.filter((p) => p.kandidaten.length > 1).length} | zonder ${personen.filter((p) => !p.kandidaten.length).length}`)
console.log(`zonder e-mail ${personen.filter((p) => !p.email).length} | postbusadres ${personen.filter((p) => p.emailIsPostbus).length}`)
