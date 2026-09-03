'use server'

/**
 * Excel-import van een opnameprijslijst.
 *
 * Twee fasen, net als `importeerExcel` voor de receptenbibliotheek: eerst een **voorbeeld** met
 * aantallen en fouten, daarna pas schrijven. Een corporatie-prijslijst is 300 tot 1500 regels; die
 * blind wegschrijven en dan zien wat er misging is geen werkbare volgorde.
 *
 * Een onbekende receptcode is een FOUT en geen stille overslag. Zo'n regel zou anders als
 * vaste-prijs-onderdeel zonder prijs eindigen: onzichtbaar kapot, en pas merkbaar als de opnemer
 * hem op locatie niet kan kiezen.
 */

import { createAdminClient } from '@everts/database/server'
import { revalidatePath } from 'next/cache'
import { vereisRecht } from '@/lib/auth/rechten'
import { haalAlleRijen } from '@/lib/supabase/paginate'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createAdminClient() as any

export type ImportRij = {
  code: string
  hoofdgroep: string | null
  subgroep: string | null
  omschrijving: string
  eenheid: string
  prijs_soort: 'vast' | 'recept'
  verkoop_pe: number | null
  kostprijs_pe: number | null
  uren_pe: number | null
  paint_item_id: string | null
  opslag_pct: number | null
  btw_pct: number | null
  kostengroep: string | null
  foto_verplicht: boolean
  toelichting_verplicht: boolean
  standaard_aantal: number
  aantal_stap: number
  actief: boolean
}

export type ImportVoorbeeld = {
  aangemaakt: number
  bijgewerkt: number
  fouten: string[]
  rijen: ImportRij[]
}

const tekst = (v: unknown): string => (v == null ? '' : String(v).trim())

