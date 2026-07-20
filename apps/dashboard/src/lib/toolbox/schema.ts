/**
 * Schema-helpers: valideren (bij publiceren), strippen (vóór de client) en
 * schudden (per deelnemer) van een toolbox-schema, plus het parsen van
 * video-URL's naar een provider + id.
 */
import type {
  ToolboxSchema,
  ToolboxSlide,
  VraagSlide,
  ContentSlide,
  VideoProvider,
  VraagOptie,
} from '@/components/toolbox/types'
import { seededShuffle, seedVoorVraag } from './shuffle'

// ── Validatie (bij publiceren) ─────────────────────────────────────────
export type ValidatieFout = { slideId?: string; boodschap: string }

export function valideerSchema(schema: ToolboxSchema): ValidatieFout[] {
  const fouten: ValidatieFout[] = []
  const contentSlides = schema.slides.filter((s) => s.type === 'content')
  const vraagSlides = schema.slides.filter((s): s is VraagSlide => s.type === 'vraag')

  if (contentSlides.length === 0) {
    fouten.push({ boodschap: 'Voeg minstens één inhoudsslide toe voordat je publiceert.' })
  }

  for (const v of vraagSlides) {
    if (!v.vraag.trim()) {
      fouten.push({ slideId: v.id, boodschap: 'Een vraag heeft geen vraagtekst.' })
    }
    if (v.opties.length < 2) {
      fouten.push({ slideId: v.id, boodschap: `Vraag "${v.vraag || '—'}" heeft minder dan 2 antwoorden.` })
    }
    if (v.opties.some((o) => !o.tekst.trim())) {
      fouten.push({ slideId: v.id, boodschap: `Vraag "${v.vraag || '—'}" heeft een leeg antwoord.` })
    }
    const aantalJuist = v.opties.filter((o) => o.correct).length
    if (aantalJuist !== 1) {
      fouten.push({
        slideId: v.id,
        boodschap: `Vraag "${v.vraag || '—'}" moet precies één juist antwoord hebben (nu: ${aantalJuist}).`,
      })
    }
    if (!v.uitleg?.trim()) {
      fouten.push({ slideId: v.id, boodschap: `Vraag "${v.vraag || '—'}" mist een uitleg.` })
    }
  }

  return fouten
}

// ── Strippen (vóór verzenden naar de mobiele client) ───────────────────
export type PubliekeVraagOptie = Omit<VraagOptie, 'correct'>
export type PubliekeVraagSlide = Omit<VraagSlide, 'opties' | 'uitleg'> & {
  opties: PubliekeVraagOptie[]
}
export type PubliekeSlide = ContentSlide | PubliekeVraagSlide
export type PubliekSchema = { version: number; slides: PubliekeSlide[] }

/**
 * Verwijder `correct` en `uitleg`, zodat de juiste antwoorden nooit in de
 * client-payload staan. Antwoorden worden server-side gecheckt.
 */
export function stripSchemaVoorDeelnemer(schema: ToolboxSchema): PubliekSchema {
  return {
    version: schema.version,
    slides: schema.slides.map((slide): PubliekeSlide => {
      if (slide.type !== 'vraag') return slide
      return {
        id: slide.id,
        type: 'vraag',
        vraag: slide.vraag,
        opties: slide.opties.map(({ id, tekst }) => ({ id, tekst })),
      }
    }),
  }
}

// ── Schudden per deelnemer ─────────────────────────────────────────────
/**
 * Content-slides blijven in auteursvolgorde; vraag-slides worden geschud en
 * achteraan gezet, en hun opties worden per vraag geschud. Werkt op een al
 * gestript schema, zodat het meteen naar de client kan.
 */
export function schudVoorDeelnemer(schema: PubliekSchema, seed: number): PubliekSchema {
  const content = schema.slides.filter((s) => s.type === 'content')
  const vragen = schema.slides.filter((s): s is PubliekeVraagSlide => s.type === 'vraag')

  const geschuddeVragen = seededShuffle(vragen, seed).map((v) => ({
    ...v,
    opties: seededShuffle(v.opties, seedVoorVraag(seed, v.id)),
  }))

  return { version: schema.version, slides: [...content, ...geschuddeVragen] }
}

// ── Server-side antwoord-check ─────────────────────────────────────────
/** Vind de juiste optie-id van een vraag in het (volledige) versie-schema. */
export function juisteOptieId(schema: ToolboxSchema, vraagId: string): string | null {
  const slide = schema.slides.find((s): s is VraagSlide => s.type === 'vraag' && s.id === vraagId)
  return slide?.opties.find((o) => o.correct)?.id ?? null
}

/** Alle vraag-id's van een versie-schema (voor de "alles goed"-check bij afronden). */
export function alleVraagIds(schema: ToolboxSchema): string[] {
  return schema.slides.filter((s): s is VraagSlide => s.type === 'vraag').map((s) => s.id)
}

// ── Video-URL parsen ───────────────────────────────────────────────────
export type GeparsedeVideo = { provider: VideoProvider; videoId: string }

/**
 * Herken een YouTube- of Vimeo-URL en haal het video-id eruit. Retourneert
 * null bij een niet-herkende URL, zodat de editor een nette melding kan tonen.
 */
export function parseVideoUrl(input: string): GeparsedeVideo | null {
  const url = input.trim()
  if (!url) return null

  // YouTube: watch?v=, youtu.be/, /embed/, /shorts/
  const yt =
    url.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/)
  if (yt) return { provider: 'youtube', videoId: yt[1] }

  // Vimeo: vimeo.com/123456789 (evt. /manage/videos/ of met hash)
  const vimeo = url.match(/vimeo\.com\/(?:manage\/videos\/|video\/)?(\d{6,})/)
  if (vimeo) return { provider: 'vimeo', videoId: vimeo[1] }

  return null
}

/** Privacyvriendelijke embed-URL voor een video-blok. */
export function videoEmbedUrl(provider: VideoProvider, videoId: string): string {
  return provider === 'youtube'
    ? `https://www.youtube-nocookie.com/embed/${videoId}`
    : `https://player.vimeo.com/video/${videoId}`
}
