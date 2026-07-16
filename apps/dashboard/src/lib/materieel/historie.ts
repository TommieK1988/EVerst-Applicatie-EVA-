import 'server-only'
import { createAdminClient } from '@everts/database/server'
import { volledigeNaam } from './data'
import {
  STATUS_META, UITKOMST_META, NIVEAU_LABELS, ALGEMEEN_GEBRUIK,
  type HistorieItem, type KeuringUitkomst, type MaterieelStatus, type ToewijzingNiveau,
} from './types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createAdminClient() as any

type MedewerkerNaam = { id: string; voornaam: string | null; tussenvoegsel: string | null; achternaam: string | null }

type ToewijzingRij = {
  id: string; niveau: ToewijzingNiveau; medewerker_id: string | null; team_id: string | null
  van: string; tot: string | null; door: string | null; opmerking: string | null
}
type KeuringRij = {
  id: string; soort: string; geldig_van: string | null; geldig_tot: string | null
  uitkomst: KeuringUitkomst | null; bevindingen: string | null; opmerking: string | null
  uitgevoerd_door: string | null; created_at: string
}
type OnderhoudRij = {
  id: string; type: string; omschrijving: string | null; datum: string
  kosten: number | null; status: string; gemeld_door: string | null
}
type ControleRij = {
  id: string; controle_datum: string; uitgevoerd_door: string | null
  status: string | null; opmerking: string | null
}
type GebeurtenisRij = {
  id: string; soort: string; omschrijving: string | null
  van: string | null; naar: string | null; door: string | null; created_at: string
}
type ScanRij = { id: string; gescand_at: string; locatie: string | null; gescand_door: string | null }

const KLEUR = {
  overdracht: '#2563eb',
  onderhoud:  '#f97316',
  scan:       '#64748b',
  neutraal:   '#64748b',
}

function euro(v: number | null): string | null {
  return v === null || v === undefined ? null : new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(v)
}

/**
 * Bouwt de volledige historie van één object op uit de bronbestanden.
 *
 * Bewust samengesteld i.p.v. een aparte log-tabel: de bronnen (toewijzingen,
 * keuringen, onderhoud, controles, scans) zijn al de waarheid, dus de tijdlijn
 * kan niet uit de pas lopen. Alleen statuswijzigingen hebben een eigen tabel,
 * omdat die anders simpelweg overschreven zouden worden.
 */
