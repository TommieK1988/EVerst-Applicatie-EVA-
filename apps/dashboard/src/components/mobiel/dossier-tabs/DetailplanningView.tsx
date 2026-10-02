import React from 'react'
import { createAdminClient } from '@everts/database/server'
import { getPlanningBewakingscodes } from '@/lib/planning/bewakingscodes'
import DetailplanningClient, { type MobielActiviteit } from './DetailplanningClient'

/**
 * Mobiele Detailplanning-tab: haalt de planning-activiteiten van het dossier op
 * (EVA-native, geen Bouw7) en geeft ze door aan de client-weergave. Die sorteert
 * chronologisch, verbergt verlopen werk en toont bij een liggend scherm een
 * versimpelde Gantt in plaats van de lijst.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createAdminClient() as any

export default async function DetailplanningView({ dossierId }: { dossierId: string }) {
  const supabase = db()
  const [{ data }, codes] = await Promise.all([supabase
    .from('planning_activiteiten')
    .select(`
      id, titel, status, gewenste_start, deadline, locatie_adres, volgorde,
      fase_id, bewakingscode,
      planning_fasen ( naam, volgorde ),
      planning_items (
        id, medewerker_id, start_dt, eind_dt,
        medewerkers ( voornaam, tussenvoegsel, achternaam )
      )
    `)
    .eq('dossier_id', dossierId)
    .order('volgorde', { ascending: true }),
    // Alleen voor de omschrijving naast de code. Lukt dat niet, dan staat de kale code er
    // nog steeds — en dat is wat de medewerker in zijn weekstaat moet invullen.
    getPlanningBewakingscodes(dossierId).catch(() => []),
  ])

  /** Kale code → omschrijving. Codes zijn niet uniek op nummer; de eerste met een naam wint. */
  const naamVanCode = new Map<string, string>()
  for (const c of codes) {
    const sleutel = c.code.toLowerCase()
    if (c.naam && !naamVanCode.has(sleutel)) naamVanCode.set(sleutel, c.naam)
  }

  // Supabase-typegeneratie kent deze geneste select niet; normaliseren naar een
  // expliciet type zodat er geen `any` de client in gaat.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rijen = (data ?? []) as any[]

  const activiteiten: MobielActiviteit[] = rijen.map((a) => ({
    id: String(a.id),
    titel: a.titel ?? '—',
    status: a.status ?? null,
    gewenste_start: a.gewenste_start ?? null,
    deadline: a.deadline ?? null,
    locatie_adres: a.locatie_adres ?? null,
    volgorde: typeof a.volgorde === 'number' ? a.volgorde : 0,
    fase_id: a.fase_id ? String(a.fase_id) : null,
    fase_naam: a.planning_fasen?.naam ?? null,
    fase_volgorde: a.planning_fasen?.volgorde ?? null,
    bewakingscode: a.bewakingscode ?? null,
    bewakingscode_naam: a.bewakingscode ? (naamVanCode.get(String(a.bewakingscode).toLowerCase()) ?? null) : null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    items: (a.planning_items ?? []).map((pi: any) => ({
      id: String(pi.id),
      medewerker_id: pi.medewerker_id ? String(pi.medewerker_id) : null,
      start_dt: pi.start_dt ?? null,
      eind_dt: pi.eind_dt ?? null,
      naam: [pi.medewerkers?.voornaam, pi.medewerkers?.tussenvoegsel, pi.medewerkers?.achternaam]
        .filter(Boolean).join(' ') || null,
      voornaam: pi.medewerkers?.voornaam ?? null,
    })),
  }))

  return <DetailplanningClient activiteiten={activiteiten} />
}
