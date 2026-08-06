'use client'

import { useCallback, useEffect, useState } from 'react'

/**
 * Locatie-toestemming en -ophalen voor EVA (met name EVA Mobiel).
 *
 * Waarom deze laag bestaat: de telefoon vroeg bij élk locatieveld opnieuw om toestemming.
 * De browser bewaart een verleende toestemming zelf (per herkomst), maar EVA hielp daar
 * niet bij mee:
 *
 * 1. Er werd altijd een verse `getCurrentPosition` afgevuurd, óók als er net een positie
 *    was opgehaald. Zonder `maximumAge` mag de browser geen bewaarde fix teruggeven, dus
 *    ging het toestel elke keer opnieuw de GPS in — met op iOS opnieuw de vraag erbij.
 * 2. Zonder `timeout` keert de aanroep bij een zwakke fix nóóit terug. Voor de monteur is
 *    dat niet te onderscheiden van "hij vraagt het weer" — hij tikt nog eens, en nog eens.
 * 3. Er werd nergens bijgehouden dát toestemming al gegeven (of juist geweigerd) was, dus
 *    kon EVA ook geen uitleg tonen: een geweigerde toestemming gaf dezelfde kale melding
 *    als een mislukte fix.
 *
 * Deze module lost dat op door de laatst bekende positie én de toestemmingsstatus op het
 * toestel te onthouden, en pas een nieuwe uitvraag te doen als dat echt nodig is.
 *
 * Wat we níét kunnen: een toestemming afdwingen. De browser is daar eigenaar van. Twee
 * dingen blijven daarom altijd aan de gebruikerskant liggen:
 * - Een toestemming geldt per herkomst (domein). Een grant op een Vercel-previewadres
 *   telt niet mee op het productieadres — test dus altijd op het echte adres.
 * - Op iOS heeft de vanaf het beginscherm geïnstalleerde PWA een eigen toestemmingslijst,
 *   los van Safari. Wie EVA installeert, geeft toestemming één keer opnieuw en houdt hem
 *   daarna — in Safari zelf vervalt hij standaard aan het eind van de sessie.
 */

export type LocatieStatus =
  /** Toestemming staat vast: ophalen kan zonder dat de gebruiker iets ziet. */
  | 'toegestaan'
  /** Geweigerd of geblokkeerd — alleen de gebruiker kan dit terugdraaien in de instellingen. */
  | 'geweigerd'
  /** Nog niet beslist: de eerstvolgende aanroep laat de browser de vraag stellen. */
  | 'vragen'
  /** Browser geeft geen uitsluitsel (geen Permissions API, of nog niet uitgelezen). */
  | 'onbekend'

export type Locatie = {
  lat: number
  lng: number
  /** Nauwkeurigheid in meters zoals het toestel die opgeeft; null als onbekend. */
  nauwkeurigheid: number | null
  /** Moment van de fix (ms sinds epoch) — bepaalt of hij nog bruikbaar is. */
  opgehaaldOp: number
}

/** Bewaarde fix. Bewust localStorage: dit is toestelgebonden en moet een herstart overleven. */
const SLEUTEL_FIX = 'eva.locatie.laatste'
/** Onthouden status, als vangnet voor browsers zonder Permissions API (iOS Safari). */
const SLEUTEL_STATUS = 'eva.locatie.status'

/**
 * Hoe oud een bewaarde positie mag zijn voordat er een nieuwe wordt gevraagd.
 * Vijf minuten: lang genoeg om een reeks velden of formulieren op hetzelfde adres in te
 * vullen zonder tussentijdse vraag, kort genoeg om na een rit naar het volgende werk een
 * verse positie te pakken.
 */
export const STANDAARD_MAX_LEEFTIJD_MS = 5 * 60_000

/** Zonder limiet blijft een aanroep bij slechte ontvangst eindeloos hangen. */
const STANDAARD_TIMEOUT_MS = 15_000

export type LocatieFoutSoort = 'geen-gps' | 'geweigerd' | 'geen-fix' | 'te-traag'

export class LocatieFout extends Error {
  soort: LocatieFoutSoort
  /** Laatst bekende positie, ook als die te oud was — de aanroeper mag hem alsnog aanbieden. */
  laatstBekend: Locatie | null

  constructor(soort: LocatieFoutSoort, message: string, laatstBekend: Locatie | null = null) {
    super(message)
    this.name = 'LocatieFout'
    this.soort = soort
    this.laatstBekend = laatstBekend
  }
}

