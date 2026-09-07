/**
 * types.ts — projectbezoek.
 *
 * Client-veilig: geen `'use server'`, geen server-only imports. De mobiele doorloop, de
 * dossiertab en de server-actions gebruiken dezelfde definities.
 */

/** De onderdelen die een projectleider bij een bezoek kan aanvinken. */
export const BEZOEK_ONDERDELEN = ['kwaliteit', 'veiligheid', 'algemeen', 'voortgang'] as const
export type BezoekOnderdeel = (typeof BEZOEK_ONDERDELEN)[number]

export const bezoekOnderdeelLabels: Record<BezoekOnderdeel, string> = {
  kwaliteit:  'Kwaliteit',
  veiligheid: 'Veiligheid',
  algemeen:   'Algemeen',
  voortgang:  'Voortgang',
}

/** Eén zin per onderdeel, voor de keuzelijst op de telefoon. */
export const bezoekOnderdeelUitleg: Record<BezoekOnderdeel, string> = {
  kwaliteit:  'Controlepunten nalopen met de kwaliteitsronde',
  veiligheid: 'Onveilige situaties vastleggen met foto',
  algemeen:   'Wat je opvalt vastleggen als aandachtspunt',
  voortgang:  'Hoe staat het ervoor, in woorden en beeld',
}

/** Kolomnaam op `projectbezoeken` per onderdeel. */
export const BEZOEK_ONDERDEEL_KOLOM: Record<BezoekOnderdeel, `doet_${BezoekOnderdeel}`> = {
  kwaliteit:  'doet_kwaliteit',
  veiligheid: 'doet_veiligheid',
  algemeen:   'doet_algemeen',
  voortgang:  'doet_voortgang',
}

export type BezoekStatus = 'concept' | 'definitief'

export interface Projectbezoek {
  id: string
  dossier_id: string
  volgnummer: number
  task_id: string | null
  datum: string
  tijd: string | null
  uitgevoerd_door: string | null
  weer: string | null
  locatie: string | null
  werkzaamheden: string | null
  doet_kwaliteit: boolean
  doet_veiligheid: boolean
  doet_algemeen: boolean
  doet_voortgang: boolean
  kwaliteit_inspectie_id: string | null
  voortgang_tekst: string | null
  algemene_opmerkingen: string | null
  status: BezoekStatus
  afgerond_op: string | null
  heropend_reden: string | null
  created_at: string
  updated_at: string
}

export interface BezoekFoto {
  id: string
  bezoek_id: string
  soort: 'voortgang' | 'algemeen'
  url: string
  storage_path: string | null
  toelichting: string | null
  volgorde: number
  created_at: string
}

/** Een punt dat tijdens dit bezoek is vastgelegd (veiligheid of algemeen). */
export interface BezoekPunt {
  id: string
  volgnummer: number
  omschrijving: string
  ruimte: string | null
  soort: 'oplever' | 'veiligheid'
  status: string
  fotoUrls: string[]
}

export interface BezoekContext {
  bezoek: Projectbezoek
  dossier: {
    id: string
    dossiernummer: string | null
    titel: string
    werkadres: string
  }
  uitvoerderNaam: string | null
  punten: BezoekPunt[]
  fotos: BezoekFoto[]
  /** Samenvatting van de gekoppelde kwaliteitsronde, als die er is. */
  kwaliteit: { id: string; nummer: string; status: string; beoordeeld: number; afwijkend: number } | null
}

/** Weergavekenmerk van een bezoek: PB-03. */
export function bezoekKenmerk(volgnummer: number): string {
  return `PB-${String(volgnummer).padStart(2, '0')}`
}

/** De aangevinkte onderdelen van een bezoek, in vaste volgorde. */
export function gekozenOnderdelen(bezoek: Pick<Projectbezoek,
  'doet_kwaliteit' | 'doet_veiligheid' | 'doet_algemeen' | 'doet_voortgang'>): BezoekOnderdeel[] {
  return BEZOEK_ONDERDELEN.filter(o => bezoek[BEZOEK_ONDERDEEL_KOLOM[o]])
}

/**
 * Wat er nog mist voordat het bezoek afgerond mag worden.
 *
 * Bewust mild: alleen "je hebt een onderdeel aangevinkt en er niets in gedaan" wordt gemeld, en
 * dat blokkeert niet. Een ronde waarbij niets op te merken viel is een geldige uitkomst — dat is
 * juist het bericht.
 */
export function bezoekOnvolledig(ctx: BezoekContext): string[] {
  const meldingen: string[] = []
  const b = ctx.bezoek
  if (gekozenOnderdelen(b).length === 0) meldingen.push('Er is nog geen enkel onderdeel gekozen.')
  if (b.doet_kwaliteit && !b.kwaliteit_inspectie_id) {
    meldingen.push('Kwaliteit staat aan, maar de kwaliteitsronde is nog niet gestart.')
  }
  if (b.doet_voortgang && !b.voortgang_tekst?.trim() && !ctx.fotos.some(f => f.soort === 'voortgang')) {
    meldingen.push('Voortgang staat aan, maar er is nog niets vastgelegd.')
  }
  return meldingen
}
