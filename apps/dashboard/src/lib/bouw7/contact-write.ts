/**
 * Relaties en contactpersonen bijwerken in Bouw7 (EVA → Bouw7).
 *
 * `POST /contact` en `POST /contact/{contact}/contact-person` zijn partiële upserts: mét `id`
 * wijzigen alleen de meegestuurde velden (geverifieerd sep 2026 op een tijdelijk contact:
 * `phoneNumber` resp. `jobTitle` gewijzigd, de rest bleef staan). Aanmaken zit in
 * create-contact.ts; dit bestand doet het bijwerken.
 *
 * De veldnamen aan de schrijfkant zijn de Swagger-namen (`email`, `mobileNumber`,
 * `accountNumber`, …) en verschillen van de leeskant (`emailAddress`, `mobilePhoneNumber`,
 * `iban`). Omdat niet elk schrijfveld live is bevestigd, leest elke write het record terug en
 * meldt hij welke velden Bouw7 daadwerkelijk heeft overgenomen. Een veld dat niet aankwam
 * blijft in EVA gemarkeerd (zie lib/bouw7/handmatige-velden.ts) en wordt dus niet door de
 * sync overschreven — EVA verliest er niets aan, de cron probeert het opnieuw.
 */

import { createAdminClient } from '@everts/database/server'
import { getBouw7Client } from './sync'
import type { Bouw7Contact, Bouw7ContactPerson, Bouw7ListResponse } from './client'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createAdminClient() as any

export type ContactWriteResultaat =
  | { ok: true; geschreven: string[]; nietOvergenomen: string[] }
  | { ok: false; error: string; geschreven: string[] }

/** EVA-kolom → { schrijfveld op POST /contact, leesveld op /list/contacts }. */
const RELATIE_VELDEN: Record<string, { post: string; lees: keyof Bouw7Contact }> = {
  naam:           { post: 'name',         lees: 'name' },
  kvk_nummer:     { post: 'cocNumber',    lees: 'cocNumber' },
  btw_nummer:     { post: 'vatNumber',    lees: 'vatNumber' },
  email:          { post: 'email',        lees: 'emailAddress' },
  telefoon:       { post: 'phoneNumber',  lees: 'phoneNumber' },
  mobiel:         { post: 'mobileNumber', lees: 'mobilePhoneNumber' },
  opmerkingen:    { post: 'information',  lees: 'information' },
  adres_postcode: { post: 'zipCode',      lees: 'zipCode' },
  adres_plaats:   { post: 'city',         lees: 'city' },
  actief:         { post: 'isActive',     lees: 'isActive' },
  iban:           { post: 'accountNumber', lees: 'iban' },
}

const norm = (v: unknown): string => (v == null ? '' : String(v)).trim()

/**
 * Schrijf de opgegeven relatiekolommen naar het Bouw7-contact. `iban` komt uit
 * `relatie_bankgegevens`; `adres_straat` gaat als `streetName` (het huisnummer zit in EVA al in
 * de straat, zoals de sync hem samenvoegt). Niet-gekende kolommen worden genegeerd.
 */
export async function schrijfBouw7Relatie(relatieId: string, velden: readonly string[]): Promise<ContactWriteResultaat> {
  const geschreven: string[] = []
  try {
    const supabase = db()
    const { data: r } = await supabase
      .from('relaties')
      .select('bouw7_id, naam, kvk_nummer, btw_nummer, email, telefoon, mobiel, opmerkingen, adres_straat, adres_postcode, adres_plaats, actief')
      .eq('id', relatieId)
      .maybeSingle()
    if (!r?.bouw7_id) return { ok: false, error: 'Relatie staat nog niet in Bouw7.', geschreven }

    const body: Record<string, unknown> = { id: Number(r.bouw7_id) }
    const verwacht = new Map<string, { lees: keyof Bouw7Contact; waarde: string }>()
    for (const k of velden) {
      if (k === 'adres_straat') {
        body.streetName = norm(r.adres_straat)
        body.houseNumber = ''
        verwacht.set(k, { lees: 'streetName', waarde: norm(r.adres_straat) })
        continue
      }
      if (k === 'iban') {
        const { data: bank } = await supabase.from('relatie_bankgegevens').select('iban').eq('relatie_id', relatieId).maybeSingle()
        body.accountNumber = norm(bank?.iban)
        verwacht.set(k, { lees: 'iban', waarde: norm(bank?.iban) })
        continue
      }
      const def = RELATIE_VELDEN[k]
      if (!def) continue
      const waarde = k === 'actief' ? r.actief !== false : (r[k] ?? '')
      body[def.post] = waarde
      verwacht.set(k, { lees: def.lees, waarde: k === 'actief' ? String(r.actief !== false) : norm(waarde) })
    }
    if (verwacht.size === 0) return { ok: true, geschreven, nietOvergenomen: [] }

    const client = await getBouw7Client()
    await client.post('/contact', body)

    // Terugleescontrole: welke velden nam Bouw7 echt over?
    const na = (await client.get<Bouw7ListResponse<Bouw7Contact>>('/list/contacts', { q: `id = ${Number(r.bouw7_id)}` })).items?.[0]
    const nietOvergenomen: string[] = []
    for (const [k, v] of verwacht) {
      const gelezen = na ? na[v.lees] : undefined
      // Straat komt terug als `streetName houseNumber`; vergelijk zonder het lege huisnummer.
      const gelezenNorm = k === 'adres_straat' ? norm(`${na?.streetName ?? ''} ${na?.houseNumber ?? ''}`) : norm(gelezen)
      if (na && gelezenNorm === v.waarde) geschreven.push(k)
      else nietOvergenomen.push(k)
    }
    return { ok: true, geschreven, nietOvergenomen }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Onbekende fout bij bijwerken van de relatie in Bouw7.', geschreven }
  }
}