// ─── Opslag ────────────────────────────────────────────────────────────────────────────

/** localStorage kan gooien (Safari privémodus, storage vol). Nooit de flow laten breken. */
function lees(sleutel: string): string | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage.getItem(sleutel)
  } catch {
    return null
  }
}

function schrijf(sleutel: string, waarde: string): void {
  try {
    if (typeof window !== 'undefined') window.localStorage.setItem(sleutel, waarde)
  } catch {
    /* stil: onthouden is een verbetering, geen voorwaarde */
  }
}

function isLocatie(x: unknown): x is Locatie {
  const o = x as Locatie | null
  return !!o && typeof o.lat === 'number' && typeof o.lng === 'number' && typeof o.opgehaaldOp === 'number'
}

/**
 * De bewaarde positie, of null als er geen is of hij ouder is dan `maxLeeftijdMs`.
 * Met `maxLeeftijdMs = Infinity` krijg je de laatst bekende positie, hoe oud ook.
 */
export function laatsteLocatie(maxLeeftijdMs = STANDAARD_MAX_LEEFTIJD_MS): Locatie | null {
  const ruw = lees(SLEUTEL_FIX)
  if (!ruw) return null
  try {
    const fix: unknown = JSON.parse(ruw)
    if (!isLocatie(fix)) return null
    if (Date.now() - fix.opgehaaldOp > maxLeeftijdMs) return null
    return fix
  } catch {
    return null
  }
}

function bewaarLocatie(fix: Locatie): void {
  schrijf(SLEUTEL_FIX, JSON.stringify(fix))
}

/** De status zoals EVA hem bij de vorige poging heeft gezien. */
export function onthoudenStatus(): LocatieStatus {
  const s = lees(SLEUTEL_STATUS)
  return s === 'toegestaan' || s === 'geweigerd' || s === 'vragen' ? s : 'onbekend'
}

function bewaarStatus(status: LocatieStatus): void {
  if (status === 'onbekend') return
  schrijf(SLEUTEL_STATUS, status)
}

// ─── Status uitlezen ───────────────────────────────────────────────────────────────────

function alsStatus(state: PermissionState): LocatieStatus {
  return state === 'granted' ? 'toegestaan' : state === 'denied' ? 'geweigerd' : 'vragen'
}

/**
 * Huidige toestemmingsstatus. Vraagt niets aan de gebruiker — de Permissions API leest
 * alleen uit. Browsers zonder die API (iOS Safari tot voor kort) vallen terug op wat we
 * zelf onthouden hebben.
 */
export async function leesStatus(): Promise<LocatieStatus> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return 'onbekend'
  try {
    const res = await navigator.permissions?.query({ name: 'geolocation' as PermissionName })
    if (res) {
      const status = alsStatus(res.state)
      bewaarStatus(status)
      return status
    }
  } catch {
    /* Permissions API ontbreekt of kent 'geolocation' niet — vangnet hieronder. */
  }
  return onthoudenStatus()
}

/**
 * Volgt de toestemming en meldt wijzigingen (bijv. de gebruiker zet hem in de
 * telefooninstellingen weer aan). Geeft een opruimfunctie terug.
 */
export function volgStatus(bij: (status: LocatieStatus) => void): () => void {
  let actief = true
  let res: PermissionStatus | null = null

  const opWijziging = () => {
    if (!actief || !res) return
    const status = alsStatus(res.state)
    bewaarStatus(status)
    bij(status)
  }

  void (async () => {
    const eerste = await leesStatus()
    if (actief) bij(eerste)
    try {
      res = (await navigator.permissions?.query({ name: 'geolocation' as PermissionName })) ?? null
      if (actief && res) res.addEventListener('change', opWijziging)
      else res = null
    } catch {
      res = null
    }
  })()

  return () => {
    actief = false
    res?.removeEventListener('change', opWijziging)
  }
}

// ─── Ophalen ───────────────────────────────────────────────────────────────────────────

export type HaalOpties = {
  /** Hoe oud een bewaarde positie mag zijn. Standaard vijf minuten. */
  maxLeeftijdMs?: number
  /** Forceer een verse fix (knop "Vernieuwen"): negeert alles wat bewaard is. */
  vernieuwen?: boolean
  timeoutMs?: number
}

