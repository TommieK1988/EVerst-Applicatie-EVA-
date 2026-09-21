/**
 * Het Bouw7-maatwerkveld "Factuuradres" omzetten in een echt factuuradres op het dossier.
 *
 * WAAROM DIT BESTAAT
 *
 * Bij een beheerder (VvE-beheerder, vastgoedmanager) is de opdrachtgever zelden de partij die
 * betaalt. Schep Vastgoed Managers geeft de opdracht, maar de factuur gaat naar "VvE 8266
 * Steenlaan 30-152". In Bouw7 is die VvE een gewoon zelfstandig contact; het enige wat hem aan
 * het project verbindt is het maatwerkveld "Factuuradres" (`caFactuuradres`) — **vrije tekst**
 * met de naam van dat contact erin.
 *
 * EVA las dat veld niet. Gevolg: zo'n VvE landde via de contactsync wél als losse relatie, maar
 * verscheen nooit in de lijst Factuuradressen onder de beheerder, en het dossier bleef zonder
 * factuuradres staan. Dat is in september 2026 opgevallen op dossier 20267.00748; de acht VvE's
 * ervóór waren met de hand rechtgezet (`scripts/bouw7-vve-contactpersoon-naar-contact.mjs`),
 * waardoor het leek alsof het werkte.
 *
 * DE MATCH
 *
 * `caFactuuradres` is vrije tekst, dus de naam moet gematcht worden op een relatie. De regel is
 * bewust streng: normaliseer (kleine letters, alles wat geen letter of cijfer is wordt één
 * spatie) en eis dan een **exacte** treffer op precies één relatie. Geen fuzzy matching, geen
 * "lijkt er het meest op". Dat vangt de echte variatie — "VvE 8109 - Steenvoordelaan 269-531"
 * tegenover "VvE 8266 Steenlaan 30-152", met en zonder streepje — zonder ooit te gokken.
 *
 * Die strengheid is op de 62 bestaande adresrijen gecontroleerd: voor 60 ervan levert deze
 * naam-match exact hetzelfde Bouw7-contact op als het id dat de opruimscripts destijds in de
 * opmerking noteerden — nul afwijkingen. De twee die overblijven zijn precies de gevallen waarin
 * niet gegokt mág worden: "VvE 7069 - Seghwaert SE-a" bestaat twee keer als relatie (ambigu →
 * overslaan), en de Von Geusau-rij heeft geen contact en een vastgelegde tenaamstelling.
 *
 * WAT DEZE CODE NIET DOET
 *
 * Bestaande adresrijen worden **nooit** bijgewerkt. De tenaamstelling op een factuuradres is geen
 * cosmetisch veld: VvE Advies heeft in augustus 2026 facturen afgewezen omdat de naam net anders
 * was. Een naamswijziging in Bouw7 mag een in EVA vastgelegde tenaamstelling dus niet overschrijven.
 * Alleen ontbrekende rijen worden aangemaakt.
 *
 * Er gaat ook niets terug naar Bouw7. Kiest iemand in EVA een ander factuuradres, dan wordt dat
 * veld via `handmatige_velden` beschermd (zie lib/bouw7/handmatige-velden.ts) en laat de sync het
 * met rust; het Bouw7-maatwerkveld blijft dan staan zoals het stond.
 */

import { haalAlleRijen } from '@/lib/supabase/paginate'

