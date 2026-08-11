'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Pushmeldingen aan- en uitzetten in de browser.
 *
 * De drie lagen die alle drie moeten kloppen voordat er een melding binnenkomt:
 *   1. toestemming van de gebruiker (Notification.permission),
 *   2. een abonnement bij de pushdienst van de browser (PushManager),
 *   3. dat abonnement opgeslagen bij EVA (/api/push/aanmelden).
 *
 * Laag 2 en 3 kunnen uit de pas lopen — een gebruiker kan het abonnement in de
 * browserinstellingen weggooien, en EVA gooit dode endpoints zelf weg. Daarom
 * synchroniseert deze hook bij het laden: staat alles lokaal aan, dan wordt het
 * abonnement opnieuw naar de server gestuurd (upsert, dus dat is gratis).
 */

export type PushStatus =
  /** Nog aan het kijken hoe het ervoor staat. */
  | 'laden'
  /** Browser kan geen push (oudere iOS-Safari, sommige desktopbrowsers). */
  | 'niet-ondersteund'
  /** Geen service worker actief — in de dev-omgeving is dat normaal. */
  | 'geen-sw'
  /**
   * iPhone/iPad in de browser i.p.v. de geïnstalleerde app. Bewust een eigen stand
   * en niet 'geweigerd': Safari zet `Notification.permission` daar uit zichzelf op
   * `denied` zonder dat de gebruiker ooit iets is gevraagd. Dat als "geweigerd"
   * tonen stuurt iemand de telefooninstellingen in op zoek naar een schakelaar die
   * er niet is, terwijl de echte oplossing "zet EVA op je beginscherm" is.
   */
  | 'installeren'
  /** Kan aangezet worden. */
  | 'uit'
  /** Staat aan op dit apparaat. */
  | 'aan'
  /** Gebruiker heeft geweigerd; alleen te herstellen in de browserinstellingen. */
  | 'geweigerd'

/** VAPID-sleutels reizen als base64url; subscribe() wil er bytes van. */
function sleutelNaarBytes(base64url: string): ArrayBuffer {
  const opvulling = '='.repeat((4 - (base64url.length % 4)) % 4)
  const base64 = (base64url + opvulling).replace(/-/g, '+').replace(/_/g, '/')
  const rauw = atob(base64)
  const buffer = new ArrayBuffer(rauw.length)
  const bytes = new Uint8Array(buffer)
  for (let i = 0; i < rauw.length; i++) bytes[i] = rauw.charCodeAt(i)
  return buffer
}

function ondersteund(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

/** Draait EVA als geïnstalleerde app? Op iOS is dat de voorwaarde voor push. */
export function isGeinstalleerd(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false
  return /iPhone|iPad|iPod/i.test(navigator.userAgent)
}

async function bewaarBijEva(abonnement: PushSubscription): Promise<boolean> {
  const antwoord = await fetch('/api/push/aanmelden', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(abonnement.toJSON()),
  })
  return antwoord.ok
}

