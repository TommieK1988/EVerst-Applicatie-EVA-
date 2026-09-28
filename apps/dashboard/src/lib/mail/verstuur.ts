import 'server-only'

/**
 * Mail namens de ingelogde medewerker, met de testomleiding erin verwerkt.
 *
 * Stond eerst als privéhulpje in `lib/dossiers/uitvraag-mail-acties.ts`. De mandaatmail heeft
 * dezelfde omleiding nodig, en dat bestand is `'use server'`: een export daar zou vanuit de browser
 * aanroepbaar worden — een knop die naar elk willekeurig adres mailt. Daarom hier, server-only.
 *
 * TESTEN ZONDER EXTERNE PARTIJEN TE MAILEN: zet `MAIL_OMLEIDEN_NAAR` in `.env.local`. Alle
 * geadresseerden worden dan vervangen door dat ene adres en het onderwerp krijgt een [TEST]-voorvoegsel
 * met de oorspronkelijke ontvangers erin. Bewust niet in `verstuurMailNamensMedewerker` zelf: dat is de
 * gedeelde verzendlaag van offertes, bestellingen en opleveringen, en die pas je niet aan voor een test.
 */

/** Omleiding voor testen; leeg in productie. */
function omleiding(): string | null {
  const v = (process.env.MAIL_OMLEIDEN_NAAR ?? '').trim()
  return v.includes('@') ? v : null
}

export function splitsAdressen(v?: string | null): string[] {
  return (v ?? '').split(/[;,]/).map(s => s.trim()).filter(Boolean)
}

/** Gooit bij mislukking (net als de onderliggende Graph-laag); de aanroeper beslist wat dat raakt. */
export async function verstuurMetOmleiding(
  medewerkerId: string,
  input: { to: string[]; cc: string[]; onderwerp: string; bodyHtml: string },
): Promise<void> {
  const naar = omleiding()
  const { verstuurMailNamensMedewerker } = await import('@/lib/o365/mail')
  await verstuurMailNamensMedewerker(medewerkerId, {
    to: naar ? [naar] : input.to,
    cc: naar ? [] : input.cc,
    subject: naar
      ? `[TEST → ${[...input.to, ...input.cc].join(', ')}] ${input.onderwerp}`
      : input.onderwerp,
    bodyHtml: input.bodyHtml,
  })
}
