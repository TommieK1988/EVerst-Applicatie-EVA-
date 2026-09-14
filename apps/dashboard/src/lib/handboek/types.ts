/**
 * Types van het personeelshandboek. Puur — ook bruikbaar in client-componenten.
 *
 * De inhoud van een blok zit in één JSONB-kolom (`inhoud`) waarvan de vorm per
 * `type` verschilt. Dat is bewust: een aparte kolom per bloktype zou een tabel
 * met dertig lege kolommen opleveren, terwijl de zichtbaarheid — het enige waar
 * SQL echt op moet filteren — wél gewoon een kolom is.
 */
import type { Zichtbaarheid } from './kenmerken'

export type BlokType =
  | 'kop'
  | 'tekst'
  | 'lijst'
  | 'tabel'
  | 'let-op'
  | 'afbeelding'
  | 'bijlage'
  | 'contact'
  | 'stap'

export type BlokInhoud =
  | { tekst: string; niveau?: 'groot' | 'klein' }          // kop
  | { tekst: string }                                       // tekst, stap
  | { stijl: 'bullet' | 'nummer'; items: string[] }         // lijst
  | { kolommen: string[]; rijen: string[][] }               // tabel
  | { tekst: string; toon?: 'waarschuwing' | 'info' }       // let-op
  | { url: string; bijschrift?: string }                    // afbeelding
  | { bijlage_id: string; label?: string }                  // bijlage
  | { contact_id: string; label?: string }                  // contact

export type Blok = Zichtbaarheid & {
  id: string
  sectie_id: string
  volgorde: number
  type: BlokType
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  inhoud: any
  zoektekst: string
}

export type SectieSoort = 'hoofdstuk' | 'situatie'

export type Sectie = Zichtbaarheid & {
  id: string
  slug: string
  titel: string
  samenvatting: string | null
  icoon: string | null
  volgorde: number
  soort: SectieSoort
}

/** Eén hoofdstuk of situatie mét zijn blokken, klaar om te renderen. */
export type SectieMetBlokken = Sectie & { blokken: Blok[] }

export type Bijlage = Zichtbaarheid & {
  id: string
  sectie_id: string | null
  titel: string
  omschrijving: string | null
  bestandsnaam: string
  mimetype: string
  grootte: number | null
  volgorde: number
}

/**
 * Contact met een uitgerekend nummer. `nummer` is null als er geen medewerker
 * gekoppeld is én geen override staat — dan toont de app de knop niet, want een
 * belknop die niets doet is erger dan geen belknop.
 */
export type Contact = {
  id: string
  rol: string
  naam: string | null
  nummer: string | null
}

/** Eén regel in de zoekindex: genoeg om te scoren, te tonen en te deeplinken. */
export type ZoekRegel = {
  sectieSlug: string
  sectieTitel: string
  sectieSoort: SectieSoort
  blokId: string
  tekst: string
  /** Titeltreffers en koppen wegen zwaarder dan een zin midden in een alinea. */
  gewicht: number
}

export type ZoekTreffer = {
  sectieSlug: string
  sectieTitel: string
  sectieSoort: SectieSoort
  blokId: string
  /**
   * Fragment rond de treffer, al opgeknipt: de stukken met `raak` zijn wat de
   * gebruiker intypte. Zo kan de UI markeren zonder HTML te injecteren.
   */
  delen: { tekst: string; raak: boolean }[]
  score: number
}
