import 'server-only'
import { unstable_cache } from 'next/cache'
import { createAdminClient } from '@everts/database/server'
import {
  bedrijfsagendaTypeKleur, bedrijfsagendaTypeLabels,
  medewerkerAfwezigheidKleur, medewerkerAfwezigheidLabels,
} from '@everts/database/platform-types'
import type {
  BedrijfsagendaRegel, BedrijfsagendaType, MedewerkerAfwezigheidType,
} from '@everts/database/platform-types'
import { haalAlleRegels } from '@/app/(platform)/planning/bedrijfsagenda/actions'
import { getMijnTaken } from '@/lib/taken/services/taken'
import { omschrijvingNaarTekst } from '@/lib/taken/omschrijving'
import type { CurrentMedewerker } from '@/lib/auth/rechten'
import {
  dagVanDatum, dagVanTijdstip, tijdVanTijdstip, type AgendaItem,
} from './agenda-model'

/**
 * Datalaag van de mobiele agenda (`/m/planning`): vier bronnen → één lijst
 * `AgendaItem`. Dit is de enige normalisatieplek; zowel de server-render als de
 * bijlaad-action (`app/m/planning/actions.ts`) lopen hierdoorheen, zodat een
 * bijgeladen maand er gegarandeerd hetzelfde uitziet als de eerste render.
 *
 * Elk scherm onder `/m` gebruikt de admin-client (RLS op `medewerkers` en `tasks`
 * laat een sessie-client niet door) en schermt daarom zélf af op de ingelogde
 * medewerker. Geen enkele functie hier accepteert een medewerker-id uit de client.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createAdminClient() as any

const GROEN = '#009439'

/** Dagen die we extra terugkijken om meerdaagse blokken te vangen die vóór het venster begonnen. */
const MARGE_DAGEN = 31

function verschuif(dag: string, dagen: number): string {
  const d = new Date(`${dag}T12:00:00`)
  d.setDate(d.getDate() + dagen)
  return d.toISOString().slice(0, 10)
}

// ─── Planitems ────────────────────────────────────────────────────────────────

async function haalPlanitems(medewerkerId: string, van: string, tot: string): Promise<AgendaItem[]> {
  // Begrensd op medewerker én venster, dus ruim onder de PostgREST-grens van 1000 rijen.
  //
  // Filteren op `start_dt` in plaats van op echte overlap met `eind_dt`: die kolom is
  // nullable, en een `.or()` met `is.null` zou alle historische rijen zonder einddatum
  // binnenhalen. De marge terug vangt meerdaagse blokken die vóór het venster begonnen;
  // de definitieve overlaptoets doet `itemsOpDag` op de berekende lokale dagen.
  const { data, error } = await db()
    .from('planning_items')
    .select(`
      id, start_dt, eind_dt, medewerker_id,
      planning_activiteiten (
        titel, omschrijving, locatie_adres, dossier_id, uursoort_id,
        planning_uursoorten ( naam, kleur ),
        dossiers ( id, titel, dossiernummer, relaties!klant_id ( naam ) )
      )
    `)
    .eq('medewerker_id', medewerkerId)
    .gte('start_dt', verschuif(van, -MARGE_DAGEN))
    .lt('start_dt', verschuif(tot, 1))
    .order('start_dt', { ascending: true })

  if (error) return []

  const items: AgendaItem[] = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const rij of (data ?? []) as any[]) {
    const startDag = dagVanTijdstip(rij.start_dt)
    if (!startDag) continue
    const eindDag = dagVanTijdstip(rij.eind_dt, true) ?? startDag

    const activiteit = rij.planning_activiteiten
    const dossier = activiteit?.dossiers
    const uursoort = activiteit?.planning_uursoorten

    const startTijd = tijdVanTijdstip(rij.start_dt)
    const eindTijd = tijdVanTijdstip(rij.eind_dt)
    // Bouw7 zet dagblokken weg als 00:00 → 00:00; die tijden zeggen niets en
    // horen bovenaan de dag te staan in plaats van bij "07:00".
    const heleDag = startTijd === '00:00' && (eindTijd === '00:00' || eindTijd === null)

    const klant = dossier?.relaties?.naam ?? null
    const nummer = dossier?.dossiernummer ?? null

    items.push({
      id: `plan:${rij.id}`,
      bron: 'planitem',
      titel: activiteit?.titel ?? 'Werk',
      subtitel: [klant, nummer].filter(Boolean).join(' · ') || null,
      startDag,
      eindDag: eindDag < startDag ? startDag : eindDag,
      heleDag,
      startTijd: heleDag ? null : startTijd,
      eindTijd: heleDag ? null : eindTijd,
      // LET OP — bewust géén uren. `planning_items.uren` is bij Bouw7-planning het
      // bloktotaal dat ongewijzigd op de regel van élke toegewezen medewerker staat
      // (zie DetailplanningClient), dus met vier man op één blok toont iedereen
      // hetzelfde getal. De tijdspanne klopt wél.
      kleur: uursoort?.kleur ?? GROEN,
      typeLabel: uursoort?.naam ?? 'Werk',
      locatie: activiteit?.locatie_adres ?? null,
      dossierId: dossier?.id ?? null,
      href: dossier?.id ? `/m/dossiers/${dossier.id}` : null,
      detail: activiteit?.omschrijving ?? null,
    })
  }
  return items
}

