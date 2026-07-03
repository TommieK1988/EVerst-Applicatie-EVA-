import { createAdminClient } from '@everts/database/server'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createAdminClient() as any

export type WerkbegrotingOvernameResultaat =
  | { ok: true; gematch: number; ongematch: string[] }
  | { ok: false; error: string }

/**
 * Neem de arbeidsuren uit de everts-calc werkbegroting over als planning-werkbegroting
 * (begrote uren per uursoort) van dit dossier.
 *
 * Wordt automatisch aangeroepen zodra een offerte opdracht wordt (gewonnen / Bouw7 02.x),
 * en blijft daarnaast handmatig beschikbaar via de sync-knop op de Planning-tab
 * (bijv. na een gewijzigde calculatie). Idempotent: bestaande regels worden ge-upsert.
 */
export async function neemWerkbegrotingOver(dossier_id: string): Promise<WerkbegrotingOvernameResultaat> {
  const supabase = db()

  const { data: dossier, error: dossierErr } = await supabase
    .from('dossiers')
    .select('everts_calc_project_id')
    .eq('id', dossier_id)
    .single()

  if (dossierErr) return { ok: false, error: dossierErr.message }
  if (!dossier?.everts_calc_project_id) return { ok: false, error: 'Geen everts-calc project gekoppeld aan dit dossier.' }

  const { data: componenten, error: compErr } = await supabase
    .from('werkbegroting_componenten')
    .select(`omschrijving, norm_hoeveelheid, type, werkbegroting_regels ( hoeveelheid )`)
    .eq('project_id', dossier.everts_calc_project_id)
    .eq('type', 'arbeid')

  if (compErr) return { ok: false, error: compErr.message }

  const urenPerOmschrijving: Record<string, number> = {}
  for (const comp of (componenten ?? [])) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const uren = (comp.werkbegroting_regels ?? []).reduce(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (sum: number, r: any) => sum + (r.hoeveelheid * comp.norm_hoeveelheid),
      0,
    )
    urenPerOmschrijving[comp.omschrijving] = (urenPerOmschrijving[comp.omschrijving] ?? 0) + uren
  }

  const { data: uursoorten, error: uursoortErr } = await supabase
    .from('planning_uursoorten')
    .select('id, everts_calc_omschrijvingen')
    .eq('actief', true)

  if (uursoortErr) return { ok: false, error: uursoortErr.message }

  const urenPerUursoort: Record<string, number> = {}
  const ongematch: string[] = []

  for (const [omschrijving, uren] of Object.entries(urenPerOmschrijving)) {
    const match = (uursoorten ?? []).find(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (u: any) => (u.everts_calc_omschrijvingen ?? []).includes(omschrijving),
    )
    if (match) {
      urenPerUursoort[match.id] = (urenPerUursoort[match.id] ?? 0) + uren
    } else {
      ongematch.push(omschrijving)
    }
  }

  for (const [uursoort_id, begrote_uren] of Object.entries(urenPerUursoort)) {
    const { error } = await supabase
      .from('planning_werkbegroting_regels')
      .upsert(
        { dossier_id, uursoort_id, begrote_uren },
        { onConflict: 'dossier_id,uursoort_id' },
      )
    if (error) return { ok: false, error: error.message }
  }

  return { ok: true, gematch: Object.keys(urenPerUursoort).length, ongematch }
}

/**
 * Automatische overname bij de fase-overgang offerte → opdracht. Stil: dossiers zonder
 * everts-calc-koppeling of zonder matchende uursoorten zijn geen fout — de handmatige
 * sync-knop op de Planning-tab blijft beschikbaar als vangnet.
 */
export async function neemWerkbegrotingOverStil(dossier_id: string): Promise<void> {
  try {
    await neemWerkbegrotingOver(dossier_id)
  } catch {
    /* nooit de statuswijziging of sync laten falen op de werkbegroting-overname */
  }
}
