import 'server-only'
import { createAdminClient } from '@everts/database/server'
import { bepaalVcaStatus, type VcaSoort, type VcaStatus } from '@/lib/kam/vca'
import { datumSleutel } from '@/lib/uren/rooster'
import type { BedrijfsmiddelType } from '@everts/database/platform-types'

/**
 * De eigen medewerkergegevens voor "Mijn gegevens" op mobiel.
 *
 * Alles hier is alleen-lezen: de medewerker ziet wat de administratie over hem
 * vastgelegd heeft, maar wijzigt het niet zelf. Dat is geen UI-keuze maar een
 * gegevenskeuze — functie, afdeling, rooster en diploma's komen uit Bouw7 of uit
 * het beheerscherm, en een wijziging vanaf een telefoon zou bij de eerstvolgende
 * sync stil worden overschreven (zie lib/bouw7/sync-medewerkers.ts).
 *
 * Gelezen met de admin-client en strikt gefilterd op het eigen medewerker-id:
 * op `medewerkers` staat RLS aan zonder policies, dus een sessie-client krijgt
 * nul rijen terug. Dezelfde constructie als `getCurrentMedewerker()`.
 */

/** Wat de kaart toont. Alles optioneel: lege velden verbergt de UI. */
export type EigenGegevens = {
  email: string | null
  telefoon: string | null
  geboortedatum: string | null
  adres_straat: string | null
  adres_postcode: string | null
  adres_plaats: string | null
  functie: string | null
  afdeling: string | null
  ploeg: string | null
  in_dienst_vanaf: string | null
  rooster: EigenRooster | null
  bedrijfsmiddelen: EigenBedrijfsmiddel[]
  vca: EigenVca | null
}

export type EigenRooster = {
  werkdagen: number[]
  dagstart: string
  dageind: string
  contracturen_per_week: number
  pauzes: { start: string; eind: string }[]
}

export type EigenBedrijfsmiddel = {
  id: string
  type: BedrijfsmiddelType
  omschrijving: string | null
  /** Alleen de kenmerken die een medewerker mag zien; de tankpas-PIN zit hier bewust niet bij. */
  kenmerken: { label: string; waarde: string }[]
  uitgegeven_op: string | null
}

export type EigenVca = {
  soort: VcaSoort | null
  diplomanummer: string | null
  behaald_op: string | null
  geldig_tot: string | null
  status: VcaStatus
  dagen_tot_verval: number | null
}

/**
 * Kenmerken die op het eigen profiel getoond worden, per type.
 *
 * Bewust een witte lijst en geen "alles behalve": `kenmerken` is een vrije JSONB
 * waar het beheerscherm later velden aan kan toevoegen. Met een zwarte lijst zou
 * een nieuw gevoelig veld er vanzelf bij komen te staan.
 *
 * De tankpas-PIN (`pin`) ontbreekt met opzet. Kaartnummer plus PIN op één scherm
 * maakt van een gevonden telefoon een bruikbare tankpas; wie zijn PIN kwijt is,
 * vraagt die bij de administratie op.
 */
const ZICHTBARE_KENMERKEN: Record<BedrijfsmiddelType, { key: string; label: string }[]> = {
  sleutel:  [{ key: 'sleutelnummer', label: 'Sleutelnummer' }, { key: 'kopienummer', label: 'Kopienummer' }],
  telefoon: [{ key: 'toestel', label: 'Toestel' }, { key: 'imei', label: 'IMEI' }, { key: 'simkaart', label: 'Simkaart' }],
  tankpas:  [{ key: 'kaartnummer', label: 'Kaartnummer' }, { key: 'maatschappij', label: 'Maatschappij' }],
  overig:   [{ key: 'omschrijving_extra', label: 'Extra info' }],
}

/** Alleen de velden die het diploma-keuzemoment hieronder nodig heeft. */
type DiplomaRij = { soort: string | null; diplomanummer: string | null; behaald_op: string | null; geldig_tot: string | null }

/**
 * `kenmerken` is een vrije JSONB-kolom, dus het type laat ook een string, getal
 * of array toe. In de praktijk staat er een object in, maar een rij die dat niet
 * is mag geen lege kaart of een crash opleveren — die leveren we als leeg op.
 */
function kenmerkenObject(waarde: unknown): Record<string, unknown> {
  return waarde !== null && typeof waarde === 'object' && !Array.isArray(waarde)
    ? (waarde as Record<string, unknown>)
    : {}
}

