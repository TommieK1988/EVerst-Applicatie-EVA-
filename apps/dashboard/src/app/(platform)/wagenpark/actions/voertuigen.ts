'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { RDW } from '@everts/wagenpark-core'
import { createServiceRoleClient } from '@/lib/wagenpark/supabase/service-role'

const voertuigSchema = z.object({
  kenteken: z.string().min(3).max(10),
  merk: z.string().optional().nullable(),
  model: z.string().optional().nullable(),
  type: z.string().optional().nullable(),
  brandstof: z.string().optional().nullable(),
  kleur: z.string().optional().nullable(),
  status: z.string().default('actief'),
  opmerkingen: z.string().optional().nullable(),
})

export type VoertuigFormState = {
  ok: boolean
  error?: string
  voertuig_id?: string
}

export async function createVoertuigAction(
  _prev: VoertuigFormState | null,
  formData: FormData,
): Promise<VoertuigFormState> {
  const raw = {
    kenteken: (formData.get('kenteken') as string).trim().toUpperCase().replace(/\s+/g, ''),
    merk: formData.get('merk')?.toString() || null,
    model: formData.get('model')?.toString() || null,
    type: formData.get('type')?.toString() || null,
    brandstof: formData.get('brandstof')?.toString() || null,
    kleur: formData.get('kleur')?.toString() || null,
    status: formData.get('status')?.toString() || 'actief',
    opmerkingen: formData.get('opmerkingen')?.toString() || null,
  }

  const parsed = voertuigSchema.safeParse(raw)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.errors[0]?.message ?? 'Validatiefout' }
  }

  const supabase = createServiceRoleClient()

  // 1. Voeg voertuig toe
  const { data: voertuig, error: insertError } = await supabase
    .from('voertuigen')
    .insert(parsed.data)
    .select('id, kenteken')
    .single()

  if (insertError) {
    return { ok: false, error: insertError.message }
  }

  // 2. Probeer RDW-gegevens op te halen (best-effort, niet-blokkerend)
  try {
    const rdw = await RDW.fetchRdwVoertuig(voertuig.kenteken)
    if (rdw.voertuig) {
      const brandstofOmsch = RDW.brandstofOmschrijvingCombi(rdw.brandstof)
      const emissieklasse = RDW.emissieklasseCombi(rdw.brandstof, rdw.voertuig.milieuklasse_eg_goedkeuring_licht)
      await supabase.from('rdw_data').upsert(
        {
          voertuig_id: voertuig.id,
          kenteken: voertuig.kenteken,
          apk_vervaldatum: RDW.parseRdwDate(rdw.voertuig.vervaldatum_apk),
          massa_ledig_voertuig: RDW.parseRdwNumber(rdw.voertuig.massa_ledig_voertuig),
          massa_rijklaar: RDW.parseRdwNumber(rdw.voertuig.massa_rijklaar),
          toegestane_maximum_massa: RDW.parseRdwNumber(
            rdw.voertuig.toegestane_maximum_massa_voertuig,
          ),
          aantal_zitplaatsen: RDW.parseRdwNumber(rdw.voertuig.aantal_zitplaatsen),
          aantal_cilinders: RDW.parseRdwNumber(rdw.voertuig.aantal_cilinders),
          cilinderinhoud: RDW.parseRdwNumber(rdw.voertuig.cilinderinhoud),
          brandstof_omschrijving: brandstofOmsch,
          milieuclassificatie: emissieklasse,
          wok_status: rdw.voertuig.wacht_op_keuren === 'Ja',
          vervaldatum_tenaamstelling: RDW.parseRdwDate(
            rdw.voertuig.vervaldatum_tenaamstelling,
          ),
          eerste_toelating: RDW.parseRdwDate(rdw.voertuig.datum_eerste_toelating),
          datum_tenaamstelling: RDW.parseRdwDate(rdw.voertuig.datum_tenaamstelling),
          trekgewicht_geremd: RDW.parseRdwNumber(rdw.voertuig.maximum_trekken_massa_geremd),
          trekgewicht_ongeremd: RDW.parseRdwNumber(rdw.voertuig.maximum_massa_trekken_ongeremd),
          catalogusprijs: RDW.parseRdwNumber(rdw.voertuig.catalogusprijs),
          terugroepactie_open: rdw.terugroep.length > 0,
          terugroepactie_status: rdw.terugroep.length > 0
            ? rdw.terugroep.map((r) => r.omschrijving ?? r.referentiecode_rdw).filter(Boolean).join('; ').slice(0, 500)
            : null,
          rdw_raw: { voertuig: rdw.voertuig, brandstof: rdw.brandstof, terugroep: rdw.terugroep },
          laatst_opgehaald: rdw.opgehaald_op,
        },
        { onConflict: 'kenteken' },
      )

      // Vul voertuig aan met RDW-data waar leeg
      const updates: Record<string, unknown> = {}
      if (!parsed.data.merk && rdw.voertuig.merk) updates.merk = rdw.voertuig.merk
      if (!parsed.data.model && rdw.voertuig.handelsbenaming) {
        updates.model = rdw.voertuig.handelsbenaming
      }
      if (!parsed.data.brandstof && rdw.brandstof.length > 0) {
        updates.brandstof = RDW.samengesteldeBrandstof(rdw.brandstof)
      }
      // Kleur: sla "N.v.t." en "Niet geregistreerd" over
      const rdwKleur = rdw.voertuig.eerste_kleur
      if (!parsed.data.kleur && rdwKleur && !/n\.v\.t|niet geregistreerd/i.test(rdwKleur)) {
        updates.kleur = rdwKleur.charAt(0).toUpperCase() + rdwKleur.slice(1).toLowerCase()
      }
      if (rdw.voertuig.inrichting) {
        updates.carrosserietype = rdw.voertuig.inrichting
      }
      if (Object.keys(updates).length > 0) {
        await supabase.from('voertuigen').update(updates).eq('id', voertuig.id)
      }
    }
  } catch (err) {
    // RDW-fout is niet fataal; voertuig is al aangemaakt.
    console.warn('[RDW] lookup faalde voor', voertuig.kenteken, err)
  }

  revalidatePath('/wagenpark/voertuigen')
  return { ok: true, voertuig_id: voertuig.id }
}

