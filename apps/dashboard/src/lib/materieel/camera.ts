'use client'

/**
 * Camera-toestemming en -stream voor de QR-scanner.
 *
 * Waarom deze laag bestaat: EVA vroeg op de telefoon bij elke scanronde opnieuw
 * om toestemming voor de camera. Dat kwam voor een deel door EVA zelf:
 *
 * 1. Elk scanscherm vroeg zijn **eigen** camerastream aan en zette hem bij het
 *    verlaten meteen weer uit. Tijdens een stickerronde ga je continu heen en
 *    weer — scannen → koppelen → paspoort → scannen — en dat was dus elke keer
 *    een nieuwe aanvraag. Er is nu één gedeelde stream die een korte pauze
 *    tussen twee schermen overleeft.
 * 2. Er werd nergens uitgelezen óf de toestemming al vaststond, dus kon EVA ook
 *    niet uitleggen wat er aan de hand was als hij geweigerd bleek. Nu wel — en
 *    hij is vooraf, rustig, te geven op "Mijn gegevens".
 *
 * Wat we níét kunnen: een toestemming afdwingen of bewaren. De browser is daar
 * eigenaar van, net als bij locatie (`lib/locatie/toestemming.ts`). Twee dingen
 * blijven aan de gebruikerskant liggen:
 * - een grant geldt **per herkomst** — een Vercel-preview telt niet mee op het
 *   productieadres;
 * - op iOS heeft de vanaf het beginscherm geïnstalleerde app een eigen
 *   toestemmingslijst; in Safari zelf vervalt de camera-toestemming aan het eind
 *   van de sessie. Blijft iemand het gevraagd krijgen: eerst vragen of EVA als
 *   app geïnstalleerd is.
 */

export type CameraStatus =
  /** Toestemming staat vast: de camera start zonder dat de gebruiker iets ziet. */
  | 'toegestaan'
  /** Geweigerd of geblokkeerd — alleen de gebruiker draait dit terug. */
  | 'geweigerd'
  /** Nog niet beslist: de eerstvolgende start laat de browser de vraag stellen. */
  | 'vragen'
  /** Geen uitsluitsel (browser zonder Permissions API, of nog niet uitgelezen). */
  | 'onbekend'

/** Vangnet voor browsers zonder Permissions API (iOS Safari). */
const SLEUTEL_STATUS = 'eva.camera.status'

/**
 * Hoe lang de camera aan blijft nadat het laatste scherm hem heeft losgelaten.
 *
 * Twintig seconden is een afweging: lang genoeg om het heen-en-weer binnen de
 * scanflow te overbruggen (en daarmee een nieuwe toestemmingsvraag te vermijden),
 * kort genoeg dat het lampje niet minutenlang brandt terwijl iemand allang iets
 * anders doet.
 */
const LOSLAAT_VERTRAGING_MS = 20_000

const VIDEO_EISEN: MediaTrackConstraints = {
  // `ideal` en niet `exact`: op een laptop of een toestel zonder achtercamera
  // zou `exact` de hele scanner laten falen.
  facingMode: { ideal: 'environment' },
  width: { ideal: 1280 },
  height: { ideal: 720 },
}

let gedeeld: MediaStream | null = null
let gebruikers = 0
let opruimen: ReturnType<typeof setTimeout> | null = null
/** Lopende aanvraag, zodat twee schermen tegelijk niet twee vragen opleveren. */
let aanvraag: Promise<MediaStream> | null = null

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

function bewaarStatus(status: CameraStatus): void {
  if (status !== 'onbekend') schrijf(SLEUTEL_STATUS, status)
}

/** De status zoals EVA hem bij de vorige poging zag. */
export function onthoudenStatus(): CameraStatus {
  const s = lees(SLEUTEL_STATUS)
  return s === 'toegestaan' || s === 'geweigerd' || s === 'vragen' ? s : 'onbekend'
}

/**
 * Huidige toestemmingsstatus. Vraagt niets aan de gebruiker — de Permissions API
 * leest alleen uit.
 *
 * Kent de browser 'camera' niet (iOS Safari), dan is het antwoord bewust
 * `onbekend` en níét wat we de vorige keer onthouden hebben. Die herinnering kan
 * namelijk verouderd zijn: wie de camera nu in de instellingen van zijn telefoon
 * alsnog aanzet, zou anders voor altijd "geweigerd" te zien krijgen en de knop om
 * het opnieuw te proberen niet meer vinden. Gebruik `onthoudenStatus()` apart als
 * hint bij de uitleg.
 */
