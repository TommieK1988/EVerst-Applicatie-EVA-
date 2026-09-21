/**
 * Het Bouw7-maatwerkveld "Factuuradres" omzetten in een echt factuuradres op het dossier.
 *
 * WAAROM DIT BESTAAT
 *
 * Bij een beheerder (VvE-beheerder, vastgoedmanager) is de opdrachtgever zelden de partij die
 * betaalt. Schep Vastgoed Managers geeft de opdracht, maar de factuur gaat naar "VvE 8266
 * Steenlaan 30-152". In Bouw7 is die VvE een zelfstandig contact van het type **Klant**
 * (`customer`); het enige wat hem aan het project verbindt is het maatwerkveld "Factuuradres"
 * (`caFactuuradres`) — de naam van dat contact als kale tekst.
 *
 * EVA las dat veld niet. Gevolg: zo'n VvE landde via de contactsync wél als losse relatie, maar
 * verscheen nooit in de lijst Factuuradressen onder de beheerder, en het dossier bleef zonder
 * factuuradres staan. Dat is in september 2026 opgevallen op dossier 20267.00748; de acht VvE's
 * ervóór waren met de hand rechtgezet (`scripts/bouw7-vve-contactpersoon-naar-contact.mjs`),
 * waardoor het leek alsof het werkte.
 *
 * DE MATCH — TEGEN BOUW7, NIET TEGEN `relaties`
 *
 * Sinds september 2026 importeert `syncContacts` contacten van het type Klant niet meer als
 * relatie (zie `isKlantContact` in lib/bouw7/sync.ts): die partijen hóren hier thuis, onder hun
 * beheerder, en niet als opdrachtgever in het relatieoverzicht. Daarmee verviel ook de oude
 * matchbron. Deze code matcht de vrije tekst daarom rechtstreeks op de **Bouw7-contactenlijst**;
 * het adres van de nieuwe rij komt van dat Bouw7-contact zelf.
 *
 * De regel is bewust streng: normaliseer (kleine letters, alles wat geen letter of cijfer is
 * wordt één spatie) en eis dan een **exacte** treffer op precies één contact. Geen fuzzy
 * matching, geen "lijkt er het meest op". Dat vangt de echte variatie — "VvE 8109 -
 * Steenvoordelaan 269-531" tegenover "VvE 8266 Steenlaan 30-152", met en zonder streepje —
 * zonder ooit te gokken.
 *
 * Die strengheid is op de 62 bestaande adresrijen gecontroleerd: voor 60 ervan levert deze
 * naam-match exact hetzelfde Bouw7-contact op als het id dat de opruimscripts destijds in de
 * opmerking noteerden — nul afwijkingen. De twee die overblijven zijn precies de gevallen waarin
 * niet gegokt mág worden: "VvE 7069 - Seghwaert SE-a" bestaat twee keer als contact (ambigu →
 * overslaan), en de Von Geusau-rij heeft een vastgelegde tenaamstelling.
 *
 * WAT DEZE CODE NIET DOET
 *
 * Bestaande adresrijen worden **nooit** bijgewerkt. De tenaamstelling op een factuuradres is geen
 * cosmetisch veld: VvE Advies heeft in augustus 2026 facturen afgewezen omdat de naam net anders
 * was. Een naamswijziging in Bouw7 mag een in EVA vastgelegde tenaamstelling dus niet overschrijven.
 * Alleen ontbrekende rijen worden aangemaakt.
 *
 * Er gaat vanuit deze lees-sync ook niets terug naar Bouw7. Kiest iemand in EVA een ánder
 * factuuradres, dan schrijft `lib/bouw7/factuuradres-write.ts` dat maatwerkveld wél terug en
 * beschermt `handmatige_velden` de EVA-keuze tegen deze sync.
 */