/** Eén project zoals de sync het aanbiedt: welk dossier, welke opdrachtgever, welke vrije tekst. */
export type FactuuradresKandidaat = {
  /** Bouw7-project-id (string), de sleutel waarop de sync zijn rijen terugvindt. */
  bouw7ProjectId: string
  /** EVA-relatie van de opdrachtgever; het adres komt onder deze relatie te hangen. */
  klantId: string | null
  /** Ruwe waarde van het maatwerkveld "Factuuradres". */
  caFactuuradres: string | null | undefined
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
    .replace(/ /g, ' ')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

type RelatieRij = {
  id: string
  naam: string
  bouw7_id: string | null
  adres_straat: string | null
  adres_postcode: string | null
  adres_plaats: string | null
  adres_land: string | null
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
): Promise<FactuuradresResultaat> {
  const leeg: FactuuradresResultaat = { perProject: new Map(), aangemaakt: 0, nietGematcht: [] }

  const relevant = kandidaten.filter(k => k.klantId && factuuradresSleutel(k.caFactuuradres) !== '')
  if (relevant.length === 0) return leeg

  // Alle relaties met een Bouw7-contact. Gepagineerd: dit is de map die bepaalt óf een naam
  // gematcht wordt, en een stille afkapping op 1000 rijen zou de match willekeurig laten mislukken.
  const relaties = await haalAlleRijen<RelatieRij>((van, tot) => supabase
    .from('relaties')
    .select('id, naam, bouw7_id, adres_straat, adres_postcode, adres_plaats, adres_land')
    .not('bouw7_id', 'is', null)
    .order('id')
    .range(van, tot))

  // null = de naam komt meer dan eens voor en is dus niet bruikbaar om op te matchen.
  const opNaam = new Map<string, RelatieRij | null>()
  for (const r of relaties) {
    const sleutel = factuuradresSleutel(r.naam)
    if (!sleutel) continue
    if (opNaam.has(sleutel) && opNaam.get(sleutel)?.id !== r.id) opNaam.set(sleutel, null)
    else opNaam.set(sleutel, r)
  }

  // Per project de gevonden relatie; daarnaast de unieke (opdrachtgever, contact)-paren waarvoor
  // straks een adresrij moet bestaan.
  const gevonden = new Map<string, { klantId: string; relatie: RelatieRij }>()
  const nietGematcht = new Set<string>()
  for (const k of relevant) {
    const sleutel = factuuradresSleutel(k.caFactuuradres)
    const relatie = opNaam.get(sleutel)
    if (!relatie) {
      // Onbekend óf ambigu. In beide gevallen niet gokken — een factuur naar de verkeerde partij
      // is duurder dan een leeg veld.
      nietGematcht.add(String(k.caFactuuradres ?? '').trim())
      continue
    }
    // Het maatwerkveld noemt de opdrachtgever zelf: dan is er niets af te wijken.
    if (relatie.id === k.klantId) continue
    if (!relatie.bouw7_id) continue
    gevonden.set(k.bouw7ProjectId, { klantId: k.klantId!, relatie })
  }
  if (gevonden.size === 0) {
    return { ...leeg, nietGematcht: [...nietGematcht] }
  }

  const paren = new Map<string, { klantId: string; relatie: RelatieRij }>()
  for (const g of gevonden.values()) paren.set(`${g.klantId}|${g.relatie.bouw7_id}`, g)

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

  // Wat er nog niet is, aanmaken. Het adres komt van de relatie zelf — dat is hetzelfde adres dat
  // Bouw7 op dat contact heeft staan.
  const nieuw = [...paren.entries()]
    .filter(([sleutel]) => !bestaand.has(sleutel))
    .map(([, p]) => ({
      relatie_id:       p.klantId,
      label:            p.relatie.naam,
      straat:           p.relatie.adres_straat,
      postcode:         p.relatie.adres_postcode,
      plaats:           p.relatie.adres_plaats,
      land:             p.relatie.adres_land ?? 'NL',
      bouw7_contact_id: p.relatie.bouw7_id,
      opmerkingen:      `Automatisch uit het Bouw7-maatwerkveld "Factuuradres" op het project. Bouw7-contact ${p.relatie.bouw7_id}.`,
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
    const id = bestaand.get(`${g.klantId}|${g.relatie.bouw7_id}`)
    if (id) perProject.set(projectId, id)
  }

  return { perProject, aangemaakt, nietGematcht: [...nietGematcht] }
}
