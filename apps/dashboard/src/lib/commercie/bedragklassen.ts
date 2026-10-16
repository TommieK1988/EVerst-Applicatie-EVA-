/**
 * Bedragklassen van de offertebewaking.
 *
 * Niet elke offerte verdient een telefoontje. Afgesproken (okt 2026), als standaard:
 *  - klein  (< € 3.000): niet nabellen; reageert de klant niet, dan laat je hem lopen;
 *  - middel (€ 3.000 – 45.000): nabellen als het werk het toelaat, bijvoorbeeld als je uit je werk loopt;
 *  - groot  (€ 45.000 – 125.000): altijd nabellen;
 *  - mega   (vanaf € 125.000): altijd nabellen, met extra regels voor eigenaar en hercontrole.
 *
 * De grenzen zijn instelbaar onder Instellingen → Offertes → Offertebewaking (opgeslagen in
 * `bedrijfsinstellingen.overige.offerte_bedragklassen`). Dit bestand rekent met de grenzen die
 * het meekrijgt; zonder grenzen gelden de standaardwaarden hieronder. Puur en zonder
 * `'use server'`, zodat lijst, kaart en server hetzelfde rekenen.
 */

export type Bedragklasse = 'mega' | 'groot' | 'middel' | 'klein'

export type Bedragklassegrenzen = {
  /** Onder dit bedrag: klein. */
  kleinTot: number
  /** Vanaf dit bedrag: groot. */
  grootVanaf: number
  /** Vanaf dit bedrag: mega. */
  megaVanaf: number
}

export const STANDAARD_GRENZEN: Bedragklassegrenzen = { kleinTot: 3_000, grootVanaf: 45_000, megaVanaf: 125_000 }

/** Zonder bedrag telt een offerte als middel: niet weggestopt, maar ook niet voorrang. */
export function bedragklasse(bedrag: number | null, g: Bedragklassegrenzen = STANDAARD_GRENZEN): Bedragklasse {
  if (bedrag == null) return 'middel'
  if (bedrag >= g.megaVanaf) return 'mega'
  if (bedrag >= g.grootVanaf) return 'groot'
  if (bedrag < g.kleinTot) return 'klein'
  return 'middel'
}

/** "€ 3k", "€ 125k", "€ 2.500": kort genoeg voor een filterknop. */
export function eurDrempel(n: number): string {
  return n >= 1000 && n % 1000 === 0
    ? `€ ${new Intl.NumberFormat('nl-NL').format(n / 1000)}k`
    : `€ ${new Intl.NumberFormat('nl-NL', { maximumFractionDigits: 0 }).format(n)}`
}

export function bedragklasseLabels(g: Bedragklassegrenzen = STANDAARD_GRENZEN): {
  klasse: Bedragklasse; label: string; uitleg: string
}[] {
  return [
    { klasse: 'mega',   label: 'Mega',   uitleg: `vanaf ${eurDrempel(g.megaVanaf)}` },
    { klasse: 'groot',  label: 'Groot',  uitleg: `${eurDrempel(g.grootVanaf)} – ${eurDrempel(g.megaVanaf)}` },
    { klasse: 'middel', label: 'Middel', uitleg: `${eurDrempel(g.kleinTot)} – ${eurDrempel(g.grootVanaf)}` },
    { klasse: 'klein',  label: 'Klein',  uitleg: `tot ${eurDrempel(g.kleinTot)}, niet nabellen` },
  ]
}

/**
 * Leest grenzen uit de instellingen. Klopt er iets niet (ontbreekt, geen getal, niet oplopend),
 * dan de standaard: een half ingevulde instelling mag de werklijst niet door elkaar gooien.
 */
export function leesGrenzen(v: unknown): Bedragklassegrenzen {
  if (!v || typeof v !== 'object') return STANDAARD_GRENZEN
  const o = v as Record<string, unknown>
  const g = { kleinTot: Number(o.kleinTot), grootVanaf: Number(o.grootVanaf), megaVanaf: Number(o.megaVanaf) }
  return grenzenFout(g) ? STANDAARD_GRENZEN : g
}

/** Foutmelding als de grenzen niet kloppen, anders null. Eén regel voor scherm en server. */
export function grenzenFout(g: Bedragklassegrenzen): string | null {
  const vals = [g.kleinTot, g.grootVanaf, g.megaVanaf]
  if (vals.some(n => !Number.isFinite(n) || n <= 0)) return 'Vul drie bedragen groter dan nul in.'
  if (!(g.kleinTot < g.grootVanaf && g.grootVanaf < g.megaVanaf)) {
    return 'De bedragen moeten oplopen: klein tot < groot vanaf < mega vanaf.'
  }
  return null
}

/** Standaard in Te doen: alles behalve klein. Klein wordt niet nagebeld. */
export const STANDAARD_KLASSEN: Record<Bedragklasse, boolean> = {
  mega: true, groot: true, middel: true, klein: false,
}