/** Eén project zoals de sync het aanbiedt: welk dossier, welke opdrachtgever, welke vrije tekst. */
export type FactuuradresKandidaat = {
  /** Bouw7-project-id (string), de sleutel waarop de sync zijn rijen terugvindt. */
  bouw7ProjectId: string
  /** EVA-relatie van de opdrachtgever; het adres komt onder deze relatie te hangen. */
  klantId: string | null
  /** Bouw7-contact-id van diezelfde opdrachtgever — om "het veld noemt de klant zelf" te zien. */
  klantBouw7Id?: string | null
  /** Ruwe waarde van het maatwerkveld "Factuuradres". */
  caFactuuradres: string | null | undefined
}

/** Het Bouw7-contact zoals deze sync het nodig heeft: naam plus postadres. */
export type FactuuradresContact = {
  id: string | number
  name?: string | null
  streetName?: string | null
  houseNumber?: string | null
  zipCode?: string | null
  city?: string | null
  countryCode?: string | null
}

export type FactuuradresResultaat = {
  /** bouw7ProjectId → `relatie_factuuradressen.id`. Alleen de opgeloste projecten staan erin. */
  perProject: Map<string, string>
  /** Nieuw aangemaakte adresrijen (voor de sync-log). */
  aangemaakt: number
  /** Namen die niet of niet eenduidig te matchen waren (voor de sync-log). */
  nietGematcht: string[]
}

/**
 * Sleutel voor naamvergelijking: kleine letters, alles wat geen letter of cijfer is wordt één
 * spatie. "VvE 8109 - Steenvoordelaan 269-531" en "VvE 8109 Steenvoordelaan 269 531" vallen zo
 * samen, terwijl twee verschillende VvE-nummers uit elkaar blijven.
 */
