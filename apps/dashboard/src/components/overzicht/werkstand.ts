/**
 * Werkstand van een overzichttabel: kolommen, sortering, filters, zoekterm en
 * paginagrootte zoals de gebruiker ze achterliet.
 *
 * Twee opslagplaatsen, bewust allebei:
 *   - localStorage — synchroon te lezen, dus de eerste render staat meteen goed
 *     (geen flits van de standaardkolommen) en er gaat niets verloren als het
 *     component halverwege een schrijfactie unmount;
 *   - `gebruiker_werkstand` in Supabase — zodat je stand meeverhuist naar een
 *     ander apparaat. Die schrijft de tabel gedempt weg (zie useWerkstand).
 *
 * Bij het toepassen wordt altijd gereconcilieerd met de *huidige* kolomdefinities:
 * kolommen die sinds de laatste keer zijn toegevoegd verschijnen op hun standaard-
 * plek, verdwenen kolommen (en filters daarop) vallen weg. Zonder die stap zou een
 * nieuwe kolom nooit zichtbaar worden voor iemand die het scherm ooit heeft aangepast.
 */

import type { KolomConfig, TabelWerkstand } from '@everts/database/platform-types'

/** Formaatversie van `TabelWerkstand`. Ophogen zodra de vorm breekt. */
export const WERKSTAND_VERSIE = 1

export const PAGINA_GROOTTES = [10, 25, 50, 100] as const
export const STANDAARD_PAGINA_GROOTTE = 25

/** Wat de tabelcomponent nodig heeft om een kolom te kunnen reconstrueren. */
export type KolomBasis = {
  key:                  string
  standaard_zichtbaar?: boolean
  vast?:                boolean
  filterType?:          'tekst' | 'select'
  breedte?:             number
}

/** De losse stukjes TanStack-state die we bewaren en terugzetten. */
export type TabelStand = {
  columnOrder:      string[]
  columnVisibility: Record<string, boolean>
  columnSizing:     Record<string, number>
  sorting:          { id: string; desc: boolean }[]
  columnFilters:    { id: string; value: unknown }[]
  globalFilter:     string
  pageSize:         number
}

// ─── Reconciliatie ───────────────────────────────────────────────────────────

/** Zichtbaarheid volgens de code. Vaste kolommen zijn niet door de gebruiker te wisselen. */
function standaardZichtbaar(k: KolomBasis): boolean {
  return k.standaard_zichtbaar !== false
}

/** De stand zoals de code hem bedoelt: geen opgeslagen voorkeur toegepast. */
export function standaardStand(
  kolommen: KolomBasis[],
  beginSortering?: { id: string; desc: boolean }[],
): TabelStand {
  return {
    columnOrder:      kolommen.map(k => k.key),
    columnVisibility: Object.fromEntries(kolommen.map(k => [k.key, standaardZichtbaar(k)])),
    columnSizing:     {},
    sorting:          beginSortering ?? [],
    columnFilters:    [],
    globalFilter:     '',
    pageSize:         STANDAARD_PAGINA_GROOTTE,
  }
}

/**
 * Legt opgeslagen kolominstellingen over de huidige kolomdefinities.
 * Onbekende keys vallen weg; nieuwe kolommen komen achteraan op hun standaardstand.
 */
function pasKolommenToe(
  opgeslagen: KolomConfig[],
  kolommen: KolomBasis[],
): Pick<TabelStand, 'columnOrder' | 'columnVisibility' | 'columnSizing'> {
  const perKey = new Map(kolommen.map(k => [k.key, k]))
  const gesorteerd = [...opgeslagen]
    .filter(k => perKey.has(k.key))
    .sort((a, b) => a.volgorde - b.volgorde)

  const bekend = new Set(gesorteerd.map(k => k.key))
  const nieuw  = kolommen.filter(k => !bekend.has(k.key))

  const columnVisibility: Record<string, boolean> = {}
  const columnSizing:     Record<string, number>  = {}

  for (const opgeslagenKolom of gesorteerd) {
    const def = perKey.get(opgeslagenKolom.key)!
    // Een vaste kolom volgt altijd de code: de gebruiker kan hem niet uitzetten, dus
    // een opgeslagen `false` kan alleen uit een oude definitie komen en zou de kolom
    // permanent verbergen zonder knop om hem terug te halen.
    columnVisibility[def.key] = def.vast ? standaardZichtbaar(def) : opgeslagenKolom.zichtbaar
    if (opgeslagenKolom.breedte) columnSizing[def.key] = opgeslagenKolom.breedte
  }
  for (const def of nieuw) {
    columnVisibility[def.key] = standaardZichtbaar(def)
  }

  return {
    columnOrder: [...gesorteerd.map(k => k.key), ...nieuw.map(k => k.key)],
    columnVisibility,
    columnSizing,
  }
}

