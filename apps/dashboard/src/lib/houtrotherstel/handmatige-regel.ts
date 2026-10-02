/**
 * handmatige-regel.ts — zelf ingevoerde arbeid of materiaal bij een houtrotreparatie.
 *
 * Een handmatige regel landt in dezelfde tabel en dezelfde momentopname-velden als
 * een regel uit de bibliotheek. Daardoor tellen tab, totalen, rapportage en btw-
 * opstelling hem mee zonder dat ze het verschil hoeven te kennen:
 *
 *   arbeid     aantal = uren · eenheid 'uur' · 1 uur per stuk
 *              kostprijs per stuk = kostprijs per uur · verkoop per stuk = uurtarief
 *   materiaal  aantal = hoeveelheid · eenheid zoals gekozen
 *              kostprijs per stuk = inkoopprijs · verkoop = inkoop × (1 + opslag/100)
 *
 * Bewust pure code (geen server-imports), zodat het rekenwerk los te testen is.
 */
import { z } from 'zod'
import type {
  RegistratieRegelForm, RepairRegistrationLine, RegelCategorie,
} from './types'

const rond = (n: number) => Math.round(n * 100) / 100

// ── Validatie ─────────────────────────────────────────────────────────────

const geenNegatief = (veld: string) =>
  z.number({ invalid_type_error: `Vul ${veld} in.` })
    .finite(`Vul ${veld} in.`)
    .min(0, `${veld[0].toUpperCase()}${veld.slice(1)} mag niet negatief zijn.`)

const meerDanNul = (veld: string) =>
  z.number({ invalid_type_error: `Vul ${veld} in.` })
    .finite(`Vul ${veld} in.`)
    .gt(0, `${veld[0].toUpperCase()}${veld.slice(1)} moet groter dan 0 zijn.`)

const gedeeld = {
  omschrijving: z.string().trim().min(1, 'Omschrijving is verplicht.'),
  categorie: z.enum(['reparatie', 'meerwerk']),
  btw_tarief: z.enum(['hoog', 'laag']),
  notitie: z.string().trim().optional(),
  foto_pad: z.string().optional(),
}

export const handmatigeRegelSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('arbeid'),
    ...gedeeld,
    functie: z.string().trim().min(1, 'Kies een functie.'),
    uren: meerDanNul('het aantal uren'),
    uurtarief: geenNegatief('het uurtarief'),
    kostprijs_per_uur: geenNegatief('de kostprijs per uur'),
  }),
  z.object({
    type: z.literal('materiaal'),
    ...gedeeld,
    aantal: meerDanNul('het aantal'),
    eenheid: z.string().trim().min(1, 'Kies een eenheid.'),
    inkoopprijs: geenNegatief('de inkoopprijs'),
    opslag_pct: geenNegatief('het opslagpercentage'),
  }),
])

export type HandmatigeRegel = z.infer<typeof handmatigeRegelSchema>

/** Valideert; geeft óf de regel óf de eerste foutmelding terug. */
export function valideerHandmatigeRegel(
  invoer: unknown,
): { ok: true; regel: HandmatigeRegel } | { ok: false; fout: string } {
  const r = handmatigeRegelSchema.safeParse(invoer)
  if (r.success) return { ok: true, regel: r.data }
  return { ok: false, fout: r.error.issues[0]?.message ?? 'Ongeldige regel.' }
}

// ── Rekenen ───────────────────────────────────────────────────────────────

/** Verkoopprijs per stuk van handmatig materiaal: inkoop plus opslag. */
export function verkoopMateriaal(inkoopprijs: number, opslagPct: number): number {
  return rond(inkoopprijs * (1 + opslagPct / 100))
}

