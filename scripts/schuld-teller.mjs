#!/usr/bin/env node
/**
 * Schuldteller — de rem op technische schuld.
 *
 * WAAROM DIT BESTAAT: tussen 3 en 9 september 2026 groeide `as any` van 360 naar 751 en
 * ging het aandeel server actions zonder rechtencontrole van 54% naar 66%. In diezelfde
 * week is DEVELOPMENT_STANDARDS.md geschreven, dat exact deze dingen verbiedt. Documentatie
 * zonder handhaving werkt hier dus aantoonbaar niet. Dit script is dezelfde regel met een
 * machine ervoor.
 *
 * WAAROM GEEN ESLINT-REGEL: van de 751 casts staan er 492 met een `eslint-disable-next-line`
 * erboven. `@typescript-eslint/no-explicit-any` van warn naar error zetten vangt dus alleen
 * de rest, en laat elke nieuwe cast die in de bestaande huisstijl geschreven wordt gewoon
 * door. Een teller telt ook wat is uitgezet; een lintregel per definitie niet.
 *
 * WAAROM DRIE LOSSE BUDGETTEN: 622 ongegate actions met service-role is de feitelijke
 * blootstelling, 751 casts is latente schuld. Die in één getal proppen kost evenveel krediet
 * aan een beveiligingsgat als aan een schoonheidsfout.
 *
 * GEBRUIK
 *   node scripts/schuld-teller.mjs            controleer tegen het budget (exit 1 bij groei)
 *   node scripts/schuld-teller.mjs --json     alleen de getallen, voor kalibratie
 *   node scripts/schuld-teller.mjs --zet      schrijf de huidige stand als nieuw budget
 *   node scripts/schuld-teller.mjs --wortel X meet een andere boom (voor kalibratie tegen
 *                                             een oudere commit, bijv. via `git archive`)
 *
 * Het budget mag alleen omláág. Verlagen hoort bij de PR die de schuld verlaagt.
 */

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const EIGEN_WORTEL = fileURLToPath(new URL('..', import.meta.url))
const wortelArg = process.argv.indexOf('--wortel')
/** Standaard de repo waar dit script in staat; `--wortel` laat een andere boom meten. */
const WORTEL = wortelArg !== -1 ? process.argv[wortelArg + 1] : EIGEN_WORTEL
/** Het budget hoort altijd bij deze repo, ook als je een andere boom meet. */
const BUDGET = join(EIGEN_WORTEL, 'scripts', 'schuld-budget.json')

/** Mappen die we doorzoeken. */
const BRONMAPPEN = ['apps/dashboard/src', 'packages/database/src', 'packages/wagenpark-core/src']

/**
 * Gegenereerde bestanden tellen niet mee. `database.types.ts` volgt het databaseschema,
 * niet onze stijlregels — hem meetellen in de regellimiet zou betekenen dat het schema
 * niet meer mag groeien.
 */
const GENEGEERD = [/database\.types\.ts$/, /\.d\.ts$/, /node_modules/, /[\\/]\.next/]

/** De gates die als rechtencontrole gelden. Volgorde doet er niet toe. */
const GATES = ['vereisRecht', 'vereisSessie', 'vereisBeheerder', 'vereisModuleToegang']

const REGELLIMIET = 800

function bestanden(map) {
  const pad = join(WORTEL, map)
  if (!existsSync(pad)) return []
  const uit = []
  const loop = (d) => {
    for (const naam of readdirSync(d)) {
      const p = join(d, naam)
      if (GENEGEERD.some((r) => r.test(p))) continue
      const st = statSync(p)
      if (st.isDirectory()) loop(p)
      else if (/\.(ts|tsx|mts)$/.test(naam)) uit.push(p)
    }
  }
  loop(pad)
  return uit
}

const rel = (p) => relative(WORTEL, p).split(sep).join('/')

// ── Teller 1: as any ────────────────────────────────────────────────────────
// Telt vóórkomens, niet regels, en telt bewust ook regels met een disable-comment mee.
function telAsAny(paden) {
  let totaal = 0
  const perBestand = new Map()
  for (const p of paden) {
    const n = (readFileSync(p, 'utf8').match(/\bas\s+any\b/g) ?? []).length
    if (n) { totaal += n; perBestand.set(rel(p), n) }
  }
  return { totaal, perBestand }
}

