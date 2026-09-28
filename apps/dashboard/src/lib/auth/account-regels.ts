/**
 * account-regels.ts — één account per medewerker, en welke inlogweg daarbij hoort.
 *
 * EVA kent twee manieren om binnen te komen: Microsoft (Azure) en e-mail + wachtwoord. Welke van
 * de twee geldt, volgt uit het **e-mailadres van de medewerker**, niet uit zijn gebruikerstype:
 * een adres in het bedrijfsdomein hoort bij een Microsoft-account, en daar hoort dus nooit een
 * wachtwoordaccount naast.
 *
 * WAAROM DIT EEN HARDE REGEL IS
 * Een medewerker die zowel per e-mail wordt uitgenodigd als met Microsoft inlogt, krijgt twee
 * losse rijen in `auth.users`. `medewerkers.auth_user_id` wijst er dan maar naar één, en beide
 * inlogpogingen komen daarna uit op "Je account heeft geen toegang tot EVA" — zonder dat de
 * melding verraadt waaróm. Dat is in september 2026 gebeurd en kostte tien dagen om te vinden;
 * de medewerker kon al die tijd niet werken en kon het zelf niet oplossen.
 *
 * Supabase herstelt dit niet vanzelf: `auth.users.email` wordt bij de eerste login gezet en
 * daarna niet meer bijgewerkt, ook niet als Azure een ander adres gaat melden. De enige plek waar
 * dit te voorkomen is, is het moment waarop een account wordt aangemaakt.
 *
 * Het gebruikerstype blijft gaan over wat iemand mág (mobiel-only versus het hele platform), niet
 * over hoe hij binnenkomt. Een uitvoerder met een bedrijfsadres kan dus prima app-gebruiker zijn;
 * hij logt alleen in met Microsoft, net als zijn collega's op kantoor.
 */

/**
 * Het domein waarvoor Microsoft-accounts bestaan. Eén organisatie, één tenant — vandaar een
 * constante en geen instelling. Verhuist het bedrijf naar een ander domein, dan is dit de plek.
 */
export const MICROSOFT_DOMEIN = 'everts.chat'

/** Normaliseert een adres voor vergelijken: trim en kleine letters, leeg wordt null. */
export function normaliseerEmail(email: string | null | undefined): string | null {
  const schoon = (email ?? '').trim().toLowerCase()
  return schoon || null
}

/**
 * Hoort bij dit adres een Microsoft-login? Zo ja, dan mag er géén wachtwoordaccount worden
 * aangemaakt en krijgt de medewerker de Microsoft-uitnodiging.
 */
export function logtInMetMicrosoft(email: string | null | undefined): boolean {
  const adres = normaliseerEmail(email)
  return !!adres && adres.endsWith(`@${MICROSOFT_DOMEIN}`)
}

/** Vaste uitleg voor de beheerder én voor de medewerker op het inlogscherm. */
export const MICROSOFT_UITLEG =
  `Een adres op @${MICROSOFT_DOMEIN} hoort bij een Microsoft-account. `
  + 'Inloggen gaat met de knop Inloggen met Microsoft; er wordt geen wachtwoord ingesteld.'
