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

// Zelfde berekening als berekenQuoteCijfers() in apps/dashboard/src/lib/bouw7/sync.ts
function berekenQuoteCijfers(det, quote) {
  const n = v => { const x = parseFloat(String(v ?? '')); return isNaN(x) ? 0 : x }
  const rond = v => Math.round(v * 100) / 100

  // Meerwerk-hoofdstukken (additionalWork) en optionele regels tellen niet mee in de aanneemsom.
  const lines = (det.chapters ?? [])
    .filter(c => !c.additionalWork)
    .flatMap(c => c.lines ?? [])
    .filter(l => !l.option)
  if (!lines.length) return { kostprijs: null, regelsom: null, btwSplitsing: null }

  const kostprijsSom = rond(lines.reduce((s, l) => s + n(l.calculationTotal), 0))
  const regelsom     = rond(lines.reduce((s, l) => s + n(l.subtotal), 0))

  const tarieven = new Map()
  const telMee = (tarief, pctFallback, grondslag) => {
    if (!grondslag) return
    const percentage = n(tarief?.percentage ?? pctFallback)
    const label = tarief?.label ?? `${percentage}%`
    const cur = tarieven.get(label) ?? { label, percentage, grondslag: 0 }
    cur.grondslag += grondslag
    tarieven.set(label, cur)
  }
  for (const l of lines) telMee(l.vatTariffObject, l.vatTariffPercentage, n(l.subtotal))
  telMee(det.overheadsVatTariff,     undefined, regelsom * n(det.overheads) / 100)
  telMee(det.profitAndRiskVatTariff, undefined, regelsom * n(det.profitAndRisk) / 100)

  const splitsing = [...tarieven.values()]
    .map(t => ({ label: t.label, percentage: t.percentage, grondslag: rond(t.grondslag), bedrag: rond(t.grondslag * t.percentage / 100) }))
    .sort((a, b) => b.percentage - a.percentage)

  // Telt de splitsing niet op tot (total − subtotal) → liever géén splitsing dan een foute.
  let splitsingOk = true
  const doelBtw = quote.total != null && quote.subtotal != null
    ? rond(Number(quote.total) - Number(quote.subtotal)) : null
  if (doelBtw != null && splitsing.length) {
    const som = rond(splitsing.reduce((s, t) => s + t.bedrag, 0))
    const verschil = rond(doelBtw - som)
    if (verschil !== 0 && Math.abs(verschil) <= 0.02) {
      const grootste = splitsing.reduce((a, b) => (b.bedrag > a.bedrag ? b : a))
      grootste.bedrag = rond(grootste.bedrag + verschil)
    } else if (verschil !== 0) {
      splitsingOk = false
    }
  }

  return { kostprijs: kostprijsSom > 0 ? kostprijsSom : null, regelsom, btwSplitsing: splitsingOk ? splitsing : null }
}

console.log('Offerte-details (calculatieregels + BTW-splitsing) ophalen…')
const quoteDetailMap = new Map()
{
  const entries = [...quotationMap.entries()]
  for (let i = 0; i < entries.length; i += 10) {
    const batch = entries.slice(i, i + 10)
    const results = await Promise.allSettled(
      batch.map(([, q]) => bouw7Get(HEIMDALL, `/quotation/${q.id}`))
    )
    results.forEach((r, j) => {
      if (r.status !== 'fulfilled' || !r.value?.chapters) return
      quoteDetailMap.set(batch[j][0], berekenQuoteCijfers(r.value, batch[j][1]))
    })
    process.stdout.write(`\r${Math.min(i + 10, entries.length)}/${entries.length}`)
  }
  console.log(`\n${[...quoteDetailMap.values()].filter(d => d.kostprijs != null).length} projecten met gecalculeerde kostprijs`)
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
const dossiers = await sbGet('dossiers?select=bouw7_id,dossiernummer,bedrag_excl_btw,bedrag_incl_btw,kostprijs_excl_btw,btw_splitsing&bouw7_id=not.is.null&limit=10000')
const bestaand = new Map(dossiers.map(d => [d.bouw7_id, d]))

let updated = 0, skipped = 0, errors = 0, unchanged = 0
const num = v => (v == null ? null : Number(v))

for (const p of projects) {
  const id = String(p.id)
  const huidig = bestaand.get(id)
  if (!huidig) { skipped++; continue }
  const quote = quotationMap.get(id)
  const fin   = financialMap.get(id)

  const det = quoteDetailMap.get(id)
  const finPrijs = extractFinNum(fin?.fixedPrice) ?? extractFinNum(fin?.revenue?.budgeted)
  const quoteSubtotal = extractFinNum(quote?.subtotal)
  // Offerte is de bron als er geen contractbedrag is, of als het contractbedrag aansluit
  // op deze offerte (== subtotal, of == regelsom: Athena fixedPrice is excl. AK/W&R).
  const quoteIsBron = quoteSubtotal != null && (
    finPrijs == null
    || Math.abs(finPrijs - quoteSubtotal) < 0.01
    || (det?.regelsom != null && Math.abs(finPrijs - det.regelsom) < 0.01)
  )

  const body = {
    bedrag_excl_btw:    quoteIsBron ? quoteSubtotal : (finPrijs ?? extractFinNum(p.fixedPrice) ?? null),
    bedrag_incl_btw:    quoteIsBron ? extractFinNum(quote?.total) : null,
    kostprijs_excl_btw: quoteIsBron ? (det?.kostprijs ?? null) : null,
    btw_splitsing:      quoteIsBron ? (det?.btwSplitsing ?? null) : null,
  }

  const zelfde = num(huidig.bedrag_excl_btw) === body.bedrag_excl_btw
    && num(huidig.kostprijs_excl_btw) === body.kostprijs_excl_btw
    && num(huidig.bedrag_incl_btw) === body.bedrag_incl_btw
    && JSON.stringify(huidig.btw_splitsing) === JSON.stringify(body.btw_splitsing)
  if (zelfde) { unchanged++; continue }

  if (!APPLY) {
    const btwStr = body.btw_splitsing
      ? body.btw_splitsing.map(t => `${t.percentage}%→${t.bedrag}`).join(' ')
      : '-'
    console.log(
      `${(huidig.dossiernummer ?? id).padEnd(14)} ` +
      `excl: ${huidig.bedrag_excl_btw} → ${body.bedrag_excl_btw}  ` +
      `incl: → ${body.bedrag_incl_btw}  ` +
      `kostprijs: ${huidig.kostprijs_excl_btw} → ${body.kostprijs_excl_btw}  ` +
      `btw: ${btwStr}`
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