/** EVA-kolom → { schrijfveld, leesveld } voor contactpersonen. */
const CP_VELDEN: Record<string, { post: string; lees: keyof Bouw7ContactPerson }> = {
  voornaam:   { post: 'firstName',   lees: 'firstName' },
  achternaam: { post: 'lastName',    lees: 'lastName' },
  email:      { post: 'email',       lees: 'emailAddress' },
  telefoon:   { post: 'phoneNumber', lees: 'phoneNumber' },
  aanhef:     { post: 'salutation',  lees: 'salutation' },
}

/** Het Bouw7-contact waaronder de contactpersoon hangt: de eerste gekoppelde organisatie mét Bouw7-id. */
async function moederContactBouw7Id(contactpersoonId: string): Promise<number | null> {
  const { data } = await db()
    .from('contactpersoon_organisaties')
    .select('relaties!organisatie_id ( bouw7_id )')
    .eq('contactpersoon_id', contactpersoonId)
  for (const l of (data ?? []) as { relaties?: { bouw7_id?: string | null } | null }[]) {
    if (l.relaties?.bouw7_id) return Number(l.relaties.bouw7_id)
  }
  return null
}

/**
 * De Bouw7-spiegels van een persoon als `{ moeder, cp }`-paren: het contact waaronder de rij
 * hangt en het contactpersoon-id daarbinnen. Eén mens die voor twee bedrijven werkt heeft er
 * twee — Bouw7 kent geen gedeelde contactpersoon.
 */
async function spiegelParen(contactpersoonId: string): Promise<{ moeder: number; cp: number }[]> {
  const supabase = db()
  const { data } = await supabase
    .from('contactpersoon_bouw7_koppelingen')
    .select('bouw7_id, bouw7_contact_id, organisatie_id, is_primair')
    .eq('contactpersoon_id', contactpersoonId)
    .order('is_primair', { ascending: false })

  const paren: { moeder: number; cp: number }[] = []
  for (const s of (data ?? []) as { bouw7_id: string; bouw7_contact_id: string | null; organisatie_id: string | null }[]) {
    let moeder = s.bouw7_contact_id ? Number(s.bouw7_contact_id) : null
    if (moeder == null && s.organisatie_id) {
      const { data: rel } = await supabase.from('relaties').select('bouw7_id').eq('id', s.organisatie_id).maybeSingle()
      moeder = rel?.bouw7_id ? Number(rel.bouw7_id) : null
    }
    if (moeder != null && Number.isFinite(Number(s.bouw7_id))) paren.push({ moeder, cp: Number(s.bouw7_id) })
  }

  if (paren.length === 0) {
    // Terugval voor personen zonder spiegelrij: de oude route via contactpersonen.bouw7_id.
    const { data: cp } = await supabase.from('contactpersonen').select('bouw7_id').eq('id', contactpersoonId).maybeSingle()
    const moeder = await moederContactBouw7Id(contactpersoonId)
    if (cp?.bouw7_id && moeder) paren.push({ moeder, cp: Number(cp.bouw7_id) })
  }
  return paren
}