/** Bouwt de opslagvorm (zelfde velden als een bibliotheekregel) uit een handmatige regel. */
export function regelVanHandmatig(h: HandmatigeRegel, volgorde: number): RegistratieRegelForm {
  const basis = {
    bron: 'handmatig' as const,
    regel_type: h.type,
    categorie: h.categorie,
    btw_tarief: h.btw_tarief,
    notitie: h.notitie || undefined,
    foto_pad: h.foto_pad || undefined,
    repair_name_snapshot: h.omschrijving.trim(),
    volgorde,
  }
  if (h.type === 'arbeid') {
    return {
      ...basis,
      aantal: rond(h.uren),
      functie: h.functie,
      unit_snapshot: 'uur',
      labor_hours_snapshot: 1,
      labor_rate_snapshot: rond(h.uurtarief),
      labor_cost_snapshot: rond(h.kostprijs_per_uur),
      material_cost_snapshot: 0,
      cost_price_snapshot: rond(h.kostprijs_per_uur),
      sale_price_snapshot: rond(h.uurtarief),
    }
  }
  return {
    ...basis,
    aantal: rond(h.aantal),
    unit_snapshot: h.eenheid,
    opslag_pct: rond(h.opslag_pct),
    labor_hours_snapshot: 0,
    labor_cost_snapshot: 0,
    material_cost_snapshot: rond(h.inkoopprijs),
    cost_price_snapshot: rond(h.inkoopprijs),
    sale_price_snapshot: verkoopMateriaal(h.inkoopprijs, h.opslag_pct),
  }
}

/** Terug naar de invoervorm, om een opgeslagen handmatige regel te bewerken. */
export function handmatigVanRegel(r: RegistratieRegelForm): HandmatigeRegel {
  const gedeeldeVelden = {
    omschrijving: r.repair_name_snapshot ?? '',
    categorie: (r.categorie ?? 'reparatie') as RegelCategorie,
    btw_tarief: r.btw_tarief === 'laag' ? 'laag' as const : 'hoog' as const,
    notitie: r.notitie,
    foto_pad: r.foto_pad,
  }
  if (r.regel_type === 'arbeid') {
    return {
      type: 'arbeid', ...gedeeldeVelden,
      functie: r.functie ?? '',
      uren: Number(r.aantal),
      uurtarief: Number(r.sale_price_snapshot ?? 0),
      kostprijs_per_uur: Number(r.cost_price_snapshot ?? 0),
    }
  }
  return {
    type: 'materiaal', ...gedeeldeVelden,
    aantal: Number(r.aantal),
    eenheid: r.unit_snapshot ?? '',
    inkoopprijs: Number(r.cost_price_snapshot ?? 0),
    opslag_pct: Number(r.opslag_pct ?? 0),
  }
}

/**
 * Een opgeslagen regel terug naar de opslagvorm, met álle velden. Bewerken vervangt
 * de regels van een registratie in z'n geheel; wat hier wegvalt, is daarna weg.
 */
export function regelVanLijn(l: RepairRegistrationLine): RegistratieRegelForm {
  const getal = (v: number | null | undefined) => (v == null ? undefined : Number(v))
  const tekst = (v: string | null | undefined) => v ?? undefined
  return {
    recept_id: tekst(l.recept_id),
    aantal: Number(l.aantal),
    repair_code_snapshot: tekst(l.repair_code_snapshot),
    repair_name_snapshot: tekst(l.repair_name_snapshot),
    repair_description_snapshot: tekst(l.repair_description_snapshot),
    unit_snapshot: tekst(l.unit_snapshot),
    labor_hours_snapshot: getal(l.labor_hours_snapshot),
    labor_rate_snapshot: getal(l.labor_rate_snapshot),
    labor_cost_snapshot: getal(l.labor_cost_snapshot),
    material_cost_snapshot: getal(l.material_cost_snapshot),
    cost_price_snapshot: getal(l.cost_price_snapshot),
    sale_price_snapshot: getal(l.sale_price_snapshot),
    volgorde: l.volgorde,
    bron: l.bron ?? 'bibliotheek',
    regel_type: l.regel_type ?? undefined,
    categorie: l.categorie ?? 'reparatie',
    functie: tekst(l.functie),
    opslag_pct: getal(l.opslag_pct),
    btw_tarief: tekst(l.btw_tarief),
    notitie: tekst(l.notitie),
    foto_pad: tekst(l.foto_pad),
  }
}

export const isHandmatig = (r: { bron?: string | null }) => r.bron === 'handmatig'

// ── Totalen ───────────────────────────────────────────────────────────────

