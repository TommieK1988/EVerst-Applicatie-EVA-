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
 * De vlag `is_inline` scheidt de twee groepen niet: een logo dat als gewone
 * bijlage meekomt is niet inline, en een foto die iemand in zijn mail plàkt is dat
 * wél. Vandaar deze tweede zeef, op naam en op grootte.
 *
 * Daarom drie uitkomsten in plaats van twee. "In de dossiermap" en "mag gelezen
 * worden" zijn niet hetzelfde: een geplakte gevelfoto is vaak het enige beeld dat
 * er is en moet het model bereiken, maar hoort niet als `image003.jpg` los in de
 * projectmap te belanden.
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
const NAAMLOOS_BEELD = [
  /^image\d{3,}\.(png|jpe?g|gif)$/i,
  /^att\d+\.(png|jpe?g|gif)$/i,
]

/** Bestanden die de mailclient zelf produceert en die niets bevatten. */
const ONBRUIKBAAR = [
  /^oledata\.mso$/i,
  /^winmail\.dat$/i,
]

/** Onder deze grens is een afbeelding een icoontje, geen foto van het werk. */
const MINIMALE_FOTO_BYTES = 25 * 1024

export interface BijlageKeuze {
  bestandsnaam: string
  contentType: string | null
  grootteBytes: number | null
  isInline: boolean
}

export interface BijlageOordeel {
  /** Hoort in de dossiermap van het project. */
  mee: boolean
  /** Mag mee naar het model en staat in de voorvertoning op het scherm. */
  meelezen: boolean
  /** Waarom het niet in de dossiermap komt. Null als het gewoon meegaat. */
  reden: string | null
}

const WEL = { mee: true, meelezen: true, reden: null } as const
const NIET = (reden: string): BijlageOordeel => ({ mee: false, meelezen: false, reden })

export function beoordeelBijlage(b: BijlageKeuze): BijlageOordeel {
  const naam = (b.bestandsnaam ?? '').trim()
  if (!naam) return NIET('geen bestandsnaam')

  const laag = naam.toLowerCase()
  const type = (b.contentType ?? '').toLowerCase().split(';')[0].trim()
  const isAfbeelding = type.startsWith('image/')

  // Alleen bij afbeeldingen op naam filteren. Een PDF die "logo-onderhoud.pdf" heet
  // is een raar geval, maar een bestek dat "Huisstijl gevelrenovatie.pdf" heet is
  // dat niet -- en die zou je dan weggooien.
  if (isAfbeelding && OPMAAK_NAMEN.some(w => laag.includes(w))) {
    return NIET('lijkt mailopmaak (logo, handtekening of icoon)')
  }

  // De grens die logo van foto scheidt. Dit is het enige harde signaal: een
  // handtekeningafbeelding blijft onder de 25 kB, een foto van een gevel niet.
  if (isAfbeelding && (b.grootteBytes ?? 0) > 0 && (b.grootteBytes ?? 0) < MINIMALE_FOTO_BYTES) {
    return NIET(`te klein voor een foto van het werk (${Math.round((b.grootteBytes ?? 0) / 1024)} kB)`)
  }

  if (ONBRUIKBAAR.some(p => p.test(naam))) {
    return NIET('door de mailclient toegevoegd, geen projectstuk')
  }

  // Een foto die iemand in de mail plakt in plaats van bijvoegt, is nog steeds een
  // foto van het werk -- en vaak de enige. Die moet het model zien en de
  // behandelaar in beeld krijgen. In de dossiermap hoort hij niet: daar staat hij
  // zonder de mailtekst eromheen los van zijn betekenis, onder een naam die
  // Outlook heeft verzonnen.
  if (b.isInline) {
    return isAfbeelding
      ? { mee: false, meelezen: true, reden: 'staat in de mailtekst; wordt wel meegelezen' }
      : NIET('staat in de mailtekst zelf')
  }

  if (NAAMLOOS_BEELD.some(p => p.test(naam))) {
    return { mee: false, meelezen: true, reden: 'naamloos beeld uit de mail; wordt wel meegelezen' }
  }

  return { ...WEL }
}

/** Splitst een lijst bijlagen in wat meegaat en wat bewust wordt overgeslagen. */
export function splitsBijlagen<T extends BijlageKeuze>(bijlagen: T[]): {
  /** Gaat naar de dossiermap. */
  mee: T[]
  /** Gaat naar het model en naar de voorvertoning; ook alles uit `mee`. */
  meelezen: T[]
  /** Gaat nergens heen, met de reden erbij. */
  uitgesloten: { bijlage: T; reden: string }[]
} {
  const mee: T[] = []
  const meelezen: T[] = []
  const uitgesloten: { bijlage: T; reden: string }[] = []
  for (const b of bijlagen) {
    const oordeel = beoordeelBijlage(b)
    if (oordeel.meelezen) meelezen.push(b)
    if (oordeel.mee) mee.push(b)
    else if (!oordeel.meelezen) uitgesloten.push({ bijlage: b, reden: oordeel.reden ?? 'onbekend' })
  }
  return { mee, meelezen, uitgesloten }
}
