'use server'

/**
 * mailintake/beantwoorden.ts
 *
 * Reageren op een binnengekomen bericht, vanuit het eigen mailadres van de
 * behandelaar.
 *
 * WAAROM VANUIT DE PERSOON EN NIET UIT DE POSTBUS
 * De intake-registratie in Azure heeft bewust alleen `Mail.ReadWrite`: EVA mag de
 * postbussen lezen en opruimen, niet namens ze mailen. Dat is een grens die we
 * niet oprekken voor een antwoordknop. `verstuurMailNamensMedewerker` gebruikt het
 * persoonlijke token van wie is ingelogd (`/me/sendMail`), dus het antwoord komt
 * uit zijn eigen mailbox en staat ook in zijn Verzonden items. Dat is precies wat
 * je wilt: de klant krijgt antwoord van een mens, niet van een systeemadres.
 *
 * WAT DIT NIET IS
 * Geen echte "reply" in de mailketen. Graph kan een antwoord alleen in de thread
 * hangen als het oorspronkelijke bericht in de mailbox van de afzender staat, en
 * dat is hier de gedeelde postbus. De `In-Reply-To`-header zelf mag via Graph niet
 * gezet worden (alleen `x-`-headers). Het wordt dus een nieuw bericht met `RE:` in
 * het onderwerp en het origineel eronder geciteerd -- voor de ontvanger niet te
 * onderscheiden van een gewoon antwoord, maar het klapt in Outlook niet samen in
 * dezelfde conversatie.
 *
 * NAAR WIE
 * Niet klakkeloos naar de afzender. Werkorders komen van een postbus of van een
 * no-reply-adres, en er staat vaak "u kunt hier niet op reageren" onderaan. De
 * kandidaten worden daarom als lijst aangeboden en de behandelaar kiest: de
 * oorspronkelijke afzender uit de doorstuurkop, het adres in de handtekening, en
 * pas daarna de afzender van het bericht zelf.
 */

import { createAdminClient } from '@everts/database/server'
import type { Json } from '@everts/database'
import { revalidatePath } from 'next/cache'

import { vereisRecht } from '@/lib/auth/rechten'
import { verstuurMailNamensMedewerker } from '@/lib/o365/mail'

import { afzenderUitDoorstuur, eigenDomeinen, domeinVan } from './triage'

export interface AntwoordConcept {
  /** Voorgestelde ontvangers, gescheiden door `;` — het formaat van OntvangerVeld. */
  aan: string
  onderwerp: string
  /** Het origineel, als platte tekst, om onder het antwoord te citeren. */
  origineel: string
  /** Waarom deze ontvanger wordt voorgesteld; één regel voor onder het veld. */
  toelichting: string
  relatieId: string | null
  dossierId: string | null
  /** true als de mail zegt dat er niet op geantwoord kan worden. */
  noReply: boolean
}

const NO_REPLY_TEKENS = [
  'niet op reageren', 'niet reageren op', 'do not reply', 'no-reply', 'noreply',
  'automatisch gegenereerde', 'automatically generated',
]

/** Haalt `RE:`/`FW:`-voorvoegsels weg, zodat er niet `RE: FW: RE:` ontstaat. */
function kaalOnderwerp(onderwerp: string | null): string {
  let t = (onderwerp ?? '').trim()
  for (let i = 0; i < 5; i++) {
    const korter = t.replace(/^\s*(re|fw|fwd|antw|doorst)\s*:\s*/i, '')
    if (korter === t) break
    t = korter
  }
  return t
}

/**
 * Stelt het antwoord samen. Leest alleen; er gaat nog niets de deur uit.
 */
export async function getAntwoordConcept(berichtId: string): Promise<
  { ok: true; concept: AntwoordConcept } | { ok: false; error: string }