export interface RegelTotalen {
  uren: number
  /** Kosten arbeid (zelfde betekenis als de kolom Arbeid in de tab). */
  arbeid: number
  /** Kosten materiaal. */
  materiaal: number
  kostprijs: number
  verkoop: number
  /** Deel van de verkoop uit handmatige regels. */
  verkoopHandmatig: number
  /** Deel van de verkoop uit aanvullende werkzaamheden. */
  verkoopMeerwerk: number
}

/**
 * Telt regels op: bibliotheek en handmatig samen, arbeid en materiaal gesplitst.
 * Per regel afgerond zoals `line_sale_total` in de database, zodat het scherm vóór
 * en ná opslaan hetzelfde bedrag toont.
 */
export function telRegels(regels: RegistratieRegelForm[]): RegelTotalen {
  const t: RegelTotalen = {
    uren: 0, arbeid: 0, materiaal: 0, kostprijs: 0, verkoop: 0, verkoopHandmatig: 0, verkoopMeerwerk: 0,
  }
  for (const r of regels) {
    const a = Number(r.aantal) || 0
    const verkoop = rond(a * (r.sale_price_snapshot ?? 0))
    t.uren += a * (r.labor_hours_snapshot ?? 0)
    t.arbeid += a * (r.labor_cost_snapshot ?? 0)
    t.materiaal += a * (r.material_cost_snapshot ?? 0)
    t.kostprijs += rond(a * (r.cost_price_snapshot ?? 0))
    t.verkoop += verkoop
    if (isHandmatig(r)) t.verkoopHandmatig += verkoop
    if (r.categorie === 'meerwerk') t.verkoopMeerwerk += verkoop
  }
  return {
    uren: rond(t.uren), arbeid: rond(t.arbeid), materiaal: rond(t.materiaal),
    kostprijs: rond(t.kostprijs), verkoop: rond(t.verkoop),
    verkoopHandmatig: rond(t.verkoopHandmatig), verkoopMeerwerk: rond(t.verkoopMeerwerk),
  }
}

// ── Standaard uurtarief ───────────────────────────────────────────────────

export type TariefBron = 'opdrachtgever' | 'functie' | 'kostprijs_opslag' | 'geen'

export const TARIEF_BRON_LABEL: Record<TariefBron, string> = {
  opdrachtgever: 'afgesproken tarief opdrachtgever',
  functie: 'verkooptarief van de functie',
  kostprijs_opslag: 'kostprijs plus opslag',
  geen: 'geen tarief bekend',
}

/**
 * Het standaard uurtarief voor handmatige arbeid. Zelfde voorrang als de regie-
 * facturatie: een met de opdrachtgever afgesproken tarief is een harde prijsafspraak
 * en gaat vóór alles; daarna het verkooptarief van de functie; en anders kostprijs
 * plus de ingestelde opslag. Zonder opslag zou zo'n uur tegen kostprijs de
 * rapportage in gaan — dat was bij de regie precies het gat dat gedicht moest worden.
 *
 * De kostprijs volgt opdrachtgever → functie → bedrijfstarief. Dat laatste (uit
 * Bedrijfsinstellingen) is ook de kostprijsbasis waarmee de recepten rekenen.
 */
export function kiesUurtarief(opties: {
  opdrachtgeverVerkoop?: number | null
  opdrachtgeverKostprijs?: number | null
  functieVerkoop?: number | null
  functieKostprijs?: number | null
  bedrijfstarief?: number | null
  opslagPct: number
}): { verkoop: number; kostprijs: number; bron: TariefBron } {
  const g = (v: number | null | undefined) => (v != null && Number.isFinite(v) && v >= 0 ? v : null)
  const kostprijs = g(opties.opdrachtgeverKostprijs) ?? g(opties.functieKostprijs) ?? g(opties.bedrijfstarief)

  const opdrachtgever = g(opties.opdrachtgeverVerkoop)
  if (opdrachtgever != null) return { verkoop: opdrachtgever, kostprijs: kostprijs ?? 0, bron: 'opdrachtgever' }
  const functie = g(opties.functieVerkoop)
  if (functie != null) return { verkoop: functie, kostprijs: kostprijs ?? 0, bron: 'functie' }
  if (kostprijs != null) {
    return { verkoop: rond(kostprijs * (1 + opties.opslagPct / 100)), kostprijs, bron: 'kostprijs_opslag' }
  }
  return { verkoop: 0, kostprijs: 0, bron: 'geen' }
}
