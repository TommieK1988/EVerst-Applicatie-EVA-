import 'server-only'
import { createAdminClient } from '@everts/database/server'

/**
 * Schrijfweg naar het foutenlogboek (/instellingen/foutenlog).
 *
 * Aanroepers:
 *   * src/instrumentation.ts   — onRequestError, vangt elke onafgevangen serverfout
 *   * api/fouten/melden        — fouten die in de browser van de gebruiker klappen
 *   * handmatig, in catch-blokken waar een fout nu stil verdwijnt
 *
 * Deze module gooit NOOIT. Hij draait in de foutafhandeling zelf; een logger die de
 * request sloopt is erger dan geen logger.
 */

export type FoutOmgeving = 'server' | 'browser' | 'cron'

export type FoutInvoer = {
  omgeving: FoutOmgeving
  /** Route-patroon, niet het concrete pad: '/dossiers/[id]', niet '/dossiers/abc-123'. */
  bron: string
  melding: string
  soort?: string | null
  fout_type?: string | null
  stack?: string | null
  digest?: string | null
  url?: string | null
  medewerker_id?: string | null
  extra?: Record<string, unknown> | null
}

const MAX_MELDING = 500
const MAX_STACK = 8_000
const MAX_URL = 500
const MAX_BRON = 200

/**
 * Fouten die geen incident zijn. `GeenToegangError` (lib/auth/rechten.ts) is een nette
 * 403 en NEXT_REDIRECT/NEXT_NOT_FOUND zijn Next-controlestromen, geen mankement — die
 * bereiken onRequestError wel maar horen niet in de lijst.
 */
export function isVerwachteFout(fout: unknown): boolean {
  if (!fout || typeof fout !== 'object') return false
  const e = fout as { name?: unknown; digest?: unknown; message?: unknown }

  if (e.name === 'GeenToegangError') return true

  const digest = typeof e.digest === 'string' ? e.digest : ''
  if (digest.startsWith('NEXT_REDIRECT') || digest === 'NEXT_NOT_FOUND' || digest === 'DYNAMIC_SERVER_USAGE') return true

  // Gebruiker navigeert weg of sluit het tabblad tijdens een request. Ruis, geen bug.
  const melding = typeof e.message === 'string' ? e.message : ''
  if (e.name === 'AbortError' || /aborted|ECONNRESET/i.test(melding)) return true

  return false
}

/**
 * Maakt van een melding een stabiele vorm door variabele delen weg te strepen. Zonder
 * dit is "Rij 4f2a-… niet gevonden" elke keer een nieuwe fingerprint en dus een nieuwe
 * rij, waarmee het hele dedupliceren waardeloos wordt.
 *
 * Volgorde is bewust: UUID's vóór hex vóór losse getallen — anders vreet de
 * getallenregel de UUID's half op.
 */
export function normaliseerMelding(melding: string): string {
  return melding
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '{id}')
    .replace(/\d{4}-\d{2}-\d{2}(?:[T ][\d:.]+Z?)?/g, '{datum}')
    .replace(/\b[0-9a-f]{8,}\b/gi, '{hex}')
    .replace(/\b\d{4,}\b/g, '{n}')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * SHA-256 via de Web Crypto API — bewust niet node:crypto. instrumentation.ts wordt ook
 * voor de edge-runtime gebundeld, en daar bestaat `node:crypto` niet; webpack volgt de
 * importgraaf ook door een dynamische import heen en laat de build klappen. globalThis.crypto
 * bestaat in beide runtimes.
 *
 * 128 bits (32 hex-tekens) is ruim zat: dit is een groepeersleutel, geen beveiliging.
 */
async function sha256(waarde: string): Promise<string> {
  const buffer = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(waarde))
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 32)
}

/**
 * Eerste betekenisvolle padsegment als module-tag: '/dossiers/[id]/offerte' → 'dossiers'.
 *
 * 'api' wordt overgeslagen — anders krijgt élke route-handler dezelfde tag en is de
 * kolom waardeloos om op te filteren. '/api/documenten/pdf' → 'documenten'.
 * Route-groepen als '(platform)' tellen ook niet mee; die zitten niet in de URL.
 */
function leidModuleAf(bron: string, url?: string | null): string | null {
  const pad = bron || url || ''
  const segmenten = pad.split('?')[0].split('/').filter(s => s && !s.startsWith('('))
  const eerste = segmenten[0] === 'api' ? segmenten[1] : segmenten[0]
  return eerste ?? null
}

function kap(waarde: string | null | undefined, max: number): string | null {
  if (!waarde) return null
  const schoon = String(waarde).trim()
  if (!schoon) return null
  return schoon.length > max ? `${schoon.slice(0, max)}…` : schoon
}

/**
 * Registreert één voorval. Identieke fouten worden op `fingerprint` samengevoegd tot
 * één rij met een teller — zie de log_fout()-functie in migratie 20260716f.
 */
export async function logFout(invoer: FoutInvoer): Promise<void> {
  try {
    const melding = kap(invoer.melding, MAX_MELDING) ?? 'Onbekende fout'
    const bron = kap(invoer.bron, MAX_BRON) ?? 'onbekend'

    const fingerprint = await sha256(`${invoer.omgeving}|${bron}|${normaliseerMelding(melding)}`)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = createAdminClient() as any
    const { error } = await admin.rpc('log_fout', {
      p_fingerprint: fingerprint,
      p_omgeving: invoer.omgeving,
      p_bron: bron,
      p_melding: melding,
      p_soort: kap(invoer.soort, 50),
      p_module: leidModuleAf(bron, invoer.url),
      p_fout_type: kap(invoer.fout_type, 100),
      p_stack: kap(invoer.stack, MAX_STACK),
      p_digest: kap(invoer.digest, 100),
      p_url: kap(invoer.url, MAX_URL),
      p_medewerker_id: invoer.medewerker_id ?? null,
      p_extra: invoer.extra ?? null,
    })

    if (error) console.error('[foutenlog] wegschrijven mislukt:', error.message)
  } catch (e) {
    console.error('[foutenlog] logFout faalde:', e)
  }
}

/** Bouwt een FoutInvoer uit een opgevangen `unknown`; scheelt overal hetzelfde geneuzel. */
export function foutNaarInvoer(
  fout: unknown,
  basis: Omit<FoutInvoer, 'melding' | 'fout_type' | 'stack' | 'digest'>,
): FoutInvoer {
  const e = (fout ?? {}) as { name?: string; message?: string; stack?: string; digest?: string }
  return {
    ...basis,
    melding: e.message || String(fout) || 'Onbekende fout',
    fout_type: e.name ?? null,
    stack: e.stack ?? null,
    digest: e.digest ?? null,
  }
}
