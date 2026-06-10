'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { SchilderCombinatie } from '@/lib/services/schilderwerk'

// Helper: cast naar any zodat niet-gegenereerde tabellen werken (schilder_* staan niet in auto-gen types)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getDb(): Promise<any> { return createClient() }

// ─── Data ophalen ─────────────────────────────────────────────────────────────

export async function haalSchilderDropdownData() {
  const { getSchilderDropdownData } = await import('@/lib/services/schilderwerk')
  return getSchilderDropdownData()
}

export async function haalCombinaties(type_id: string): Promise<SchilderCombinatie[]> {
  const { getSchilderCombinaties } = await import('@/lib/services/schilderwerk')
  return getSchilderCombinaties(type_id)
}

const PAD = '/bibliotheek/schilderwerk'

// ─── Onderdelen ───────────────────────────────────────────────────────────────

export async function maakOnderdeel(naam: string, code?: string): Promise<string> {
  const supabase = await getDb()
  const { data, error } = await supabase
    .from('schilder_onderdelen')
    .insert({ naam, code: code ?? null })
    .select('id').single()
  if (error) throw new Error(`Fout bij aanmaken onderdeel: ${error.message}`)
  revalidatePath(PAD)
  return data.id
}

export async function wijzigOnderdeel(id: string, data: { naam?: string; code?: string; volgorde?: number }): Promise<void> {
  const supabase = await getDb()
  const { error } = await supabase.from('schilder_onderdelen').update({ ...data, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) throw new Error(`Fout bij wijzigen onderdeel: ${error.message}`)
  revalidatePath(PAD)
}

export async function verwijderOnderdeel(id: string): Promise<void> {
  const supabase = await getDb()
  const { error } = await supabase.from('schilder_onderdelen').update({ actief: false }).eq('id', id)
  if (error) throw new Error(`Fout bij verwijderen onderdeel: ${error.message}`)
  revalidatePath(PAD)
}

// ─── Types ────────────────────────────────────────────────────────────────────

export async function maakType(onderdeel_id: string, naam: string, eenheid = 'm²', formule?: string, code?: string): Promise<string> {
  const supabase = await getDb()
  const { data, error } = await supabase
    .from('schilder_types')
    .insert({ onderdeel_id, naam, eenheid, formule: formule ?? null, code: code ?? null })
    .select('id').single()
  if (error) throw new Error(`Fout bij aanmaken type: ${error.message}`)
  revalidatePath(PAD)
  return data.id
}

export async function wijzigType(id: string, data: { naam?: string; code?: string; eenheid?: string; formule?: string | null; volgorde?: number }): Promise<void> {
  const supabase = await getDb()
  const { error } = await supabase.from('schilder_types').update({ ...data, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) throw new Error(`Fout bij wijzigen type: ${error.message}`)
  revalidatePath(PAD)
}

export async function verwijderType(id: string): Promise<void> {
  const supabase = await getDb()
  const { error } = await supabase.from('schilder_types').update({ actief: false }).eq('id', id)
  if (error) throw new Error(`Fout bij verwijderen type: ${error.message}`)
  revalidatePath(PAD)
}

// ─── Behandelingen ────────────────────────────────────────────────────────────

export async function maakBehandeling(naam: string, code?: string, bron?: string): Promise<string> {
  const supabase = await getDb()
  const { data, error } = await supabase
    .from('schilder_behandelingen')
    .insert({ naam, code: code ?? null, bron: bron ?? 'Basisverfbestek 2020' })
    .select('id').single()
  if (error) throw new Error(`Fout bij aanmaken behandeling: ${error.message}`)
  revalidatePath(PAD)
  return data.id
}

export async function wijzigBehandeling(id: string, data: {
  naam?: string
  code?: string
  bron?: string
  korte_omschrijving?: string | null
  uitgebreide_werkomschrijving?: string | null
}): Promise<void> {
  const supabase = await getDb()
  const { error } = await supabase.from('schilder_behandelingen').update({ ...data, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) throw new Error(`Fout bij wijzigen behandeling: ${error.message}`)
  revalidatePath(PAD)
}

export async function verwijderBehandeling(id: string): Promise<void> {
  const supabase = await getDb()
  const { error } = await supabase.from('schilder_behandelingen').update({ actief: false }).eq('id', id)
  if (error) throw new Error(`Fout bij verwijderen behandeling: ${error.message}`)
  revalidatePath(PAD)
}

// ─── Combinaties (Schilderrecepten) ───────────────────────────────────────────

export async function maakCombinatie(onderdeel_id: string, type_id: string, behandeling_id: string): Promise<string> {
  const supabase = await getDb()
  const { data, error } = await supabase
    .from('schilder_combinaties')
    .insert({ onderdeel_id, type_id, behandeling_id })
    .select('id').single()
  if (error) throw new Error(`Fout bij aanmaken schilderrecept: ${error.message}`)
  revalidatePath(PAD)
  return data.id
}

export async function verwijderCombinatie(id: string): Promise<void> {
  const supabase = await getDb()
  const { error } = await supabase.from('schilder_combinaties').update({ actief: false }).eq('id', id)
  if (error) throw new Error(`Fout bij verwijderen schilderrecept: ${error.message}`)
  revalidatePath(PAD)
}

// ─── Arbeidsnormen ────────────────────────────────────────────────────────────

export async function maakArbeidNorm(combinatie_id: string, data: {
  omschrijving?: string
  minutes_per_unit: number
  hour_rate: number
  unit?: string
}): Promise<void> {
  const supabase = await getDb()
  const { error } = await supabase.from('schilder_arbeid_normen').insert({
    combinatie_id,
    omschrijving: data.omschrijving ?? null,
    minutes_per_unit: data.minutes_per_unit,
    hour_rate: data.hour_rate,
    cost_per_unit: (data.minutes_per_unit / 60) * data.hour_rate,
    unit: data.unit ?? 'm²',
  })
  if (error) throw new Error(`Fout bij toevoegen arbeidsnorm: ${error.message}`)
  revalidatePath(PAD)
}

export async function wijzigArbeidNorm(id: string, data: {
  omschrijving?: string
  minutes_per_unit?: number
  hour_rate?: number
  unit?: string
}): Promise<void> {
  const supabase = await getDb()
  const bestaand = await supabase.from('schilder_arbeid_normen').select('minutes_per_unit, hour_rate').eq('id', id).single()
  const minuten = data.minutes_per_unit ?? bestaand.data?.minutes_per_unit ?? 0
  const tarief = data.hour_rate ?? bestaand.data?.hour_rate ?? 0
  const { error } = await supabase.from('schilder_arbeid_normen').update({
    ...data,
    cost_per_unit: (minuten / 60) * tarief,
  }).eq('id', id)
  if (error) throw new Error(`Fout bij wijzigen arbeidsnorm: ${error.message}`)
  revalidatePath(PAD)
}

export async function verwijderArbeidNorm(id: string): Promise<void> {
  const supabase = await getDb()
  const { error } = await supabase.from('schilder_arbeid_normen').delete().eq('id', id)
  if (error) throw new Error(`Fout bij verwijderen arbeidsnorm: ${error.message}`)
  revalidatePath(PAD)
}

// ─── Materiaalnormen ──────────────────────────────────────────────────────────

export async function maakMateriaalNorm(combinatie_id: string, data: {
  naam?: string
  norm_type?: string
  quantity_per_unit: number
  eenheid?: string
  unit_price: number
}): Promise<void> {
  const supabase = await getDb()
  const { error } = await supabase.from('schilder_materiaal_normen').insert({
    combinatie_id,
    naam: data.naam ?? null,
    norm_type: data.norm_type ?? 'materiaal',
    quantity_per_unit: data.quantity_per_unit,
    eenheid: data.eenheid ?? 'ltr',
    unit_price: data.unit_price,
    cost_per_unit: data.quantity_per_unit * data.unit_price,
  })
  if (error) throw new Error(`Fout bij toevoegen materiaalnorm: ${error.message}`)
  revalidatePath(PAD)
}

export async function wijzigMateriaalNorm(id: string, data: {
  naam?: string
  quantity_per_unit?: number
  eenheid?: string
  unit_price?: number
}): Promise<void> {
  const supabase = await getDb()
  const bestaand = await supabase.from('schilder_materiaal_normen').select('quantity_per_unit, unit_price').eq('id', id).single()
  const qty = data.quantity_per_unit ?? bestaand.data?.quantity_per_unit ?? 0
  const prijs = data.unit_price ?? bestaand.data?.unit_price ?? 0
  const { error } = await supabase.from('schilder_materiaal_normen').update({
    ...data,
    cost_per_unit: qty * prijs,
  }).eq('id', id)
  if (error) throw new Error(`Fout bij wijzigen materiaalnorm: ${error.message}`)
  revalidatePath(PAD)
}

export async function verwijderMateriaalNorm(id: string): Promise<void> {
  const supabase = await getDb()
  const { error } = await supabase.from('schilder_materiaal_normen').delete().eq('id', id)
  if (error) throw new Error(`Fout bij verwijderen materiaalnorm: ${error.message}`)
  revalidatePath(PAD)
}

// ─── Excel import ─────────────────────────────────────────────────────────────

export async function importeerSchilderwerkExcel(
  formData: FormData
): Promise<{ aangemaakt: number; bijgewerkt: number; fouten: string[] }> {
  const XLSX = await import('xlsx')
  const supabase = await getDb()

  const bestand = formData.get('bestand') as File | null
  if (!bestand) throw new Error('Geen bestand ontvangen')

  const buffer = Buffer.from(await bestand.arrayBuffer())
  const workbook = XLSX.read(buffer, { type: 'buffer' })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  const rijen = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })

  if (rijen.length === 0) return { aangemaakt: 0, bijgewerkt: 0, fouten: ['Geen rijen gevonden'] }

  const kols = Object.keys(rijen[0])
  const vind = (...namen: string[]) =>
    kols.find(k => namen.some(n => k.toLowerCase().replace(/[^a-z]/g, '').includes(n.toLowerCase().replace(/[^a-z]/g, '')))) ?? ''

  const colOnderdeel   = vind('onderdeel')
  const colType        = vind('type')
  const colBehandeling = vind('behandeling')
  const colEenheid     = vind('eenheid')
  const colFormule     = vind('formule')
  const colNormType    = vind('normtype', 'type', 'norm_type')
  const colOmschr      = vind('omschrijving', 'naam', 'description')
  const colMinuten     = vind('minpereend', 'minuten', 'min', 'minutes')
  const colTarief      = vind('tarief', 'rate', 'uurtarief')
  const colMatNaam     = vind('materiaal', 'matnaam', 'naam')
  const colInzet       = vind('inzet', 'qty', 'hoeveelheid')
  const colEenhMat     = vind('eenheidmat', 'eenhmat')
  const colPrijs       = vind('prijs', 'price')

  if (!colOnderdeel || !colType || !colBehandeling) {
    return { aangemaakt: 0, bijgewerkt: 0, fouten: ['Kolommen "onderdeel", "type" en "behandeling" zijn vereist'] }
  }

  // Caches
  const onMap  = new Map<string, string>() // naam → id
  const tyMap  = new Map<string, string>() // 'ondId::naam' → id
  const beMap  = new Map<string, string>() // naam → id
  const coMap  = new Map<string, string>() // 'ondId::typeId::behId' → combinatie_id

  // Preload bestaande data
  const [onRes, tyRes, beRes, coRes] = await Promise.all([
    supabase.from('schilder_onderdelen').select('id, naam').eq('actief', true),
    supabase.from('schilder_types').select('id, onderdeel_id, naam').eq('actief', true),
    supabase.from('schilder_behandelingen').select('id, naam').eq('actief', true),
    supabase.from('schilder_combinaties').select('id, onderdeel_id, type_id, behandeling_id').eq('actief', true),
  ])
  for (const r of onRes.data ?? []) onMap.set(r.naam.toLowerCase(), r.id)
  for (const r of tyRes.data ?? []) tyMap.set(`${r.onderdeel_id}::${r.naam.toLowerCase()}`, r.id)
  for (const r of beRes.data ?? []) beMap.set(r.naam.toLowerCase(), r.id)
  for (const r of coRes.data ?? []) coMap.set(`${r.onderdeel_id}::${r.type_id}::${r.behandeling_id}`, r.id)

  let aangemaakt = 0
  let bijgewerkt = 0
  const fouten: string[] = []

  for (let i = 0; i < rijen.length; i++) {
    const rij = rijen[i]
    const rijNr = i + 2
    const onderdeelNaam = String(rij[colOnderdeel] ?? '').trim()
    const typeNaam = String(rij[colType] ?? '').trim()
    const behandelingNaam = String(rij[colBehandeling] ?? '').trim()
    const normType = String(rij[colNormType] ?? '').trim().toUpperCase()

    if (!onderdeelNaam || !typeNaam || !behandelingNaam) continue
    if (!['A', 'M', 'OA'].includes(normType)) {
      fouten.push(`Rij ${rijNr}: onbekend norm_type "${normType}" (verwacht A, M of OA)`)
      continue
    }

    // Find-or-create onderdeel
    let ondId = onMap.get(onderdeelNaam.toLowerCase())
    if (!ondId) {
      const { data, error } = await supabase.from('schilder_onderdelen').insert({ naam: onderdeelNaam }).select('id').single()
      if (error) { fouten.push(`Rij ${rijNr}: onderdeel aanmaken mislukt: ${error.message}`); continue }
      ondId = data!.id as string; onMap.set(onderdeelNaam.toLowerCase(), ondId as string); aangemaakt++
    }

    // Find-or-create type
    const tyKey = `${ondId}::${typeNaam.toLowerCase()}`
    let typeId = tyMap.get(tyKey)
    if (!typeId) {
      const eenheid = colEenheid ? String(rij[colEenheid] ?? 'm²').trim() : 'm²'
      const formule = colFormule ? String(rij[colFormule] ?? '').trim() || null : null
      const { data, error } = await supabase.from('schilder_types').insert({ onderdeel_id: ondId, naam: typeNaam, eenheid, formule }).select('id').single()
      if (error) { fouten.push(`Rij ${rijNr}: type aanmaken mislukt: ${error.message}`); continue }
      typeId = data!.id as string; tyMap.set(tyKey, typeId as string); aangemaakt++
    } else {
      // Bijwerken eenheid/formule als aanwezig in rij
      if (colEenheid && rij[colEenheid]) {
        const eenheid = String(rij[colEenheid]).trim()
        const formule = colFormule ? String(rij[colFormule] ?? '').trim() || null : undefined
        await supabase.from('schilder_types').update({ eenheid, ...(formule !== undefined ? { formule } : {}) }).eq('id', typeId)
        bijgewerkt++
      }
    }

    // Find-or-create behandeling
    let behId = beMap.get(behandelingNaam.toLowerCase())
    if (!behId) {
      const { data, error } = await supabase.from('schilder_behandelingen').insert({ naam: behandelingNaam }).select('id').single()
      if (error) { fouten.push(`Rij ${rijNr}: behandeling aanmaken mislukt: ${error.message}`); continue }
      behId = data!.id as string; beMap.set(behandelingNaam.toLowerCase(), behId as string); aangemaakt++
    }

    // Find-or-create combinatie
    const coKey = `${ondId}::${typeId}::${behId}`
    let combId = coMap.get(coKey)
    if (!combId) {
      const { data, error } = await supabase.from('schilder_combinaties').insert({ onderdeel_id: ondId, type_id: typeId, behandeling_id: behId }).select('id').single()
      if (error) { fouten.push(`Rij ${rijNr}: combinatie aanmaken mislukt: ${error.message}`); continue }
      combId = data!.id as string; coMap.set(coKey, combId as string); aangemaakt++
    }

    // Norm toevoegen
    if (normType === 'A') {
      const minRaw = colMinuten ? parseFloat(String(rij[colMinuten] ?? '0').replace(',', '.')) : 0
      const tarief = colTarief ? parseFloat(String(rij[colTarief] ?? '0').replace(',', '.')) : 0
      const omschr = colOmschr ? String(rij[colOmschr] ?? '').trim() : ''
      if (isNaN(minRaw) || minRaw <= 0) { fouten.push(`Rij ${rijNr}: ongeldige minuten "${rij[colMinuten]}"`); continue }
      const { error } = await supabase.from('schilder_arbeid_normen').insert({
        combinatie_id: combId, omschrijving: omschr || null,
        minutes_per_unit: minRaw, hour_rate: tarief,
        cost_per_unit: (minRaw / 60) * tarief,
      })
      if (error) fouten.push(`Rij ${rijNr}: arbeidsnorm mislukt: ${error.message}`)
      else aangemaakt++
    } else if (normType === 'M' || normType === 'OA') {
      const naam = colMatNaam ? String(rij[colMatNaam] ?? '').trim() : ''
      const inzet = colInzet ? parseFloat(String(rij[colInzet] ?? '1').replace(',', '.')) : 1
      const eenhMat = colEenhMat ? String(rij[colEenhMat] ?? 'ltr').trim() : 'ltr'
      const prijs = colPrijs ? parseFloat(String(rij[colPrijs] ?? '0').replace(',', '.')) : 0
      if (!naam) { fouten.push(`Rij ${rijNr}: materiaal/OA naam ontbreekt`); continue }
      const { error } = await supabase.from('schilder_materiaal_normen').insert({
        combinatie_id: combId, naam,
        norm_type: normType === 'OA' ? 'onderaanneming' : 'materiaal',
        quantity_per_unit: normType === 'OA' ? 1 : (isNaN(inzet) ? 1 : inzet),
        eenheid: normType === 'OA' ? 'eenh' : eenhMat,
        unit_price: isNaN(prijs) ? 0 : prijs,
        cost_per_unit: normType === 'OA' ? prijs : (isNaN(inzet) ? 0 : inzet) * (isNaN(prijs) ? 0 : prijs),
      })
      if (error) fouten.push(`Rij ${rijNr}: materiaalnorm mislukt: ${error.message}`)
      else aangemaakt++
    }
  }

  revalidatePath(PAD)
  return { aangemaakt, bijgewerkt, fouten }
}