export async function getEigenGegevens(medewerkerId: string): Promise<EigenGegevens | null> {
  // Bewust zonder cast op de client: de queries hier zijn smal genoeg dat de
  // gegenereerde Database-typen ze aankunnen, en dan loopt een hernoemde kolom
  // hier stuk in plaats van stilletjes `undefined` te worden.
  const admin = createAdminClient()
  const vandaag = datumSleutel(new Date())

  const [{ data: mw }, { data: roosterRij }, { data: middelen }, { data: diplomas }] = await Promise.all([
    admin
      .from('medewerkers')
      .select('email, telefoon, geboortedatum, adres_straat, adres_postcode, adres_plaats, functie, afdeling, in_dienst_vanaf, ploeg_id')
      .eq('id', medewerkerId)
      .maybeSingle(),
    // Hetzelfde venster als `getRooster()`: het rooster dat vandaag geldt, bij
    // overlap het laatst begonnen. Hier met de pauzes erbij, die de urenrekenaar
    // niet nodig heeft maar een medewerker juist wel wil zien.
    admin
      .from('medewerker_roosters')
      .select('id, werkdagen, dagstart, dageind, contracturen_per_week')
      .eq('medewerker_id', medewerkerId)
      .lte('geldig_vanaf', vandaag)
      .or(`geldig_tot.is.null,geldig_tot.gte.${vandaag}`)
      .order('geldig_vanaf', { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin
      .from('medewerker_bedrijfsmiddelen')
      .select('id, type, omschrijving, kenmerken, uitgegeven_op')
      .eq('medewerker_id', medewerkerId)
      .eq('actief', true)
      .order('type', { ascending: true }),
    admin
      .from('vca_diplomas')
      .select('soort, diplomanummer, behaald_op, geldig_tot')
      .eq('medewerker_id', medewerkerId),
  ])

  if (!mw) return null

  let ploeg: string | null = null
  if (mw.ploeg_id) {
    const { data } = await admin.from('ploegen').select('naam').eq('id', mw.ploeg_id).maybeSingle()
    ploeg = data?.naam ?? null
  }

  let rooster: EigenRooster | null = null
  if (roosterRij) {
    const { data: pauzes } = await admin
      .from('medewerker_rooster_pauzes')
      .select('pauze_start, pauze_eind')
      .eq('rooster_id', roosterRij.id)
      .order('pauze_start', { ascending: true })
    rooster = {
      werkdagen: (roosterRij.werkdagen ?? []) as number[],
      dagstart: roosterRij.dagstart,
      dageind: roosterRij.dageind,
      contracturen_per_week: Number(roosterRij.contracturen_per_week ?? 0),
      pauzes: (pauzes ?? []).map((p) => ({ start: p.pauze_start, eind: p.pauze_eind })),
    }
  }

  // Meerdere diploma's kunnen naast elkaar staan (B-VCA én VOL-VCA, of een
  // vernieuwd exemplaar naast het oude). De verste einddatum is de geldige;
  // dezelfde keuze als het KAM-overzicht maakt.
  const diploma = (diplomas ?? []).reduce<DiplomaRij | null>(
    (beste, d) => (!beste || (d.geldig_tot ?? '') > (beste.geldig_tot ?? '') ? d : beste),
    null,
  )
  const { status, dagen } = bepaalVcaStatus(diploma?.geldig_tot ?? null, !!diploma)

  return {
    email: mw.email ?? null,
    telefoon: mw.telefoon ?? null,
    geboortedatum: mw.geboortedatum ?? null,
    adres_straat: mw.adres_straat ?? null,
    adres_postcode: mw.adres_postcode ?? null,
    adres_plaats: mw.adres_plaats ?? null,
    functie: mw.functie ?? null,
    afdeling: mw.afdeling ?? null,
    ploeg,
    in_dienst_vanaf: mw.in_dienst_vanaf ?? null,
    rooster,
    bedrijfsmiddelen: (middelen ?? []).map((b) => {
      const bron = kenmerkenObject(b.kenmerken)
      return {
        id: b.id,
        type: b.type,
        omschrijving: b.omschrijving ?? null,
        kenmerken: (ZICHTBARE_KENMERKEN[b.type] ?? [])
          .map((v) => ({ label: v.label, waarde: String(bron[v.key] ?? '').trim() }))
          .filter((v) => v.waarde !== ''),
        uitgegeven_op: b.uitgegeven_op ?? null,
      }
    }),
    vca: diploma
      ? {
          soort: (diploma.soort as VcaSoort | null) ?? null,
          diplomanummer: diploma.diplomanummer ?? null,
          behaald_op: diploma.behaald_op ?? null,
          geldig_tot: diploma.geldig_tot ?? null,
          status,
          dagen_tot_verval: dagen,
        }
      : null,
  }
}
