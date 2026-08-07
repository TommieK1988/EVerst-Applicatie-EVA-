'use server'

/**
 * Kandidaat-ontvangers voor de mailvensters in EVA.
 *
 * Overal waar EVA een mail verstuurt (offerte, bestelling, document, opleverrapportage)
 * moest het adres met de hand ingetikt worden. Eén typefout en de mail komt nooit aan —
 * of erger, bij de verkeerde. Deze module levert de lijst waaruit je kunt kiezen:
 * de contactpersonen die bij dit dossier horen, de leverancier van deze bestelling,
 * de collega's die aan het dossier gekoppeld zijn, en als vangnet alle medewerkers.
 *
 * De volgorde van de groepen is de volgorde waarin ze in de kiezer verschijnen —
 * van "hoort bij dit dossier" naar "ergens in EVA".
 */

import { createAdminClient } from '@everts/database/server'
import { vereisSessie } from '@/lib/auth/rechten'

export type MailOntvanger = {
  /** Het adres zelf — dit belandt in het Aan/CC-veld. */
  email: string
  /** Weergavenaam, bijv. "Jan de Vries". */
  naam: string
  /** Tweede regel in de kiezer: functie, organisatie of herkomst. */
  subtitel?: string
  /** Kopje waaronder de regel gegroepeerd wordt. */
  groep: string
}

export type MailOntvangersInput = {
  /** Dossier waar de mail bij hoort — levert klant, contactpersonen en rolhouders. */
  dossierId?: string | null
  /** Extra organisatie, bijv. de leverancier van een bestelling. */
  relatieId?: string | null
}

/** Rolkolommen op `dossiers` met hun label in de kiezer. */
const ROLLEN: { kolom: string; label: string }[] = [
  { kolom: 'project_manager_id', label: 'Projectleider' },
  { kolom: 'teamleider_id',      label: 'Teamleider' },
  { kolom: 'werkvoorbereider_id', label: 'Werkvoorbereider' },
  { kolom: 'calculator_id',      label: 'Calculator' },
  { kolom: 'uitvoerder_id',      label: 'Uitvoerder' },
  { kolom: 'controller_id',      label: 'Controller' },
]

function volledigeNaam(r: { voornaam?: string | null; tussenvoegsel?: string | null; achternaam?: string | null }): string {
  return [r.voornaam, r.tussenvoegsel, r.achternaam].filter(Boolean).join(' ')
}

/** Adres schoonmaken; geeft null terug als er geen bruikbaar adres in zit. */
function schoonAdres(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const s = v.trim()
  return s.includes('@') ? s : null
}

/**
 * Verzamelt alle adressen waaruit een gebruiker kan kiezen bij het mailen.
 *
 * Alles is fail-soft: een deel dat niet laadt (geen dossier, geen klant, Bouw7-veld leeg)
 * laat de rest van de lijst intact. Een kiezer die half gevuld is helpt nog steeds; een
 * kiezer die klapt dwingt weer tot handmatig typen.
 */