// ─── Afwezigheid ──────────────────────────────────────────────────────────────

async function haalAfwezigheid(medewerkerId: string, van: string, tot: string): Promise<AgendaItem[]> {
  // Overlap-filter: verlof dat vóór het venster begon maar erin doorloopt moet mee.
  const { data, error } = await db()
    .from('medewerker_afwezigheid')
    .select('id, type, start_datum, eind_datum, start_tijd, eind_tijd, opmerking')
    .eq('medewerker_id', medewerkerId)
    .gte('eind_datum', van)
    .lte('start_datum', tot)
    .order('start_datum', { ascending: true })

  if (error) return []

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data ?? []) as any[]).map(rij => {
    const type = rij.type as MedewerkerAfwezigheidType
    // `start_datum`/`eind_datum` zijn date-kolommen: al lokaal, dus géén tz-conversie.
    const startDag = dagVanDatum(rij.start_datum) as string
    const heleDag = !rij.start_tijd
    return {
      id: `afw:${rij.id}`,
      bron: 'afwezigheid' as const,
      titel: medewerkerAfwezigheidLabels[type] ?? 'Afwezig',
      subtitel: rij.opmerking ?? null,
      startDag,
      eindDag: dagVanDatum(rij.eind_datum) ?? startDag,
      heleDag,
      startTijd: heleDag ? null : (rij.start_tijd as string).slice(0, 5),
      eindTijd: heleDag || !rij.eind_tijd ? null : (rij.eind_tijd as string).slice(0, 5),
      kleur: medewerkerAfwezigheidKleur[type] ?? '#6b7280',
      typeLabel: medewerkerAfwezigheidLabels[type] ?? 'Afwezig',
      locatie: null,
      dossierId: null,
      href: null,
      detail: rij.opmerking ?? null,
    }
  })
}

// ─── Bedrijfsagenda + feestdagen ──────────────────────────────────────────────

/**
 * De jaar-expansie van `haalAlleRegels` is relatief duur (vier queries plus het
 * uitvouwen van alle herhalingen) en levert voor iedereen hetzelfde resultaat —
 * de doelgroepfilter komt er pas ná. Cachen scheelt bij elke maand die je bijlaadt.
 */
const haalRegelsJaar = unstable_cache(
  async (jaar: number) => haalAlleRegels(jaar),
  ['mobiel-agenda-bedrijfsjaar'],
  { revalidate: 300, tags: ['bedrijfsagenda'] },
)

