/**
 * Diagnose: hoeveel offertes hebben gevulde calculatieregels en wat is de kostprijs-som? Leest alleen.
 * Draaien: node scripts/analyse-quotation-calc.mjs
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const env = {}
for (const line of readFileSync(join(root, 'apps/dashboard/.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) env[m[1]] = m[2].trim().replace(/\r$/, '').replace(/^"|"$/g, '')
}
const sbHeaders = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` }
const [config] = await (await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/integraties?naam=eq.bouw7&select=config`, { headers: sbHeaders })).json()

const HEIMDALL = 'https://heimdall.bouw7.nl'
const res = await fetch(`${HEIMDALL}/auth/login/${config.config.app_name ?? 'everts-platform'}/apiKey`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: `apiKey=${encodeURIComponent(config.config.api_key)}`,
})
const auth = await res.json()
const token = auth.token ?? auth.access_token ?? auth
const hdrs = { Authorization: `Bearer ${token}` }

const lijst = await (await fetch(`${HEIMDALL}/list/quotations`, { headers: hdrs })).json()
const quotes = lijst.items ?? []
const n = v => { const x = parseFloat(v); return isNaN(x) ? 0 : x }

let metCalc = 0, zonderCalc = 0, fouten = 0
const voorbeelden = []
for (let i = 0; i < quotes.length; i += 10) {
  const batch = quotes.slice(i, i + 10)
  const results = await Promise.allSettled(
    batch.map(q => fetch(`${HEIMDALL}/quotation/${q.id}`, { headers: hdrs }).then(r => r.json()))
  )
  results.forEach((r, j) => {
    if (r.status !== 'fulfilled' || !r.value?.chapters) { fouten++; return }
    const q = r.value
    const lines = (q.chapters ?? []).flatMap(c => c.lines ?? [])
    const calcTotaal = lines.reduce((s, l) => s + n(l.calculationTotal), 0)
    const deelTotaal = lines.reduce((s, l) =>
      s + n(l.laborTotal) + n(l.materialTotal) + n(l.equipmentTotal) + n(l.subcontractingTotal) + n(l.purchaseOrderTotal) + n(l.garbageTotal), 0)
    const verkoop = lines.reduce((s, l) => s + n(l.subtotal), 0)
    if (calcTotaal > 0 || deelTotaal > 0) {
      metCalc++
      if (voorbeelden.length < 12) {
        voorbeelden.push(`${batch[j].quotationNumber} (proj ${batch[j].project?.id}): calcTotal=${calcTotaal.toFixed(2)} deelsom=${deelTotaal.toFixed(2)} verkoopregels=${verkoop.toFixed(2)} lijst-subtotal=${batch[j].subtotal}`)
      }
    } else zonderCalc++
  })
  process.stdout.write(`\r${Math.min(i + 10, quotes.length)}/${quotes.length}`)
}
console.log(`\n${metCalc} offertes met calculatieregels > 0, ${zonderCalc} zonder, ${fouten} fouten`)
console.log(voorbeelden.join('\n'))