export async function getMailOntvangers(input: MailOntvangersInput): Promise<MailOntvanger[]> {
  await vereisSessie()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any

  const uit: MailOntvanger[] = []
  /** Adressen die al in de lijst staan — eerste vermelding wint (die is het meest specifiek). */
  const gezien = new Set<string>()

  function voegToe(email: string | null, naam: string, groep: string, subtitel?: string) {
    if (!email) return
    const sleutel = email.toLowerCase()
    if (gezien.has(sleutel)) return
    gezien.add(sleutel)
    uit.push({ email, naam: naam || email, subtitel, groep })
  }

  // ── Dossier: klant, eigen contactpersoon, werkadres en rolhouders ──────────
  let klantId: string | null = null

  if (input.dossierId) {
    const { data: d } = await admin
      .from('dossiers')
      .select(`
        klant_id, werkadres_email, werkadres_naam,
        ${ROLLEN.map(r => r.kolom).join(', ')},
        relaties!klant_id ( id, naam, email ),
        contactpersonen ( voornaam, tussenvoegsel, achternaam, email )
      `)
      .eq('id', input.dossierId)
      .maybeSingle()

    if (d) {
      klantId = d.klant_id ?? null
      const klantNaam: string = d.relaties?.naam ?? 'Opdrachtgever'

      // De contactpersoon die op het dossier staat is bijna altijd de bedoelde ontvanger.
      if (d.contactpersonen) {
        voegToe(schoonAdres(d.contactpersonen.email), volledigeNaam(d.contactpersonen),
          'Dit dossier', `Contactpersoon · ${klantNaam}`)
      }
      voegToe(schoonAdres(d.werkadres_email), d.werkadres_naam || 'Contact op locatie',
        'Dit dossier', 'Werkadres')
      voegToe(schoonAdres(d.relaties?.email), klantNaam, 'Dit dossier', 'Algemeen adres opdrachtgever')

      // Rolhouders: de collega's die aan dít dossier gekoppeld zijn.
      const rolIds = ROLLEN
        .map(r => ({ label: r.label, id: d[r.kolom] as string | null }))
        .filter((r): r is { label: string; id: string } => !!r.id)

      if (rolIds.length > 0) {
        const { data: meds } = await admin
          .from('medewerkers')
          .select('id, voornaam, tussenvoegsel, achternaam, email, o365_email')
          .in('id', [...new Set(rolIds.map(r => r.id))])

        // Eén medewerker kan meerdere rollen hebben (calculator ≡ werkvoorbereider):
        // die rollen samen op één regel, anders staat dezelfde persoon er dubbel in.
        const rollenPerId = new Map<string, string[]>()
        for (const r of rolIds) {
          if (!rollenPerId.has(r.id)) rollenPerId.set(r.id, [])
          rollenPerId.get(r.id)!.push(r.label)
        }
        for (const m of (meds ?? [])) {
          voegToe(schoonAdres(m.o365_email) ?? schoonAdres(m.email), volledigeNaam(m),
            'Betrokken collega’s', (rollenPerId.get(m.id) ?? []).join(' · '))
        }
      }
    }
  }

  // ── Contactpersonen van de betrokken organisaties ──────────────────────────
  const organisatieIds = [...new Set([klantId, input.relatieId].filter((v): v is string => !!v))]

  if (organisatieIds.length > 0) {
    const { data: orgs } = await admin
      .from('relaties')
      .select('id, naam, email')
      .in('id', organisatieIds)
    const naamPerOrg = new Map<string, string>((orgs ?? []).map((o: any) => [o.id, o.naam]))

    // Het algemene adres van een extra relatie (leverancier) hoort er ook bij.
    for (const o of (orgs ?? [])) {
      if (o.id === klantId) continue
      voegToe(schoonAdres(o.email), o.naam, o.naam, 'Algemeen adres')
    }

    const { data: koppelingen } = await admin
      .from('contactpersoon_organisaties')
      .select('organisatie_id, functie, is_primair, contactpersonen!inner ( voornaam, tussenvoegsel, achternaam, email, actief )')
      .in('organisatie_id', organisatieIds)
      .eq('contactpersonen.actief', true)
      .order('is_primair', { ascending: false })

    for (const k of (koppelingen ?? [])) {
      const cp = k.contactpersonen
      voegToe(schoonAdres(cp.email), volledigeNaam(cp),
        naamPerOrg.get(k.organisatie_id) ?? 'Contactpersonen',
        k.functie || undefined)
    }
  }

  // ── Alle actieve medewerkers, als vangnet onderaan ─────────────────────────
  const { data: alleMeds } = await admin
    .from('medewerkers')
    .select('voornaam, tussenvoegsel, achternaam, email, o365_email, functie')
    .eq('actief', true)
    .order('achternaam', { ascending: true })

  for (const m of (alleMeds ?? [])) {
    voegToe(schoonAdres(m.o365_email) ?? schoonAdres(m.email), volledigeNaam(m),
      'Medewerkers', m.functie || undefined)
  }

  return uit
}