> {
  await vereisRecht('mailintake', 'lezen')
  const supabase = createAdminClient()

  const { data: b } = await supabase
    .from('mailintake_berichten')
    .select('id, onderwerp, van_naam, van_adres, ontvangen_op, body_tekst, relatie_id, dossier_id, contactpersoon_id')
    .eq('id', berichtId)
    .maybeSingle()

  if (!b) return { ok: false, error: 'Bericht niet gevonden.' }

  const eigen = await eigenDomeinen()
  const vanDomein = domeinVan(b.van_adres)
  const isDoorstuur = vanDomein != null && eigen.has(vanDomein)
  const origineleAfzender = isDoorstuur ? afzenderUitDoorstuur(b.body_tekst ?? '', eigen) : null

  // De contactpersoon die op het bericht staat; die is door de lezing én de
  // correctie uit de mail heen gegaan, dus dat is de best onderbouwde keuze.
  let cpAdres: string | null = null
  let cpNaam: string | null = null
  if (b.contactpersoon_id) {
    const { data: cp } = await supabase
      .from('contactpersonen')
      .select('voornaam, tussenvoegsel, achternaam, email')
      .eq('id', b.contactpersoon_id)
      .maybeSingle()
    if (cp?.email) {
      cpAdres = cp.email
      cpNaam = [cp.voornaam, cp.tussenvoegsel, cp.achternaam].filter(Boolean).join(' ').trim()
    }
  }

  const body = (b.body_tekst ?? '').toLowerCase()
  const noReply = NO_REPLY_TEKENS.some(t => body.includes(t))
    || (b.van_adres ?? '').toLowerCase().includes('no_reply')
    || (b.van_adres ?? '').toLowerCase().includes('noreply')

  // Volgorde: wie het meest waarschijnlijk antwoord kan geven staat vooraan.
  const kandidaat = cpAdres ?? origineleAfzender ?? (noReply ? null : b.van_adres)
  const toelichting = cpAdres
    ? `Voorgesteld: ${cpNaam ?? cpAdres}, de contactpersoon op dit bericht.`
    : origineleAfzender
      ? `Voorgesteld: de oorspronkelijke afzender uit de doorgestuurde mail.`
      : noReply
        ? 'Dit bericht komt van een adres waarop niet geantwoord kan worden — kies zelf een ontvanger.'
        : `Voorgesteld: de afzender van het bericht.`

  return {
    ok: true,
    concept: {
      aan: kandidaat ?? '',
      onderwerp: `RE: ${kaalOnderwerp(b.onderwerp) || '(geen onderwerp)'}`,
      origineel: (b.body_tekst ?? '').trim().slice(0, 8000),
      toelichting,
      relatieId: b.relatie_id,
      dossierId: b.dossier_id,
      noReply,
    },
  }
}

function alsHtml(tekst: string): string {
  const veilig = tekst
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return veilig.split('\n').map(r => `<p style="margin:0 0 6px">${r || '&nbsp;'}</p>`).join('')
}

export interface AntwoordInvoer {
  berichtId: string
  aan: string
  cc?: string
  onderwerp: string
  bericht: string
  /** Het origineel eronder citeren. Standaard aan: de ontvanger weet dan waarop je reageert. */
  citeer?: boolean
}

export async function beantwoordBericht(inv: AntwoordInvoer): Promise<{ ok: boolean; error?: string }> {
  const { medewerker } = await vereisRecht('mailintake', 'schrijven')
  const supabase = createAdminClient()

  const splits = (v: string) => v.split(/[,;\n]/).map(s => s.trim()).filter(Boolean)
  const aan = splits(inv.aan)
  const cc = splits(inv.cc ?? '')

  if (!aan.length) return { ok: false, error: 'Er is geen ontvanger ingevuld.' }
  if (!inv.bericht.trim()) return { ok: false, error: 'Het bericht is leeg.' }

  const { data: b } = await supabase
    .from('mailintake_berichten')
    .select('id, onderwerp, van_naam, van_adres, ontvangen_op, body_tekst')
    .eq('id', inv.berichtId)
    .maybeSingle()
  if (!b) return { ok: false, error: 'Bericht niet gevonden.' }

  let html = alsHtml(inv.bericht.trim())

  if (inv.citeer !== false) {
    const datum = b.ontvangen_op
      ? new Date(b.ontvangen_op).toLocaleString('nl-NL', { dateStyle: 'full', timeStyle: 'short' })
      : ''
    const kop = `Op ${datum} schreef ${b.van_naam ?? b.van_adres ?? 'de afzender'}:`
    html +=
      '<hr style="border:none;border-top:1px solid #d4d4d4;margin:16px 0">'
      + `<p style="margin:0 0 6px;color:#666;font-size:12px">${kop.replace(/</g, '&lt;')}</p>`
      + `<blockquote style="margin:0;padding-left:12px;border-left:2px solid #d4d4d4;color:#555">`
      + alsHtml((b.body_tekst ?? '').trim().slice(0, 8000))
      + '</blockquote>'
  }

  try {
    await verstuurMailNamensMedewerker(medewerker.id, {
      to: aan,
      cc,
      subject: inv.onderwerp.trim() || `RE: ${kaalOnderwerp(b.onderwerp)}`,
      bodyHtml: html,
    })
  } catch (e) {
    // De meest voorkomende oorzaak is geen gekoppeld Microsoft-account; dat is een
    // andere melding dan "Graph is stuk", en de behandelaar moet weten welke.
    const tekst = e instanceof Error ? e.message : String(e)
    return {
      ok: false,
      error: /token|account|unauthor|401/i.test(tekst)
        ? 'Je Microsoft-account is niet (meer) aan EVA gekoppeld; log opnieuw in met Microsoft.'
        : `Versturen mislukt: ${tekst.slice(0, 200)}`,
    }
  }

  await supabase.from('mailintake_besluiten').insert({
    bericht_id: inv.berichtId,
    actor: 'medewerker',
    medewerker_id: medewerker.id,
    actie: 'beantwoord',
    details: { aan, cc, onderwerp: inv.onderwerp } as unknown as Json,
  })

  revalidatePath(`/mailintake/${inv.berichtId}`)
  return { ok: true }
}
