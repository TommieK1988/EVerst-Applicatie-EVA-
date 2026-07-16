import { z } from 'zod'
import { MATERIEEL_CATEGORIEEN, MATERIEEL_STATUSSEN } from './types'

/** Leeg tekstveld → null (i.p.v. lege string) voor optionele kolommen. */
const optioneleTekst = z
  .string()
  .trim()
  .transform((v) => (v === '' ? null : v))
  .nullable()
  .optional()

/** Bedrag: leeg → null, anders getal ≥ 0. */
const optioneelBedrag = z
  .union([z.string(), z.number()])
  .transform((v) => (v === '' || v === null || v === undefined ? null : Number(v)))
  .refine((v) => v === null || (!Number.isNaN(v) && v >= 0), 'Ongeldig bedrag')
  .nullable()
  .optional()

/** Datum als ISO-string (YYYY-MM-DD) of leeg → null. */
const optioneleDatum = z
  .string()
  .transform((v) => (v === '' ? null : v))
  .nullable()
  .optional()

export const materieelObjectSchema = z.object({
  omschrijving: z.string().trim().min(2, 'Omschrijving is verplicht'),
  categorie: z.enum(MATERIEEL_CATEGORIEEN),
  status: z.enum(MATERIEEL_STATUSSEN).default('beschikbaar'),
  inventarisnummer: optioneleTekst,
  merk: optioneleTekst,
  type: optioneleTekst,
  serienummer: optioneleTekst,
  leverancier: optioneleTekst,
  aankoopdatum: optioneleDatum,
  garantie_tot: optioneleDatum,
  aanschafwaarde: optioneelBedrag,
  boekwaarde: optioneelBedrag,
  opmerkingen: optioneleTekst,
})

export type MaterieelObjectInput = z.infer<typeof materieelObjectSchema>
