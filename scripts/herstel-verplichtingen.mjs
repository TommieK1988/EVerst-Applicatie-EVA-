/**
 * Eenmalig herstel: opdrachten die per regel zijn afgeroepen samenvoegen tot één verplichting.
 *
 * Tot september 2026 riep EVA elke contractregel apart af (`approve-contract-terms` per termijn).
 * Bouw7 maakt dan per regel een leverbon, en elke leverbon is een verplichting: een opdracht met
 * negen regels leverde negen verplichtingen. `roepBouw7ContractAf` doet dat nu in één call.
 * Dit script trekt de al aangemaakte documenten na naar dezelfde stand.
 *
 * Afroepen is onomkeerbaar — een `approved` termijn is niet terug te zetten en niet bij te werken
 * (zie WRITE-ENDPOINTS.md §2d). De enige route is daarom, per contract:
 *   1. de leverbonnen zonder inkoopfactuur verwijderen;
 *   2. de bijbehorende termijnen verwijderen — de bestelregel komt daarbij vanzelf weer vrij;
 *   3. dezelfde termijnen opnieuw aanmaken via een contract-upsert, mét hun `contractOrderLines`;
 *   4. ze in één `approve-contract-terms` afroepen → één gebundelde bon.
 *
 * Een bon waar al een inkoopfactuur op staat (`processed`) blijft ongemoeid: dat zijn geboekte
 * kosten, geen verplichting meer, en eraan zitten breekt de factuurkoppeling.
 *
 * Draaien:
 *   node scripts/herstel-verplichtingen.mjs            # droogloop — toont alleen het plan
 *   node scripts/herstel-verplichtingen.mjs --doen     # voert het uit
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const DOEN = process.argv.includes('--doen')

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const env = {}
for (const line of readFileSync(join(root, 'apps/dashboard/.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) env[m[1]] = m[2].trim().replace(/\r$/, '').replace(/^"|"$/g, '')
}
const SB = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' }

const [integratie] = await (await fetch(
  `${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/integraties?naam=eq.bouw7&select=config`, { headers: SB },
)).json()
const cfg = integratie.config

const HD = 'https://heimdall.bouw7.nl'
const auth = await (await fetch(`${HD}/auth/login/${cfg.app_name ?? 'everts-platform'}/apiKey`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: `apiKey=${encodeURIComponent(cfg.api_key)}`,
})).json()
const H = { Authorization: `Bearer ${auth.token ?? auth.access_token ?? auth}`, 'Content-Type': 'application/json' }

async function call(method, pad, body, q) {
  const u = new URL(pad, HD)
  if (q) u.searchParams.set('q', q)
  const r = await fetch(u, { method, headers: H, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) })
  const t = await r.text()
  if (!r.ok) throw new Error(`${method} ${pad} -> ${r.status}: ${t.slice(0, 300)}`)
  try { return JSON.parse(t) } catch { return t || null }
}
const get = (pad, q) => call('GET', pad, undefined, q)
const post = (pad, body) => call('POST', pad, body)
const del = (pad, body) => call('DELETE', pad, body)

const PAD = { inkooporder: '/contracts/purchase-order', oa_contract: '/contracts/subcontractor' }
/** Let op: bij OA heet de DELETE-route van een termijn `subcontractor`, de POST `subcontract`. */
const TERM_DEL = { inkooporder: '/contracts/purchase-order/contract-term', oa_contract: '/contracts/subcontractor/contract-term' }

/** Bonnen van een contract, ontdubbeld — een gebundelde bon hangt onder élke termijn. */
function bonnenVan(terms) {
  const uit = new Map()
  for (const t of terms ?? []) for (const b of t.deliveryTickets ?? []) {
    if (b.id != null && !uit.has(b.id)) uit.set(b.id, b)
  }
  return [...uit.values()]
}

/** Termijn terug naar de vorm waarin hij opnieuw aangemaakt kan worden. */
function hermaakBody(t, sortIndex) {
  return {
    number: t.number,
    description: t.description,
    sortIndex,
    unit: t.unit,
    amount: t.amount,
    unitPrice: t.unitPrice,
    subTotal: t.subTotal,
    amountOnly: t.amountOnly ?? false,
    createDeliveryTicket: false,
    ...(t.projectSecurityLink?.id != null ? { projectSecurityLink: { id: t.projectSecurityLink.id } } : {}),
    ...(t.contractOrderLines?.length ? { contractOrderLines: t.contractOrderLines.map(l => ({ id: l.id })) } : {}),
  }
}

