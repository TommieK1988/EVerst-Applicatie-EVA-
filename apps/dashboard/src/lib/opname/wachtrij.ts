'use client'

/**
 * Offline-wachtrij voor de opname: doorwerken als de verbinding even wegvalt.
 *
 * ── Scope ───────────────────────────────────────────────────────────────────
 *
 * WEL: doorwerken terwijl het scherm al openstaat, en automatisch nasturen zodra er weer bereik is.
 * NIET: het scherm openen zonder verbinding, offline inloggen, offline importeren naar de
 * calculatie. `public/sw.js` blijft dus ongemoeid — geen runtime-caching, geen Background Sync
 * (iOS Safari heeft dat laatste niet, en de buitendienst zit deels op een iPhone).
 *
 * ── Waarom IndexedDB en niet localStorage ───────────────────────────────────
 *
 * Er moeten fotoblobs in. localStorage kan alleen strings en zit op ~5 MB; twee verkleinde foto's
 * als base64 vullen dat al voor een derde.
 *
 * ── Waarom dit veilig is om opnieuw te versturen ────────────────────────────
 *
 * De client genereert de uuid's (regel-id, foto-id) vóórdat de mutatie de deur uit gaat, en de
 * server doet `upsert on conflict (id)`. Een mutatie die tóch aankwam maar waarvan het antwoord
 * onderweg verdween, levert bij een tweede poging dus geen dubbele regel op. `client_bijgewerkt_op`
 * bepaalt last-write-wins wanneer twee versies van dezelfde regel binnenkomen.
 *
 * ── Onderscheid tussen "geen bereik" en "de server zegt nee" ────────────────
 *
 * Een server-action die niet aankomt GOOIT (netwerkfout) — dan blijft de mutatie staan en proberen
 * we het later opnieuw. Een action die wél aankomt maar `{ ok: false }` teruggeeft is een inhoudelijk
 * bezwaar ("opname al afgerond"); eindeloos opnieuw proberen lost dat nooit op, dus die mutatie
 * gaat eruit en de gebruiker krijgt de melding te zien.
 */

const DB_NAAM = 'eva-opname'
const DB_VERSIE = 1
const STORE_MUTATIES = 'mutaties'

/** Na zoveel vergeefse pogingen geven we het op en melden we het. */
const MAX_POGINGEN = 8
/** Interval waarmee opnieuw wordt geprobeerd zolang de wachtrij niet leeg is. */
export const HERPROBEER_MS = 15_000

export type MutatieSoort = 'regel_upsert' | 'regel_verwijder' | 'foto_upload'

export type Mutatie = {
  id: string
  opname_id: string
  soort: MutatieSoort
  /** Serialiseerbare gegevens; bij een foto zit het bestand in `blob`. */
  payload: Record<string, unknown>
  blob?: Blob
  poging: number
  aangemaakt_op: number
}

/**
 * Verwerkt één mutatie. Gooien = tijdelijk, opnieuw proberen. `{ ok: false }` = definitief.
 * De schermen registreren hun eigen afhandelaars, zodat dit bestand niets van server-actions weet.
 */
export type Afhandelaar = (mutatie: Mutatie) => Promise<{ ok: true } | { ok: false; error: string }>

const afhandelaars = new Map<MutatieSoort, Afhandelaar>()

export function registreerAfhandelaar(soort: MutatieSoort, fn: Afhandelaar): void {
  afhandelaars.set(soort, fn)
}

/* ─────────────────────────────── IndexedDB ───────────────────────────────── */

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const verzoek = indexedDB.open(DB_NAAM, DB_VERSIE)
    verzoek.onupgradeneeded = () => {
      const db = verzoek.result
      if (!db.objectStoreNames.contains(STORE_MUTATIES)) {
        const store = db.createObjectStore(STORE_MUTATIES, { keyPath: 'id' })
        store.createIndex('aangemaakt_op', 'aangemaakt_op')
      }
    }
    verzoek.onsuccess = () => resolve(verzoek.result)
    verzoek.onerror = () => reject(verzoek.error ?? new Error('IndexedDB openen mislukt'))
  })
}

function transactie<T>(
  modus: IDBTransactionMode,
  werk: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    db =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE_MUTATIES, modus)
        const verzoek = werk(tx.objectStore(STORE_MUTATIES))
        verzoek.onsuccess = () => resolve(verzoek.result)
        verzoek.onerror = () => reject(verzoek.error ?? new Error('IndexedDB-bewerking mislukt'))
        tx.oncomplete = () => db.close()
      }),
  )
}

/* ─────────────────────────────── Abonnees ────────────────────────────────── */

type Luisteraar = (aantal: number) => void
const luisteraars = new Set<Luisteraar>()
let laatsteAantal = 0

function meldAantal(aantal: number) {
  laatsteAantal = aantal
  for (const fn of luisteraars) fn(aantal)
}

/** Abonneert op het aantal wachtende mutaties. Retourneert de opzegfunctie. */
export function abonneerOpWachtrij(fn: Luisteraar): () => void {
  luisteraars.add(fn)
  fn(laatsteAantal)
  void wachtrijAantal().then(meldAantal)
  return () => {
    luisteraars.delete(fn)
  }
}

