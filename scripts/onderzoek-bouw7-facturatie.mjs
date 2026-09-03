/**
 * READ-ONLY onderzoek naar de Bouw7-facturatieschema's (termijnstaat, termijnen, verkoopfactuur).
 * Schrijft niets naar Bouw7. Draaien: node scripts/onderzoek-bouw7-facturatie.mjs [projectId]
 *
 * Leest de Bouw7-sleutel uit Supabase (tabel `integraties`), net als de andere scripts hier;
 * de sleutel staat niet in .env.local.
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
const sb = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` }
const [integratie] = await (await fetch(
  `${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/integraties?naam=eq.bouw7&select=config`, { headers: sb },
)).json()
const cfg = integratie.config

const HD = 'https://heimdall.bouw7.nl'
const auth = await (await fetch(`${HD}/auth/login/${cfg.app_name ?? 'everts-platform'}/apiKey`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: `apiKey=${encodeURIComponent(cfg.api_key)}`,
})).json()
const H = { Authorization: `Bearer ${auth.token ?? auth.access_token ?? auth}` }

async function get(pad, q) {
  const u = new URL(pad, HD)
  if (q) u.searchParams.set('q', q)
  const r = await fetch(u, { headers: H })
  const t = await r.text()
  if (!r.ok) return { _fout: r.status, _body: t.slice(0, 250) }
  try { return JSON.parse(t) } catch { return { _rauw: t.slice(0, 250) } }
}

const TEST = Number(process.argv[2] ?? 3869371)

console.log(`== GET /project/${TEST}/invoice/new ==`)
const skel = await get(`/project/${TEST}/invoice/new`)
if (skel._fout) {
  console.log('FOUT', skel)
} else {
  console.log('  aantal sleutels:', Object.keys(skel).length)
  for (const n of ['id', 'invoiceNumber', 'status', 'date', 'dueDate', 'language', 'isCredit',
    'isCollective', 'isMailed', 'isBooked', 'canUseCostCenter', 'isVatShifted', 'description', 'internalNote']) {
    console.log('  ', n + ':', JSON.stringify(skel[n]))
  }
  console.log('   project:', JSON.stringify(skel.project))
  console.log('   contact:', skel.contact?.id, skel.contact?.name)
  console.log('   branch:', skel.branch?.id, 'division:', skel.division?.id)
  console.log('   chapters:', JSON.stringify(skel.chapters))
}

console.log('\n== GET /invoice/new (zonder project) ==')
const s2 = await get('/invoice/new')
console.log(' ', s2._fout ? `FOUT ${s2._fout}` : `ok — status=${s2.status} project=${JSON.stringify(s2.project)} chapters=${JSON.stringify(s2.chapters)}`)

console.log('\n== btw-tarieven ==')
for (const p of ['/list/vat-tariffs', '/organization/vat-tariffs']) {
  const r = await get(p, 'LIMIT 100')
  console.log(' ', p, '->', r._fout ? `FOUT ${r._fout}` : JSON.stringify(r.items ?? r).slice(0, 400))
}

console.log('\n== termijnstaat op testproject ==')
const st = await get('/list/project-invoice-term-statements', `project.id = ${TEST} LIMIT 10`)
console.log(' ', st._fout ? `FOUT ${st._fout}` : JSON.stringify(st.items ?? []).slice(0, 500))