/**
 * Schrijf de opgegeven contactpersoonkolommen naar Bouw7 (persoonsvelden; de functie gaat apart).
 *
 * Alle spiegels krijgen dezelfde waarde: het gaat om één mens, en de naam of het 06-nummer
 * hoort bij elk bedrijf hetzelfde te zijn. Een veld telt pas als geschreven wanneer élke
 * spiegel het heeft overgenomen — anders blijft het in EVA beschermd en probeert de cron opnieuw.
 */
export async function schrijfBouw7Contactpersoon(contactpersoonId: string, velden: readonly string[]): Promise<ContactWriteResultaat> {
  const geschreven: string[] = []
  try {
    const supabase = db()
    const { data: cp } = await supabase
      .from('contactpersonen')
      .select('voornaam, achternaam, email, telefoon, aanhef')
      .eq('id', contactpersoonId)
      .maybeSingle()
    if (!cp) return { ok: false, error: 'Contactpersoon bestaat niet.', geschreven }

    const paren = await spiegelParen(contactpersoonId)
    if (paren.length === 0) return { ok: false, error: 'Contactpersoon staat nog niet in Bouw7.', geschreven }

    const verwacht = new Map<string, { lees: keyof Bouw7ContactPerson; waarde: string }>()
    const body: Record<string, unknown> = {}
    for (const k of velden) {
      const def = CP_VELDEN[k]
      if (!def) continue
      body[def.post] = cp[k] ?? ''
      verwacht.set(k, { lees: def.lees, waarde: norm(cp[k]) })
    }
    if (verwacht.size === 0) return { ok: true, geschreven, nietOvergenomen: [] }

    const client = await getBouw7Client()
    const aangekomen = new Map<string, number>()
    for (const paar of paren) {
      await client.post(`/contact/${paar.moeder}/contact-person`, { ...body, id: paar.cp })
      const na = (await client.get<Bouw7ListResponse<Bouw7ContactPerson>>('/list/contact-persons', { q: `contact.id = ${paar.moeder}` }))
        .items?.find(p => Number(p.id) === paar.cp)
      for (const [k, v] of verwacht) {
        if (na && norm(na[v.lees]) === v.waarde) aangekomen.set(k, (aangekomen.get(k) ?? 0) + 1)
      }
    }

    const nietOvergenomen: string[] = []
    for (const k of verwacht.keys()) {
      if ((aangekomen.get(k) ?? 0) === paren.length) geschreven.push(k)
      else nietOvergenomen.push(k)
    }
    return { ok: true, geschreven, nietOvergenomen }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Onbekende fout bij bijwerken van de contactpersoon in Bouw7.', geschreven }
  }
}

/**
 * De functie (jobTitle) van een contactpersoon. In EVA hangt die aan de koppeling met één
 * organisatie; in Bouw7 aan de contactpersoon-rij van dát bedrijf. Met `organisatieId` gaat de
 * functie dus naar de juiste spiegel — zonder zou een tweede werkgever de titel overschrijven.
 * Geverifieerd: partiële `{ id, jobTitle }` werkt.
 */
export async function schrijfBouw7ContactpersoonFunctie(
  contactpersoonId: string,
  functie: string | null,
  organisatieId?: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const supabase = db()
    let moeder: number | null = null
    let cpBouw7Id: number | null = null

    if (organisatieId) {
      const { data: s } = await supabase
        .from('contactpersoon_bouw7_koppelingen')
        .select('bouw7_id, bouw7_contact_id')
        .eq('contactpersoon_id', contactpersoonId)
        .eq('organisatie_id', organisatieId)
        .maybeSingle()
      if (s?.bouw7_id) {
        cpBouw7Id = Number(s.bouw7_id)
        moeder = s.bouw7_contact_id ? Number(s.bouw7_contact_id) : null
        if (moeder == null) {
          const { data: rel } = await supabase.from('relaties').select('bouw7_id').eq('id', organisatieId).maybeSingle()
          moeder = rel?.bouw7_id ? Number(rel.bouw7_id) : null
        }
      }
    }

    if (cpBouw7Id == null || moeder == null) {
      const paren = await spiegelParen(contactpersoonId)
      if (paren.length === 0) return { ok: false, error: 'Contactpersoon staat nog niet in Bouw7.' }
      ;({ moeder, cp: cpBouw7Id } = paren[0])
    }

    const client = await getBouw7Client()
    await client.post(`/contact/${moeder}/contact-person`, { id: cpBouw7Id, jobTitle: functie ?? '' })
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Onbekende fout bij bijwerken van de functie in Bouw7.' }
  }
}