export async function updateVoertuigStatusAction(id: string, status: string) {
  const supabase = createServiceRoleClient()
  await supabase.from('voertuigen').update({ status }).eq('id', id)
  revalidatePath('/wagenpark/voertuigen')
  revalidatePath(`/wagenpark/voertuigen/${id}`)
}

const editSchema = z.object({
  kleur: z.string().nullable().optional(),
  type: z.string().nullable().optional(),
  carrosserietype: z.string().nullable().optional(),
  bouwjaar: z.coerce.number().int().nullable().optional(),
  opmerkingen: z.string().nullable().optional(),
})

export async function updateVoertuigFieldsAction(id: string, formData: FormData) {
  const raw = {
    kleur: formData.get('kleur')?.toString() || null,
    type: formData.get('type')?.toString() || null,
    carrosserietype: formData.get('carrosserietype')?.toString() || null,
    bouwjaar: formData.get('bouwjaar') || null,
    opmerkingen: formData.get('opmerkingen')?.toString() || null,
  }
  const parsed = editSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: parsed.error.errors[0]?.message ?? 'Validatie' }
  const supabase = createServiceRoleClient()
  const { error } = await supabase
    .from('voertuigen')
    .update(parsed.data)
    .eq('id', id)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/wagenpark/voertuigen')
  revalidatePath(`/wagenpark/voertuigen/${id}`)
  return { ok: true }
}