/** Accepteert zowel "9,25" als 9.25 — Excel levert allebei, afhankelijk van de landinstelling. */
function getal(v: unknown): number | null {
  if (v == null || v === '') return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const n = Number(String(v).replace(/\s/g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

function jaNee(v: unknown, standaard = false): boolean {
  const s = tekst(v).toLowerCase()
  if (!s) return standaard
  return ['ja', 'j', 'true', 'waar', '1', 'x', 'yes', 'y'].includes(s)
}

/**
 * Leest het bestand en valideert, zonder iets te schrijven.
 *
 * Retourneert óók de gevalideerde rijen, zodat `pasImportToe` niet opnieuw hoeft te parsen en de
 * gebruiker precies krijgt wat hij in het voorbeeld zag.
 */
export async function leesOpnamePrijslijstExcel(
  prijslijstId: string,
  formData: FormData,
): Promise<ImportVoorbeeld> {
  await vereisRecht('everts_calc', 'schrijven')
  const XLSX = await import('xlsx')
  const supabase = db()

  const bestand = formData.get('bestand')
  if (!(bestand instanceof File)) throw new Error('Geen bestand ontvangen')

  const workbook = XLSX.read(Buffer.from(await bestand.arrayBuffer()), { type: 'buffer' })
  const blad = workbook.Sheets[workbook.SheetNames[0]]
  if (!blad) throw new Error('Het bestand bevat geen werkblad')
  const ruw = XLSX.utils.sheet_to_json<Record<string, unknown>>(blad, { defval: '' })

  // Bestaande codes: bepaalt aangemaakt vs. bijgewerkt. Gepagineerd — dit zijn er meer dan 1000.
  const bestaand = await haalAlleRijen<{ code: string }>((van, tot) =>
    supabase
      .from('opname_onderdelen')
      .select('code')
      .eq('prijslijst_id', prijslijstId)
      .order('code')
      .range(van, tot),
  )
  const bestaandeCodes = new Set(bestaand.map(r => r.code))

  // Receptcodes in één keer opzoeken. paint_items.item_code is niet globaal uniek (uniek is
  // treatment_id + item_code), dus een code die twee keer voorkomt is een fout in plaats van een
  // willekeurige keuze.
  const receptcodes = Array.from(
    new Set(ruw.map(r => tekst(r['Receptcode'])).filter(Boolean)),
  )
  const receptMap = new Map<string, string>()
  const dubbeleRecepten = new Set<string>()
  if (receptcodes.length > 0) {
    // In blokken: een `.in()` met honderden waarden loopt tegen de URL-lengte aan.
    for (let i = 0; i < receptcodes.length; i += 200) {
      const { data } = await supabase
        .from('paint_items')
        .select('id, item_code')
        .in('item_code', receptcodes.slice(i, i + 200))
      for (const rij of (data ?? []) as { id: string; item_code: string }[]) {
        if (receptMap.has(rij.item_code)) dubbeleRecepten.add(rij.item_code)
        else receptMap.set(rij.item_code, rij.id)
      }
    }
  }

  const fouten: string[] = []
  const rijen: ImportRij[] = []
  const gezien = new Set<string>()
  let aangemaakt = 0
  let bijgewerkt = 0

  ruw.forEach((r, i) => {
    const regelNr = i + 2 // +1 voor de kop, +1 omdat Excel bij 1 begint
    const code = tekst(r['Code'])
    const omschrijving = tekst(r['Omschrijving'])
    if (!code && !omschrijving) return // lege rij onderaan het blad

    if (!code) {
      fouten.push(`Regel ${regelNr}: geen code`)
      return
    }
    if (gezien.has(code)) {
      fouten.push(`Regel ${regelNr}: code ${code} staat twee keer in dit bestand`)
      return
    }
    gezien.add(code)

    if (!omschrijving) {
      fouten.push(`Regel ${regelNr} (${code}): geen omschrijving`)
      return
    }

    const soortRuw = tekst(r['Prijssoort']).toUpperCase()
    const prijsSoort: 'vast' | 'recept' =
      soortRuw.startsWith('R') ? 'recept' : 'vast'

    const verkoop = getal(r['Verkoopprijs'])
    const receptcode = tekst(r['Receptcode'])

    if (prijsSoort === 'vast' && verkoop == null) {
      fouten.push(`Regel ${regelNr} (${code}): prijssoort V zonder verkoopprijs`)
      return
    }
    let paintItemId: string | null = null
    if (prijsSoort === 'recept') {
      if (!receptcode) {
        fouten.push(`Regel ${regelNr} (${code}): prijssoort R zonder receptcode`)
        return
      }
      if (dubbeleRecepten.has(receptcode)) {
        fouten.push(`Regel ${regelNr} (${code}): receptcode ${receptcode} bestaat meerdere keren in de bibliotheek`)
        return
      }
      paintItemId = receptMap.get(receptcode) ?? null
      if (!paintItemId) {
        fouten.push(`Regel ${regelNr} (${code}): receptcode ${receptcode} bestaat niet in de bibliotheek`)
        return
      }
    } else if (receptcode) {
      // Vaste prijs mét recept: prima, het recept levert dan de kostprijs en de uren.
      paintItemId = receptMap.get(receptcode) ?? null
      if (!paintItemId) {
        fouten.push(`Regel ${regelNr} (${code}): receptcode ${receptcode} bestaat niet in de bibliotheek`)
        return
      }
    }

    rijen.push({
      code,
      hoofdgroep: tekst(r['Hoofdgroep']) || null,
      subgroep: tekst(r['Subgroep']) || null,
      omschrijving,
      eenheid: tekst(r['Eenheid']) || 'st',
      prijs_soort: prijsSoort,
      verkoop_pe: verkoop,
      kostprijs_pe: getal(r['Kostprijs']),
      uren_pe: getal(r['Uren p.e.']),
      paint_item_id: paintItemId,
      opslag_pct: getal(r['Opslag %']),
      btw_pct: getal(r['BTW %']),
      kostengroep: tekst(r['Kostengroep']) || null,
      foto_verplicht: jaNee(r['Foto verplicht']),
      toelichting_verplicht: jaNee(r['Toelichting verplicht']),
      standaard_aantal: getal(r['Standaard aantal']) ?? 1,
      aantal_stap: getal(r['Stap']) ?? 1,
      actief: jaNee(r['Actief'], true),
    })

    if (bestaandeCodes.has(code)) bijgewerkt += 1
    else aangemaakt += 1
  })

  return { aangemaakt, bijgewerkt, fouten, rijen }
}

/** Schrijft de gevalideerde rijen weg: upsert op (prijslijst_id, code). */
export async function pasOpnamePrijslijstImportToe(
  prijslijstId: string,
  rijen: ImportRij[],
): Promise<{ ok: true; aantal: number } | { ok: false; error: string }> {
  await vereisRecht('everts_calc', 'schrijven')
  if (rijen.length === 0) return { ok: false, error: 'Geen rijen om te importeren' }

  const supabase = db()
  const metLijst = rijen.map((r, i) => ({ ...r, prijslijst_id: prijslijstId, volgorde: i + 1 }))

  // In blokken van 500: één upsert met 1500 rijen loopt tegen de body-limiet aan.
  for (let i = 0; i < metLijst.length; i += 500) {
    const { error } = await supabase
      .from('opname_onderdelen')
      .upsert(metLijst.slice(i, i + 500), { onConflict: 'prijslijst_id,code' })
    if (error) return { ok: false, error: `Importeren mislukt bij rij ${i + 1}: ${error.message}` }
  }

  const { data: lijst } = await supabase
    .from('opname_prijslijsten')
    .select('relatie_id')
    .eq('id', prijslijstId)
    .maybeSingle()
  if (lijst) revalidatePath(`/relaties/${lijst.relatie_id}`)

  return { ok: true, aantal: metLijst.length }
}
