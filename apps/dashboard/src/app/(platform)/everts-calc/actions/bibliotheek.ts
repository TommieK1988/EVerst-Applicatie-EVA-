'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/everts-calc/supabase/server'
import { createHash } from 'crypto'
import { getBibliotheekItems } from '@/lib/everts-calc/services/bibliotheek'
import type { PaintItemMetNormen } from '@/lib/everts-calc/services/bibliotheek'
import type { BibliotheekItemVereenvoudigd } from '@/lib/everts-calc/types'

export async function laadBibliotheekItemsVolledig(): Promise<PaintItemMetNormen[]> {
  return getBibliotheekItems()
}

// ─── Bibliotheek items ophalen (voor client components) ───────────────────────

export async function haalBibliotheekItemsOp(): Promise<BibliotheekItemVereenvoudigd[]> {
  const items = await getBibliotheekItems()
  return items.map(item => ({
    id: item.id,
    item_code: item.item_code ?? '',
    full_name: item.full_name,
    description: item.description ?? null,
    onderdeel: item.onderdeel,
    default_unit: item.default_unit ?? 'm2',
    schilderbehandeling_id: item.schilder_behandeling_id ?? null,
    behandeling_code: item.behandeling_code ?? null,
    labor_norms: item.labor_norms.map(n => ({
      hours_per_unit: n.hours_per_unit,
      hour_rate: n.hour_rate,
      cost_per_unit: n.cost_per_unit,
    })),
    material_norms: item.material_norms.map(n => ({
      material_name: n.material_name ?? null,
      quantity_per_unit: n.quantity_per_unit,
      unit_price: n.unit_price,
      cost_per_unit: n.cost_per_unit,
      unit: n.unit,
      norm_type: n.norm_type,
    })),
  }))
}

// ─── Hulpfunctie: deterministische UUID o.b.v. code ─────────────────────────

