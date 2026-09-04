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
  /**
   * De code van de sticker op het object. Voorbedrukte stickers hebben elk hun
   * eigen unieke code; die bewaren we ruw zoals de scanner hem leest (zie
   * `lib/materieel/qr.ts`). Leeg laten mag: dan houdt de trigger in de database
   * de id aan, en print het paspoort een eigen QR.
   */
  qr_code: optioneleTekst,
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

/**
 * Aanmaak-schema: bij het registreren kun je het object meteen op naam van een
 * medewerker zetten. Leeg laten = algemeen gebruik. Bewerken van de toewijzing
 * loopt via de Toewijzen-actie op het paspoort (die houdt historie bij).
 */
export const nieuwMaterieelSchema = materieelObjectSchema.extend({
  toegewezen_medewerker_id: optioneleTekst,
})

export type NieuwMaterieelInput = z.infer<typeof nieuwMaterieelSchema>