export async function wachtrijAantal(): Promise<number> {
  if (typeof indexedDB === 'undefined') return 0
  try {
    return await transactie<number>('readonly', store => store.count())
  } catch {
    // Privémodus of geblokkeerde opslag: dan is er geen wachtrij en werkt alles online-only.
    return 0
  }
}

/* ─────────────────────────────── Wachtrij ────────────────────────────────── */

/**
 * Zet een mutatie in de wachtrij en probeert hem meteen te versturen.
 *
 * Bewust in deze volgorde: eerst opslaan, dán versturen. Andersom raak je de mutatie kwijt als het
 * scherm precies tussen verzenden en opslaan wordt gesloten.
 */
export async function zetInWachtrij(
  mutatie: Omit<Mutatie, 'poging' | 'aangemaakt_op'>,
): Promise<void> {
  const volledig: Mutatie = { ...mutatie, poging: 0, aangemaakt_op: Date.now() }
  try {
    await transactie('readwrite', store => store.put(volledig))
  } catch {
    // Geen IndexedDB beschikbaar: direct proberen en de fout laten opborrelen bij de aanroeper.
    const fn = afhandelaars.get(volledig.soort)
    if (fn) await fn(volledig)
    return
  }
  meldAantal(await wachtrijAantal())
  await verwerkWachtrij()
}

/**
 * Haalt een nog niet verstuurde mutatie uit de wachtrij.
 *
 * Voor "toevoegen en meteen weer weghalen": een foto die de opnemer verkeerd nam moet ook zónder
 * verbinding weg kunnen. Een al verstuurde mutatie staat er niet meer in, en dan is dit een no-op —
 * die wordt langs de normale weg verwijderd.
 */
export async function verwijderUitWachtrij(id: string): Promise<void> {
  if (typeof indexedDB === 'undefined') return
  try {
    await transactie('readwrite', store => store.delete(id))
    meldAantal(await wachtrijAantal())
  } catch {
    /* geen wachtrij beschikbaar */
  }
}

let bezig = false

/**
 * Werkt de wachtrij af, oudste eerst.
 *
 * Stopt bij de eerste tijdelijke fout: de volgorde doet ertoe (een foto bij een regel die nog niet
 * bestaat wordt geweigerd), dus doorgaan met de volgende zou alleen maar meer fouten opleveren.
 */
export async function verwerkWachtrij(): Promise<{ verwerkt: number; fouten: string[] }> {
  if (bezig || typeof indexedDB === 'undefined') return { verwerkt: 0, fouten: [] }
  bezig = true
  const fouten: string[] = []
  let verwerkt = 0

  try {
    const alle = await transactie<Mutatie[]>('readonly', store => store.getAll())
    alle.sort((a, b) => a.aangemaakt_op - b.aangemaakt_op)

    for (const mutatie of alle) {
      const fn = afhandelaars.get(mutatie.soort)
      if (!fn) {
        // Geen afhandelaar geregistreerd (ander scherm open): laten staan voor later.
        continue
      }
      try {
        const res = await fn(mutatie)
        if (res.ok) {
          await transactie('readwrite', store => store.delete(mutatie.id))
          verwerkt += 1
          continue
        }
        // Inhoudelijk bezwaar: opnieuw proberen lost dit nooit op.
        fouten.push(res.error)
        await transactie('readwrite', store => store.delete(mutatie.id))
      } catch {
        // Netwerkfout: laten staan en later opnieuw. Bij aanhoudend falen alsnog opgeven, anders
        // blijft de opname eeuwig "niet verstuurd" en kan hij nooit worden afgerond.
        const poging = mutatie.poging + 1
        if (poging >= MAX_POGINGEN) {
          fouten.push('Een wijziging kon na meerdere pogingen niet worden verstuurd.')
          await transactie('readwrite', store => store.delete(mutatie.id))
        } else {
          await transactie('readwrite', store => store.put({ ...mutatie, poging }))
        }
        break
      }
    }
  } finally {
    bezig = false
    meldAantal(await wachtrijAantal())
  }

  return { verwerkt, fouten }
}

/**
 * Houdt de wachtrij vanzelf leeg zolang het scherm openstaat.
 *
 * Drie aanjagers: terug online, scherm weer op de voorgrond, en een interval zolang er iets staat
 * te wachten. Retourneert de opruimfunctie voor het effect dat hem startte.
 */
export function startWachtrijLus(): () => void {
  if (typeof window === 'undefined') return () => {}

  const probeer = () => void verwerkWachtrij()
  const bijZichtbaar = () => {
    if (document.visibilityState === 'visible') probeer()
  }

  window.addEventListener('online', probeer)
  document.addEventListener('visibilitychange', bijZichtbaar)
  const timer = window.setInterval(() => {
    if (laatsteAantal > 0) probeer()
  }, HERPROBEER_MS)

  probeer()

  return () => {
    window.removeEventListener('online', probeer)
    document.removeEventListener('visibilitychange', bijZichtbaar)
    window.clearInterval(timer)
  }
}