function codeNaarUuid(prefix: string, code: string): string {
  const hash = createHash('sha256').update(`everts:${prefix}:${code}`).digest('hex')
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`
}

// ─── Vergrendelde recepten ────────────────────────────────────────────────────

/**
 * Recepten met `vergrendeld = true` zijn een spiegel van de Schilderwerk-
 * bibliotheek: een database-trigger schrijft ze bij elke wijziging daar opnieuw.
 * Iets aanpassen in de recepten-bibliotheek zou dus bij de eerstvolgende
 * wijziging aan de bronkant stilzwijgend verdwijnen. Daarom blokkeren we het
 * hier — de UI toont een slotje, maar dít is de harde grens.
 */
const VERGRENDELD_MELDING =
  'Dit recept komt uit de Schilderwerkbibliotheek en wordt daar beheerd. ' +
  'Pas het daar aan; de wijziging komt vanzelf hier terug.'

async function weigerAlsVergrendeld(itemIds: string[]): Promise<void> {
  const ids = itemIds.filter(Boolean)
  if (ids.length === 0) return

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('paint_items')
    .select('id')
    .in('id', ids)
    .eq('vergrendeld', true)
    .limit(1)

  if (error) throw new Error(`Fout bij controleren recept: ${error.message}`)
  if (data && data.length > 0) throw new Error(VERGRENDELD_MELDING)
}

/** Zoekt het recept op waar een norm bij hoort en controleert de vergrendeling. */
async function weigerAlsNormVanVergrendeldRecept(
  tabel: 'paint_labor_norms' | 'paint_material_norms',
  normId: string,
): Promise<void> {
  const supabase = await createClient()
  const { data, error } = await supabase.from(tabel).select('item_id').eq('id', normId).single()
  if (error) throw new Error(`Fout bij opzoeken norm: ${error.message}`)
  await weigerAlsVergrendeld([data?.item_id].filter((v): v is string => Boolean(v)))
}

// ─── Arbeidsnorm bijwerken ────────────────────────────────────────────────────

export async function updateLaborNorm(id: string, data: {
  hours_per_unit?: number
  hour_rate?: number
  description?: string
}): Promise<void> {
  await weigerAlsNormVanVergrendeldRecept('paint_labor_norms', id)
  const supabase = await createClient()

  const bestaand = await supabase
    .from('paint_labor_norms')
    .select('hours_per_unit, hour_rate')
    .eq('id', id)
    .single()

  const hours = data.hours_per_unit ?? bestaand.data?.hours_per_unit ?? 0
  const rate  = data.hour_rate      ?? bestaand.data?.hour_rate      ?? 0

  const { error } = await supabase
    .from('paint_labor_norms')
    .update({ ...data, cost_per_unit: hours * rate })
    .eq('id', id)

  if (error) throw new Error(`Fout bij bijwerken arbeidsnorm: ${error.message}`)
  revalidatePath('/bibliotheek')
}

// ─── Materiaalnorm bijwerken ──────────────────────────────────────────────────

export async function updateMaterialNorm(id: string, data: {
  quantity_per_unit?: number
  unit_price?: number
  material_name?: string
  unit?: string
}): Promise<void> {
  await weigerAlsNormVanVergrendeldRecept('paint_material_norms', id)
  const supabase = await createClient()

  const bestaand = await supabase
    .from('paint_material_norms')
    .select('quantity_per_unit, unit_price')
    .eq('id', id)
    .single()

  const qty   = data.quantity_per_unit ?? bestaand.data?.quantity_per_unit ?? 0
  const price = data.unit_price        ?? bestaand.data?.unit_price        ?? 0

  const { error } = await supabase
    .from('paint_material_norms')
    .update({ ...data, cost_per_unit: qty * price })
    .eq('id', id)

  if (error) throw new Error(`Fout bij bijwerken materiaalnorm: ${error.message}`)
  revalidatePath('/bibliotheek')
}

// ─── Recept bijwerken ─────────────────────────────────────────────────────────

export async function updateRecept(id: string, data: {
  item_code?: string
  full_name?: string
  default_unit?: string
  onderdeel?: string
  description?: string
  treatment_id?: string
  btw_tarief?: string
  /** Houtrot-soort: groepslabel voor de tweetraps keuze in de houtrot-app. */
  groep?: string | null
}): Promise<void> {
  await weigerAlsVergrendeld([id])
  const supabase = await createClient()
  const { error } = await supabase.from('paint_items').update(data).eq('id', id)
  if (error) throw new Error(`Fout bij bijwerken recept: ${error.message}`)
  revalidatePath('/bibliotheek')
}

// ─── Recept verwijderen ───────────────────────────────────────────────────────

export async function verwijderRecept(id: string): Promise<void> {
  await weigerAlsVergrendeld([id])
  const supabase = await createClient()
  // Cascade: verwijder norms eerst
  await supabase.from('paint_labor_norms').delete().eq('item_id', id)
  await supabase.from('paint_material_norms').delete().eq('item_id', id)
  const { error } = await supabase.from('paint_items').delete().eq('id', id)
  if (error) throw new Error(`Fout bij verwijderen recept: ${error.message}`)
  revalidatePath('/bibliotheek')
}

// ─── Arbeidsnorm toevoegen ────────────────────────────────────────────────────

export async function voegLaborNormToe(itemId: string, treatmentId: string, sourceCode: string, data: {
  hours_per_unit: number
  hour_rate: number
  unit?: string
  description?: string
}): Promise<void> {
  await weigerAlsVergrendeld([itemId])
  const supabase = await createClient()
  const { error } = await supabase.from('paint_labor_norms').insert({
    item_id: itemId,
    treatment_id: treatmentId,
    source_code: sourceCode,
    unit: data.unit ?? 'uur',
    hours_per_unit: data.hours_per_unit,
    hour_rate: data.hour_rate,
    cost_per_unit: data.hours_per_unit * data.hour_rate,
    active: true,
    description: data.description ?? null,
  })
  if (error) throw new Error(`Fout bij toevoegen arbeidsnorm: ${error.message}`)
  revalidatePath('/bibliotheek')
}

// ─── Arbeidsnorm verwijderen ──────────────────────────────────────────────────

export async function verwijderLaborNorm(id: string): Promise<void> {
  await weigerAlsNormVanVergrendeldRecept('paint_labor_norms', id)
  const supabase = await createClient()
  const { error } = await supabase.from('paint_labor_norms').delete().eq('id', id)
  if (error) throw new Error(`Fout bij verwijderen arbeidsnorm: ${error.message}`)
  revalidatePath('/bibliotheek')
}

// ─── Materiaalnorm toevoegen ──────────────────────────────────────────────────

export async function voegMaterialNormToe(itemId: string, treatmentId: string, sourceCode: string, data: {
  material_name: string
  quantity_per_unit: number
  unit_price: number
  unit?: string
  norm_type?: string
}): Promise<void> {
  await weigerAlsVergrendeld([itemId])
  const supabase = await createClient()
  const { error } = await supabase.from('paint_material_norms').insert({
    item_id: itemId,
    treatment_id: treatmentId,
    source_code: sourceCode,
    material_name: data.material_name,
    unit: data.unit ?? 'ltr',
    quantity_per_unit: data.quantity_per_unit,
    unit_price: data.unit_price,
    cost_per_unit: data.quantity_per_unit * data.unit_price,
    active: true,
    norm_type: data.norm_type ?? 'materiaal',
  })
  if (error) throw new Error(`Fout bij toevoegen materiaalnorm: ${error.message}`)
  revalidatePath('/bibliotheek')
}

// ─── Materiaalnorm verwijderen ────────────────────────────────────────────────

export async function verwijderMaterialNorm(id: string): Promise<void> {
  await weigerAlsNormVanVergrendeldRecept('paint_material_norms', id)
  const supabase = await createClient()
  const { error } = await supabase.from('paint_material_norms').delete().eq('id', id)
  if (error) throw new Error(`Fout bij verwijderen materiaalnorm: ${error.message}`)
  revalidatePath('/bibliotheek')
}

// ─── Nieuw recept aanmaken ────────────────────────────────────────────────────

export async function maakRecept(data: {
  item_code: string
  full_name: string
  default_unit: string
  onderdeel: string
  description?: string
  btw_tarief?: string
  /** Houtrot-soort: groepslabel voor de tweetraps keuze in de houtrot-app. */
  groep?: string
}): Promise<string> {
  const supabase = await createClient()
  const FAMILIE_ID = '00000000-0000-0000-0000-000000000001'

  // Auto-create treatment per categorie (niet zichtbaar voor gebruiker)
  const catCode = (data.onderdeel.substring(0, 2) || 'OV').toUpperCase()
  const treatId = codeNaarUuid('treatment', catCode)
  await supabase.from('paint_treatments').upsert(
    { id: treatId, family_id: FAMILIE_ID, treatment_code: catCode, treatment_index_code: catCode, name: catCode, active: true },
    { onConflict: 'id' }
  )

  const { data: item, error } = await supabase
    .from('paint_items')
    .insert({
      ...data,
      treatment_id: treatId,
      family_id: FAMILIE_ID,
      type: 'activiteit',
      active: true,
    })
    .select('id')
    .single()
  if (error) throw new Error(`Fout bij aanmaken recept: ${error.message}`)
  revalidatePath('/bibliotheek')
  return item.id
}

// ─── Calculatieregel opslaan als recept ──────────────────────────────────────

export async function slaRegelOpAlsRecept(data: {
  naam: string
  eenheid: string
  categorie: string
  normen: {
    type: 'arbeid' | 'materieel' | 'onderaanneming'
    norm_hoeveelheid: number
    tarief: number
    omschrijving?: string
    eenheid?: string
  }[]
}): Promise<{ id: string; code: string }> {
  const supabase = await createClient()
  const FAMILIE_ID = '00000000-0000-0000-0000-000000000001'

  // Genereer volgende beschikbare code voor deze categorie
  const catPrefix = (data.categorie.substring(0, 2) || 'OV').toUpperCase()
  const { data: bestaand } = await supabase
    .from('paint_items')
    .select('item_code')
    .like('item_code', `${catPrefix}-%`)
  const nummers = (bestaand ?? [])
    .map(i => parseInt(i.item_code?.split('-')[1] ?? '0'))
    .filter(n => !isNaN(n))
  const next = (nummers.length > 0 ? Math.max(...nummers) : 0) + 1
  const itemCode = `${catPrefix}-${String(next).padStart(3, '0')}`

  // Maak recept aan (upsert treatment + insert item)
  const itemId = await maakRecept({
    item_code: itemCode,
    full_name: data.naam,
    default_unit: data.eenheid,
    onderdeel: data.categorie,
  })

  // treatmentId is deterministisch berekend in maakRecept
  const catCode = catPrefix
  const hash = createHash('sha256').update(`everts:treatment:${catCode}`).digest('hex')
  const treatId = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`

  // Voeg normen toe in parallel
  await Promise.all(data.normen.map(n => {
    if (n.type === 'arbeid') {
      return supabase.from('paint_labor_norms').insert({
        item_id: itemId,
        treatment_id: treatId,
        source_code: itemCode,
        hours_per_unit: n.norm_hoeveelheid,
        hour_rate: n.tarief,
        cost_per_unit: n.norm_hoeveelheid * n.tarief,
        unit: 'uur',
        description: n.omschrijving ?? null,
        active: true,
      })
    } else {
      return supabase.from('paint_material_norms').insert({
        item_id: itemId,
        treatment_id: treatId,
        source_code: itemCode,
        material_name: n.omschrijving ?? (n.type === 'onderaanneming' ? 'Onderaanneming' : 'Materiaal'),
        quantity_per_unit: n.type === 'onderaanneming' ? 1 : n.norm_hoeveelheid,
        unit_price: n.tarief,
        cost_per_unit: n.type === 'onderaanneming' ? n.tarief : n.norm_hoeveelheid * n.tarief,
        unit: n.eenheid ?? undefined,
        norm_type: n.type === 'onderaanneming' ? 'onderaanneming' : 'materiaal',
        active: true,
      })
    }
  }))

  revalidatePath('/bibliotheek')
  return { id: itemId, code: itemCode }
}

