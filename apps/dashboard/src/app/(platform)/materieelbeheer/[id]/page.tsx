import { notFound } from 'next/navigation'
import { createAdminClient } from '@everts/database/server'
import type { MaterieelObject, MaterieelKeuring, MaterieelOnderhoud } from '@/lib/materieel/types'
import { getMedewerkerOpties, getTeamOpties, getInstellingen, volledigeNaam } from '@/lib/materieel/data'
import Paspoort from '@/components/materieel/Paspoort'

export const dynamic = 'force-dynamic'

type MedewerkerNaam = { id: string; voornaam: string | null; tussenvoegsel: string | null; achternaam: string | null }
type ScanRow = { id: string; gescand_at: string; locatie: string | null; gescand_door: string | null }

export default async function MaterieelDetailPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any

  const { data: object } = await supabase.from('materieel_objecten').select('*').eq('id', id).maybeSingle()
  if (!object) notFound()
  const obj = object as MaterieelObject

  const [keuringenRes, onderhoudRes, scansRes, medewerkerOpties, teamOpties, instellingen] = await Promise.all([
    supabase.from('materieel_keuringen').select('*').eq('object_id', id).order('geldig_tot', { ascending: true, nullsFirst: false }),
    supabase.from('materieel_onderhoud').select('*').eq('object_id', id).order('datum', { ascending: false }),
    supabase.from('materieel_scans').select('id, gescand_at, locatie, gescand_door').eq('object_id', id).order('gescand_at', { ascending: false }).limit(8),
    getMedewerkerOpties(),
    getTeamOpties(),
    getInstellingen(),
  ])

  // Weergavenaam van de toewijzing. Zonder gekoppelde medewerker/team is het
  // algemeen gebruik — dat handelt het paspoort zelf af.
  const toegewezenNaam: string | null =
    obj.toegewezen_medewerker_id ? medewerkerOpties.find((m) => m.id === obj.toegewezen_medewerker_id)?.naam ?? null
    : obj.toegewezen_team_id ? teamOpties.find((t) => t.id === obj.toegewezen_team_id)?.naam ?? null
    : null

  // Scan-namen ophalen.
  const scans = (scansRes.data ?? []) as ScanRow[]
  const scanDoorIds = [...new Set(scans.map((s) => s.gescand_door).filter(Boolean))] as string[]
  const naamMap = new Map<string, string>()
  if (scanDoorIds.length > 0) {
    const { data: mws } = await supabase.from('medewerkers').select('id, voornaam, tussenvoegsel, achternaam').in('id', scanDoorIds)
    ;(mws ?? []).forEach((m: MedewerkerNaam) => naamMap.set(m.id, volledigeNaam(m)))
  }

  return (
    <Paspoort
      object={obj}
      toegewezenNaam={toegewezenNaam}
      medewerkerOpties={medewerkerOpties}
      teamOpties={teamOpties}
      keuringen={(keuringenRes.data ?? []) as MaterieelKeuring[]}
      onderhoud={(onderhoudRes.data ?? []) as MaterieelOnderhoud[]}
      scans={scans.map((s) => ({ id: s.id, gescand_at: s.gescand_at, locatie: s.locatie, door_naam: s.gescand_door ? naamMap.get(s.gescand_door) ?? null : null }))}
      keuringSoorten={instellingen.keuring_soorten}
    />
  )
}
