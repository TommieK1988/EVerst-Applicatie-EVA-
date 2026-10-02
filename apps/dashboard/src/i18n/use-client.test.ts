import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * `useTranslations` in een servercomponent geeft in EVA Mobiel stilletjes Nederlands: er is
 * geen taal in de URL, dus op de server weet next-intl de taal alleen via `getAppVertaler`.
 * Elk bestand in de app dat `useTranslations` gebruikt moet daarom `'use client'` zijn.
 */

const SRC = fileURLToPath(new URL('..', import.meta.url))
const MAPPEN = ['app/m', 'components/mobiel']

function bestanden(map: string): string[] {
  return readdirSync(map).flatMap((naam) => {
    const pad = join(map, naam)
    if (statSync(pad).isDirectory()) return bestanden(pad)
    return /\.tsx?$/.test(naam) && !naam.endsWith('.test.ts') ? [pad] : []
  })
}

describe('useTranslations alleen in client-componenten', () => {
  it('elk bestand met useTranslations onder /m heeft "use client"', () => {
    const fout = MAPPEN.flatMap((m) => bestanden(join(SRC, m)))
      .filter((p) => {
        const bron = readFileSync(p, 'utf8')
        return /\buseTranslations\s*\(/.test(bron) && !/^\s*['"]use client['"]/m.test(bron.slice(0, 400))
      })
      .map((p) => relative(SRC, p))
    expect(fout).toEqual([])
  })
})