export async function leesStatus(): Promise<CameraStatus> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) return 'onbekend'
  try {
    const res = await navigator.permissions?.query({ name: 'camera' as PermissionName })
    if (res) {
      const status = res.state === 'granted' ? 'toegestaan' : res.state === 'denied' ? 'geweigerd' : 'vragen'
      bewaarStatus(status)
      return status
    }
  } catch {
    /* Permissions API ontbreekt of kent 'camera' niet. */
  }
  return 'onbekend'
}

/** Kan EVA de toestemmingsstand uitlezen, of moet hij het gewoon proberen? */
export function kanStatusLezen(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.permissions?.query
}

function isLevend(stream: MediaStream | null): stream is MediaStream {
  return !!stream && stream.getVideoTracks().some((t) => t.readyState === 'live')
}

function stopEcht(): void {
  gedeeld?.getTracks().forEach((t) => t.stop())
  gedeeld = null
}

/**
 * De camera opvragen. Geeft de al lopende stream terug als die er is — dat is
 * precies wat een tweede toestemmingsvraag voorkomt.
 *
 * Elke geslaagde aanroep hoort precies één `laatLos()` te krijgen.
 */
export async function pakCamera(): Promise<MediaStream> {
  gebruikers += 1
  if (opruimen) { clearTimeout(opruimen); opruimen = null }

  if (isLevend(gedeeld)) return gedeeld
  if (aanvraag) return aanvraag

  if (!navigator.mediaDevices?.getUserMedia) {
    gebruikers = Math.max(0, gebruikers - 1)
    throw Object.assign(new Error('Geen camera beschikbaar'), { name: 'NotFoundError' })
  }

  aanvraag = navigator.mediaDevices
    .getUserMedia({ video: VIDEO_EISEN, audio: false })
    .then((stream) => {
      bewaarStatus('toegestaan')
      // Niemand meer nodig terwijl de vraag openstond (scherm alweer verlaten):
      // meteen weer uit, anders blijft de camera branden zonder kijker.
      if (gebruikers === 0) { stream.getTracks().forEach((t) => t.stop()); return stream }
      gedeeld = stream
      return stream
    })
    .catch((e: unknown) => {
      if ((e as { name?: string }).name === 'NotAllowedError') bewaarStatus('geweigerd')
      gebruikers = Math.max(0, gebruikers - 1)
      throw e
    })
    .finally(() => { aanvraag = null })

  return aanvraag
}

/**
 * Laten weten dat dit scherm de camera niet meer nodig heeft. De stream gaat pas
 * echt uit als niemand hem binnen `LOSLAAT_VERTRAGING_MS` weer oppakt.
 */
export function laatLos(): void {
  gebruikers = Math.max(0, gebruikers - 1)
  if (gebruikers > 0) return
  if (opruimen) clearTimeout(opruimen)
  opruimen = setTimeout(() => {
    opruimen = null
    if (gebruikers === 0) stopEcht()
  }, LOSLAAT_VERTRAGING_MS)
}

/** Camera nu uitzetten, ongeacht de wachttijd. */
export function stopCamera(): void {
  gebruikers = 0
  if (opruimen) { clearTimeout(opruimen); opruimen = null }
  stopEcht()
}

/**
 * Eén keer toestemming vragen zonder te scannen — voor het Toestemmingen-blok op
 * "Mijn gegevens". Het gaat om de grant, niet om het beeld: de camera gaat meteen
 * weer uit en niet pas na de gebruikelijke wachttijd, want op een instellingen-
 * scherm is een lampje dat twintig seconden nabrandt alleen maar verontrustend.
 */
export async function vraagToestemming(): Promise<CameraStatus> {
  try {
    await pakCamera()
    stopCamera()
    return 'toegestaan'
  } catch (e) {
    return (e as { name?: string }).name === 'NotAllowedError' ? 'geweigerd' : 'onbekend'
  }
}

/** Uitleg bij een geweigerde toestemming — die kan alleen de gebruiker terugdraaien. */
export function herstelUitleg(): string {
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent
  if (/iPhone|iPad|iPod/i.test(ua)) {
    return 'De camera staat geblokkeerd voor EVA. Zet hem aan via Instellingen → Safari → Camera, of tik in de adresbalk op "aA" → Website-instellingen → Camera → Sta toe.'
  }
  if (/Android/i.test(ua)) {
    return 'De camera staat geblokkeerd voor EVA. Tik op het slotje in de adresbalk → Machtigingen → Camera → Toestaan.'
  }
  return 'De camera staat geblokkeerd voor EVA. Zet hem aan in de site-instellingen van je browser.'
}

// De pagina wordt echt verlaten: camera niet laten hangen.
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => stopCamera())
}