export function factuuradresSleutel(naam: string | null | undefined): string {
  return (naam ?? '')
    .replace(/ /g, ' ')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/**
 * Zoek voor elk project het factuuradres dat bij het maatwerkveld hoort, en zorg dat de adresrij
 * onder de opdrachtgever bestaat.
 *
 * Faalt nooit hard: een dossier zonder bruikbare match komt simpelweg niet in `perProject` voor en
 * houdt het factuuradres dat het al had.
 */
export async function bepaalFactuuradressen(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  kandidaten: FactuuradresKandidaat[],
  /** De volledige Bouw7-contactenlijst — inclusief de Klant-contacten die geen relatie zijn. */
  contacten: FactuuradresContact[],
): Promise<FactuuradresResultaat> {
  const leeg: FactuuradresResultaat = { perProject: new Map(), aangemaakt: 0, nietGematcht: [] }

  const relevant = kandidaten.filter(k => k.klantId && factuuradresSleutel(k.caFactuuradres) !== '')
  if (relevant.length === 0) return leeg

  // null = de naam komt meer dan eens voor en is dus niet bruikbaar om op te matchen.
  const opNaam = new Map<string, FactuuradresContact | null>()
  for (const c of contacten) {
    const sleutel = factuuradresSleutel(c.name)
    if (!sleutel) continue
    if (opNaam.has(sleutel) && String(opNaam.get(sleutel)?.id) !== String(c.id)) opNaam.set(sleutel, null)
    else opNaam.set(sleutel, c)
  }

  // Per project het gevonden contact; daarnaast de unieke (opdrachtgever, contact)-paren waarvoor
  // straks een adresrij moet bestaan.
  const gevonden = new Map<string, { klantId: string; contact: FactuuradresContact }>()
  const nietGematcht = new Set<string>()
  for (const k of relevant) {
    const sleutel = factuuradresSleutel(k.caFactuuradres)
    const contact = opNaam.get(sleutel)
    if (!contact) {
      // Onbekend óf ambigu. In beide gevallen niet gokken — een factuur naar de verkeerde partij
      // is duurder dan een leeg veld.
      nietGematcht.add(String(k.caFactuuradres ?? '').trim())
      continue
    }
    // Het maatwerkveld noemt de opdrachtgever zelf: dan is er niets af te wijken.
    if (k.klantBouw7Id && String(contact.id) === String(k.klantBouw7Id)) continue
    gevonden.set(k.bouw7ProjectId, { klantId: k.klantId!, contact })
  }
  if (gevonden.size === 0) {
    return { ...leeg, nietGematcht: [...nietGematcht] }
  }

  const paren = new Map<string, { klantId: string; contact: FactuuradresContact }>()
  for (const g of gevonden.values()) paren.set(`${g.klantId}|${g.contact.id}`, g)

  // Bestaande adresrijen ophalen. Op relatie_id filteren houdt dit ruim onder de PostgREST-grens
  // en is bovendien de enige index die hier zin heeft.
  const klantIds = [...new Set([...paren.values()].map(p => p.klantId))]
  const bestaand = new Map<string, string>()
  for (let i = 0; i < klantIds.length; i += 200) {
    const { data } = await supabase
      .from('relatie_factuuradressen')
      .select('id, relatie_id, bouw7_contact_id')
      .in('relatie_id', klantIds.slice(i, i + 200))
      .not('bouw7_contact_id', 'is', null)
    for (const r of (data ?? []) as { id: string; relatie_id: string; bouw7_contact_id: string }[]) {
      bestaand.set(`${r.relatie_id}|${r.bouw7_contact_id}`, r.id)
    }
  }

  // Wat er nog niet is, aanmaken. Het adres komt van het Bouw7-contact zelf — bij een VvE is dat
  // vaak de postbus van de beheerder, en dat is geen fout: de tenaamstelling (`label`) is wat de
  // VvE onderscheidt, het postadres mag dat van het beheerkantoor zijn.
  const nieuw = [...paren.entries()]
    .filter(([sleutel]) => !bestaand.has(sleutel))
    .map(([, p]) => ({
      relatie_id:       p.klantId,
      label:            p.contact.name ?? '',
      straat:           [p.contact.streetName, p.contact.houseNumber].filter(Boolean).join(' ') || null,
      postcode:         p.contact.zipCode ?? null,
      plaats:           p.contact.city ?? null,
      land:             p.contact.countryCode ?? 'NL',
      bouw7_contact_id: String(p.contact.id),
      opmerkingen:      `Automatisch uit het Bouw7-maatwerkveld "Factuuradres" op het project. Bouw7-contact ${p.contact.id}.`,
    }))

  let aangemaakt = 0
  for (let i = 0; i < nieuw.length; i += 200) {
    const blok = nieuw.slice(i, i + 200)
    const { data, error } = await supabase
      .from('relatie_factuuradressen')
      .upsert(blok, { onConflict: 'relatie_id,bouw7_contact_id', ignoreDuplicates: true })
      .select('id, relatie_id, bouw7_contact_id')
    if (error) {
      console.warn(`[sync] factuuradressen aanmaken mislukt: ${error.message}`)
      continue
    }
    for (const r of (data ?? []) as { id: string; relatie_id: string; bouw7_contact_id: string }[]) {
      bestaand.set(`${r.relatie_id}|${r.bouw7_contact_id}`, r.id)
      aangemaakt++
    }
  }

  // `ignoreDuplicates` geeft niets terug voor een rij die al bestond; wie er nu nog niet in zit
  // lezen we alsnog op, zodat een gelijktijdige run geen dossiers zonder koppeling achterlaat.
  const ontbreekt = [...paren.keys()].filter(s => !bestaand.has(s))
  if (ontbreekt.length > 0) {
    const { data } = await supabase
      .from('relatie_factuuradressen')
      .select('id, relatie_id, bouw7_contact_id')
      .in('relatie_id', [...new Set(ontbreekt.map(s => s.split('|')[0]))])
      .not('bouw7_contact_id', 'is', null)
    for (const r of (data ?? []) as { id: string; relatie_id: string; bouw7_contact_id: string }[]) {
      bestaand.set(`${r.relatie_id}|${r.bouw7_contact_id}`, r.id)
    }
  }

  const perProject = new Map<string, string>()
  for (const [projectId, g] of gevonden) {
    const id = bestaand.get(`${g.klantId}|${g.contact.id}`)
    if (id) perProject.set(projectId, id)
  }

  return { perProject, aangemaakt, nietGematcht: [...nietGematcht] }
}
