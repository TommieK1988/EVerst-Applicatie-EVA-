import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Wijst elke interne link in EVA naar een pagina die echt bestaat?
 *
 * ── WAAROM DEZE TEST ──────────────────────────────────────────────────────────
 * Een kapotte link is in de code niet te zien. `${dossierPad('offerte', id)}/bewaking`
 * leest als "het dossier, tab Bewaking", maar `dossierPad()` geeft het Informatie-tabblad
 * terug — dus stond er `/offertes/<id>/informatie/bewaking` en kreeg de gebruiker een 404.
 * Diezelfde fout is drie keer los van elkaar gemaakt: `/dossiers/<id>` (bestaat niet, een
 * dossier woont onder zijn sectie), `/quotes/<id>/preview` (het pad van de losse
 * everts-calc-app die in juli is opgeheven) en de bewakingslink hierboven. Niets ving dat
 * af: TypeScript ziet een string, de build ziet een string, en de 404 verschijnt pas als
 * een collega erop klikt.
 *
 * Deze test vergelijkt daarom twee dingen die anders nooit tegen elkaar aan gehouden
 * worden: de routes die Next daadwerkelijk serveert (de mappen onder `src/app`) en de
 * links die de code aanmaakt.
 *
 * ── WAT HIJ BEWUST NIET DOET ──────────────────────────────────────────────────
 * Links waarvan het eerste segment uit een variabele komt (`/${sectie}/${id}`) kan hij
 * niet toetsen — daar bepaalt de data of het klopt. Die worden geteld, niet gekeurd.
 *
 * Alleen navigatie telt mee: `href`, `router.push/replace`, `redirect()` en
 * `window.location`. Objectsleutels als `url:` en `pad:` zijn bewust níét meegenomen,
 * want die dragen ook Microsoft Graph-paden (`/users/<adres>/outlook/...`) en die horen
 * niet bij onze routes. De opgeslagen meldings-URL's zijn eenmalig met de hand tegen de
 * routes gelegd; komt daar ooit een fout in, dan zit die in de bouwer van die URL en niet
 * in dit bestand.
 */

const HIER = path.dirname(fileURLToPath(import.meta.url))
const SRC = path.resolve(HIER, '..', '..')            // apps/dashboard/src
const APP = path.join(SRC, 'app')
const PUBLIC = path.resolve(SRC, '..', 'public')

// ── De routes die Next serveert ──────────────────────────────────────────────

type Route = { segmenten: string[]; re: RegExp }

/**
 * Loopt de app-map af. Mappen tussen haakjes zijn route-groups en leveren geen
 * URL-segment op; `@naam` is een parallel route en heeft geen eigen URL.
 */
function verzamelRoutes(dir: string, segmenten: string[] = [], uit: string[][] = []): string[][] {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!item.isDirectory()) continue
    const naam = item.name
    if (naam.startsWith('_') || naam.startsWith('@') || naam === 'node_modules') continue

    const isGroep = naam.startsWith('(') && naam.endsWith(')')
    const volgende = isGroep ? segmenten : [...segmenten, naam]
    const sub = path.join(dir, naam)

    const bestanden = fs.readdirSync(sub)
    if (bestanden.some(f => /^(page|route)\.(tsx|ts|jsx|js)$/.test(f))) uit.push(volgende)

    verzamelRoutes(sub, volgende, uit)
  }
  return uit
}

const TE_ONTSNAPPEN = /[.*+?^${}()|[\]\\]/g

function naarRegex(segmenten: string[]): RegExp {
  const delen = segmenten.map(s => {
    if (/^\[\[\.\.\..+\]\]$/.test(s)) return '(?:/[^?#]*)?'   // optionele catch-all
    if (/^\[\.\.\..+\]$/.test(s)) return '/[^?#]+'            // catch-all
    if (/^\[.+\]$/.test(s)) return '/[^/]+'                   // [id]
    return '/' + s.replace(TE_ONTSNAPPEN, teken => '\\' + teken)
  })
  return new RegExp('^' + (delen.join('') || '/') + '$')
}

const ROUTES: Route[] = verzamelRoutes(APP).map(segmenten => ({ segmenten, re: naarRegex(segmenten) }))

/** Bestanden uit `public/` worden op hun eigen naam geserveerd: /favicon.ico, /sw.js, … */
function verzamelPubliek(dir: string, voorvoegsel = '', uit = new Set<string>()): Set<string> {
  if (!fs.existsSync(dir)) return uit
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    if (item.isDirectory()) verzamelPubliek(path.join(dir, item.name), `${voorvoegsel}/${item.name}`, uit)
    else uit.add(`${voorvoegsel}/${item.name}`)
  }
  return uit
}

const PUBLIEK = verzamelPubliek(PUBLIC)

