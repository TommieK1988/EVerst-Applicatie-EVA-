/**
 * Het model achter "Te doen": welke offerte in welke groep valt, in welke volgorde, en wat de
 * rij laat zien. Puur rekenwerk, gedeeld door de werklijst en de voorbeeldpagina, en te testen.
 *
 * De lijst beantwoordt "wat moet ik vandaag doen?", niet "waar staat de pijplijn?". Daarom
 * groepen op urgentie in plaats van op fase. Wie bovenaan begint en naar beneden werkt, laat
 * niets liggen.
 */

import { berekenKaartBedrag } from '@/components/dossiers/kaart-bedrag'
import type { DossierRij } from '@/components/dossiers/types'
import { dagenTussenKalender } from '@/lib/dossiers/datum-regels'
import { bewakingsStatus, type BewakingStatus, type BewakingKaart } from '@/lib/commercie/types'
import { bedragklasse, type Bedragklasse } from '@/lib/commercie/bedragklassen'
import { alsStilReden, wordtNagebeld, STIL_REDEN_LABEL, type StilReden } from '@/lib/commercie/opvolging'

export type Bak = 'verlopen' | 'vandaag' | 'ongetrieerd' | 'week' | 'later'

/** Volgorde, label en kleur van de groepen. De volgorde is de sortering. */
export const BAKKEN: { bak: Bak; label: string; uitleg: string; kleur: string }[] = [
  { bak: 'verlopen',    label: 'Verlopen',          uitleg: 'De afgesproken datum is voorbij',              kleur: 'var(--error-500)' },
  { bak: 'vandaag',     label: 'Vandaag',           uitleg: 'Nu aan de beurt',                              kleur: 'var(--info-500)' },
  { bak: 'ongetrieerd', label: 'Nog niet opgepakt', uitleg: 'Verzonden, nog zonder eigenaar of vervolgstap', kleur: 'var(--neutral-300)' },
  { bak: 'week',        label: 'Komende 7 dagen',   uitleg: 'Actie of hercontrole staat gepland',           kleur: 'var(--success-500)' },
  { bak: 'later',       label: 'Later',             uitleg: 'Speelt pas over langere tijd, ook uitgesteld werk', kleur: 'var(--neutral-400)' },
]

export const BAK_INDEX = new Map(BAKKEN.map((b, i) => [b.bak, i]))

/** Bedragdrempel waarboven een offerte zonder eigenaar of stap extra opvalt. */
export const AANDACHT_BEDRAG = 20_000

/** Het laatste klantcontact op de kaart; los geladen, want de dossierlijst kent het niet. */
export type LaatsteContact = { op: string; door: string | null; kop: string }

export type TeDoenRij = DossierRij & {
  _status: BewakingStatus
  _bak: Bak
  /** Dagen tot de afgesproken datum; negatief = verlopen. */
  _dagen: number | null
  _bedrag: number | null
  _stap: string | null
  /** Grote offerte zonder eigenaar of vervolgstap: het geval waarin stilliggen het meest kost. */
  _aandacht: boolean
  /** Dagen sinds de offerte verzonden is. */
  _openDagen: number | null
  /** Klein, middel, groot of mega; zie bedragklassen.ts. */
  _klasse: Bedragklasse
  /** Hoort in de nabellijst: bedragklasse, tenzij de offerte zelf "altijd" of "niet" zegt. */
  _nabellen: boolean
  /** Waarom de offerte stilstaat, als dat is vastgelegd. */
  _stil: StilReden | null
}

const MAANDEN = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec']

/** "13 okt", met jaartal als dat niet het jaar van vandaag is: in een rij telt elke letter. */
export function kortDatum(iso: string, vandaag: string): string {
  const [j, m, d] = iso.slice(0, 10).split('-').map(Number)
  if (!j || !m || !d) return iso
  return `${d} ${MAANDEN[m - 1]}${String(j) !== vandaag.slice(0, 4) ? ` ${j}` : ''}`
}

/**
 * De stap in rijlengte: "Offerte toelichten · 16 okt" of "Wacht op klant tot 20 okt ·
 * Penningmeester stuurt akkoord". Korter dan stapOmschrijving, die op de kaart staat.
 */
export function kortStap(
  k: Pick<BewakingKaart, 'stap_soort' | 'stap_tekst' | 'stap_datum' | 'wacht_op'>,
  vandaag: string,
): string | null {
  if (!k.stap_soort || !k.stap_datum) return null
  const datum = kortDatum(k.stap_datum, vandaag)
  if (k.stap_soort === 'wachten') {
    const bij = k.wacht_op === 'intern' ? 'collega' : k.wacht_op === 'extern' ? 'derde' : 'klant'
    return `Wacht op ${bij} tot ${datum}${k.stap_tekst ? ` · ${k.stap_tekst}` : ''}`
  }
  return `${k.stap_tekst ?? 'Actie'} · ${datum}`
}

export function bakVan(status: BewakingStatus, dagen: number | null): Bak | null {
  switch (status) {
    case 'afgerond':    return null
    case 'verlopen':    return 'verlopen'
    case 'nu':          return 'vandaag'
    case 'ongetrieerd': return 'ongetrieerd'
    case 'slapend':     return 'later'
    default:            return dagen != null && dagen <= 7 ? 'week' : 'later'
  }
}

