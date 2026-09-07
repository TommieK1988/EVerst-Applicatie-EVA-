/** READ-ONLY: wat staat er op een Bouw7-project aan uren, kosten en termijnen? */
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
const [it] = await (await fetch(
  `${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/integraties?naam=eq.bouw7&select=config`, { headers: sb })).json()
const HD = 'https://heimdall.bouw7.nl'
const a = await (await fetch(`${HD}/auth/login/${it.config.app_name ?? 'everts-platform'}/apiKey`, {
  method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: `apiKey=${encodeURIComponent(it.config.api_key)}`,
})).json()
const H = { Authorization: `Bearer ${a.token ?? a.access_token ?? a}` }
const get = async (p, q) => {
  const u = new URL(p, HD); if (q) u.searchParams.set('q', q)
  const r = await fetch(u, { headers: H }); const t = await r.text()
  if (!r.ok) return { _fout: r.status, _body: t.slice(0, 200) }
  try { return JSON.parse(t) } catch { return { _rauw: t.slice(0, 200) } }
}

const PID = Number(process.argv[2] ?? 4202130)
console.log(`Bouw7-project ${PID}\n`)

const uren = await get('/list/hour-logs/employee', `project.id = ${PID} LIMIT 200`)
console.log(`uren-boekingen: ${uren._fout ? 'FOUT ' + uren._fout : (uren.items ?? []).length}`)
for (const u of (uren.items ?? []).slice(0, 8)) {
  console.log(`   ${u.logDate?.slice(0, 10)} · ${u.hours} u · ${u.type?.name ?? '?'}`
    + ` · code=${u.projectSecurityLink?.code ?? '—'} · tarief=${u.hourlyRate ?? '—'}`)
}

const inkoop = await get('/list/purchase-invoices', `project.id = ${PID} LIMIT 200`)
console.log(`\ninkoopfacturen: ${inkoop._fout ? 'FOUT ' + inkoop._fout : (inkoop.items ?? []).length}`)
for (const f of (inkoop.items ?? []).slice(0, 8)) {
  console.log(`   ${f.invoiceNumber ?? '(concept)'} · ${f.subTotal} · ${f.contact?.name ?? '?'}`)
}

const st = await get('/list/project-invoice-term-statements', `project.id = ${PID} LIMIT 20`)
const stmts = st.items ?? []
console.log(`\ntermijnstaten: ${st._fout ? 'FOUT ' + st._fout : stmts.length}`)
for (const s of stmts) {
  console.log(`   statement ${s.id} · fixedPrice=${s.fixedPrice ?? '—'} · contact=${s.contact?.name ?? '—'}`)
  const t = await get('/list/project-invoice-terms', `statement.id = ${s.id} LIMIT 100`)
  for (const x of t.items ?? []) {
    console.log(`      ${x.description} · ${x.percentage}% · ${x.subtotal}`
      + ` · factuur=${x.invoiceLine?.invoiceId ?? 'nee'}`)
  }
}

const facturen = await get('/list/invoices', `project.id = ${PID} LIMIT 50`)
console.log(`\nverkoopfacturen: ${facturen._fout ? 'FOUT ' + facturen._fout : (facturen.items ?? []).length}`)
for (const f of facturen.items ?? []) {
  console.log(`   ${f.invoiceNumber ?? '(concept)'} · status=${f.status} · ${f.total} · mailed=${f.isMailed}`)
}

const proj = await get(`/project/${PID}`)
console.log(`\nproject: ${proj.name ?? '?'} · status=${proj.status?.name ?? proj.status ?? '?'}`
  + ` · fixedPrice=${proj.fixedPrice ?? '—'} · contact=${proj.contact?.name ?? '—'}`)