/**
 * Haalt de locatie op — bij voorkeur uit wat er al ligt.
 *
 * Volgorde: eigen bewaarde fix → fix uit de browser (`maximumAge`, dus zonder nieuwe
 * uitvraag) → verse meting. Alleen die laatste stap kan een toestemmingsvraag opleveren,
 * en dan alleen als de gebruiker die nog nooit beantwoord heeft.
 */
export async function haalLocatie(opties: HaalOpties = {}): Promise<Locatie> {
  const maxLeeftijd = opties.vernieuwen ? 0 : opties.maxLeeftijdMs ?? STANDAARD_MAX_LEEFTIJD_MS

  const bewaard = laatsteLocatie(maxLeeftijd)
  if (bewaard) return bewaard

  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    throw new LocatieFout('geen-gps', 'Deze browser geeft geen locatie door.')
  }

  return new Promise<Locatie>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const fix: Locatie = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          nauwkeurigheid: Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : null,
          opgehaaldOp: pos.timestamp || Date.now(),
        }
        bewaarLocatie(fix)
        bewaarStatus('toegestaan')
        resolve(fix)
      },
      (err) => {
        // Ook bij een fout is de laatst bekende positie waardevol: op een binnenlocatie
        // haalt het toestel soms geen fix, terwijl die van tien minuten geleden prima is.
        const laatst = laatsteLocatie(Infinity)
        if (err.code === err.PERMISSION_DENIED) {
          bewaarStatus('geweigerd')
          reject(new LocatieFout('geweigerd', 'EVA mag je locatie niet gebruiken.', laatst))
          return
        }
        if (err.code === err.TIMEOUT) {
          reject(new LocatieFout('te-traag', 'Locatie duurde te lang. Ga eventueel even naar buiten.', laatst))
          return
        }
        reject(new LocatieFout('geen-fix', 'Locatie ophalen lukte niet.', laatst))
      },
      {
        enableHighAccuracy: true,
        timeout: opties.timeoutMs ?? STANDAARD_TIMEOUT_MS,
        // De sleutel tot minder vragen: de browser mag zijn eigen bewaarde fix teruggeven.
        maximumAge: maxLeeftijd,
      }
    )
  })
}

/** Uitleg bij een geweigerde toestemming, toegesneden op het toestel. */
export function herstelUitleg(): string {
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent
  if (/iPhone|iPad|iPod/i.test(ua)) {
    return 'Zet locatie aan via Instellingen → Safari → Locatie (of Instellingen → Privacy → Locatievoorzieningen). Installeer EVA op je beginscherm: dan hoef je het maar één keer te doen.'
  }
  if (/Android/i.test(ua)) {
    return 'Tik op het slotje in de adresbalk → Machtigingen → Locatie, en kies "Toestaan".'
  }
  return 'Zet locatie voor EVA weer aan in de instellingen van je browser.'
}

// ─── Hook ──────────────────────────────────────────────────────────────────────────────

export type LocatieHaken = {
  status: LocatieStatus
  bezig: boolean
  fout: LocatieFout | null
  locatie: Locatie | null
  /** Haalt de locatie op (cache-first) en zet `locatie`. Geeft null terug bij een fout. */
  vraagLocatie: (opties?: HaalOpties) => Promise<Locatie | null>
}

/**
 * React-kant van bovenstaande: houdt de toestemmingsstatus bij en biedt één actie om de
 * locatie op te halen. De status komt binnen zónder de gebruiker iets te vragen, zodat de
 * knop meteen de juiste tekst kan tonen.
 */
export function useLocatie(): LocatieHaken {
  const [status, setStatus] = useState<LocatieStatus>('onbekend')
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState<LocatieFout | null>(null)
  const [locatie, setLocatie] = useState<Locatie | null>(null)

  useEffect(() => volgStatus(setStatus), [])

  const vraagLocatie = useCallback(async (opties?: HaalOpties) => {
    setBezig(true)
    setFout(null)
    try {
      const fix = await haalLocatie(opties)
      setLocatie(fix)
      setStatus('toegestaan')
      return fix
    } catch (e) {
      const f = e instanceof LocatieFout ? e : new LocatieFout('geen-fix', 'Locatie ophalen lukte niet.')
      setFout(f)
      if (f.soort === 'geweigerd') setStatus('geweigerd')
      return null
    } finally {
      setBezig(false)
    }
  }, [])

  return { status, bezig, fout, locatie, vraagLocatie }
}