// ── De links in de code ──────────────────────────────────────────────────────

type Link = { bestand: string; regel: number; ruw: string }

const LINK_PATRONEN = [
  /href\s*=\s*\{?\s*[`'"]([^`'"\n]*)[`'"]/g,
  /router\s*\.\s*(?:push|replace)\s*\(\s*[`'"]([^`'"\n]*)[`'"]/g,
  /\bredirect\s*\(\s*[`'"]([^`'"\n]*)[`'"]/g,
  /window\s*\.\s*location\s*\.\s*(?:href\s*=|assign\s*\()\s*[`'"]([^`'"\n]*)[`'"]/g,
]

function bronbestanden(dir: string, uit: string[] = []): string[] {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, item.name)
    if (item.isDirectory()) { if (item.name !== 'node_modules') bronbestanden(p, uit) }
    else if (/\.(ts|tsx)$/.test(item.name) && !/\.test\.tsx?$/.test(item.name)) uit.push(p)
  }
  return uit
}

function verzamelLinks(): Link[] {
  const links: Link[] = []
  for (const bestand of bronbestanden(SRC)) {
    const regels = fs.readFileSync(bestand, 'utf8').split(/\r?\n/)
    regels.forEach((regel, i) => {
      for (const patroon of LINK_PATRONEN) {
        patroon.lastIndex = 0
        let m: RegExpExecArray | null
        while ((m = patroon.exec(regel)) !== null) {
          const ruw = m[1]
          if (!ruw || !ruw.startsWith('/') || ruw.startsWith('//')) continue
          links.push({ bestand: path.relative(SRC, bestand).replace(/\\/g, '/'), regel: i + 1, ruw })
        }
      }
    })
  }
  return links
}

/**
 * Plaatshouder voor een `${...}` in een link. Een leesbare tekenreeks en geen stuurteken,
 * zodat je in de test ziet staan wat er gebeurt.
 */
const EXPR = '<expr>'

/** Query en anker weg; elke `${...}` wordt één ondoorzichtig segment. */
function normaliseerPad(url: string): string {
  let pad = url.split('?')[0].split('#')[0]
  pad = pad.replace(/\$\{[^}]*\}/g, EXPR)
  if (pad.length > 1 && pad.endsWith('/')) pad = pad.slice(0, -1)
  return pad
}

/** Komt het eerste segment uit een variabele, dan valt er niets te toetsen. */
function isOntoetsbaar(pad: string): boolean {
  return pad.slice(1).split('/')[0].includes(EXPR)
}

function bestaat(pad: string): boolean {
  if (PUBLIEK.has(pad)) return true
  // Een placeholder mag op elk concreet segment slaan, dus als [^/]+ behandelen.
  const alsRegexPad = pad.split(EXPR).join('x')
  return ROUTES.some(r => r.re.test(alsRegexPad))
}

// ── De tests ─────────────────────────────────────────────────────────────────

describe('interne links wijzen naar een bestaande route', () => {
  const links = verzamelLinks()
  const toetsbaar = links.filter(l => !isOntoetsbaar(normaliseerPad(l.ruw)))

  /**
   * Zonder deze twee ondergrenzen kan de test stilletjes nutteloos worden: gaat het
   * zoekpatroon ooit stuk, dan vindt hij nul links en is alles "in orde".
   */
  it('vindt de routes en de links waar hij over gaat', () => {
    expect(ROUTES.length).toBeGreaterThan(150)
    expect(toetsbaar.length).toBeGreaterThan(100)
  })

  it('kent de fouten die hem hebben opgeleverd', () => {
    // Precies de drie 404's uit september 2026, plus hun juiste tegenhanger.
    expect(bestaat('/offertes/<expr>/informatie/bewaking')).toBe(false)
    expect(bestaat('/offertes/<expr>/bewaking')).toBe(true)
    expect(bestaat('/dossiers/<expr>')).toBe(false)
    expect(bestaat('/opdrachten/<expr>')).toBe(true)
    expect(bestaat('/quotes/<expr>/preview')).toBe(false)
    expect(bestaat('/everts-calc/quotes/<expr>/preview')).toBe(true)
    // En het soort link dat wél moet mogen.
    expect(bestaat('/favicon.ico')).toBe(true)
    expect(bestaat('/mijn-taken')).toBe(true)
  })

  it('heeft geen enkele link zonder route', () => {
    const zonderRoute = toetsbaar.filter(l => !bestaat(normaliseerPad(l.ruw)))
    const melding = zonderRoute
      .map(l => `  ${l.bestand}:${l.regel}  ${l.ruw}`)
      .join('\n')
    expect(zonderRoute.length, `Deze links leiden naar een 404:\n${melding}\n`).toBe(0)
  })
})
