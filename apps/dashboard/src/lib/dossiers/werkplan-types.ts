/**
 * Werkplan bij een opdracht-dossier: wat de uitvoering op dit werk moet weten.
 *
 * Los van `werkplan.ts` omdat een `'use server'`-bestand alleen async functies mag exporteren;
 * het schema, het kopjessjabloon en de standaardzinnen gebruiken zowel de tab in EVA als de
 * mobiele weergave.
 */
import { z } from 'zod'

/** De kopjes waarmee het werkomschrijvingsveld begint. */
export const WERKOMSCHRIJVING_KOPJES = ['Werkzaamheden', 'Bereikbaarheid', 'Bouwplaats', 'Voorzieningen', 'Reclame'] as const

export const WERKOMSCHRIJVING_SJABLOON = WERKOMSCHRIJVING_KOPJES.map(k => `${k}:\n`).join('\n')

const KOPJE_REGEL = new RegExp(`^\\s*(${WERKOMSCHRIJVING_KOPJES.join('|')})\\s*:?\\s*$`, 'i')

/** Is deze regel één van de vaste kopjes (eventueel met dubbele punt)? */
export function isWerkomschrijvingKopje(regel: string): boolean {
  return KOPJE_REGEL.test(regel)
}

/** Staat er meer in de werkomschrijving dan alleen de kopjes en witregels? */
export function heeftInhoud(werkomschrijving: string): boolean {
  return werkomschrijving.split(/\r?\n/).some(r => r.trim() !== '' && !isWerkomschrijvingKopje(r))
}

// ── Werkafspraken ───────────────────────────────────────────────────────────

export const WERKTIJDEN_KEUZES = ['geen', 'anders'] as const
export const REISUREN_KEUZES = ['geen', 'buiten_productief', 'binnen_productief', 'anders'] as const
export const REISKOSTEN_KEUZES = ['geen', 'vergoeding'] as const
export const PARKEREN_KEUZES = ['gratis', 'zelf_betalen', 'declareren', 'anders'] as const

export type WerktijdenKeuze = (typeof WERKTIJDEN_KEUZES)[number]
export type ReisurenKeuze = (typeof REISUREN_KEUZES)[number]
export type ReiskostenKeuze = (typeof REISKOSTEN_KEUZES)[number]
export type ParkerenKeuze = (typeof PARKEREN_KEUZES)[number]

/**
 * De standaardzinnen per keuze. `…` markeert waar de invulwaarde staat; het formulier zet daar
 * een invoerveld, de mobiele weergave de ingevulde waarde.
 */
export const WERKTIJDEN_TEKST: Record<WerktijdenKeuze, string> = {
  geen: 'Er gelden geen afwijkende werktijden.',
  anders: 'Afwijkende werktijden, namelijk …',
}

export const REISUREN_TEKST: Record<ReisurenKeuze, string> = {
  geen: 'Er zijn geen bijzondere afspraken nodig voor reisuren. De werkplek is op binnen een uur rijden van de standplaats.',
  buiten_productief: 'Reisuren langer dan het eigen uur worden gedaan buiten de productieve uren en als reisuren aangemerkt op het weekbriefje. Per persoon, per dag bedraagt dit … uur.',
  binnen_productief: 'Reisuren langer dan het eigen uur worden gedaan binnen de productieve uren. Het is toegestaan om … uur van het werk te vertrekken.',
  anders: 'Anders, namelijk …',
}

export const REISKOSTEN_TEKST: Record<ReiskostenKeuze, string> = {
  geen: 'Er zijn geen bijzondere afspraken nodig voor reiskosten. De werkplek is minder dan 15 km rijafstand van De Star.',
  vergoeding: 'Er mag reiskostenvergoeding gerekend worden. De rijafstand is … km van De Star 3. Er mag € 0,30 gerekend worden bij elke kilometer boven de 15 kilometer per rit.',
}

export const PARKEREN_TEKST: Record<ParkerenKeuze, string> = {
  gratis: 'In de omgeving van het werk kan gratis worden geparkeerd.',
  zelf_betalen: 'Er zijn geen bijzondere afspraken nodig voor parkeren en/of parkeerkosten. Wanneer met de auto naar het werk wordt gereisd dienen de parkeerkosten zelf te worden betaald.',
  declareren: 'Het is toegestaan om parkeerkosten te declareren. De kosten bedragen hooguit € … per dag.',
  anders: 'Anders, namelijk …',
}

// ── Schema ──────────────────────────────────────────────────────────────────

const optTekst = z.string().trim().max(2000).nullable().optional().transform(v => (v ? v : null))
const optGetal = z.number().nonnegative().max(100000).nullable().optional().transform(v => (v ?? null))

export const kleurMateriaalSchema = z.object({
  onderdeel: z.string().trim().max(200),
  waarde: z.string().trim().max(500),
})
export type KleurMateriaal = z.infer<typeof kleurMateriaalSchema>