export function usePush() {
  const [status, setStatus] = useState<PushStatus>('laden')
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState<string | null>(null)
  const sleutelRef = useRef<{ beschikbaar?: boolean; publicKey?: string; reden?: string } | null>(null)

  /**
   * Bepaalt de huidige stand. De volgorde is niet vrijblijvend: de iOS-controle
   * staat vóór de ondersteuningscontrole, omdat Safari op de iPhone buiten de
   * geïnstalleerde app óf `PushManager` verzwijgt óf de toestemming meteen op
   * `denied` zet. Allebei zouden hier als een onoplosbaar probleem landen,
   * terwijl het gewoon "nog niet op het beginscherm gezet" is.
   */
  const bepaalStand = useCallback(async (): Promise<PushStatus> => {
    if (isIOS() && !isGeinstalleerd()) return 'installeren'
    if (!ondersteund()) return 'niet-ondersteund'

    // Bewust getRegistration() en niet .ready: zonder service worker (dev)
    // blijft .ready eeuwig hangen en blijft de knop op "laden" staan.
    const registratie = await navigator.serviceWorker.getRegistration()
    if (!registratie) return 'geen-sw'
    if (Notification.permission === 'denied') return 'geweigerd'

    const abonnement = await registratie.pushManager.getSubscription()
    if (abonnement && Notification.permission === 'granted') {
      // Hersynchroniseren: het abonnement kan bij EVA zijn opgeruimd (dood
      // endpoint) terwijl de telefoon het nog heeft. Upsert, dus gratis.
      await bewaarBijEva(abonnement).catch(() => false)
      return 'aan'
    }
    return 'uit'
  }, [])

  useEffect(() => {
    let afgebroken = false
    bepaalStand()
      .then(s => { if (!afgebroken) setStatus(s) })
      .catch(() => { if (!afgebroken) setStatus('uit') })
    // Sleutel vast klaarzetten (zie `aanzetten`).
    fetch('/api/push/sleutel')
      .then(r => r.json())
      .then(s => { if (!afgebroken) sleutelRef.current = s })
      .catch(() => { /* dan haalt aanzetten() hem alsnog op */ })
    return () => { afgebroken = true }
  }, [bepaalStand])

  /**
   * Opnieuw kijken na een wijziging buiten EVA om — toestemming teruggezet in de
   * telefooninstellingen, of EVA alsnog op het beginscherm gezet. De browser
   * vertelt zoiets niet uit zichzelf, dus zonder deze knop is de enige uitweg
   * "app helemaal afsluiten en opnieuw openen".
   */
  const hercontroleer = useCallback(async () => {
    setFout(null)
    setBezig(true)
    try {
      setStatus(await bepaalStand())
    } catch {
      setStatus('uit')
    } finally {
      setBezig(false)
    }
  }, [bepaalStand])

  const aanzetten = useCallback(async () => {
    setFout(null)
    setBezig(true)
    try {
      if (!('Notification' in window)) { setStatus('niet-ondersteund'); return }

      // MOET de eerste await van deze functie zijn. Safari (iOS) accepteert
      // requestPermission alleen als de aanroep nog binnen de klik van de
      // gebruiker valt; staat er één await vóór — al is het maar het opvragen
      // van de service worker — dan is die klik "op" en wijst Safari het verzoek
      // af zonder iets te vragen. De schakelaar sprong dan meteen op "geweigerd"
      // terwijl de gebruiker nooit iets te zien had gekregen. Chrome is hier
      // soepeler, vandaar dat het op de desktop wél werkte.
      const toestemming = await Notification.requestPermission()
      if (toestemming === 'denied') { setStatus('geweigerd'); return }
      if (toestemming !== 'granted') { setStatus('uit'); return }

      const registratie = await navigator.serviceWorker.getRegistration()
      if (!registratie) { setStatus('geen-sw'); return }

      // Bij voorkeur de sleutel die bij het laden al is opgehaald: hoe minder er
      // tussen de klik en subscribe() zit, hoe kleiner de kans dat Safari de
      // aanroep als "niet meer bij de klik horend" beschouwt.
      const sleutel = sleutelRef.current ?? await fetch('/api/push/sleutel').then(r => r.json())
      if (!sleutel?.beschikbaar) {
        setFout(
          sleutel?.reden === 'ongeldig'
            ? 'De sleutels voor pushmeldingen worden niet geaccepteerd. Controleer VAPID_SUBJECT (moet met mailto: of https:// beginnen) en of het sleutelpaar bij elkaar hoort — de details staan in het foutenlogboek.'
            : 'Pushmeldingen zijn op deze omgeving nog niet ingesteld: VAPID_PUBLIC_KEY en VAPID_PRIVATE_KEY ontbreken in deze deploy. Nieuwe omgevingsvariabelen komen pas mee in een deploy die ná het instellen is gemaakt.',
        )
        setStatus('uit')
        return
      }

      const abonnement =
        (await registratie.pushManager.getSubscription()) ??
        (await registratie.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: sleutelNaarBytes(sleutel.publicKey),
        }))

      if (!(await bewaarBijEva(abonnement))) {
        setFout('Aanmelden bij EVA is niet gelukt. Probeer het opnieuw.')
        setStatus('uit')
        return
      }
      setStatus('aan')
    } catch (e) {
      setFout((e as Error)?.message ?? 'Aanzetten is niet gelukt.')
      setStatus('uit')
    } finally {
      setBezig(false)
    }
  }, [])

  const uitzetten = useCallback(async () => {
    setFout(null)
    setBezig(true)
    try {
      const registratie = await navigator.serviceWorker.getRegistration()
      const abonnement = await registratie?.pushManager.getSubscription()
      if (abonnement) {
        // Eerst bij EVA afmelden: lukt het opzeggen bij de pushdienst niet, dan
        // stuurt EVA in elk geval niets meer.
        await fetch('/api/push/afmelden', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: abonnement.endpoint }),
        }).catch(() => null)
        await abonnement.unsubscribe().catch(() => null)
      }
      setStatus('uit')
    } finally {
      setBezig(false)
    }
  }, [])

  const testen = useCallback(async (): Promise<boolean> => {
    setFout(null)
    setBezig(true)
    try {
      const antwoord = await fetch('/api/push/test', { method: 'POST' })
      const data = await antwoord.json().catch(() => ({}))
      if (!data?.ok) {
        setFout('Er kon geen testmelding worden verstuurd naar dit apparaat.')
        return false
      }
      return true
    } catch {
      setFout('Er kon geen testmelding worden verstuurd.')
      return false
    } finally {
      setBezig(false)
    }
  }, [])

  return { status, bezig, fout, aanzetten, uitzetten, testen, hercontroleer }
}
