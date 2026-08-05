import 'server-only'
import { createAdminClient } from '@everts/database/server'

/**
 * Beheer van de standaardteksten waarmee een inkooporder of onderaannemersopdracht naar de
 * leverancier wordt gemaild. Opgeslagen als singleton in `bedrijfsinstellingen.overige`, net als
 * het offerte-mailsjabloon (zie lib/everts-calc/offerte-mail.ts).
 *
 * Twee aparte sjablonen: een inkooporder gaat naar een leverancier van materiaal, een
 * onderaannemersopdracht naar een partij die werk uitvoert. Dat vraagt om andere woorden.
 *
 * De opmaak zit hier NIET in: de tekst is platte tekst met regeleinden, `bouwBestellingMailHtml`
 * maakt er Outlook-proof HTML van.
 */

export type BestellingMailSjabloon = { onderwerp: string; tekst: string }
export type BestellingMailSjablonen = {
  inkooporder: BestellingMailSjabloon
  oa_contract: BestellingMailSjabloon
}

export const STANDAARD_BESTELLING_MAIL: BestellingMailSjablonen = {
  inkooporder: {
    onderwerp: 'Inkooporder {bestelling.nummer}',
    tekst: [
      'Beste {leverancier.naam},',
      '',
      'Hierbij ontvangt u onze inkooporder {bestelling.nummer}. De volledige omschrijving staat in de bijgevoegde pdf.',
      '',
      'Wilt u de order bevestigen? Vermeld bij facturatie het ordernummer, dan verwerken wij uw factuur vlot.',
      '',
      'Met vriendelijke groet,',
    ].join('\n'),
  },
  oa_contract: {
    onderwerp: 'Opdracht {bestelling.nummer}',
    tekst: [
      'Beste {leverancier.naam},',
      '',
      'Hierbij ontvangt u onze opdracht {bestelling.nummer}. De volledige omschrijving staat in de bijgevoegde pdf.',
      '',
      'Wilt u de opdracht bevestigen? Vermeld bij facturatie het opdrachtnummer, dan verwerken wij uw factuur vlot.',
      '',
      'Met vriendelijke groet,',
    ].join('\n'),
  },
}

/** Variabelen die in onderwerp en tekst gebruikt mogen worden — ook de lijst in Instellingen. */
export const BESTELLING_MAIL_VARIABELEN = [
  '{leverancier.naam}',
  '{bestelling.nummer}',
  '{bestelling.soort}',
  '{project.nummer}',
  '{project.naam}',
  '{project.werkadres}',
  '{levering.datum}',
] as const

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createAdminClient() as any

const OVERIGE_SLEUTELS = {
  inkooporder: { onderwerp: 'bestelling_mail_inkooporder_onderwerp', tekst: 'bestelling_mail_inkooporder_tekst' },
  oa_contract: { onderwerp: 'bestelling_mail_oa_onderwerp', tekst: 'bestelling_mail_oa_tekst' },
} as const

function uitOverige(
  overige: Record<string, unknown>,
  soort: keyof BestellingMailSjablonen,
): BestellingMailSjabloon {
  const s = OVERIGE_SLEUTELS[soort]
  const val = (k: string) => (typeof overige[k] === 'string' && overige[k] ? (overige[k] as string) : null)
  return {
    onderwerp: val(s.onderwerp) ?? STANDAARD_BESTELLING_MAIL[soort].onderwerp,
    tekst: val(s.tekst) ?? STANDAARD_BESTELLING_MAIL[soort].tekst,
  }
}

export async function getBestellingMailSjablonen(): Promise<BestellingMailSjablonen> {
  const { data } = await db().from('bedrijfsinstellingen').select('overige').eq('id', 1).maybeSingle()
  const overige = (data?.overige as Record<string, unknown> | null) ?? {}
  return { inkooporder: uitOverige(overige, 'inkooporder'), oa_contract: uitOverige(overige, 'oa_contract') }
}

export async function setBestellingMailSjablonen(sjablonen: BestellingMailSjablonen): Promise<void> {
  const { data } = await db().from('bedrijfsinstellingen').select('overige').eq('id', 1).maybeSingle()
  const overige = (data?.overige as Record<string, unknown> | null) ?? {}
  await db().from('bedrijfsinstellingen').update({
    overige: {
      ...overige,
      [OVERIGE_SLEUTELS.inkooporder.onderwerp]: sjablonen.inkooporder.onderwerp,
      [OVERIGE_SLEUTELS.inkooporder.tekst]: sjablonen.inkooporder.tekst,
      [OVERIGE_SLEUTELS.oa_contract.onderwerp]: sjablonen.oa_contract.onderwerp,
      [OVERIGE_SLEUTELS.oa_contract.tekst]: sjablonen.oa_contract.tekst,
    },
  }).eq('id', 1)
}

/**
 * Vult {variabelen} in. Onbekende of lege variabelen worden leeg — en omdat een lege variabele
 * midden in een zin anders "onze inkooporder ." oplevert, worden dubbele spaties en een spatie
 * vóór leesteken daarna opgeruimd.
 */
export function renderBestellingMailTekst(sjabloon: string, vars: Record<string, string>): string {
  return sjabloon
    .replace(/\{([a-z0-9_.]+)\}/gi, (_, key) => vars[key] ?? '')
    .split('\n')
    .map(regel => regel.replace(/[ \t]{2,}/g, ' ').replace(/ +([.,;:!?])/g, '$1').trimEnd())
    .join('\n')
}
