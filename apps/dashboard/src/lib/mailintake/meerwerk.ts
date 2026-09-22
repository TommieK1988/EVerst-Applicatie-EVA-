import 'server-only'
import { createAdminClient } from '@everts/database/server'

import { maakIntakeActie } from './taken'

/**
 * mailintake/meerwerk.ts
 *
 * Een mail die akkoord geeft op meerwerk, verwerken op het lopende dossier.
 *
 * DE REGEL
 * **EVA zet alleen een meerwerkregel op akkoord die er al is.** Hij maakt er nooit
 * zelf een aan. Een regel aanmaken betekent een bedrag en een omschrijving kiezen
 * uit een bijlage; dat bedrag gaat via de bewakingscode naar Bouw7 en telt mee in
 * de contractsom. Dat is geen invulveld maar een afspraak met de klant, en die
 * hoort van de projectleider te komen.
 *
 * Staat er geen regel, dan gaat er een actie naar de projectleider dat hij er een
 * moet aanmaken. De mail wordt wél aan het dossier gekoppeld, zodat de bijlage met
 * het geoffreerde bedrag er al ligt als hij eraan begint.
 *
 * WAAROM PRECIES ÉÉN
 * Staan er meerdere regels open, dan zegt de mail niet welke bedoeld is. Twee
 * regels op akkoord zetten omdat er één akkoord binnenkwam is een boekhoudfout
 * die niemand terugvindt. Dan dus ook een actie, met de vraag welke.
 *
 * Hetzelfde patroon als bij de offertekeuze elders in deze module: één eenduidige
 * kandidaat mag automatisch, meer dan één is een vraag aan een mens.
 */

/** Statussen die nog op een antwoord van de klant wachten. */
const OPEN_STATUSSEN = ['aangevraagd', 'offerte_verstuurd']

export type MeerwerkUitkomst =
  | { ok: true; soort: 'akkoord'; regelId: string; omschrijving: string; waarschuwing?: string }
  | { ok: true; soort: 'geen_regel' | 'meerdere'; taakVoor: string | null; aantal: number }
  | { ok: false; fout: string }

export interface MeerwerkInvoer {
  berichtId: string
  /** Het lopende dossier waar dit meerwerk bij hoort: opdracht of servicedeskbon. */
  dossierId: string
  /** Terugval als het dossier geen projectleider heeft. */
  behandelaarId: string | null
}

export async function zetMeerwerkAkkoordUitBericht(inv: MeerwerkInvoer): Promise<MeerwerkUitkomst> {
  const supabase = createAdminClient()

  const { data: d } = await supabase
    .from('dossiers')
    .select('id, dossiernummer, titel, hoofdstatus, servicedesk_substatus, project_manager_id')
    .eq('id', inv.dossierId)
    .maybeSingle()

  if (!d) return { ok: false, fout: 'Dossier niet gevonden.' }

  // Meerwerk hoort bij werk dat lóópt. Dat is een opdracht én een servicedeskbon:
  // die laatste heeft hoofdstatus 'aanvraag' met een eigen ladder ernaast, maar is
  // gewoon werk in uitvoering. Alleen op `hoofdstatus = opdracht` toetsen was te
  // streng -- er staan servicedeskdossiers met echt openstaand meerwerk, en die
  // zou EVA dan weigeren terwijl daar juist extra werk ontstaat.
  //
  // Wat overblijft is een aanvraag of offerte zonder servicedeskladder. Daar is
  // "meerwerk" gewoon werk dat nog in de prijs hoort; het daar wegschrijven levert
  // een regel op die in geen enkel overzicht klopt.
  const loopt = d.hoofdstatus === 'opdracht' || d.servicedesk_substatus != null
  if (!loopt) {
    return {
      ok: false,
      fout: `Meerwerk hoort bij werk dat loopt; dossier ${d.dossiernummer ?? ''} staat in fase ${d.hoofdstatus}.`.trim(),
    }
  }

  const { data: regels } = await supabase
    .from('meerwerk_regels')
    .select('id, omschrijving, status, bedrag_excl_btw')
    .eq('dossier_id', inv.dossierId)
    .in('status', OPEN_STATUSSEN)
    .order('created_at')
    .limit(50)

  const open = regels ?? []
  const naarPl = d.project_manager_id ?? inv.behandelaarId

  // ── Geen regel: de projectleider moet er een maken ────────────────────────
  if (open.length === 0) {
    const res = await maakIntakeActie({
      berichtId: inv.berichtId,
      dossierId: inv.dossierId,
      medewerkerId: naarPl,
      rollen: ['project_manager_id'],
      titel: `Meerwerkregel aanmaken voor ${d.dossiernummer ?? d.titel ?? 'dit dossier'}`.slice(0, 200),
      prioriteit: 'hoog',
      dagen: 2,
      toelichting: [
        'De opdrachtgever heeft per mail akkoord gegeven op meerwerk, maar op dit dossier',
        'staat nog geen meerwerkregel die op een antwoord wacht.',
        '',
        'Maak de regel aan op het Meerwerk-tabblad met het bedrag uit de mail of de bijlage,',
        'en zet hem daarna op akkoord. EVA doet dat bewust niet zelf: het bedrag gaat via de',
        'bewakingscode naar Bouw7 en telt mee in de contractsom.',
        '',
        `De mail en de bijlagen staan bij het dossier: /mailintake/${inv.berichtId}`,
      ].join('\n'),
    })
    return { ok: true, soort: 'geen_regel', taakVoor: res.toegewezenAan ?? null, aantal: 0 }
  }

  // ── Meerdere regels: welke bedoelt de klant? ──────────────────────────────
  if (open.length > 1) {
    const res = await maakIntakeActie({
      berichtId: inv.berichtId,
      dossierId: inv.dossierId,
      medewerkerId: naarPl,
      rollen: ['project_manager_id'],
      titel: `Welk meerwerk is akkoord op ${d.dossiernummer ?? d.titel ?? 'dit dossier'}?`.slice(0, 200),
      prioriteit: 'hoog',
      dagen: 2,
      toelichting: [
        `Er staan ${open.length} meerwerkregels open op dit dossier, en uit de mail blijkt niet`,
        'welke de opdrachtgever bedoelt. Zet zelf de juiste op akkoord.',
        '',
        ...open.map(r => `- ${r.omschrijving ?? '(zonder omschrijving)'}`),
        '',
        `De mail: /mailintake/${inv.berichtId}`,
      ].join('\n'),
    })
    return { ok: true, soort: 'meerdere', taakVoor: res.toegewezenAan ?? null, aantal: open.length }
  }

  // ── Precies één: die mag op akkoord ───────────────────────────────────────
  // Via `setMeerwerkStatus`, niet met een eigen update: die functie bewaakt de
  // statusovergang, legt vast wie akkoord gaf, maakt de bewakingscode in Bouw7 en
  // schrijft de status terug. Dat hier overdoen zou drie plekken opleveren die
  // uit elkaar gaan lopen.
  const regel = open[0]
  const { setMeerwerkStatus } = await import('@/lib/dossiers/meerwerk')
  const res = await setMeerwerkStatus(regel.id, 'akkoord')

  if (!res.ok) return { ok: false, fout: res.error }

  return {
    ok: true,
    soort: 'akkoord',
    regelId: regel.id,
    omschrijving: regel.omschrijving ?? '(zonder omschrijving)',
    waarschuwing: res.waarschuwing,
  }
}
