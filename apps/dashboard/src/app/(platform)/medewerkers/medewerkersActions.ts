'use server'

import { createAdminClient } from '@everts/database/server'
import { z } from 'zod'

const nieuweMedewerkerSchema = z.object({
  voornaam:      z.string().min(1),
  tussenvoegsel: z.string().nullable().optional(),
  achternaam:    z.string().min(1),
  email:         z.string().email().nullable().optional(),
  functie:       z.string().nullable().optional(),
  extern:        z.boolean().optional().default(false),
})

type MaakMedewerkerResult = { ok: true; id: string } | { ok: false; error: string }

export async function maakMedewerker(raw: unknown): Promise<MaakMedewerkerResult> {
  const parsed = nieuweMedewerkerSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: parsed.error.errors[0]?.message ?? 'Ongeldige invoer' }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any

  const { data, error } = await supabase
    .from('medewerkers')
    .insert({
      voornaam:      parsed.data.voornaam,
      tussenvoegsel: parsed.data.tussenvoegsel ?? null,
      achternaam:    parsed.data.achternaam,
      email:         parsed.data.email ?? null,
      functie:       parsed.data.functie ?? null,
      extern:        parsed.data.extern ?? false,
      actief:        true,
    })
    .select('id')
    .single()

  if (error) return { ok: false, error: error.message }

  // Standaard werkrooster van de functie automatisch aanmaken
  if (parsed.data.functie) {
    const { data: functieDef } = await supabase
      .from('medewerker_functies')
      .select('standaard_rooster')
      .eq('naam', parsed.data.functie)
      .eq('actief', true)
      .maybeSingle()

    const r = functieDef?.standaard_rooster
    if (r?.werkdagen?.length && r.dagstart && r.dageind) {
      const vandaag = new Date().toISOString().split('T')[0]

      const { data: newRooster } = await supabase
        .from('medewerker_roosters')
        .insert({
          medewerker_id:         data.id,
          geldig_vanaf:          vandaag,
          geldig_tot:            null,
          werkdagen:             r.werkdagen,
          dagstart:              r.dagstart,
          dageind:               r.dageind,
          contracturen_per_week: r.contracturen_per_week ?? 0,
        })
        .select('id')
        .single()

      if (newRooster && r.pauzes?.length > 0) {
        await supabase.from('medewerker_rooster_pauzes').insert(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          r.pauzes.map((p: any) => ({
            rooster_id:  newRooster.id,
            pauze_start: p.pauze_start,
            pauze_eind:  p.pauze_eind,
          }))
        )
      }
    }
  }

  return { ok: true, id: data.id }
}