export async function refreshRdwAction(voertuig_id: string, kenteken: string) {
  const supabase = createServiceRoleClient()
  try {
    const rdw = await RDW.fetchRdwVoertuig(kenteken)
    if (!rdw.voertuig) {
      return { ok: false, error: 'Geen RDW-data gevonden voor dit kenteken.' }
    }
    const brandstofOmsch = RDW.brandstofOmschrijvingCombi(rdw.brandstof)
    const emissieklasse = RDW.emissieklasseCombi(rdw.brandstof, rdw.voertuig.milieuklasse_eg_goedkeuring_licht)
    await supabase.from('rdw_data').upsert(
      {
        voertuig_id,
        kenteken,
        apk_vervaldatum: RDW.parseRdwDate(rdw.voertuig.vervaldatum_apk),
        massa_ledig_voertuig: RDW.parseRdwNumber(rdw.voertuig.massa_ledig_voertuig),
        massa_rijklaar: RDW.parseRdwNumber(rdw.voertuig.massa_rijklaar),
        toegestane_maximum_massa: RDW.parseRdwNumber(
          rdw.voertuig.toegestane_maximum_massa_voertuig,
        ),
        aantal_zitplaatsen: RDW.parseRdwNumber(rdw.voertuig.aantal_zitplaatsen),
        aantal_cilinders: RDW.parseRdwNumber(rdw.voertuig.aantal_cilinders),
        cilinderinhoud: RDW.parseRdwNumber(rdw.voertuig.cilinderinhoud),
        brandstof_omschrijving: brandstofOmsch,
        milieuclassificatie: emissieklasse,
        wok_status: rdw.voertuig.wacht_op_keuren === 'Ja',
        vervaldatum_tenaamstelling: RDW.parseRdwDate(
          rdw.voertuig.vervaldatum_tenaamstelling,
        ),
        eerste_toelating: RDW.parseRdwDate(rdw.voertuig.datum_eerste_toelating),
        datum_tenaamstelling: RDW.parseRdwDate(rdw.voertuig.datum_tenaamstelling),
        trekgewicht_geremd: RDW.parseRdwNumber(rdw.voertuig.maximum_trekken_massa_geremd),
        trekgewicht_ongeremd: RDW.parseRdwNumber(rdw.voertuig.maximum_massa_trekken_ongeremd),
        catalogusprijs: RDW.parseRdwNumber(rdw.voertuig.catalogusprijs),
        terugroepactie_open: rdw.terugroep.length > 0,
        terugroepactie_status: rdw.terugroep.length > 0
          ? rdw.terugroep.map((r) => r.omschrijving ?? r.referentiecode_rdw).filter(Boolean).join('; ').slice(0, 500)
          : null,
        rdw_raw: { voertuig: rdw.voertuig, brandstof: rdw.brandstof, terugroep: rdw.terugroep },
        laatst_opgehaald: rdw.opgehaald_op,
      },
      { onConflict: 'kenteken' },
    )
    // Ook het voertuig zelf verrijken waar leeg
    const { data: v } = await supabase
      .from('voertuigen')
      .select('merk, model, brandstof, bouwjaar, kleur, carrosserietype')
      .eq('id', voertuig_id)
      .single()
    if (v) {
      const updates: Record<string, unknown> = {}
      if (!v.merk && rdw.voertuig.merk) updates.merk = rdw.voertuig.merk
      if (!v.model && rdw.voertuig.handelsbenaming) updates.model = rdw.voertuig.handelsbenaming
      if ((!v.brandstof || v.brandstof === 'onbekend') && rdw.brandstof.length > 0) {
        updates.brandstof = RDW.samengesteldeBrandstof(rdw.brandstof)
      }
      const rdwKleur = rdw.voertuig.eerste_kleur
      if (!v.kleur && rdwKleur && !/n\.v\.t|niet geregistreerd/i.test(rdwKleur)) {
        updates.kleur = rdwKleur.charAt(0).toUpperCase() + rdwKleur.slice(1).toLowerCase()
      }
      if (!v.carrosserietype && rdw.voertuig.inrichting) {
        updates.carrosserietype = rdw.voertuig.inrichting
      }
      if (Object.keys(updates).length > 0) {
        await supabase.from('voertuigen').update(updates).eq('id', voertuig_id)
      }
    }
    revalidatePath(`/wagenpark/voertuigen/${voertuig_id}`)
    revalidatePath('/wagenpark/voertuigen')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
