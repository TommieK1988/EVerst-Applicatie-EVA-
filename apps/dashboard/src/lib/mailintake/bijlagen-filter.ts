/**
 * mailintake/bijlagen-filter.ts
 *
 * Welke bijlagen horen bij het project, en welke zijn mailopmaak?
 *
 * Een zakelijke mail sleept van alles mee: het logo uit de briefhoofd, de
 * handtekeningafbeelding, LinkedIn- en Facebook-icoontjes, een tracking-pixel van
 * één bij één. Die horen niet in een dossiermap. Wat er wél hoort is het
 * inhoudelijke werk: bestekken, werkschema's, technische adviezen, tekeningen en
 * foto's van de situatie.
 *
 * De vlag `is_inline` vangt het meeste, maar niet alles: een logo dat als gewone
 * bijlage meekomt is niet inline en glipt er dan doorheen. Vandaar deze tweede
 * zeef, op naam en op grootte.
 *
 * Bewust voorzichtig. Bij twijfel gaat een bestand mee: een gemiste tekening kost
 * meer dan een logo in de dossiermap. En elke uitsluiting krijgt een reden, zodat
 * hij vóór het aanmaken op het scherm staat en niemand zich achteraf afvraagt waar
 * een bestand gebleven is.
 */

/** Namen die vrijwel altijd mailopmaak zijn en geen projectstuk. */
const OPMAAK_NAMEN = [
  'logo', 'signature', 'handtekening', 'briefhoofd', 'banner', 'footer',
  'linkedin', 'facebook', 'twitter', 'instagram', 'youtube', 'whatsapp',
  'icon', 'pictogram', 'social', 'beeldmerk', 'huisstijl',
]

/**
 * Namen die Outlook zelf verzint voor ingesloten beeld. Die zijn zonder de mail
 * erbij betekenisloos.
 */
const OUTLOOK_PATRONEN = [
  /^image\d{3,}\.(png|jpe?g|gif)$/i,
  /^oledata\.mso$/i,
  /^winmail\.dat$/i,
  /^att\d+\.(png|jpe?g|gif)$/i,
]

/** Onder deze grens is een afbeelding een icoontje, geen foto van het werk. */
const MINIMALE_FOTO_BYTES = 25 * 1024

export interface BijlageKeuze {
  bestandsnaam: string
  contentType: string | null
  grootteBytes: number | null
  isInline: boolean
}

export type BijlageOordeel =
  | { mee: true }
  | { mee: false; reden: string }

export function beoordeelBijlage(b: BijlageKeuze): BijlageOordeel {
  const naam = (b.bestandsnaam ?? '').trim()
  if (!naam) return { mee: false, reden: 'geen bestandsnaam' }

  const laag = naam.toLowerCase()
  const type = (b.contentType ?? '').toLowerCase().split(';')[0].trim()
  const isAfbeelding = type.startsWith('image/')

  if (b.isInline) return { mee: false, reden: 'staat in de mailtekst zelf' }

  if (OUTLOOK_PATRONEN.some(p => p.test(naam))) {
    return { mee: false, reden: 'door de mailclient toegevoegd, geen projectstuk' }
  }

  // Alleen bij afbeeldingen op naam filteren. Een PDF die "logo-onderhoud.pdf" heet
  // is een raar geval, maar een bestek dat "Huisstijl gevelrenovatie.pdf" heet is
  // dat niet -- en die zou je dan weggooien.
  if (isAfbeelding && OPMAAK_NAMEN.some(w => laag.includes(w))) {
    return { mee: false, reden: 'lijkt mailopmaak (logo, handtekening of icoon)' }
  }

  if (isAfbeelding && (b.grootteBytes ?? 0) > 0 && (b.grootteBytes ?? 0) < MINIMALE_FOTO_BYTES) {
    return { mee: false, reden: `te klein voor een foto van het werk (${Math.round((b.grootteBytes ?? 0) / 1024)} kB)` }
  }

  return { mee: true }
}

/** Splitst een lijst bijlagen in wat meegaat en wat bewust wordt overgeslagen. */
export function splitsBijlagen<T extends BijlageKeuze>(bijlagen: T[]): {
  mee: T[]
  uitgesloten: { bijlage: T; reden: string }[]
} {
  const mee: T[] = []
  const uitgesloten: { bijlage: T; reden: string }[] = []
  for (const b of bijlagen) {
    const oordeel = beoordeelBijlage(b)
    if (oordeel.mee) mee.push(b)
    else uitgesloten.push({ bijlage: b, reden: oordeel.reden })
  }
  return { mee, uitgesloten }
}
