/**
 * QR-/stickercodes lezen en herkennen.
 *
 * Twee soorten codes komen langs:
 *
 *  1. **EVA-eigen QR** — de code die het paspoort zelf print: een URL die eindigt
 *     op `/materieelbeheer/<uuid>`. Daar staat de id gewoon in.
 *  2. **Voorbedrukte sticker** — gekochte stickers hebben elk hun eigen unieke
 *     code, soms als kale tekst (`EV-00123`), soms als URL naar het portaal van
 *     de leverancier (`https://qr.example/abc123`). Wat er precies in staat weten
 *     we niet en hoeven we niet te weten: EVA bewaart de **ruwe payload** in
 *     `materieel_objecten.qr_code` en zoekt daar later weer op.
 *
 * Daarom normaliseren we niet weg wat we niet begrijpen. We bewaren de payload
 * zoals hij is en zoeken met een handvol *kandidaten*: de hele payload én — als
 * het een URL is — de betekenisvolle staart ervan. Zo vindt EVA het object ook
 * terug als iemand later alleen het nummer van de sticker intypt.
 *
 * Puur en zonder server-afhankelijkheden: deze module wordt zowel in de browser
 * (scanner) als op de server (opzoeken) gebruikt.
 */

/** Wat er in een gescande code bleek te zitten. */
export type ScanResultaat =
  /** Een QR die EVA zelf printte — de object-id staat erin. */
  | { soort: 'eva'; objectId: string }
  /** Een voorbedrukte sticker of handmatig ingetypte code. */
  | { soort: 'code'; code: string }

/**
 * Waar een gescande code je heen brengt. Woont hier en niet bij de server-actie:
 * een `'use server'`-module hoort alleen async functies te exporteren.
 */
export type ScanBestemming =
  /** Code hoort bij bestaand materieel → paspoort openen. */
  | { soort: 'bekend'; id: string; omschrijving: string }
  /** Onbekende code → nieuw materieel aanmaken met deze sticker eraan. */
  | { soort: 'onbekend'; code: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Querynamen waar een stickercode in pleegt te zitten. */
const CODE_PARAMS = ['id', 'code', 'qr', 'tag', 'asset', 's', 'n']

/** Payload → URL, of null als het geen URL is. */
function alsUrl(payload: string): URL | null {
  try {
    const url = new URL(payload)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : null
  } catch {
    return null
  }
}

/**
 * Wat heb ik gescand? `null` bij een lege of onbruikbare payload.
 *
 * Een EVA-URL levert de object-id; al het andere blijft ongewijzigd staan als
 * losse code — inclusief de URL van een leverancier, want díé string is nu
 * eenmaal wat er op de sticker staat.
 */
export function leesScan(ruw: string): ScanResultaat | null {
  const payload = ruw.trim()
  if (!payload) return null

  const url = alsUrl(payload)
  if (url) {
    // .../materieelbeheer/<uuid> of .../m/materieel/<uuid>
    const delen = url.pathname.split('/').filter(Boolean)
    const laatste = delen[delen.length - 1] ?? ''
    if (UUID.test(laatste) && (delen.includes('materieelbeheer') || delen.includes('materieel'))) {
      return { soort: 'eva', objectId: laatste.toLowerCase() }
    }
  }

  // Een kale uuid (bijv. handmatig geplakt) is ook gewoon een EVA-object.
  if (UUID.test(payload)) return { soort: 'eva', objectId: payload.toLowerCase() }

  return { soort: 'code', code: payload }
}

/**
 * Zoektermen voor één code, in volgorde van betrouwbaarheid: eerst de volledige
 * payload, daarna de staart van een URL.
 *
 * De staart is bewust een *extra* kandidaat en geen vervanging: twee stickers
 * van verschillende leveranciers kunnen dezelfde staart hebben, de volledige
 * payload is uniek. Vandaar de volgorde — de eerste treffer wint.
 */
export function zoektermen(code: string): string[] {
  const payload = code.trim()
  if (!payload) return []
  const termen = [payload]

  const url = alsUrl(payload)
  if (url) {
    for (const naam of CODE_PARAMS) {
      const waarde = url.searchParams.get(naam)?.trim()
      if (waarde) termen.push(waarde)
    }
    const delen = url.pathname.split('/').filter(Boolean)
    const laatste = delen[delen.length - 1]
    if (laatste) termen.push(decodeURIComponent(laatste))
    // Sommige stickers zetten de code in het fragment (#ABC123).
    const hash = url.hash.replace(/^#/, '').trim()
    if (hash) termen.push(hash)
  }

  return [...new Set(termen.filter(Boolean))]
}

/**
 * Korte weergave van een stickercode. Een URL van 60 tekens is op een telefoon
 * onleesbaar; de staart zegt precies genoeg om te herkennen wélke sticker.
 */
export function codeLabel(code: string | null): string {
  if (!code) return '—'
  const url = alsUrl(code)
  if (!url) return code
  const delen = url.pathname.split('/').filter(Boolean)
  const laatste = delen[delen.length - 1]
  return laatste ? decodeURIComponent(laatste) : url.host
}
