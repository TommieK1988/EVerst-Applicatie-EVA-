/** READ-ONLY: welke hoofdstukken en bewakingscodes komen voor op opdracht-projecten? */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const env = {}
for (const line of readFileSync(join(root, 'apps/dashboard/.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) env[m[1]] = m[2].trim().replace(/\r$/, '').replace(/^"|"$/g, '')
}
const sb = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` }
const [it] = await (await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/integraties?naam=eq.bouw7&select=config`, { headers: sb })).json()
const HD = 'https://heimdall.bouw7.nl', AT = 'https://athena.bouw7.nl'
const a = await (await fetch(`${HD}/auth/login/${it.config.app_name ?? 'everts-platform'}/apiKey`, {
  method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: `apiKey=${encodeURIComponent(it.config.api_key)}`,
})).json()
const H = { Authorization: `Bearer ${a.token ?? a.access_token ?? a}` }

// Opdracht-dossiers met een Bouw7-koppeling
const dossiers = await (await fetch(
  `${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/dossiers?hoofdstatus=eq.opdracht&bouw7_id=not.is.null&select=id,titel,bouw7_id&limit=25`,
  { headers: sb })).json()

const hoofdstukTeller = new Map()
const codeVoorbeelden = new Map()

for (const d of dossiers.slice(0, 12)) {
  for (const ct of [1, 2, 3, 5]) {
    const r = await fetch(`${AT}/project-control/${d.bouw7_id}/cost-type/${ct}/chapters?include_subprojects=false`, { headers: H })
    if (!r.ok) continue
    const j = await r.json().catch(() => null)
    for (const item of j?.items ?? j?.chapters ?? []) {
      const naam = item?.chapterInfo?.name ?? item?.name ?? '(geen)'
      hoofdstukTeller.set(naam, (hoofdstukTeller.get(naam) ?? 0) + 1)
      for (const c of item?.securityCodes ?? []) {
        const sleutel = `${naam} | ${c.code}`
        if (!codeVoorbeelden.has(sleutel)) codeVoorbeelden.set(sleutel, c.name ?? '')
      }
    }
  }
}

console.log('=== HOOFDSTUKKEN (naam -> hoe vaak gezien) ===')
for (const [n, c] of [...hoofdstukTeller.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${c}x  ${n}`)

console.log('\n=== CODES per hoofdstuk (eerste 60) ===')
for (const [s, naam] of [...codeVoorbeelden.entries()].slice(0, 60)) console.log(`  ${s}  —  ${naam}`)
