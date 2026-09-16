/**
 * types.ts — projectbezoek.
 *
 * Client-veilig: geen `'use server'`, geen server-only imports. De mobiele doorloop, de
 * dossiertab en de server-actions gebruiken dezelfde definities.
 *
 * Een bezoek gaat over **disciplines**: de projectleider kiest de vakken die op dat moment
 * in uitvoering zijn, legt er punten bij vast en geeft per vak aan hoe ver het is. De
 * disciplinelijst is dezelfde als die van de kwaliteitsmodule (`kwaliteit_disciplines`) —
 * zie de kop van `20260916d_projectbezoek_disciplines.sql` voor het waarom.
 */

/**
 * `ALG` (Algemeen) hoort niet in het bezoek. In de kwaliteitsronde staat die discipline
 * altijd aan omdat er controlepunten aan hangen die elke ronde gelden; een bezoek kent
 * geen controlepunten, en iets algemeens schrijf je in "Algemene opmerkingen".
 */
export const BEZOEK_UITGESLOTEN_DISCIPLINES = ['ALG'] as const

export type BezoekStatus = 'concept' | 'definitief'

/** Eén discipline zoals hij in de keuzelijst staat. */
export interface DisciplineKeuze {
  code: string
  naam: string
  volgorde: number
}

/** Een gekozen discipline binnen dit bezoek, met de voortgang van dat vak. */
export interface BezoekDiscipline {
  code: string
  naam: string
  /** null = niet opgegeven. Bewust onderscheiden van 0 %. */
  voortgang_pct: number | null
}

export interface BezoekFoto {
  id: string
  bezoek_id: string
  punt_id: string | null
  soort: 'voortgang' | 'algemeen' | 'punt'
  url: string
  storage_path: string | null
  toelichting: string | null
  volgorde: number
  created_at: string
}

/** Eén punt dat tijdens het bezoek bij een discipline is vastgelegd. */
export interface BezoekPunt {
  id: string
  discipline_code: string
  volgnummer: number
  tekst: string
  /** Aan = dit punt staat óók als aandachtspunt op het dossier, met opvolging. */
  is_aandachtspunt: boolean
  /** De afgeleide rij in `oplever_punten`, zolang het vinkje aan staat. */
  oplever_punt_id: string | null
  /**
   * Waar zodra er op het dossier iets met het aandachtspunt is gebeurd: een andere status,
   * een toewijzing, een deadline, meerwerk of een reactie. Dan mag het vinkje niet meer uit —
   * de doorloop vergrendelt het in plaats van pas bij de klik te falen.
   */
  opgepakt: boolean
  fotos: BezoekFoto[]
}

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
  algemene_opmerkingen: string | null
  status: BezoekStatus
  afgerond_op: string | null
  heropend_reden: string | null
  created_at: string
  updated_at: string
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
  /** De gekozen disciplines van dit bezoek, in vaste volgorde. */
  disciplines: BezoekDiscipline[]
  /** Alle punten van dit bezoek; de UI groepeert ze op `discipline_code`. */
  punten: BezoekPunt[]
  /** Foto's die bij het bezoek als geheel horen (`soort = 'algemeen'`), niet bij een punt. */
  fotos: BezoekFoto[]
  /** Waar de projectleider uit kan kiezen: actieve disciplines, zonder `ALG`. */
  beschikbareDisciplines: DisciplineKeuze[]
}

/** Weergavekenmerk van een bezoek: PB-03. */
export function bezoekKenmerk(volgnummer: number): string {
  return `PB-${String(volgnummer).padStart(2, '0')}`
}

/** Weergavekenmerk van een punt binnen een bezoek: P-03. */
export function puntKenmerk(volgnummer: number): string {
  return `P-${String(volgnummer).padStart(2, '0')}`
}

/** "65 %" of een streepje wanneer er niets is opgegeven. */
export function voortgangLabel(pct: number | null): string {
  return pct === null || pct === undefined ? '—' : `${pct} %`
}

/**
 * Wat er nog mist voordat het bezoek afgerond mag worden.
 *
 * Bewust mild: dit meldt, het blokkeert niet. Een discipline waarbij niets op te merken
 * viel is een geldige uitkomst — dat is juist het bericht. Alleen "je hebt nog helemaal
 * niets gekozen" is een echte omissie.
 */
export function bezoekOnvolledig(ctx: BezoekContext): string[] {
  const meldingen: string[] = []
  if (ctx.disciplines.length === 0) {
    meldingen.push('Er is nog geen discipline gekozen.')
    return meldingen
  }
  for (const d of ctx.disciplines) {
    const heeftPunten = ctx.punten.some(p => p.discipline_code === d.code)
    if (!heeftPunten && d.voortgang_pct === null) {
      meldingen.push(`${d.naam}: nog geen punten en geen voortgang ingevuld.`)
    }
  }
  return meldingen
}
