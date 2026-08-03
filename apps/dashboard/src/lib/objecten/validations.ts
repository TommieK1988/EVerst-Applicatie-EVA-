import { z } from 'zod'

const leegNaarNull = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? null : v)

/** Optioneel tekstveld: lege invoer uit een formulier wordt null, niet "". */
const optioneleTekst = z.preprocess(leegNaarNull, z.string().trim().max(500).nullable().optional())

export const objectSoortSchema = z.enum(['vve', 'complex', 'pand', 'locatie', 'overig'])
export const objectRolSchema = z.enum(['vve', 'eigenaar', 'beheerder', 'opdrachtgever', 'overig'])

/**
 * Invoer voor het aanmaken/bewerken van een object.
 *
 * `objectnummer` is verplicht en uniek: het is in Bouw7 de feitelijke sleutel
 * (`number`, met de hand getypt — HW1013, KESSZAM6) en zonder die code kan een
 * nieuw object daar niet worden aangemaakt.
 */
export const objectSchema = z.object({
  objectnummer: z.string().trim().min(1, 'Objectnummer is verplicht').max(60),
  naam: z.string().trim().min(1, 'Naam is verplicht').max(200),
  soort: objectSoortSchema.default('complex'),
  vve_code: optioneleTekst,
  adres_straat: optioneleTekst,
  adres_huisnummer: optioneleTekst,
  adres_postcode: optioneleTekst,
  adres_plaats: optioneleTekst,
  omschrijving: z.preprocess(leegNaarNull, z.string().trim().max(5000).nullable().optional()),
  contact_naam: optioneleTekst,
  contact_telefoon: optioneleTekst,
  contact_email: z.preprocess(
    leegNaarNull,
    z.string().trim().email('Geen geldig e-mailadres').nullable().optional(),
  ),
  standaard_opdrachtgever_id: z.preprocess(leegNaarNull, z.string().uuid().nullable().optional()),
  standaard_contactpersoon_id: z.preprocess(leegNaarNull, z.string().uuid().nullable().optional()),
  notities: z.preprocess(leegNaarNull, z.string().trim().max(5000).nullable().optional()),
  actief: z.boolean().default(true),
})

export type ObjectInvoer = z.infer<typeof objectSchema>

/** Welke velden bij het koppelen van een dossier vanuit het object worden overgenomen. */
export const overnemenSchema = z.object({
  werkadres: z.boolean().default(true),
  opdrachtgever: z.boolean().default(true),
  vveCode: z.boolean().default(true),
  contactTerPlaatse: z.boolean().default(true),
})

export type OvernemenKeuze = z.infer<typeof overnemenSchema>
