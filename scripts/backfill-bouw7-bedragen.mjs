/**
 * Eenmalige backfill van dossier-bedragen na de Bouw7-mapping-fix (juni 2026).
 *
 * Vult per Bouw7-dossier:
 *   - bedrag_excl_btw    ← Athena fixedPrice ?? revenue.budgeted ?? quote.subtotal ?? project.fixedPrice
 *   - bedrag_incl_btw    ← quote.total (incl. BTW), alleen als de offerte de bron van de excl-prijs is
 *   - kostprijs_excl_btw ← som van calculationTotal over de offerteregels (/quotation/{id}), anders null
 *
 * Zelfde mapping als apps/dashboard/src/lib/bouw7/sync.ts (syncProjects).
 *
 * Draaien:
 *   node scripts/backfill-bouw7-bedragen.mjs            → dry-run: toont wat er zou wijzigen, schrijft NIETS
 *   node scripts/backfill-bouw7-bedragen.mjs --apply    → voert de updates daadwerkelijk uit
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
const ATHENA   = 'https://athena.bouw7.nl'
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

async function bouw7Get(baseUrl, path, params) {
  const url = new URL(path, baseUrl)
  if (params) for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error(`Bouw7 GET ${path} (${res.status}): ${await res.text()}`)
  return res.json()
}

async function fetchAllPages(path, pageSize = 100) {
  const first = await bouw7Get(HEIMDALL, path)
  const all = [...(first.items ?? [])]
  while (all.length < first.count) {
    const raw = await bouw7Get(HEIMDALL, path, { limit: String(pageSize), offset: String(all.length) })
    const items = raw.items ?? []
    if (!items.length) break
    all.push(...items)
  }
  return all
}

// ── Mapping-helpers (identiek aan sync.ts) ──────────────────────────
function extractFinNum(v) {
  if (v == null) return null
  if (typeof v === 'number') return v > 0 ? v : null
  if (typeof v === 'string') {
    const n = parseFloat(v)
    return !isNaN(n) && n > 0 ? n : null
  }
  if (typeof v === 'object') return extractFinNum(v.budgeted)
  return null
}

// ── Main ────────────────────────────────────────────────────────────
const [config] = await sbGet('integraties?naam=eq.bouw7&select=config')
if (!config?.config?.api_key) throw new Error('Bouw7 api_key niet gevonden in integraties')
await bouw7Login(config.config.api_key, config.config.app_name ?? 'everts-platform')

console.log('Projecten ophalen…')
const projects = await fetchAllPages('/list/projects')
console.log(`${projects.length} projecten`)

console.log('Offertes ophalen…')
const quotationMap = new Map()
const quotations = await fetchAllPages('/list/quotations')
for (const q of quotations) {
  if (!q.project?.id) continue
  const key = String(q.project.id)
  const existing = quotationMap.get(key)
  if (!existing || (q.quotationDate ?? '') >= (existing.quotationDate ?? '')) quotationMap.set(key, q)
}
console.log(`${quotations.length} offertes, ${quotationMap.size} gekoppeld aan project`)

console.log('Offerte-details (calculatieregels) ophalen…')
const kostprijsMap = new Map()
{
  const entries = [...quotationMap.entries()]
  for (let i = 0; i < entries.length; i += 10) {
    const batch = entries.slice(i, i + 10)
    const results = await Promise.allSettled(
      batch.map(([, q]) => bouw7Get(HEIMDALL, `/quotation/${q.id}`))
    )
    results.forEach((r, j) => {
      if (r.status !== 'fulfilled' || !r.value?.chapters) return
      const kostprijs = r.value.chapters
        .flatMap(c => c.lines ?? [])
        .filter(l => !l.option)
        .reduce((s, l) => {
          const n = parseFloat(String(l.calculationTotal ?? ''))
          return s + (isNaN(n) ? 0 : n)
        }, 0)
      if (kostprijs > 0) kostprijsMap.set(batch[j][0], Math.round(kostprijs * 100) / 100)
    })
    process.stdout.write(`\r${Math.min(i + 10, entries.length)}/${entries.length}`)
  }
  console.log(`\n${kostprijsMap.size} projecten met gecalculeerde kostprijs`)
}

console.log('Athena financials ophalen…')
const financialMap = new Map()
for (let i = 0; i < projects.length; i += 10) {
  const batch = projects.slice(i, i + 10)
  const results = await Promise.allSettled(
    batch.map(p => bouw7Get(ATHENA, `/project-financial/${p.id}`))
  )
  results.forEach((r, j) => {
    if (r.status === 'fulfilled' && r.value && typeof r.value === 'object') {
      financialMap.set(String(batch[j].id), r.value)
    }
  })
  process.stdout.write(`\r${Math.min(i + 10, projects.length)}/${projects.length}`)
}
console.log()

const APPLY = process.argv.includes('--apply')

// Alleen dossiers bijwerken die al bestaan (geen nieuwe aanmaken — dat doet de echte sync)
const dossiers = await sbGet('dossiers?select=bouw7_id,dossiernummer,bedrag_excl_btw,bedrag_incl_btw,kostprijs_excl_btw&bouw7_id=not.is.null&limit=10000')
const bestaand = new Map(dossiers.map(d => [d.bouw7_id, d]))

let updated = 0, skipped = 0, errors = 0, unchanged = 0
const num = v => (v == null ? null : Number(v))

for (const p of projects) {
  const id = String(p.id)
  const huidig = bestaand.get(id)
  if (!huidig) { skipped++; continue }
  const quote = quotationMap.get(id)
  const fin   = financialMap.get(id)

  const verkoopExcl = extractFinNum(fin?.fixedPrice)
    ?? extractFinNum(fin?.revenue?.budgeted)
    ?? extractFinNum(quote?.subtotal)
    ?? extractFinNum(p.fixedPrice)
    ?? null
  const quoteSubtotal = extractFinNum(quote?.subtotal)
  const verkoopIncl = (quoteSubtotal != null && verkoopExcl != null
    && Math.abs(quoteSubtotal - verkoopExcl) < 0.01)
    ? extractFinNum(quote?.total)
    : null

  const body = {
    bedrag_excl_btw:    verkoopExcl,
    bedrag_incl_btw:    verkoopIncl,
    kostprijs_excl_btw: kostprijsMap.get(id) ?? null,
  }

  const zelfde = num(huidig.bedrag_excl_btw) === body.bedrag_excl_btw
    && num(huidig.kostprijs_excl_btw) === body.kostprijs_excl_btw
    && num(huidig.bedrag_incl_btw) === body.bedrag_incl_btw
  if (zelfde) { unchanged++; continue }

  if (!APPLY) {
    console.log(
      `${(huidig.dossiernummer ?? id).padEnd(14)} ` +
      `excl: ${huidig.bedrag_excl_btw} → ${body.bedrag_excl_btw}  ` +
      `incl: → ${body.bedrag_incl_btw}  ` +
      `kostprijs: ${huidig.kostprijs_excl_btw} → ${body.kostprijs_excl_btw}`
    )
    updated++
    continue
  }

  try {
    await sbPatch(`dossiers?bouw7_id=eq.${id}`, body)
    updated++
  } catch (e) {
    errors++
    console.error(`\nFout bij ${id}: ${e.message}`)
  }
}
console.log(`\n${APPLY ? 'Klaar' : 'DRY-RUN (niets geschreven)'}: ${updated} ${APPLY ? 'bijgewerkt' : 'te wijzigen'}, ${unchanged} ongewijzigd, ${skipped} niet in EVA, ${errors} fouten`)