export const werkplanSchema = z
  .object({
    werkomschrijving: z.string().max(20000),
    werktijden_keuze: z.enum(WERKTIJDEN_KEUZES),
    werktijden_anders: optTekst,
    reisuren_keuze: z.enum(REISUREN_KEUZES),
    reisuren_uren: optGetal,
    reisuren_vertrektijd: z
      .string()
      .trim()
      .nullable()
      .optional()
      .transform(v => (v ? v : null))
      .refine(v => v === null || /^([01]\d|2[0-3]):[0-5]\d$/.test(v), 'Vul een tijd in als UU:MM'),
    reisuren_anders: optTekst,
    reiskosten_keuze: z.enum(REISKOSTEN_KEUZES),
    reiskosten_km: optGetal,
    parkeren_keuze: z.enum(PARKEREN_KEUZES),
    parkeren_max_per_dag: optGetal,
    parkeren_anders: optTekst,
    // Lege rijen vallen weg: een half ingevulde rij met alleen een onderdeel blijft wél staan.
    kleuren_materialen: z
      .array(kleurMateriaalSchema)
      .max(100)
      .transform(rijen => rijen.filter(r => r.onderdeel !== '' || r.waarde !== '')),
  })
  .superRefine((w, ctx) => {
    const eis = (ok: boolean, pad: string, bericht: string) => {
      if (!ok) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [pad], message: bericht })
    }
    eis(heeftInhoud(w.werkomschrijving), 'werkomschrijving', 'Vul de werkomschrijving in — alleen de kopjes is niet genoeg.')
    if (w.werktijden_keuze === 'anders') eis(!!w.werktijden_anders, 'werktijden_anders', 'Beschrijf de afwijkende werktijden.')
    if (w.reisuren_keuze === 'buiten_productief') eis(w.reisuren_uren !== null, 'reisuren_uren', 'Vul het aantal reisuren per dag in.')
    if (w.reisuren_keuze === 'binnen_productief') eis(w.reisuren_vertrektijd !== null, 'reisuren_vertrektijd', 'Vul de vertrektijd in.')
    if (w.reisuren_keuze === 'anders') eis(!!w.reisuren_anders, 'reisuren_anders', 'Beschrijf de afspraak over reisuren.')
    if (w.reiskosten_keuze === 'vergoeding') eis(w.reiskosten_km !== null, 'reiskosten_km', 'Vul de rijafstand in.')
    if (w.parkeren_keuze === 'declareren') eis(w.parkeren_max_per_dag !== null, 'parkeren_max_per_dag', 'Vul het maximale bedrag per dag in.')
    if (w.parkeren_keuze === 'anders') eis(!!w.parkeren_anders, 'parkeren_anders', 'Beschrijf de afspraak over parkeren.')
  })

/** Wat het formulier instuurt. */
export type WerkplanInvoer = z.input<typeof werkplanSchema>
/** Na validatie: lege tekst is `null`, lege tabelrijen zijn weg. */
export type WerkplanGegevens = z.output<typeof werkplanSchema>

/** Een opgeslagen werkplan, zoals de tab en de mobiele weergave het krijgen. */
export type Werkplan = WerkplanGegevens & {
  dossier_id: string
  bijgewerkt_op: string
  bijgewerkt_door_naam: string | null
}

/** Startwaarden voor een dossier zonder werkplan. */
export const LEEG_WERKPLAN: WerkplanInvoer = {
  werkomschrijving: WERKOMSCHRIJVING_SJABLOON,
  werktijden_keuze: 'geen',
  werktijden_anders: null,
  reisuren_keuze: 'geen',
  reisuren_uren: null,
  reisuren_vertrektijd: null,
  reisuren_anders: null,
  reiskosten_keuze: 'geen',
  reiskosten_km: null,
  parkeren_keuze: 'gratis',
  parkeren_max_per_dag: null,
  parkeren_anders: null,
  kleuren_materialen: [],
}

const getal = (n: number) => n.toLocaleString('nl-NL', { maximumFractionDigits: 2 })
const bedrag = (n: number) => n.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** Zet `…` in een standaardzin om in de ingevulde waarde. */
function vul(zin: string, waarde: string): string {
  return zin.replace('…', waarde)
}

/** De gekozen afspraken als volle zinnen, voor de alleen-lezenweergave. */
export function werkafsprakenAlsZinnen(w: WerkplanGegevens): { titel: string; zin: string }[] {
  return [
    {
      titel: 'Afwijkende werktijden',
      zin: w.werktijden_keuze === 'anders' ? vul(WERKTIJDEN_TEKST.anders, w.werktijden_anders ?? '—') : WERKTIJDEN_TEKST.geen,
    },
    {
      titel: 'Reisuren',
      zin:
        w.reisuren_keuze === 'buiten_productief' ? vul(REISUREN_TEKST.buiten_productief, w.reisuren_uren != null ? getal(w.reisuren_uren) : '—')
        : w.reisuren_keuze === 'binnen_productief' ? vul(REISUREN_TEKST.binnen_productief, w.reisuren_vertrektijd ?? '—')
        : w.reisuren_keuze === 'anders' ? vul(REISUREN_TEKST.anders, w.reisuren_anders ?? '—')
        : REISUREN_TEKST.geen,
    },
    {
      titel: 'Reiskosten',
      zin: w.reiskosten_keuze === 'vergoeding'
        ? vul(REISKOSTEN_TEKST.vergoeding, w.reiskosten_km != null ? getal(w.reiskosten_km) : '—')
        : REISKOSTEN_TEKST.geen,
    },
    {
      titel: 'Parkeren',
      zin:
        w.parkeren_keuze === 'declareren' ? vul(PARKEREN_TEKST.declareren, w.parkeren_max_per_dag != null ? bedrag(w.parkeren_max_per_dag) : '—')
        : w.parkeren_keuze === 'anders' ? vul(PARKEREN_TEKST.anders, w.parkeren_anders ?? '—')
        : PARKEREN_TEKST[w.parkeren_keuze],
    },
  ]
}
