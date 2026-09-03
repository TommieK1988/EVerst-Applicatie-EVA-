/**
 * Deterministische id's voor de calculatie-import — puur, browser-veilig, geen `'use server'`.
 *
 * Waarom niet `createHash('sha256')` zoals `codeNaarUuid()` in de recepten-actions? Die draait op de
 * server; deze functie draait in de BROWSER, want de calculatie-import loopt via het werkgeheugen
 * van de calculatie-editor (`lib/everts-calc/local-store.ts`). `node:crypto` bestaat daar niet, en
 * `crypto.subtle.digest` is asynchroon en dus onbruikbaar midden in een synchrone mapping.
 *
 * Daarom vier FNV-1a-passes met verschillende beginwaarden, samen 128 bits. Dat is geen
 * cryptografie, en dat hoeft ook niet: de invoer is geen geheim en de sleutelruimte is één opname
 * met een handvol ruimtenamen. Wat wél telt is dat dezelfde invoer altijd hetzelfde id oplevert,
 * zodat een tweede import in dezelfde groepen landt in plaats van een tweede blok te maken.
 */

const FNV_PRIME = 0x01000193

function fnv1a(tekst: string, begin: number): number {
  let hash = begin >>> 0
  for (let i = 0; i < tekst.length; i++) {
    hash ^= tekst.charCodeAt(i)
    hash = Math.imul(hash, FNV_PRIME) >>> 0
  }
  return hash >>> 0
}

const hex8 = (n: number): string => n.toString(16).padStart(8, '0')

/**
 * Zet een sleutel om in een vaste, geldig gevormde UUID.
 *
 * De versie-nibble staat op 5 en de variant-bits op 10xx, zodat Postgres hem als normale uuid
 * accepteert en niemand hem per ongeluk voor een willekeurig gegenereerd id aanziet.
 */
export function uuidVanTekst(sleutel: string): string {
  const a = fnv1a(sleutel, 0x811c9dc5)
  const b = fnv1a(sleutel, 0x9e3779b9)
  const c = fnv1a(sleutel, 0x85ebca6b)
  const d = fnv1a(sleutel, 0xc2b2ae35)
  const hex = `${hex8(a)}${hex8(b)}${hex8(c)}${hex8(d)}`

  const versie = `5${hex.slice(13, 16)}`
  // Variant 10xx: het eerste nibble van blok 4 naar 8/9/a/b trekken.
  const variant = `${'89ab'[parseInt(hex[16], 16) % 4]}${hex.slice(17, 20)}`
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${versie}-${variant}-${hex.slice(20, 32)}`
}

/** De bovengroep van een opname in de calculatie. */
export function opnameGroepId(opnameId: string): string {
  return uuidVanTekst(`opname:groep:${opnameId}`)
}

/** De subgroep per ruimte binnen die bovengroep. */
export function ruimteGroepId(opnameId: string, ruimte: string): string {
  return uuidVanTekst(`opname:ruimte:${opnameId}:${ruimte.trim().toLowerCase()}`)
}

/**
 * Het id van een componentregel.
 *
 * Inclusief de index, want een regel kan meerdere arbeids- of materiaalcomponenten hebben. De
 * import verwijdert eerst alle bestaande componenten van de regel: het aantal kan tussen twee
 * imports verschillen, en dan zouden er anders wezen achterblijven die wél meetellen in het totaal.
 */
export function componentId(regelId: string, index: number): string {
  return uuidVanTekst(`opname:component:${regelId}:${index}`)
}
