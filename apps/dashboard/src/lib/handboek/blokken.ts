/**
 * Bloktypes: wat ze heten, hoe een leeg exemplaar eruitziet en welke platte
 * tekst eruit komt. Puur — de editor (client) en de opslag-action (server)
 * gebruiken allebei dit bestand, zodat een nieuw bloktype op één plek landt.
 */
import type { BlokType } from './types'

export const BLOK_SOORTEN: { type: BlokType; label: string; uitleg: string }[] = [
  { type: 'tekst', label: 'Alinea', uitleg: 'Gewone lopende tekst' },
  { type: 'kop', label: 'Tussenkop', uitleg: 'Kopje boven een stuk tekst' },
  { type: 'lijst', label: 'Opsomming', uitleg: 'Punten of genummerde regels' },
  { type: 'tabel', label: 'Tabel', uitleg: 'Rijen en kolommen; mobiel als kaartjes' },
  { type: 'let-op', label: 'Let op', uitleg: 'Opvallend kader voor iets belangrijks' },
  { type: 'stap', label: 'Stap', uitleg: 'Genummerde stap — alleen in "Wat te doen bij…"' },
]

/** Bloktypes die alleen in een situatiekaart thuishoren, en andersom. */
export function soortenVoor(sectieSoort: 'hoofdstuk' | 'situatie') {
  return BLOK_SOORTEN.filter((s) =>
    sectieSoort === 'situatie' ? s.type !== 'kop' : s.type !== 'stap',
  )
}

/** Verse inhoud voor een nieuw blok van dit type. */
export function leegBlok(type: BlokType): Record<string, unknown> {
  switch (type) {
    case 'kop':
      return { tekst: '', niveau: 'klein' }
    case 'lijst':
      return { stijl: 'bullet', items: [''] }
    case 'tabel':
      return { kolommen: [], rijen: [['', '']] }
    case 'let-op':
      return { tekst: '', toon: 'waarschuwing' }
    case 'afbeelding':
      return { url: '' }
    case 'bijlage':
      return { bijlage_id: '' }
    case 'contact':
      return { contact_id: '' }
    default:
      return { tekst: '' }
  }
}

/**
 * De platte tekst van een blok, voor de zoekindex en het fragment eronder.
 *
 * Bewust hier en niet in een database-trigger: de projectie moet precies gelijk
 * lopen met wat de renderer toont, en dat is TypeScript-kennis. Twee
 * implementaties van dezelfde regel is precies hoe een zoekindex stilletjes
 * achterloopt op de inhoud.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function zoektekstVoor(type: BlokType, inhoud: any): string {
  const i = inhoud ?? {}
  switch (type) {
    case 'tekst':
    case 'kop':
    case 'let-op':
    case 'stap':
      return [i.tekst, i.toelichting].filter(Boolean).join(' ').trim()
    case 'lijst':
      return (i.items ?? []).filter(Boolean).join(' ').trim()
    case 'tabel':
      return (i.rijen ?? [])
        .map((r: string[]) => (r ?? []).filter(Boolean).join(' '))
        .filter(Boolean)
        .join(' ')
        .trim()
    case 'afbeelding':
      return String(i.bijschrift ?? '').trim()
    default:
      // bijlage en contact dragen alleen een verwijzing; hun label staat al bij
      // de bijlage respectievelijk het contact zelf.
      return String(i.label ?? '').trim()
  }
}

/** Is dit blok leeg genoeg om te negeren bij het opslaan? */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function blokIsLeeg(type: BlokType, inhoud: any): boolean {
  if (type === 'bijlage') return !inhoud?.bijlage_id
  if (type === 'contact') return !inhoud?.contact_id
  if (type === 'afbeelding') return !inhoud?.url
  return zoektekstVoor(type, inhoud).length === 0
}