// ─── Hele bibliotheek leegmaken ───────────────────────────────────────────────

export async function leegMaakBibliotheek(): Promise<void> {
  const supabase = await createClient()

  // Gespiegelde recepten blijven staan: die horen bij de Schilderwerkbibliotheek
  // en zouden door de trigger toch meteen terugkomen.
  const { data: teVerwijderen, error: leesFout } = await supabase
    .from('paint_items')
    .select('id')
    .eq('vergrendeld', false)
  if (leesFout) throw new Error(`Fout bij leegmaken bibliotheek: ${leesFout.message}`)

  const ids = (teVerwijderen ?? []).map(r => r.id)
  if (ids.length === 0) return

  await supabase.from('paint_labor_norms').delete().in('item_id', ids)
  await supabase.from('paint_material_norms').delete().in('item_id', ids)
  const { error } = await supabase.from('paint_items').delete().in('id', ids)
  if (error) throw new Error(`Fout bij leegmaken bibliotheek: ${error.message}`)
  revalidatePath('/bibliotheek')
}

// ─── Item deactiveren ─────────────────────────────────────────────────────────

export async function toggleItemActief(id: string, actief: boolean): Promise<void> {
  await weigerAlsVergrendeld([id])
  const supabase = await createClient()
  const { error } = await supabase.from('paint_items').update({ active: actief }).eq('id', id)
  if (error) throw new Error(`Fout bij bijwerken item: ${error.message}`)
  revalidatePath('/bibliotheek')
}

