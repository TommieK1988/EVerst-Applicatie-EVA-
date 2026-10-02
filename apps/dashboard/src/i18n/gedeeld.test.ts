import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { GEDEELDE_NAAMRUIMTES } from './gedeeld'

/**
 * Buiten `/m` geeft de root-layout alleen de GEDEELDE_NAAMRUIMTES mee (in het Nederlands).
 * Een component dat ook op kantoor draait en een andere naamruimte gebruikt, toont daar de
 * kale sleutel in plaats van de tekst. Deze test volgt de imports vanaf alles búíten de app
 * en meldt elke naamruimte die dan niet gedeeld is.
 * (Het volgt alleen statische imports; een `dynamic(() => import(...))` ontgaat hem.)
 */

const SRC = fileURLToPath(new URL('..', import.meta.url))
/** Ingangen van het kantoordeel: pagina's, layouts en routes buiten /m (en buiten het taalvoorbeeld). */
const KANTOOR_INGANG = (rel: string) =>
  rel.startsWith('app/') && !rel.startsWith('app/m/') && !rel.startsWith('app/auth/app-taal-preview/') &&
  /\/(page|layout|template|error|not-found|loading)\.tsx$|\/route\.ts$/.test(rel)

function alleBestanden(map: string): string[] {
  return readdirSync(map).flatMap((naam) => {
    const pad = join(map, naam)
    if (statSync(pad).isDirectory()) return naam === 'node_modules' ? [] : alleBestanden(pad)
    return /\.tsx?$/.test(naam) && !/\.test\.ts$/.test(naam) ? [pad] : []
  })
}

function losOp(van: string, spec: string): string | null {
  const basis = spec.startsWith('@/') ? join(SRC, spec.slice(2)) : spec.startsWith('.') ? resolve(dirname(van), spec) : null
  if (!basis) return null
  for (const k of [basis, `${basis}.tsx`, `${basis}.ts`, join(basis, 'index.tsx'), join(basis, 'index.ts')]) {
    if (existsSync(k) && statSync(k).isFile()) return k
  }
  return null
}

const IMPORT = /^\s*import\s+(?!type\b)[^'"]*?from\s+['"]([^'"]+)['"]/gm
const NAAMRUIMTE = /useTranslations\(\s*'([a-zA-Z]+)'/g

describe('gedeelde componenten gebruiken alleen gedeelde naamruimtes', () => {
  it('geen niet-gedeelde naamruimte bereikbaar vanaf het kantoordeel', () => {
    const gedeeld = new Set<string>(GEDEELDE_NAAMRUIMTES)
    const startpunten = alleBestanden(SRC).filter((p) => KANTOOR_INGANG(relative(SRC, p)))
    const gezien = new Set<string>()
    const rij = [...startpunten]
    const fout: string[] = []
    while (rij.length) {
      const pad = rij.pop()!
      if (gezien.has(pad)) continue
      gezien.add(pad)
      const bron = readFileSync(pad, 'utf8')
      for (const m of bron.matchAll(NAAMRUIMTE)) {
        if (!gedeeld.has(m[1])) fout.push(`${relative(SRC, pad)} → ${m[1]}`)
      }
      for (const m of bron.matchAll(IMPORT)) {
        const doel = losOp(pad, m[1])
        // Pagina's onder /m zijn geen kantoor; daar stopt het volgen.
        if (doel && !relative(SRC, doel).startsWith('app/m/')) rij.push(doel)
      }
    }
    expect([...new Set(fout)].sort()).toEqual([])
  })
})