// ── 1. welke EVA-bestellingen staan als afgeroepen in Bouw7? ──────────────────
const bestellingen = await (await fetch(
  `${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/werkbegroting_bestellingen` +
  `?bouw7_contract_id=not.is.null&select=id,soort,bouw7_contract_id,bouw7_nummer,bouw7_leverbon_id,bouw7_bonnummer`,
  { headers: SB },
)).json()

console.log(`${bestellingen.length} bestellingen met een Bouw7-contract\n`)

const plan = []
for (const b of bestellingen) {
  const soort = b.soort ?? 'inkooporder'
  const cid = Number(b.bouw7_contract_id)
  let d
  try { d = await get(`${PAD[soort]}/${cid}`) } catch (e) {
    console.log(`  ${b.bouw7_nummer}: contract niet leesbaar (${String(e).slice(0, 90)}) — overslaan`)
    continue
  }
  const terms = d.contractTerms ?? []
  const bonnen = bonnenVan(terms)

  // Een termijn met een bon wáár een inkoopfactuur op staat blijft ongemoeid: dat zijn geboekte
  // kosten, geen verplichting meer, en eraan zitten breekt de factuurkoppeling.
  const heeftGeboekteBon = t => (t.deliveryTickets ?? []).some(x => x.processed)
  const vast = terms.filter(heeftGeboekteBon)

  // Te herbouwen: al afgeroepen termijnen zonder geboekte bon. Ook een termijn zonder één enkele
  // bon hoort erbij — die is `approved` maar z'n verplichting is verdwenen (bon losgemaakt bij
  // het terugdraaien van een factuur), en `approved` is niet terug te zetten.
  const teHerstellen = terms.filter(t => t.approved === true && !heeftGeboekteBon(t))
  // Nooit-afgeroepen termijnen hoeven niet herbouwd; die gaan straks vanzelf mee in de afroep.
  const nooitAfgeroepen = terms.filter(t => t.approved !== true)

  const bonnenWeg = bonnenVan(teHerstellen)
  const zonderBon = teHerstellen.filter(t => (t.deliveryTickets ?? []).length === 0)

  // Zinvol zodra er iets samen te voegen valt, of zodra er een termijn zonder verplichting staat.
  // Delen de te herbouwen termijnen al één bon, dan is dit contract al hersteld — zo blijft
  // het script herhaalbaar zonder elke keer opnieuw te slopen en op te bouwen.
  if (teHerstellen.length === 0 || (bonnenWeg.length === 1 && zonderBon.length === 0)) {
    console.log(`  ${b.bouw7_nummer}: ${bonnen.length} bon(nen), ${vast.length} met factuur — al goed, overslaan`)
    continue
  }

  plan.push({ bestelling: b, soort, cid, detail: d, terms, bonnenWeg, vast, teHerstellen })
  console.log(
    `  ${b.bouw7_nummer}: ${bonnen.length} bon(nen) → ${vast.length + 1} ` +
    `(${vast.length} met factuur blijft staan, ${teHerstellen.length} termijnen → 1 gebundelde verplichting)`,
  )
  for (const t of teHerstellen) {
    const bon = (t.deliveryTickets ?? []).map(x => x.ticketNumber).join(',') || 'GEEN BON — verplichting was kwijt'
    console.log(`      termijn #${t.id} "${t.description}" ${t.subTotal} · ${bon} · regels=${(t.contractOrderLines ?? []).map(l => l.id).join(',') || 'geen'}`)
  }
  if (nooitAfgeroepen.length) console.log(`      (+ ${nooitAfgeroepen.length} nog niet afgeroepen termijnen gaan mee in de afroep)`)
}

if (plan.length === 0) { console.log('\nNiets te herstellen.'); process.exit(0) }
if (!DOEN) { console.log('\nDROOGLOOP — draai met --doen om dit uit te voeren.'); process.exit(0) }

