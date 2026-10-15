import { SAMENVATTING_ONLEESBAAR } from './types'

/** Lang genoeg voor twee zinnen; het belletje en de telefoon kappen daarna toch af. */
const MAX_TEKENS = 300

/**
 * Waar de mail over gaat, voor de melding aan de projectleider.
 *
 * Bij voorkeur de samenvatting die de AI bij binnenkomst opstelde -- die zegt in één
 * of twee zinnen wat er gevraagd of gemeld wordt. Ontbreekt die (de mail is vóór het
 * lezen al uitgefilterd) of kon de AI hem niet lezen, dan het begin van de mail zelf.
 * Is er ook dat niet, dan niets: liever geen regel dan een lege of misleidende.
 */
export function waarGaatHetOver(samenvatting: string | null, bodyPreview: string | null): string | null {
  const s = (samenvatting ?? '').trim()
  if (s && s !== SAMENVATTING_ONLEESBAAR) return kort(s)

  const p = (bodyPreview ?? '').replace(/\s+/g, ' ').trim()
  return p ? kort(p) : null
}

function kort(tekst: string): string {
  return tekst.length <= MAX_TEKENS ? tekst : `${tekst.slice(0, MAX_TEKENS - 1).trimEnd()}…`
}
