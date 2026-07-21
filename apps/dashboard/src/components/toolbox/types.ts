/**
 * Toolbox-schema — de JSONB-structuur van een toolbox-versie.
 *
 * Een toolbox bestaat uit een reeks slides. Content-slides tonen instructie
 * (kop/tekst/afbeelding/video). Vraag-slides vormen de kennischeck en worden
 * ná de content getoond, per deelnemer geschud (zowel de vragen als de opties).
 */

export const TOOLBOX_SCHEMA_VERSION = 1 as const

// ── Content-blokken ────────────────────────────────────────────────────
export type KopBlok = {
  id: string
  type: 'kop'
  tekst: string
  niveau?: 'groot' | 'klein'
}

export type TekstBlok = {
  id: string
  type: 'tekst'
  tekst: string
}

export type AfbeeldingBlok = {
  id: string
  type: 'afbeelding'
  url: string
  bijschrift?: string
}

export type VideoProvider = 'youtube' | 'vimeo'

export type VideoBlok = {
  id: string
  type: 'video'
  provider: VideoProvider
  videoId: string
  titel?: string
}

export type ContentBlok = KopBlok | TekstBlok | AfbeeldingBlok | VideoBlok
export type ContentBlokType = ContentBlok['type']

// ── Slides ─────────────────────────────────────────────────────────────
export type ContentSlide = {
  id: string
  type: 'content'
  titel?: string
  blokken: ContentBlok[]
}

export type VraagOptie = {
  id: string
  tekst: string
  /** Alleen aanwezig in het auteurs-/versie-schema; gestript vóór de client. */
  correct?: boolean
}

export type VraagSlide = {
  id: string
  type: 'vraag'
  vraag: string
  opties: VraagOptie[]
  /** Uitleg bij een fout antwoord; gestript vóór de client. */
  uitleg?: string
}

export type ToolboxSlide = ContentSlide | VraagSlide
export type SlideType = ToolboxSlide['type']

export type ToolboxSchema = {
  version: typeof TOOLBOX_SCHEMA_VERSION
  slides: ToolboxSlide[]
}

/** Een lege werkkopie voor een nieuwe toolbox. */
export function leegSchema(): ToolboxSchema {
  return { version: TOOLBOX_SCHEMA_VERSION, slides: [] }
}

// ── DB-rijen (subset, camel niet nodig — Supabase levert snake_case) ────
export type ToolboxStatus = 'concept' | 'gepubliceerd' | 'gearchiveerd'
export type ToewijzingStatus = 'open' | 'bezig' | 'afgerond'
export type MomentStatus = 'gepland' | 'klaargezet' | 'geannuleerd'

export type ToolboxRow = {
  id: string
  titel: string
  omschrijving: string | null
  status: ToolboxStatus
  huidige_versie: number
  concept_schema: ToolboxSchema
  aangemaakt_op: string
  bijgewerkt_op: string
}

export type ToewijzingRow = {
  id: string
  toolbox_id: string
  versie_id: string
  medewerker_id: string
  moment_id: string | null
  task_id: string | null
  shuffle_seed: number
  status: ToewijzingStatus
  laatste_slide: number
  gestart_op: string | null
  afgerond_op: string | null
  handtekening_pad: string | null
  handtekening_naam: string | null
}
