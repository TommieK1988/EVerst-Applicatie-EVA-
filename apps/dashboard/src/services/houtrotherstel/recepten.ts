'use server'

import { createAdminClient } from '@everts/database/server'

/**
 * Recepten uit de calculatiebibliotheek, doorgerekend tot een prijs.
 *
 * De houtrot-reparatiebibliotheek is opgegaan in de Recepten-bibliotheek
 * (`paint_items` + arbeids-/materiaalnormen). Een registratie kiest dus een
 * recept. Server action omdat de houtrot-client op het `houtrotherstel`-schema
 * staat en `public.paint_items` daar niet leesbaar is.
 *
 * Uurtarieven komen uit Bedrijfsinstellingen: een arbeidsnorm verwijst met
 * `uurtarief_label` naar een tarief, zodat een tariefwijziging automatisch
 * doorwerkt in alle recepten. `hour_rate` op de norm is slechts de laatst
 * doorgerekende waarde en dient als terugval.
 */
export type Recept = {
  id: string
  code: string
  naam: string
  omschrijving: string | null
  eenheid: string | null
  uren: number
  uurtarief: number
  arbeidskosten: number
  materiaalkosten: number
  kostprijs: number
  margePct: number | null
  verkoopprijs: number
}

const getal = (v: unknown): number => {
  const n = typeof v === 'string' ? parseFloat(v) : Number(v)
  return Number.isFinite(n) ? n : 0
}

export async function getRecepten(): Promise<Recept[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any

  const [{ data: items }, { data: instellingen }] = await Promise.all([
    supabase
      .from('paint_items')
      .select(`
        id, item_code, onderdeel, full_name, description, default_unit, marge_pct, active,
        labor_norms:paint_labor_norms ( hours_per_unit, hour_rate, cost_per_unit, active, uurtarief_label ),
        material_norms:paint_material_norms ( cost_per_unit, active )
      `)
      .eq('active', true)
      .order('item_code'),
    supabase.from('bedrijfsinstellingen').select('uurtarieven').eq('id', 1).maybeSingle(),
  ])

  // Tarieven op label, zodat een norm het actuele bedrijfstarief volgt.
  const tarieven = new Map<string, number>()
  for (const t of (instellingen?.uurtarieven ?? []) as { label?: string; tarief?: number }[]) {
    if (t?.label) tarieven.set(t.label.toLowerCase(), getal(t.tarief))
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((items ?? []) as any[]).map((it: any): Recept => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const arbeid = (it.labor_norms ?? []).filter((n: any) => n.active !== false)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const materiaal = (it.material_norms ?? []).filter((n: any) => n.active !== false)

    let uren = 0
    let arbeidskosten = 0
    let laatstTarief = 0

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const n of arbeid as any[]) {
      const u = getal(n.hours_per_unit)
      const label = (n.uurtarief_label ?? '').toLowerCase()
      // Actueel bedrijfstarief wint; anders het bedrag dat op de norm staat.
      const tarief = (label && tarieven.get(label)) || getal(n.hour_rate)
      uren += u
      arbeidskosten += u > 0 ? u * tarief : getal(n.cost_per_unit)
      if (tarief) laatstTarief = tarief
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const materiaalkosten = (materiaal as any[]).reduce((s, n) => s + getal(n.cost_per_unit), 0)

    const kostprijs = Math.round((arbeidskosten + materiaalkosten) * 100) / 100
    const margePct = it.marge_pct == null ? null : getal(it.marge_pct)

    // Marge is een percentage ván de verkoopprijs: verkoop = kostprijs / (1 - marge/100).
    const verkoopprijs =
      margePct != null && margePct > 0 && margePct < 100
        ? Math.round((kostprijs / (1 - margePct / 100)) * 100) / 100
        : kostprijs

    return {
      id: it.id,
      code: it.item_code,
      naam: it.onderdeel ?? it.full_name ?? it.item_code,
      omschrijving: it.description ?? null,
      eenheid: it.default_unit ?? null,
      uren: Math.round(uren * 100) / 100,
      uurtarief: laatstTarief,
      arbeidskosten: Math.round(arbeidskosten * 100) / 100,
      materiaalkosten: Math.round(materiaalkosten * 100) / 100,
      kostprijs,
      margePct,
      verkoopprijs,
    }
  })
}