// ─── Excel importeren (Gilde Normregels formaat) ──────────────────────────────

export async function importeerExcel(formData: FormData): Promise<{ aangemaakt: number; bijgewerkt: number; fouten: string[] }> {
  const XLSX = await import('xlsx')
  const supabase = await createClient()

  const bestand = formData.get('bestand') as File | null
  if (!bestand) throw new Error('Geen bestand ontvangen')

  const buffer = Buffer.from(await bestand.arrayBuffer())
  const workbook = XLSX.read(buffer, { type: 'buffer' })

  const FAMILIE_ID = '00000000-0000-0000-0000-000000000001'
  let aangemaakt = 0
  let bijgewerkt = 0
  const fouten: string[] = []

  // ── Haal bestaande treatments op ──────────────────────────────────────────
  const { data: bestaandeTreatments } = await supabase
    .from('paint_treatments')
    .select('id, treatment_code')

  const treatmentMap = new Map<string, string>(
    (bestaandeTreatments ?? [])
      .filter(t => t.treatment_code != null)
      .map(t => [t.treatment_code as string, t.id])
  )

  // ── Haal bestaande items op ────────────────────────────────────────────────
  const { data: bestaandeItems } = await supabase
    .from('paint_items')
    .select('id, item_code')

  const itemMap = new Map<string, string>(
    (bestaandeItems ?? [])
      .filter(i => i.item_code != null)
      .map(i => [i.item_code as string, i.id])
  )

  // ── Hulpfunctie: find-or-create item ─────────────────────────────────────
  const vindOfMaakItem = async (code: string, naam: string, eenh: string, code2: string, cat?: string): Promise<string | null> => {
    const treatCode = code2 || code.split('-')[0] || 'IMPORT'
    let treatmentId = treatmentMap.get(treatCode)
    if (!treatmentId) {
      const tId = codeNaarUuid('treatment', treatCode)
      const { error: tErr } = await supabase.from('paint_treatments').upsert({
        id: tId, family_id: FAMILIE_ID, treatment_code: treatCode,
        treatment_index_code: treatCode, name: treatCode, active: true,
      }, { onConflict: 'id' })
      if (tErr) { fouten.push(`Treatment ${treatCode}: ${tErr.message}`); return null }
      treatmentId = tId
      treatmentMap.set(treatCode, tId)
    }

    const onderdeel = cat || code2 || 'Import'

    const bestaandId = itemMap.get(code)
    if (bestaandId) {
      if (naam) await supabase.from('paint_items').update({ full_name: naam, default_unit: eenh, treatment_id: treatmentId, onderdeel }).eq('id', bestaandId)
      bijgewerkt++
      return bestaandId
    }

    const nId = codeNaarUuid('item', code)
    const { error: iErr } = await supabase.from('paint_items').upsert({
      id: nId, family_id: FAMILIE_ID, treatment_id: treatmentId,
      item_code: code, onderdeel, type: 'activiteit',
      full_name: naam, default_unit: eenh, active: true,
    }, { onConflict: 'id' })
    if (iErr) { fouten.push(`Item ${code}: ${iErr.message}`); return null }
    itemMap.set(code, nId)
    aangemaakt++
    return nId
  }

  // ── Verwerk elke sheet ────────────────────────────────────────────────────
  for (const sheetNaam of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetNaam]
    const rijen = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })
    if (rijen.length === 0) continue

    const kols = Object.keys(rijen[0])
    const vindKolom = (...namen: string[]) =>
      kols.find(k => namen.some(n => k.toLowerCase().includes(n.toLowerCase()))) ?? ''

    // ── Nieuw formaat: 1 tabblad met Type-kolom (A / M / OA) ───────────────
    const colType = vindKolom('type')
    if (colType) {
      const colCode   = kols.find(k => k.toLowerCase() === 'code') ?? vindKolom('code')
      const colOmschr = vindKolom('omschrijving', 'naam', 'description')
      const colCode2  = kols.find(k => k.toLowerCase().includes('code') && k !== colCode) ?? ''
      const colCat    = vindKolom('categorie', 'categori', 'onderdeel')
      const colEenh   = vindKolom('eenheid', 'unit')
      const colNorm   = vindKolom('norm', 'min', 'uren', 'hours')
      const colTarief = vindKolom('tarief', 'rate')
      const isMinuten = colNorm.toLowerCase().includes('min')
      const colMatOmschr = vindKolom('mat. omschr', 'mat omschr', 'materiaal omschr', 'materiaal')
      const colMatEenh   = vindKolom('mat. eenh', 'mat eenh', 'eenheid mat')
      const colInzet     = vindKolom('inzet')
      const colPrijs     = vindKolom('prijs')

      for (const rij of rijen) {
        const type = String(rij[colType] ?? '').trim().toUpperCase()
        const code = colCode ? String(rij[colCode] ?? '').trim() : ''
        if (!code || !['A', 'M', 'OA'].includes(type)) continue

        if (type === 'A') {
          const naam  = String(rij[colOmschr] ?? '').trim()
          const code2 = colCode2 ? String(rij[colCode2] ?? '').trim() : ''
          const eenh  = colEenh  ? String(rij[colEenh]  ?? 'm2').trim() : 'm2'
          const cat   = colCat   ? String(rij[colCat]   ?? '').trim() : ''
          const normRaw  = colNorm   ? parseFloat(String(rij[colNorm]   ?? '0').replace(',', '.')) : 0
          const tarief   = colTarief ? parseFloat(String(rij[colTarief] ?? '0').replace(',', '.')) : 0
          const hoursPerUnit = isMinuten ? normRaw / 60 : normRaw
          if (!naam) continue
          const itemId = await vindOfMaakItem(code, naam, eenh, code2, cat || undefined)
          if (!itemId) continue
          const treatmentId = treatmentMap.get(code2 || code.split('-')[0] || 'IMPORT') ?? ''
          if (!isNaN(hoursPerUnit) && hoursPerUnit > 0 && treatmentId) {
            await supabase.from('paint_labor_norms').delete().eq('item_id', itemId)
            await supabase.from('paint_labor_norms').insert({
              item_id: itemId, treatment_id: treatmentId, source_code: code,
              unit: 'uur', hours_per_unit: hoursPerUnit, hour_rate: tarief,
              cost_per_unit: hoursPerUnit * tarief, active: true,
            })
          }
        }

        if (type === 'M') {
          const omschr = colMatOmschr ? String(rij[colMatOmschr] ?? '').trim() : ''
          const eenh   = colMatEenh  ? String(rij[colMatEenh]   ?? 'ltr').trim() : 'ltr'
          const inzet  = colInzet    ? parseFloat(String(rij[colInzet] ?? '0').replace(',', '.')) : 0
          const prijs  = colPrijs    ? parseFloat(String(rij[colPrijs] ?? '0').replace(',', '.')) : 0
          if (!omschr) continue
          const itemId = itemMap.get(code)
          if (!itemId) { fouten.push(`M-rij: code "${code}" niet gevonden (zet A-rij erboven)`); continue }
          const treatmentId = treatmentMap.get(code.split('-')[0]) ?? ''
          if (!treatmentId) continue
          await supabase.from('paint_material_norms').delete().eq('item_id', itemId).eq('norm_type', 'materiaal').eq('material_name', omschr)
          await supabase.from('paint_material_norms').insert({
            item_id: itemId, treatment_id: treatmentId, source_code: code,
            material_name: omschr, unit: eenh, quantity_per_unit: inzet,
            unit_price: prijs, cost_per_unit: inzet * prijs, active: true, norm_type: 'materiaal',
          })
        }

        if (type === 'OA') {
          const omschr = String(rij[colOmschr] ?? '').trim()
          const prijs  = colPrijs ? parseFloat(String(rij[colPrijs] ?? '0').replace(',', '.')) : 0
          if (!omschr) continue
          const itemId = itemMap.get(code)
          if (!itemId) { fouten.push(`OA-rij: code "${code}" niet gevonden`); continue }
          const treatmentId = treatmentMap.get(code.split('-')[0]) ?? ''
          if (!treatmentId) continue
          await supabase.from('paint_material_norms').insert({
            item_id: itemId, treatment_id: treatmentId, source_code: code,
            material_name: omschr, unit: 'eenh', quantity_per_unit: 1,
            unit_price: prijs, cost_per_unit: prijs, active: true, norm_type: 'onderaanneming',
          })
        }
      }
      continue
    }

    // ── Oud formaat: aparte sheets (Materiaal / Onderaanneming / Arbeid) ────
    const naamLower = sheetNaam.toLowerCase()

    if (naamLower.includes('materiaal')) {
      const colCode   = kols.find(k => k.toLowerCase() === 'code') ?? vindKolom('code')
      const colOmschr = vindKolom('materiaal omschr', 'materiaal', 'omschrijving', 'naam')
      const colEenh   = vindKolom('eenheid mat', 'eenheid')
      const colInzet  = vindKolom('inzet', 'hoeveelheid', 'qty')
      const colPrijs  = vindKolom('prijs')
      if (!colCode || !colOmschr) { fouten.push(`Sheet "${sheetNaam}": Kolommen Code en Omschrijving niet gevonden`); continue }
      for (const rij of rijen) {
        const code   = String(rij[colCode] ?? '').trim()
        const omschr = String(rij[colOmschr] ?? '').trim()
        const eenh   = colEenh  ? String(rij[colEenh] ?? 'ltr').trim() : 'ltr'
        const inzet  = colInzet ? parseFloat(String(rij[colInzet] ?? '0').replace(',', '.')) : 0
        const prijs  = colPrijs ? parseFloat(String(rij[colPrijs] ?? '0').replace(',', '.')) : 0
        if (!code || !omschr) continue
        const itemId = itemMap.get(code)
        if (!itemId) { fouten.push(`Materiaal: code "${code}" niet gevonden`); continue }
        const treatmentId = treatmentMap.get(code.split('-')[0]) ?? ''
        if (!treatmentId) continue
        await supabase.from('paint_material_norms').delete().eq('item_id', itemId).eq('norm_type', 'materiaal').eq('material_name', omschr)
        await supabase.from('paint_material_norms').insert({
          item_id: itemId, treatment_id: treatmentId, source_code: code,
          material_name: omschr, unit: eenh, quantity_per_unit: inzet,
          unit_price: prijs, cost_per_unit: inzet * prijs, active: true, norm_type: 'materiaal',
        })
      }
      continue
    }

    if (naamLower.includes('onderaanneming') || naamLower.includes('onderaan')) {
      const colCode   = kols.find(k => k.toLowerCase() === 'code') ?? vindKolom('code')
      const colOmschr = vindKolom('omschrijving', 'naam')
      const colPrijs  = vindKolom('prijs')
      if (!colCode || !colOmschr) { fouten.push(`Sheet "${sheetNaam}": Kolommen Code en Omschrijving niet gevonden`); continue }
      for (const rij of rijen) {
        const code   = String(rij[colCode] ?? '').trim()
        const omschr = String(rij[colOmschr] ?? '').trim()
        const prijs  = colPrijs ? parseFloat(String(rij[colPrijs] ?? '0').replace(',', '.')) : 0
        if (!code || !omschr) continue
        const itemId = itemMap.get(code)
        if (!itemId) { fouten.push(`OA: code "${code}" niet gevonden`); continue }
        const treatmentId = treatmentMap.get(code.split('-')[0]) ?? ''
        if (!treatmentId) continue
        await supabase.from('paint_material_norms').insert({
          item_id: itemId, treatment_id: treatmentId, source_code: code,
          material_name: omschr, unit: 'eenh', quantity_per_unit: 1,
          unit_price: prijs, cost_per_unit: prijs, active: true, norm_type: 'onderaanneming',
        })
      }
      continue
    }

    // Arbeidsheet
    const colCode   = kols.find(k => k.toLowerCase() === 'code') ?? vindKolom('code')
    const colOmschr = vindKolom('omschrijving', 'naam', 'description')
    const colCode2  = kols.find(k => k.toLowerCase().includes('code') && k !== colCode) ?? ''
    const colEenh   = vindKolom('eenheid', 'unit')
    const colCat    = vindKolom('categorie', 'categori', 'onderdeel')
    const colNorm   = vindKolom('norm', 'min', 'uren', 'hours')
    const colTarief = vindKolom('tarief', 'rate')
    const isMinuten = vindKolom('min').toLowerCase().includes('min')
    if (!colCode || !colOmschr) { fouten.push(`Sheet "${sheetNaam}": Kolommen Code en Omschrijving niet gevonden`); continue }
    for (const rij of rijen) {
      const code  = String(rij[colCode]   ?? '').trim()
      const naam  = String(rij[colOmschr] ?? '').trim()
      const code2 = colCode2 ? String(rij[colCode2] ?? '').trim() : ''
      const eenh  = colEenh  ? String(rij[colEenh]  ?? 'm2').trim() : 'm2'
      const cat   = colCat   ? String(rij[colCat]   ?? '').trim() : ''
      const normRaw = colNorm   ? parseFloat(String(rij[colNorm]   ?? '0').replace(',', '.')) : 0
      const tarief  = colTarief ? parseFloat(String(rij[colTarief] ?? '0').replace(',', '.')) : 0
      const hoursPerUnit = isMinuten ? normRaw / 60 : normRaw
      if (!code || !naam) continue
      const itemId = await vindOfMaakItem(code, naam, eenh, code2, cat || undefined)
      if (!itemId) continue
      const treatmentId = treatmentMap.get(code2 || code.split('-')[0] || 'IMPORT') ?? ''
      if (!isNaN(hoursPerUnit) && hoursPerUnit > 0 && treatmentId) {
        await supabase.from('paint_labor_norms').delete().eq('item_id', itemId)
        await supabase.from('paint_labor_norms').insert({
          item_id: itemId, treatment_id: treatmentId, source_code: code,
          unit: 'uur', hours_per_unit: hoursPerUnit, hour_rate: tarief,
          cost_per_unit: hoursPerUnit * tarief, active: true,
        })
      }
    }
  }

  revalidatePath('/bibliotheek')
  return { aangemaakt, bijgewerkt, fouten }
}