// ── 2. uitvoeren ──────────────────────────────────────────────────────────────
for (const p of plan) {
  console.log(`\n== ${p.bestelling.bouw7_nummer} (${p.soort} ${p.cid})`)
  try {
    // a. de bonnen van de te herbouwen termijnen weg
    for (const bon of p.bonnenWeg) {
      await del('/project/delivery-ticket', {
        id: bon.id, ticketNumber: bon.ticketNumber ?? '', ticketDate: bon.ticketDate ?? new Date().toISOString().slice(0, 10), processed: false,
      })
      console.log(`   bon ${bon.ticketNumber} verwijderd`)
    }

    // b. bijbehorende termijnen weg (bestelregels komen daarbij vrij)
    for (const t of p.teHerstellen) {
      await del(TERM_DEL[p.soort], {
        id: t.id, contract: { id: p.cid }, number: t.number, description: t.description, subTotal: t.subTotal,
      })
      console.log(`   termijn #${t.id} verwijderd`)
    }

    // c. opnieuw aanmaken naast de termijnen die zijn blijven staan
    const huidig = await get(`${PAD[p.soort]}/${p.cid}`)
    const behouden = huidig.contractTerms ?? []
    const isOa = p.soort === 'oa_contract'
    // `status` komt als getal terug, niet als object; weglaten zou het contract terugzetten
    // naar concept en de afroep daarna laten weigeren.
    const status = typeof huidig.status === 'object' ? huidig.status?.id : huidig.status
    if (status == null) throw new Error('kon de huidige contractstatus niet bepalen')
    await post(PAD[p.soort], {
      id: p.cid,
      project: { id: p.detail.project?.id },
      [isOa ? 'subcontractor' : 'supplier']: { id: (isOa ? p.detail.subcontractor : p.detail.supplier)?.id },
      status,
      type: p.detail.type ?? 0,
      name: p.detail.name,
      description: p.detail.description ?? '',
      paymentAgreement: p.detail.paymentAgreement ?? '',
      internalNote: p.detail.internalNote ?? null,
      cost: p.detail.cost,
      language: p.detail.language ?? 'nl-NL',
      createDeliveryTicket: false,
      mailSent: p.detail.mailSent ?? false,
      contractTerms: [
        ...behouden,
        ...p.teHerstellen.map((t, i) => hermaakBody(t, behouden.length + i)),
      ],
    })
    console.log(`   ${p.teHerstellen.length} termijnen opnieuw aangemaakt`)

    // d. in één call afroepen → één gebundelde bon
    const na = await get(`${PAD[p.soort]}/${p.cid}`)
    const vrij = (na.contractTerms ?? []).filter(t => t.approved !== true)
    if (vrij.length > 0) {
      await post(`${PAD[p.soort]}/approve-contract-terms`, {
        items: vrij.map(t => ({ ...t, partiallyAmountReceived: t.amount ?? null, partiallyCostReceived: t.subTotal ?? null })),
        createDeliveryTickets: true, createPdf: false,
        signee: 'EVA (herstel verplichtingen)',
        comments: '', recipient: null, ccRecipients: null, bccRecipients: null,
      })
      console.log(`   ${vrij.length} termijnen gebundeld afgeroepen`)
    }

    // e. resultaat teruglezen en de EVA-bestelling op de nieuwe bon zetten
    const eind = await get(`${PAD[p.soort]}/${p.cid}`)
    const eindBonnen = bonnenVan(eind.contractTerms)
    console.log(`   resultaat: ${eindBonnen.length} bon(nen): ${eindBonnen.map(x => `${x.ticketNumber}${x.processed ? ' (factuur)' : ''}`).join(', ')}`)

    const nieuwe = eindBonnen.find(x => !x.processed) ?? eindBonnen[0]
    if (nieuwe) {
      const r = await fetch(
        `${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/werkbegroting_bestellingen?id=eq.${p.bestelling.id}`,
        {
          method: 'PATCH',
          headers: { ...SB, Prefer: 'return=minimal' },
          body: JSON.stringify({ bouw7_leverbon_id: nieuwe.id, bouw7_bonnummer: nieuwe.ticketNumber, bouw7_gesynct_op: new Date().toISOString() }),
        },
      )
      console.log(`   EVA bijgewerkt naar bon ${nieuwe.ticketNumber} (${r.status})`)
    }
  } catch (e) {
    console.log(`   FOUT: ${String(e).slice(0, 400)}`)
    console.log('   >>> contract handmatig nakijken in Bouw7 voordat je verder gaat.')
    break
  }
}
