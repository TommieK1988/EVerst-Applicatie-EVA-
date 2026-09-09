/**
 * Gedeelde types + periodelogica voor het bedrijfsbrede Uren-overzicht (/uren).
 * Pure module zonder server-imports: zowel de server-laag als de client-tabel gebruikt hem.
 */

export type UrenPeriode = 'deze_maand' | 'vorige_maand' | 'dit_kwartaal' | 'dit_jaar' | 'te_keuren'

/**
 * `te_keuren` is geen periode maar een werkvoorraad: alles wat er in de bewaarde urenstand staat,
 * hoe oud ook. Het staat toch in deze rij omdat het via dezelfde URL-parameter loopt — je kunt de
 * lijst zo bewaren en doorsturen, en de knop laat zien in welke stand je zit. De widget Goedkeuren
 * linkt hierheen: wie daar op de urenregel klikt wil zijn hele stapel zien, niet die van deze maand.
 */
export const UREN_PERIODES: { key: UrenPeriode; label: string }[] = [
  { key: 'deze_maand', label: 'Deze maand' },
  { key: 'vorige_maand', label: 'Vorige maand' },
  { key: 'dit_kwartaal', label: 'Dit kwartaal' },
  { key: 'dit_jaar', label: 'Dit jaar' },
  { key: 'te_keuren', label: 'Te keuren' },
]

export const STANDAARD_PERIODE: UrenPeriode = 'deze_maand'

/** Onbekende/ontbrekende waarde uit de URL veilig terugbrengen tot een geldige periode. */
export function alsPeriode(waarde: string | undefined): UrenPeriode {
  return UREN_PERIODES.some((p) => p.key === waarde) ? (waarde as UrenPeriode) : STANDAARD_PERIODE
}

/**
 * Kale dag (`YYYY-MM-DD`) uit lokale datumdelen. Bewust géén `toISOString()`: dat rekent naar UTC
 * en schuift een dag op bij avond-/zomertijd — dezelfde valkuil als in de Bouw7-planningsync.
 * Bouw7's `logDate` is óók een kale dag zonder tijdzone.
 */
function dag(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/**
 * Van/tot-grenzen (beide inclusief) van een periode, gerekend vanaf `vandaag`.
 *
 * `te_keuren` levert het hele bewaarde urenvenster op (lopend jaar, minimaal dertien weken). Dat
 * is bewust een ondergrens en geen keuze: verder terug is er geen stand om uit te filteren, dus
 * zou een ruimere grens een lijst beloven die niet bestaat.
 */
export function periodeBereik(periode: UrenPeriode, vandaag = new Date()): { van: string; tot: string } {
  const j = vandaag.getFullYear()
  const m = vandaag.getMonth()
  switch (periode) {
    case 'te_keuren': {
      const jaarStart = new Date(j, 0, 1)
      const dertienWeken = new Date(vandaag.getTime() - 13 * 7 * 86_400_000)
      return { van: dag(jaarStart < dertienWeken ? jaarStart : dertienWeken), tot: dag(vandaag) }
    }
    case 'vorige_maand':
      return { van: dag(new Date(j, m - 1, 1)), tot: dag(new Date(j, m, 0)) }
    case 'dit_kwartaal': {
      const q = Math.floor(m / 3) * 3
      return { van: dag(new Date(j, q, 1)), tot: dag(new Date(j, q + 3, 0)) }
    }
    case 'dit_jaar':
      return { van: dag(new Date(j, 0, 1)), tot: dag(new Date(j, 11, 31)) }
    case 'deze_maand':
    default:
      return { van: dag(new Date(j, m, 1)), tot: dag(new Date(j, m + 1, 0)) }
  }
}

/**
 * Velden die alleen het bedrijfsbrede overzicht vult — in het dossier zijn ze overbodig
 * (daar is het dossier immers de context). `UrenDetailTable` toont ze op basis van de
 * `kolommen`-prop, dus in het dossier blijft de tabel exact zoals hij was.
 */
export type UrenExtraVelden = {
  dossierId: string | null
  dossierNummer: string | null
  dossierTitel: string | null
  /** Detail-URL van het dossier, server-side afgeleid uit de hoofdstatus. */
  dossierHref: string | null
  projectNummer: string | null
  projectNaam: string | null
  projectleider: string | null
  /**
   * De projectrollen op het dossier, als EVA-medewerker-id. Hiermee bepaalt het scherm welke uren
   * de ingelogde gebruiker mag goedkeuren — dat volgt uit het dossier waarop de uren staan, niet
   * uit de ploeg waar de medewerker in zit.
   */
  teamleiderId: string | null
  projectleiderId: string | null
  geaccordeerd: boolean
  geaccordeerdDoor: string | null
  geaccordeerdOp: string | null
  /** Ingehuurde kracht (ZZP/uitzend) i.p.v. eigen dienst. */
  extern: boolean
  opmerking: string | null
}