async function haalBedrijfsagenda(
  medewerker: CurrentMedewerker, van: string, tot: string,
): Promise<AgendaItem[]> {
  // `haalAlleRegels` werkt per kalenderjaar. Een decembervenster loopt door tot in
  // januari; zonder beide jaartallen mist die kant alles, Nieuwjaarsdag incluis.
  const jaren = [...new Set([Number(van.slice(0, 4)), Number(tot.slice(0, 4))])]
  let regels: BedrijfsagendaRegel[]
  try {
    regels = (await Promise.all(jaren.map(j => haalRegelsJaar(j)))).flat()
  } catch { return [] }

  return regels
    .filter(r => {
      // Venster-overlap. Bewust géén "alleen toekomst"-filter zoals de desktop-home:
      // een agenda mag terugkijken.
      if (r.eind_datum < van || r.start_datum > tot) return false
      // Doelgroep, gelijk aan app/(platform)/page.tsx.
      if (r.bron === 'berekend') return true
      if (r.doelgroep_afdelingen.length === 0 && r.doelgroep_medewerkers.length === 0) return true
      if (r.doelgroep_medewerkers.includes(medewerker.id)) return true
      if (medewerker.afdeling && r.doelgroep_afdelingen.includes(medewerker.afdeling)) return true
      return false
      // NIET op `in_agenda` filteren: die vlag is nog niet in gebruik (de checkbox in
      // AgendaItemModal staat op "binnenkort" en elk item heeft `false`), dus eropfilteren
      // levert een lege bedrijfsagenda.
    })
    .map(r => {
      const virtueel = r.bron === 'berekend'
      const heleDag = virtueel ? true : r.hele_dag
      const typeLabel = virtueel
        ? (r.type === 'feestdag' ? 'Feestdag' : r.type === 'jubileum' ? 'Jubileum' : 'Verjaardag')
        : (bedrijfsagendaTypeLabels[r.type as BedrijfsagendaType] ?? 'Agenda')
      return {
        id: `agenda:${r.id}`,
        bron: 'bedrijf' as const,
        titel: r.titel,
        subtitel: virtueel ? null : (r.locatie ?? null),
        startDag: r.start_datum,
        eindDag: r.eind_datum,
        heleDag,
        startTijd: virtueel || heleDag || !r.start_tijd ? null : r.start_tijd.slice(0, 5),
        eindTijd: virtueel || heleDag || !r.eind_tijd ? null : r.eind_tijd.slice(0, 5),
        kleur: virtueel
          ? r.kleur
          : (r.kleur ?? bedrijfsagendaTypeKleur[r.type as BedrijfsagendaType] ?? '#64748b'),
        typeLabel,
        locatie: virtueel ? null : (r.locatie ?? null),
        dossierId: null,
        href: null,
        detail: virtueel ? null : (r.omschrijving ?? null),
      }
    })
}

// ─── Taken met deadline ───────────────────────────────────────────────────────

/**
 * Eigen open taken met een deadline, als hele-dag-items. Bewust zonder datumvenster:
 * `getMijnTaken` filtert toch al op niet-gereed en niet-vervallen, het gaat om enkele
 * tientallen rijen, en zo hoeft de bijlaad-action ze nooit opnieuw op te halen.
 */
export async function haalMijnTaakItems(authUserId: string | null): Promise<AgendaItem[]> {
  if (!authUserId) return []
  const taken = await getMijnTaken(authUserId).catch(() => [])

  return taken
    .filter(t => Boolean(t.deadline))
    .map(t => {
      const dag = dagVanDatum(t.deadline) as string
      const urgent = t.prioriteit === 'urgent' || t.prioriteit === 'hoog'
      return {
        id: `taak:${t.id}`,
        bron: 'taak' as const,
        titel: t.titel,
        subtitel: t.dossier_naam ?? null,
        startDag: dag,
        eindDag: dag,
        heleDag: true,
        startTijd: null,
        eindTijd: null,
        kleur: urgent ? '#b42318' : '#b85a00',
        typeLabel: 'Deadline',
        locatie: null,
        dossierId: t.dossier_id ?? null,
        // Er is geen taakdetailpagina op /m (`/m/taken/[taakId]` heeft alleen
        // formulier/kwaliteit/opname), dus linken we naar het dossier of de takenlijst.
        href: t.dossier_id ? `/m/dossiers/${t.dossier_id}` : '/m/taken',
        detail: omschrijvingNaarTekst(t.omschrijving) || null,
      }
    })
}

// ─── Publieke ingang ──────────────────────────────────────────────────────────

/**
 * Alle agenda-items van deze medewerker binnen `[van, tot]` (beide yyyy-MM-dd,
 * inclusief). Taken zitten hier bewust níét in — die haalt de pagina één keer
 * apart op, zie `haalMijnTaakItems`.
 *
 * Per bron fail-soft: valt de bedrijfsagenda om, dan blijft de eigen planning staan.
 */
export async function haalAgendaVenster(
  medewerker: CurrentMedewerker, van: string, tot: string,
): Promise<AgendaItem[]> {
  const [planitems, afwezigheid, bedrijf] = await Promise.all([
    haalPlanitems(medewerker.id, van, tot).catch(() => []),
    haalAfwezigheid(medewerker.id, van, tot).catch(() => []),
    haalBedrijfsagenda(medewerker, van, tot).catch(() => []),
  ])
  return [...planitems, ...afwezigheid, ...bedrijf]
}