export function maakTeDoenRij(d: DossierRij, vandaag: string): TeDoenRij {
  const stap = {
    stap_soort: d.bewaking_stap_soort ?? null,
    stap_tekst: d.bewaking_stap_tekst ?? null,
    stap_datum: d.bewaking_stap_datum ?? null,
    wacht_op:   d.bewaking_wacht_op ?? null,
  }
  const status = bewakingsStatus(stap, { vandaag, afgerond: d.hoofdstatus === 'opdracht' })
  const dagen = stap.stap_datum ? dagenTussenKalender(vandaag, stap.stap_datum) : null
  const bedrag = berekenKaartBedrag(d, 'offerte').totaalExclBtw
  const verzonden = d.verzonden_op ? d.verzonden_op.slice(0, 10) : null
  return {
    ...d,
    _status: status,
    _bak: bakVan(status, dagen) ?? 'later',
    _dagen: dagen,
    _bedrag: bedrag,
    _stap: kortStap(stap, vandaag),
    _aandacht: (bedrag ?? 0) >= AANDACHT_BEDRAG && (!d.bewaking_eigenaar_id || !d.bewaking_stap_soort),
    _openDagen: verzonden ? dagenTussenKalender(verzonden, vandaag) : null,
    _klasse: bedragklasse(bedrag),
    _nabellen: wordtNagebeld(bedragklasse(bedrag), d.bewaking_opvolging ?? null),
    _stil: alsStilReden(d.bewaking_stil_reden),
  }
}

/**
 * Sortering van de lijst: eerst de groep, binnen de groep wat het eerst moet (verlopen: het
 * langst verlopen eerst), en bij gelijke datum het hoogste bedrag. Dezelfde volgorde bepaalt
 * welke offerte na het vastleggen vanzelf opent.
 */
export function sorteerTeDoen(a: TeDoenRij, b: TeDoenRij): number {
  return (BAK_INDEX.get(a._bak) ?? 99) - (BAK_INDEX.get(b._bak) ?? 99)
    || (a._dagen ?? 9999) - (b._dagen ?? 9999)
    || (b._bedrag ?? 0) - (a._bedrag ?? 0)
}

/**
 * Past een rij bij de zoekterm? Op alles waarmee je een offerte aan de telefoon herkent: titel,
 * klant, dossiernummer, contactpersoon, werkadres en wie er aan zet is.
 */
export function pastBijZoekterm(r: TeDoenRij, term: string): boolean {
  const q = term.trim().toLowerCase()
  if (!q) return true
  return [
    r.titel, r.klant_naam, r.dossiernummer, r.contactpersoon_naam, r.werkadres_naam,
    [r.werkadres_straat, r.werkadres_huisnummer, r.werkadres_postcode, r.werkadres_stad].filter(Boolean).join(' '),
    r.bewaking_actiehouder, r.bewaking_stap_tekst,
  ].some(v => v?.toLowerCase().includes(q))
}

/**
 * Past een rij bij het bedragfilter? De keuze op de offerte zelf gaat voor: "altijd nabellen"
 * staat erin ongeacht de klasse, "niet nabellen" nooit. Het van–tot-bereik geldt altijd.
 */
export function pastBijBedrag(
  r: Pick<TeDoenRij, '_klasse' | '_bedrag' | 'bewaking_opvolging'>,
  klassen: Record<Bedragklasse, boolean>,
  bereik: { min: number | null; max: number | null },
): boolean {
  const b = r._bedrag ?? 0
  if ((bereik.min != null && b < bereik.min) || (bereik.max != null && b > bereik.max)) return false
  if (r.bewaking_opvolging === 'altijd') return true
  if (r.bewaking_opvolging === 'niet') return false
  return klassen[r._klasse]
}

/** Stilstand per reden, voor het overzicht "Waarom staat het stil": aantal, bedrag, eerste besluit. */
export function stilstandPerReden(rijen: TeDoenRij[]): {
  reden: StilReden; label: string; aantal: number; bedrag: number; eersteBesluit: string | null
}[] {
  const per = new Map<StilReden, { aantal: number; bedrag: number; eersteBesluit: string | null }>()
  for (const r of rijen) {
    if (!r._stil) continue
    const g = per.get(r._stil) ?? { aantal: 0, bedrag: 0, eersteBesluit: null }
    g.aantal++
    g.bedrag += r._bedrag ?? 0
    const besluit = r.bewaking_besluit_datum ?? null
    if (besluit && (!g.eersteBesluit || besluit < g.eersteBesluit)) g.eersteBesluit = besluit
    per.set(r._stil, g)
  }
  return [...per.entries()]
    .map(([reden, g]) => ({ reden, label: STIL_REDEN_LABEL[reden], ...g }))
    .sort((a, b) => b.bedrag - a.bedrag)
}

/** "Ook open bij": zelfde klant (VvE) eerst, dan urgentie, dan het hoogste bedrag. */
export function sorteerOverige(rijen: TeDoenRij[], eigenKlant: string | null): TeDoenRij[] {
  return [...rijen].sort((a, b) =>
    Number(b.klant_naam === eigenKlant) - Number(a.klant_naam === eigenKlant)
    || (BAK_INDEX.get(a._bak) ?? 99) - (BAK_INDEX.get(b._bak) ?? 99)
    || (b._bedrag ?? 0) - (a._bedrag ?? 0))
}

export const eur = (n: number | null) =>
  n == null ? '—' : new Intl.NumberFormat('nl-NL', {
    style: 'currency', currency: 'EUR', maximumFractionDigits: 0,
  }).format(n)

export const eurKort = (n: number) =>
  n >= 1000
    ? `€ ${new Intl.NumberFormat('nl-NL', { maximumFractionDigits: 0 }).format(Math.round(n / 1000))}k`
    : eur(n)