/** Kolominstellingen van een benoemde layout toepassen op de huidige stand. */
export function standUitLayout(
  layoutKolommen: KolomConfig[],
  kolommen: KolomBasis[],
  basis: TabelStand,
): TabelStand {
  return { ...basis, ...pasKolommenToe(layoutKolommen, kolommen) }
}

/**
 * Volledige werkstand toepassen. Geeft `null` bij een onbekende formaatversie of
 * onbruikbare inhoud, zodat de aanroeper netjes terugvalt op de standaard.
 */
export function standUitWerkstand(
  staat: TabelWerkstand | null,
  kolommen: KolomBasis[],
  basis: TabelStand,
): TabelStand | null {
  if (!staat || staat.versie !== WERKSTAND_VERSIE || !Array.isArray(staat.kolommen)) return null

  const perKey = new Map(kolommen.map(k => [k.key, k]))

  const sortering = (staat.sortering ?? []).filter(s => perKey.has(s.id))
  // Een filter op een kolom die geen filter (meer) heeft, kun je in de UI niet wissen:
  // de chip verwijst naar een kolom zonder filterknop. Die gooien we weg.
  const filters = (staat.filters ?? [])
    .filter(f => perKey.get(f.id)?.filterType)
    .map(f => ({ id: f.id, value: f.waarde }))

  const paginaGrootte = (PAGINA_GROOTTES as readonly number[]).includes(staat.paginaGrootte)
    ? staat.paginaGrootte
    : basis.pageSize

  return {
    ...basis,
    ...pasKolommenToe(staat.kolommen, kolommen),
    sorting:       sortering,
    columnFilters: filters,
    globalFilter:  typeof staat.zoek === 'string' ? staat.zoek : '',
    pageSize:      paginaGrootte,
  }
}

/** De huidige stand omzetten naar het opslagformaat. */
export function werkstandUitStand(stand: TabelStand, layout_id: string | null): TabelWerkstand {
  return {
    versie:    WERKSTAND_VERSIE,
    kolommen:  stand.columnOrder.map((key, i) => ({
      key,
      zichtbaar: stand.columnVisibility[key] !== false,
      volgorde:  i,
      breedte:   stand.columnSizing[key] ?? undefined,
    })),
    sortering:     stand.sorting.map(s => ({ id: s.id, desc: s.desc })),
    filters:       stand.columnFilters.map(f => ({ id: f.id, waarde: f.value })),
    zoek:          stand.globalFilter,
    paginaGrootte: stand.pageSize,
    layout_id,
    opgeslagen_op: new Date().toISOString(),
  }
}

// ─── localStorage ────────────────────────────────────────────────────────────

/**
 * Sleutel per gebruiker én per scherm: op een gedeelde pc mag de ene collega de
 * kolommen van de andere niet erven.
 */
export function lokaleSleutel(user_id: string | null, scherm: string): string {
  return `eva-tabel-werkstand:${user_id ?? 'anoniem'}:${scherm}`
}

export function leesLokaal(sleutel: string): TabelWerkstand | null {
  if (typeof window === 'undefined') return null
  try {
    const ruw = window.localStorage.getItem(sleutel)
    if (!ruw) return null
    const staat = JSON.parse(ruw) as TabelWerkstand
    return staat?.versie === WERKSTAND_VERSIE ? staat : null
  } catch {
    // Kapotte of geblokkeerde opslag mag nooit een tabel breken.
    return null
  }
}

export function schrijfLokaal(sleutel: string, staat: TabelWerkstand): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(sleutel, JSON.stringify(staat))
  } catch {
    /* quota vol of privacymodus — de servercopie blijft over */
  }
}
