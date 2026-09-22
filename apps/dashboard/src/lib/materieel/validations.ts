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
  vervangingswaarde: optioneelBedrag,
  opmerkingen: optioneleTekst,
})

export type MaterieelObjectInput = z.infer<typeof materieelObjectSchema>

/**
 * Aanmaak-schema: bij het registreren kun je het object meteen toewijzen — aan
 * een collega, of aan een team (een servicebus of de werkplaats). Beide leeg
 * laten = algemeen gebruik.
 *
 * Een team is hier net zo gewoon als een persoon: gereedschap dat op de
 * werkplaats blijft liggen hoort niet op iemands naam te staan, want dan lijkt
 * het uitgegeven. Bewerken van de toewijzing loopt daarna via de Toewijzen-actie
 * op het paspoort (die houdt historie bij).
 */
export const nieuwMaterieelSchema = materieelObjectSchema
  .extend({
    toegewezen_medewerker_id: optioneleTekst,
    toegewezen_team_id: optioneleTekst,
    /**
     * Aantal identieke exemplaren dat in één keer wordt ingeboekt. Elk exemplaar
     * wordt een eigen object met een eigen paspoort, QR-code en keuringsregime —
     * er bestaat bewust geen voorraadkolom "aantal" op een object.
     *
     * Het maximum is een rem tegen een typefout: 500 in plaats van 5 zou een
     * halve database aan gereedschap opleveren die je met de hand mag opruimen.
     */
    aantal: z
      .union([z.string(), z.number()])
      .transform((v) => (v === '' || v === null || v === undefined ? 1 : Number(v)))
      .refine((v) => Number.isInteger(v) && v >= 1 && v <= 50, 'Aantal moet een heel getal van 1 tot 50 zijn')
      .default(1),
  })
  .refine(
    (v) => !(v.toegewezen_medewerker_id && v.toegewezen_team_id),
    'Kies een collega óf een team, niet allebei',
  )
  /**
   * Stickercode en inventarisnummer zijn uniek in de database, en een
   * serienummer hoort bij precies één apparaat. Bij meerdere exemplaren zou de
   * tweede insert dus afketsen op een unieke sleutel — of, erger, zouden vijf
   * helmen hetzelfde serienummer dragen. Die velden vul je per stuk in nadat ze
   * zijn aangemaakt.
   */
  .refine(
    (v) => v.aantal === 1 || !(v.qr_code || v.inventarisnummer || v.serienummer),
    'Stickercode, inventarisnummer en serienummer horen bij één exemplaar — laat ze leeg als je er meerdere tegelijk aanmaakt',
  )

export type NieuwMaterieelInput = z.infer<typeof nieuwMaterieelSchema>
