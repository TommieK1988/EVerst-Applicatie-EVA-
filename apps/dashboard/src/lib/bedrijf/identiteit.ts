import 'server-only'
import { cache } from 'react'
import { createAdminClient } from '@everts/database/server'

/**
 * De identiteit van de organisatie waar deze installatie van is: naam, logo's en merkkleuren.
 *
 * WAAROM DIT BESTAAT: het inlogscherm, het klantportaal, de publieke opleverpagina's, de PWA-naam
 * en de uitgaande mail toonden allemaal een hardgeschreven "EVERTS." met `/logo-beeldmerk.svg`,
 * terwijl er een compleet Huisstijl-scherm bestaat dat niemand las. Eén installatie hoort één
 * identiteit te hebben en die hoort uit de database te komen, niet uit de JSX.
 *
 * LET OP — `.limit(1)` zonder filter is hier fout. De tabel bevat de organisatie én de
 * werkmaatschappijen (nu vier rijen); zonder `type = 'organisatie'` krijg je een willekeurige
 * werkmaatschappij terug. Dat is eerder misgegaan en leverde "Dakplan" op als bedrijfsnaam.
 *
 * Bewust GEEN terugval op echte Everts-waarden: een lege installatie hoort een lege kop te
 * tonen, niet het merk van een ander bedrijf. Zie ook `LEEG_BEDRIJF` in
 * `lib/everts-calc/quote-renderer.ts` — zelfde afweging.
 */
export type BedrijfsIdentiteit = {
  /** Lege string als de organisatiegegevens nog niet zijn ingevuld. */
  naam: string
  /** Woordmerk voor de kop; valt terug op `naam`. Leeg = toon geen woordmerk. */
  woordmerk: string
  logo_primair_url: string | null
  logo_wit_url: string | null
  logo_icon_url: string | null
  kleur_primair: string | null
  kleur_accent: string | null
  website: string | null
  email: string | null
  telefoon: string | null
  /** Vestigingsplaats; gebruikt op het inlogscherm. */
  plaats: string | null
  /**
   * Domein van het zakelijke e-mailadres (bv. `voorbeeld.nl` uit `info@voorbeeld.nl`).
   * Het inlogscherm noemt dit als "log in met je <domein>-account". Afgeleid en niet apart
   * ingesteld: klopt het domein niet, pas dan het organisatie-e-mailadres aan.
   */
  mail_domein: string | null
}

export const LEGE_IDENTITEIT: BedrijfsIdentiteit = {
  naam: '',
  woordmerk: '',
  logo_primair_url: null,
  logo_wit_url: null,
  logo_icon_url: null,
  kleur_primair: null,
  kleur_accent: null,
  website: null,
  email: null,
  telefoon: null,
  plaats: null,
  mail_domein: null,
}

/**
 * Leest de organisatie-rij. `cache()` dedupliceert binnen één request — het inlogscherm en de
 * portaalkop vragen hem allebei op.
 *
 * Faalt nooit: zonder rij (of bij een leesfout) komt de lege identiteit terug, zodat een
 * ontbrekende inrichting geen pagina stukmaakt maar wél zichtbaar leeg is.
 */
export const getBedrijfsIdentiteit = cache(async (): Promise<BedrijfsIdentiteit> => {
  try {
    const { data, error } = await createAdminClient()
      .from('bedrijfsgegevens')
      .select('naam, logo_primair_url, logo_wit_url, logo_icon_url, kleur_primair, kleur_accent, website, email, telefoon, adres_plaats')
      .eq('type', 'organisatie')
      .maybeSingle()

    if (error || !data) return LEGE_IDENTITEIT

    const naam = (data.naam ?? '').trim()
    const email = data.email ?? null
    const domein = email?.includes('@') ? email.split('@').pop()!.trim().toLowerCase() || null : null
    return {
      naam,
      woordmerk: naam,
      logo_primair_url: data.logo_primair_url ?? null,
      logo_wit_url: data.logo_wit_url ?? null,
      logo_icon_url: data.logo_icon_url ?? null,
      kleur_primair: data.kleur_primair ?? null,
      kleur_accent: data.kleur_accent ?? null,
      website: data.website ?? null,
      email,
      telefoon: data.telefoon ?? null,
      plaats: data.adres_plaats ?? null,
      mail_domein: domein,
    }
  } catch {
    return LEGE_IDENTITEIT
  }
})