export async function getHistorie(objectId: string): Promise<HistorieItem[]> {
  const client = db()

  const [objRes, toewRes, keurRes, ondRes, contrRes, gebRes, scanRes] = await Promise.all([
    client.from('materieel_objecten').select('created_at, created_by').eq('id', objectId).maybeSingle(),
    client.from('materieel_toewijzingen').select('id, niveau, medewerker_id, team_id, van, tot, door, opmerking').eq('object_id', objectId).order('van', { ascending: true }),
    client.from('materieel_keuringen').select('id, soort, geldig_van, geldig_tot, uitkomst, bevindingen, opmerking, uitgevoerd_door, created_at').eq('object_id', objectId),
    client.from('materieel_onderhoud').select('id, type, omschrijving, datum, kosten, status, gemeld_door').eq('object_id', objectId),
    client.from('materieel_controles').select('id, controle_datum, uitgevoerd_door, status, opmerking').eq('object_id', objectId),
    client.from('materieel_gebeurtenissen').select('id, soort, omschrijving, van, naar, door, created_at').eq('object_id', objectId),
    client.from('materieel_scans').select('id, gescand_at, locatie, gescand_door').eq('object_id', objectId).order('gescand_at', { ascending: false }).limit(50),
  ])

  const object = objRes.data as { created_at: string; created_by: string | null } | null
  const toewijzingen = (toewRes.data ?? []) as ToewijzingRij[]
  const keuringen = (keurRes.data ?? []) as KeuringRij[]
  const onderhoud = (ondRes.data ?? []) as OnderhoudRij[]
  const controles = (contrRes.data ?? []) as ControleRij[]
  const gebeurtenissen = (gebRes.data ?? []) as GebeurtenisRij[]
  const scans = (scanRes.data ?? []) as ScanRij[]

  // Alle betrokken medewerkers + teams in één keer ophalen voor de namen.
  const mwIds = new Set<string>()
  toewijzingen.forEach((t) => { if (t.medewerker_id) mwIds.add(t.medewerker_id); if (t.door) mwIds.add(t.door) })
  onderhoud.forEach((o) => { if (o.gemeld_door) mwIds.add(o.gemeld_door) })
  controles.forEach((c) => { if (c.uitgevoerd_door) mwIds.add(c.uitgevoerd_door) })
  gebeurtenissen.forEach((g) => { if (g.door) mwIds.add(g.door) })
  scans.forEach((s) => { if (s.gescand_door) mwIds.add(s.gescand_door) })
  if (object?.created_by) mwIds.add(object.created_by)

  const teamIds = [...new Set(toewijzingen.map((t) => t.team_id).filter(Boolean))] as string[]

  const [mwRes, teamRes] = await Promise.all([
    mwIds.size > 0
      ? client.from('medewerkers').select('id, voornaam, tussenvoegsel, achternaam').in('id', [...mwIds])
      : Promise.resolve({ data: [] }),
    teamIds.length > 0
      ? client.from('materieel_teams').select('id, naam').in('id', teamIds)
      : Promise.resolve({ data: [] }),
  ])

  const naam = new Map<string, string>()
  ;((mwRes.data ?? []) as MedewerkerNaam[]).forEach((m) => naam.set(m.id, volledigeNaam(m)))
  const teamNaam = new Map<string, string>()
  ;((teamRes.data ?? []) as { id: string; naam: string }[]).forEach((t) => teamNaam.set(t.id, t.naam))

  const wieVan = (id: string | null) => (id ? naam.get(id) ?? 'Onbekend' : null)

  /** Aan wie hing het object bij deze toewijzing? */
  const houderVan = (t: ToewijzingRij): string =>
    t.medewerker_id ? naam.get(t.medewerker_id) ?? 'Onbekend'
    : t.team_id ? teamNaam.get(t.team_id) ?? 'Onbekend team'
    : ALGEMEEN_GEBRUIK

  const items: HistorieItem[] = []

  // ── Registratie: het begin van de tijdlijn ──
  if (object) {
    items.push({
      id: `reg-${objectId}`,
      wanneer: object.created_at,
      soort: 'status',
      titel: 'Geregistreerd in materieelbeheer',
      detail: null,
      door: wieVan(object.created_by),
      kleur: KLEUR.neutraal,
    })
  }

  // ── Overdrachten: van wie naar wie ──
  toewijzingen.forEach((t, i) => {
    const vorige = i > 0 ? houderVan(toewijzingen[i - 1]) : ALGEMEEN_GEBRUIK
    const nieuw = houderVan(t)
    items.push({
      id: `toew-${t.id}`,
      wanneer: t.van,
      soort: 'overdracht',
      titel: `Overgedragen aan ${nieuw}`,
      detail: [
        `Van ${vorige}`,
        t.niveau !== 'persoonlijk' ? NIVEAU_LABELS[t.niveau] : null,
        t.opmerking,
      ].filter(Boolean).join(' · '),
      door: wieVan(t.door),
      kleur: KLEUR.overdracht,
    })
  })

  // Innemen zonder nieuwe toewijzing: het laatste blok is afgesloten.
  const laatste = toewijzingen[toewijzingen.length - 1]
  if (laatste?.tot) {
    items.push({
      id: `toew-eind-${laatste.id}`,
      wanneer: laatste.tot,
      soort: 'overdracht',
      titel: `Ingenomen van ${houderVan(laatste)}`,
      detail: `Naar ${ALGEMEEN_GEBRUIK}`,
      door: null,
      kleur: KLEUR.overdracht,
    })
  }

  // ── Keuringen: uitkomst + bijzonderheden ──
  keuringen.forEach((k) => {
    const meta = k.uitkomst ? UITKOMST_META[k.uitkomst] : null
    items.push({
      id: `keur-${k.id}`,
      wanneer: k.geldig_van ?? k.created_at,
      soort: 'keuring',
      titel: `Keuring ${k.soort}${meta ? ` — ${meta.label}` : ''}`,
      detail: [
        k.bevindingen ? `Bijzonderheden: ${k.bevindingen}` : null,
        k.geldig_tot ? `Geldig t/m ${new Date(k.geldig_tot).toLocaleDateString('nl-NL')}` : null,
        k.uitgevoerd_door ? `Door ${k.uitgevoerd_door}` : null,
        k.opmerking,
      ].filter(Boolean).join(' · ') || null,
      door: null,
      kleur: meta?.kleur ?? KLEUR.neutraal,
    })
  })

  // ── Onderhoud, reparaties, storingen ──
  onderhoud.forEach((o) => {
    const bedrag = euro(o.kosten)
    items.push({
      id: `ond-${o.id}`,
      wanneer: o.datum,
      soort: 'onderhoud',
      titel: `${o.type.charAt(0).toUpperCase()}${o.type.slice(1)}${o.omschrijving ? `: ${o.omschrijving}` : ''}`,
      detail: [o.status === 'open' ? 'Nog open' : 'Afgerond', bedrag].filter(Boolean).join(' · '),
      door: wieVan(o.gemeld_door),
      kleur: KLEUR.onderhoud,
    })
  })

  // ── Periodieke controles ──
  controles.forEach((c) => {
    const uitkomst = c.status === 'ok' ? 'Aanwezig & werkt'
      : c.status === 'beschadigd' ? 'Beschadigd'
      : c.status === 'vermist' ? 'Vermist' : 'Gecontroleerd'
    const kleur = c.status === 'ok' ? '#16a34a' : c.status === 'beschadigd' ? '#f97316' : c.status === 'vermist' ? '#dc2626' : KLEUR.neutraal
    items.push({
      id: `contr-${c.id}`,
      wanneer: c.controle_datum,
      soort: 'controle',
      titel: `Controle: ${uitkomst}`,
      detail: c.opmerking,
      door: wieVan(c.uitgevoerd_door),
      kleur,
    })
  })

  // ── Statuswijzigingen en notities ──
  gebeurtenissen.forEach((g) => {
    if (g.soort === 'status') {
      const naarMeta = g.naar ? STATUS_META[g.naar as MaterieelStatus] : null
      const vanLabel = g.van ? STATUS_META[g.van as MaterieelStatus]?.label ?? g.van : '—'
      items.push({
        id: `geb-${g.id}`,
        wanneer: g.created_at,
        soort: 'status',
        titel: `Status: ${vanLabel} → ${naarMeta?.label ?? g.naar}`,
        detail: g.omschrijving,
        door: wieVan(g.door),
        kleur: naarMeta?.kleur ?? KLEUR.neutraal,
      })
    } else {
      items.push({
        id: `geb-${g.id}`,
        wanneer: g.created_at,
        soort: 'status',
        titel: g.omschrijving ?? 'Notitie',
        detail: null,
        door: wieVan(g.door),
        kleur: KLEUR.neutraal,
      })
    }
  })

  // ── Scans ──
  scans.forEach((s) => {
    items.push({
      id: `scan-${s.id}`,
      wanneer: s.gescand_at,
      soort: 'scan',
      titel: 'Gescand',
      detail: s.locatie,
      door: wieVan(s.gescand_door),
      kleur: KLEUR.scan,
    })
  })

  // Nieuwste bovenaan.
  return items.sort((a, b) => new Date(b.wanneer).getTime() - new Date(a.wanneer).getTime())
}
