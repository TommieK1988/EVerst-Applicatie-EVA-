'use server'

import { createAdminClient } from '@everts/database/server'
import { bouwInloglinkMail, verstuurPortaalMailDirect } from '@/lib/portaal/mail'

/**
 * De inlogactie van het klantportaal.
 *
 * Deze action is per definitie publiek aanroepbaar — hij zit vóór de login. Dat
 * betekent twee dingen die de hele opzet bepalen:
 *
 *  1. Het antwoord is ALTIJD hetzelfde, of het adres nu bekend is of niet.
 *     Anders is dit formulier een gratis controle op "is deze persoon klant bij
 *     Everts", en dat is precies het soort informatie waar phishing op draait.
 *     Dezelfde afweging als bij `stuurHerstelLink` in de EVA-login.
 *  2. Er zit een rem op. Zonder rem kan iemand met dit formulier de postbus van
 *     een klant vol laten lopen vanaf onze eigen server.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createAdminClient() as any

/** Minimale tijd tussen twee inloglinks naar hetzelfde adres. */
const REM_SECONDEN = 60

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export type InlogResultaat = { ok: true } | { ok: false; error: string }

export async function vraagInloglink(email: string): Promise<InlogResultaat> {
  const adres = (email ?? '').trim().toLowerCase()
  if (!EMAIL.test(adres) || adres.length > 254) {
    return { ok: false, error: 'Vul een geldig e-mailadres in.' }
  }

  try {
    const { data: gebruiker } = await db()
      .from('portaal_gebruikers')
      .select('id, email, actief, laatste_link_op, contactpersoon_id, particulier_id')
      .eq('email', adres)
      .maybeSingle()

    // Onbekend of geblokkeerd: stil doen alsof het gelukt is. De beller ziet
    // hetzelfde scherm als iemand die wél een link krijgt.
    if (!gebruiker || !gebruiker.actief) return { ok: true }

    const vorige = gebruiker.laatste_link_op ? Date.parse(gebruiker.laatste_link_op) : 0
    if (Number.isFinite(vorige) && Date.now() - vorige < REM_SECONDEN * 1000) {
      // Ook hier geen aparte melding: dat zou alsnog verklappen dat het adres
      // bestaat. De klant heeft net een mail gekregen en kan die gewoon gebruiken.
      return { ok: true }
    }

    const voornaam = await haalVoornaam(gebruiker)
    const mail = bouwInloglinkMail(voornaam)

    await verstuurPortaalMailDirect({
      email: gebruiker.email,
      onderwerp: mail.onderwerp,
      bodyHtml: mail.bodyHtml,
    })

    await db().from('portaal_gebruikers')
      .update({ laatste_link_op: new Date().toISOString() })
      .eq('id', gebruiker.id)

    return { ok: true }
  } catch (e) {
    // Een echte storing (Graph plat, postbus verkeerd geconfigureerd) mag niet
    // als "gelukt" eindigen — dan wacht de klant op een mail die nooit komt.
    // De oorzaak zelf blijft binnen: die zegt de aanvrager niets en verklapt
    // hooguit iets over onze inrichting.
    console.error('[portaal] inloglink versturen mislukt', e)
    return { ok: false, error: 'Er ging iets mis bij het versturen. Probeer het later opnieuw of bel ons.' }
  }
}

/** Voor de aanhef in de mail. Ontbreekt hij, dan wordt het "Beste heer/mevrouw". */
async function haalVoornaam(gebruiker: {
  contactpersoon_id: string | null
  particulier_id: string | null
}): Promise<string | null> {
  if (gebruiker.contactpersoon_id) {
    const { data } = await db().from('contactpersonen')
      .select('voornaam').eq('id', gebruiker.contactpersoon_id).maybeSingle()
    return data?.voornaam ?? null
  }
  if (gebruiker.particulier_id) {
    const { data } = await db().from('particulieren')
      .select('voornaam').eq('id', gebruiker.particulier_id).maybeSingle()
    return data?.voornaam ?? null
  }
  return null
}