// ── Teller 2: ongegate server actions met service-role ──────────────────────
/**
 * Een geëxporteerde async functie in een `'use server'`-bestand dat `createAdminClient`
 * gebruikt, zonder gate in zijn eigen body óf in een helper die hij aanroept.
 *
 * Grep volstaat hier niet: een gate kan in een lokale helper zitten of achter een early
 * return. Daarom de AST, met één niveau helper-resolutie binnen hetzelfde bestand. Dat
 * dekt het gangbare patroon; een gate die twéé bestanden verderop zit telt als ongegate
 * en dat is de veilige kant om op te falen (liever te streng dan een gat missen).
 */
function telOngegate(paden) {
  let totaal = 0
  const perBestand = new Map()

  for (const p of paden) {
    const tekst = readFileSync(p, 'utf8')
    if (!/^\s*['"]use server['"]/m.test(tekst)) continue
    if (!tekst.includes('createAdminClient')) continue

    const bron = ts.createSourceFile(p, tekst, ts.ScriptTarget.Latest, true)

    /** Namen van functies (op elk niveau) → bevat die body een gate-aanroep? */
    const heeftGate = new Map()
    /** Namen van functies → welke andere functies roept hij aan? */
    const roeptAan = new Map()

    const aanroepenIn = (node) => {
      const namen = new Set()
      const loop = (n) => {
        if (ts.isCallExpression(n)) {
          const e = n.expression
          if (ts.isIdentifier(e)) namen.add(e.text)
          else if (ts.isPropertyAccessExpression(e)) namen.add(e.name.text)
        }
        ts.forEachChild(n, loop)
      }
      loop(node)
      return namen
    }

    const functies = []
    const verzamel = (node) => {
      let naam = null
      let body = null
      if (ts.isFunctionDeclaration(node) && node.name) { naam = node.name.text; body = node.body }
      else if (ts.isVariableStatement(node)) {
        for (const d of node.declarationList.declarations) {
          if (d.name && ts.isIdentifier(d.name) && d.initializer &&
              (ts.isArrowFunction(d.initializer) || ts.isFunctionExpression(d.initializer))) {
            const n2 = d.name.text
            const aanroepen = aanroepenIn(d.initializer)
            roeptAan.set(n2, aanroepen)
            heeftGate.set(n2, GATES.some((g) => aanroepen.has(g)))
            functies.push({ naam: n2, node: node, decl: d.initializer })
          }
        }
      }
      if (naam && body) {
        const aanroepen = aanroepenIn(body)
        roeptAan.set(naam, aanroepen)
        heeftGate.set(naam, GATES.some((g) => aanroepen.has(g)))
        functies.push({ naam, node, decl: node })
      }
      ts.forEachChild(node, verzamel)
    }
    verzamel(bron)

    /** Gate in eigen body, of in een helper uit hetzelfde bestand die hij aanroept. */
    const gedekt = (naam) => {
      if (heeftGate.get(naam)) return true
      for (const aangeroepen of roeptAan.get(naam) ?? []) {
        if (heeftGate.get(aangeroepen)) return true
      }
      return false
    }

    const ongegate = []
    for (const f of functies) {
      const mods = ts.canHaveModifiers(f.node) ? (ts.getModifiers(f.node) ?? []) : []
      const geexporteerd = mods.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
      if (!geexporteerd) continue
      const isAsync =
        (ts.canHaveModifiers(f.decl) ? (ts.getModifiers(f.decl) ?? []) : [])
          .some((m) => m.kind === ts.SyntaxKind.AsyncKeyword) ||
        (f.decl.modifiers ?? []).some((m) => m.kind === ts.SyntaxKind.AsyncKeyword)
      if (!isAsync) continue
      if (!gedekt(f.naam)) ongegate.push(f.naam)
    }

    if (ongegate.length) { totaal += ongegate.length; perBestand.set(rel(p), ongegate.length) }
  }
  return { totaal, perBestand }
}

// ── Teller 3: te grote bestanden ────────────────────────────────────────────
function telGroot(paden) {
  let totaal = 0
  const perBestand = new Map()
  for (const p of paden) {
    const n = readFileSync(p, 'utf8').split('\n').length
    if (n > REGELLIMIET) { totaal += 1; perBestand.set(rel(p), n) }
  }
  return { totaal, perBestand }
}

// ── Uitvoeren ───────────────────────────────────────────────────────────────
const paden = BRONMAPPEN.flatMap(bestanden)
const asAny = telAsAny(paden)
const ongegate = telOngegate(paden)
const groot = telGroot(paden)

const stand = {
  as_any: asAny.totaal,
  ongegate_service_role_actions: ongegate.totaal,
  bestanden_boven_800_regels: groot.totaal,
}

const args = process.argv.slice(2)

if (args.includes('--json')) {
  console.log(JSON.stringify({ ...stand, bestanden_gescand: paden.length }, null, 2))
  process.exit(0)
}

/**
 * Naast de drie totalen leggen we per bestand vast wat de stand is. Dat is wat de
 * foutmelding aanwijzend maakt: bij groei kunnen we zeggen wélk bestand erbij kwam in
 * plaats van de grootste bestaande zondaars op te sommen. Een teller die je naar het
 * verkeerde bestand stuurt wordt binnen een week uitgezet, en dan heb je niets.
 * Bijkomend voordeel: de git-diff van dit bestand laat per PR zien waar schuld beweegt.
 */
const perBestandNu = {
  as_any: Object.fromEntries([...asAny.perBestand].sort()),
  ongegate_service_role_actions: Object.fromEntries([...ongegate.perBestand].sort()),
  bestanden_boven_800_regels: Object.fromEntries([...groot.perBestand].sort()),
}

if (args.includes('--zet')) {
  writeFileSync(BUDGET, JSON.stringify({ budget: stand, per_bestand: perBestandNu }, null, 2) + '\n')
  console.log('Budget vastgelegd:', JSON.stringify(stand))
  process.exit(0)
}

if (!existsSync(BUDGET)) {
  console.error('Geen scripts/schuld-budget.json. Draai eerst: node scripts/schuld-teller.mjs --zet')
  process.exit(2)
}

const { budget, per_bestand: perBestandBudget = {} } = JSON.parse(readFileSync(BUDGET, 'utf8'))
const toelichting = {
  as_any: 'as any-casts',
  ongegate_service_role_actions: 'server actions met service-role zonder rechtencontrole',
  bestanden_boven_800_regels: `bestanden boven de ${REGELLIMIET} regels`,
}

let gezakt = false
let gedaald = false

for (const [sleutel, nu] of Object.entries(stand)) {
  const max = budget[sleutel]
  const label = toelichting[sleutel]
  if (nu > max) {
    gezakt = true
    console.error(`\nGEGROEID  ${label}: ${nu} (budget ${max}, dus ${nu - max} erbij)`)
    const was = perBestandBudget[sleutel] ?? {}
    const gestegen = Object.entries(perBestandNu[sleutel])
      .map(([b, n]) => [b, n, was[b] ?? 0])
      .filter(([, n, oud]) => n > oud)
      .sort((a, b) => (b[1] - b[2]) - (a[1] - a[2]))
    if (gestegen.length) {
      for (const [bestand, n, oud] of gestegen) {
        const richting = oud === 0 ? 'nieuw' : `was ${oud}`
        console.error(`            ${bestand}: ${n} (${richting})`)
      }
    } else {
      console.error('            (geen per-bestand-nulmeting; draai --zet om die vast te leggen)')
    }
  } else if (nu < max) {
    gedaald = true
    console.log(`GEDAALD   ${label}: ${nu} (budget ${max}) — verlaag het budget naar ${nu} in deze PR`)
  } else {
    console.log(`gelijk    ${label}: ${nu}`)
  }
}

if (gezakt) {
  console.error(`
De schuld is gegroeid. Dat is geen reden om dit script uit te zetten -- juist niet.
Kies er één:
  - los het op in deze wijziging;
  - of leg in de commitmelding uit waarom het hier niet anders kon, en verhoog het
    budget bewust met exact het aantal dat je toevoegt.
`)
  process.exit(1)
}

if (gedaald) console.log('\nVergeet het budget niet te verlagen: node scripts/schuld-teller.mjs --zet')
process.exit(0)
