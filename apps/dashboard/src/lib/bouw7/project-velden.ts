/**
 * Dossiervelden terugschrijven naar het Bouw7-project (EVA → Bouw7).
 *
 * Tot sep 2026 waren werkadres, categorie, referentie, contactpersoon, projectnaam, object en de
 * datums op een Bouw7-dossier alleen-lezen in EVA, puur omdat er geen write was. `POST /project`
 * is een **partiële upsert** (geverifieerd op 4202130: alleen de meegestuurde velden wijzigen,
 * de rest blijft staan), dus die velden zijn gewoon te schrijven. De aanneemsom óók: `fixedPrice`
 * op het project voedt direct Athena's `revenue.budgeted` (idem geverifieerd).
 *
 * Datumformaten zijn een valkuil: `startDate`/`endDate` willen een datetime mét offset
 * ("2026-10-01T00:00:00+02:00"), `deliveryDate` juist een kale datum ("2026-11-15"). Een verkeerd
 * formaat geeft een 400 op de hele POST — er wordt dan niets gewijzigd.
 *
 * Wat bewust NIET wordt geschreven: de werkmaatschappij (`branch`) — Bouw7 kent het projectnummer
 * toe op basis van de branch, dus die na het aanmaken wijzigen is vragen om een hernummering.
 *
 * Elke write geeft terug wélke velden echt zijn geschreven; de aanroeper ontmarkeert alleen die in
 * `handmatige_velden` (zie lib/bouw7/handmatige-velden.ts). Een categorie die Bouw7 niet kent blijft
 * zo beschermd in EVA in plaats van bij de volgende sync te verdwijnen.
 */

import { createAdminClient } from '@everts/database/server'
import { getBouw7Client } from './sync'
import { getBouw7Categorieen } from './create-project'
import { resolveCustomAttributeId, mergeCustomAttributeValue, type Bouw7CustomAttrValue } from './custom-attributes'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createAdminClient() as any

/** Dossierkolommen die naar het Bouw7-project gaan. Volgorde is niet van belang. */
export const BOUW7_PROJECT_SCHRIJFVELDEN = [
  'titel',
  'klant_id',
  'contactpersoon_id',
  'categorie',
  'referentie',
  'opmerkingen',
  'werkadres_straat',
  'werkadres_huisnummer',
  'werkadres_postcode',
  'werkadres_stad',
  'object_id',
  'deadline',
  'voorlopige_start',
  'voorlopige_eind',
  'vve_code',
] as const

const WERKADRES = ['werkadres_straat', 'werkadres_huisnummer', 'werkadres_postcode', 'werkadres_stad']

export type ProjectVeldenResultaat =
  | { ok: true; geschreven: string[]; overgeslagen: string[] }
  | { ok: false; error: string; geschreven: string[] }

/** Offset-suffix ("+02:00") voor Europe/Amsterdam op een kalenderdatum, zomertijd-bewust. */
function nlOffset(datum: string): string {
  const [y, m, d] = datum.split('-').map(Number)
  const naam = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Amsterdam', timeZoneName: 'longOffset' })
    .formatToParts(new Date(Date.UTC(y, m - 1, d, 12)))
    .find(p => p.type === 'timeZoneName')?.value
  const offset = naam?.replace('GMT', '')
  return offset && offset.length > 0 ? offset : '+01:00'
}

/** "2026-10-01" → "2026-10-01T00:00:00+02:00"; leeg → null. */
function alsDatetime(datum: string | null | undefined): string | null {
  const d = (datum ?? '').slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? `${d}T00:00:00${nlOffset(d)}` : null
}

/** "2026-11-15" (deliveryDate wil een kale datum); leeg → null. */
function alsDatum(datum: string | null | undefined): string | null {
  const d = (datum ?? '').slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null
}

/**
 * Straat en huisnummer voor Bouw7. De sync plakt `streetName houseNumber` samen in
 * `werkadres_straat`, terwijl een EVA-aanvraag het huisnummer ook los bewaart. Staat het nummer al
 * achter de straat, dan niet nog eens meesturen — anders leest de sync "Teststraat 12 12" terug.
 */
function splitsAdres(straat: string | null, huisnummer: string | null): { streetName: string; houseNumber: string } {
  const s = (straat ?? '').trim()
  const h = (huisnummer ?? '').trim()
  if (h && s.toLowerCase().endsWith(` ${h.toLowerCase()}`)) {
    return { streetName: s.slice(0, s.length - h.length).trim(), houseNumber: h }
  }
  return { streetName: s, houseNumber: h }
}

/**
 * Schrijf de opgegeven dossierkolommen naar het gekoppelde Bouw7-project. Kolommen buiten
 * `BOUW7_PROJECT_SCHRIJFVELDEN` worden genegeerd. Faalt nooit hard.
 */
export async function schrijfBouw7Projectvelden(
  dossierId: string,
  velden: readonly string[],
): Promise<ProjectVeldenResultaat> {
  const gevraagd = velden.filter(v => (BOUW7_PROJECT_SCHRIJFVELDEN as readonly string[]).includes(v))
  if (gevraagd.length === 0) return { ok: true, geschreven: [], overgeslagen: [] }

  const geschreven: string[] = []
  const overgeslagen: string[] = []
  try {
    const supabase = db()
    const { data: d } = await supabase
      .from('dossiers')
      .select('bouw7_id, ' + BOUW7_PROJECT_SCHRIJFVELDEN.join(', '))
      .eq('id', dossierId)
      .maybeSingle()
    if (!d?.bouw7_id) return { ok: false, error: 'Dossier is niet aan een Bouw7-project gekoppeld.', geschreven }

    const client = await getBouw7Client()
    const project = await client.get<{ type?: number; customAttributeValues?: Bouw7CustomAttrValue[] }>(`/project/${d.bouw7_id}`)
    if (typeof project?.type !== 'number') return { ok: false, error: 'Bouw7-project heeft geen type; kan niet schrijven.', geschreven }

    const body: Record<string, unknown> = { id: Number(d.bouw7_id), type: project.type }
    const wil = (k: string) => gevraagd.includes(k)

    if (wil('titel')) {
      const naam = String(d.titel ?? '').trim()
      if (naam) { body.name = naam; geschreven.push('titel') }
      else overgeslagen.push('titel (leeg)')
    }
    if (wil('referentie')) { body.reference = d.referentie ?? ''; geschreven.push('referentie') }

    if (WERKADRES.some(wil)) {
      const { streetName, houseNumber } = splitsAdres(d.werkadres_straat, d.werkadres_huisnummer)
      body.streetName = streetName
      body.houseNumber = houseNumber
      body.zipCode = d.werkadres_postcode ?? ''
      body.city = d.werkadres_stad ?? ''
      geschreven.push(...WERKADRES.filter(wil))
    }

    if (wil('deadline'))         { body.deliveryDate = alsDatum(d.deadline); geschreven.push('deadline') }
    if (wil('voorlopige_start')) { body.startDate = alsDatetime(d.voorlopige_start); geschreven.push('voorlopige_start') }
    if (wil('voorlopige_eind'))  { body.endDate = alsDatetime(d.voorlopige_eind); geschreven.push('voorlopige_eind') }

    if (wil('klant_id')) {
      if (!d.klant_id) overgeslagen.push('opdrachtgever (leeg; Bouw7 vereist een relatie)')
      else {
        const { data: rel } = await supabase.from('relaties').select('bouw7_id').eq('id', d.klant_id).maybeSingle()
        if (rel?.bouw7_id) { body.contact = { id: Number(rel.bouw7_id) }; geschreven.push('klant_id') }
        else overgeslagen.push('opdrachtgever (relatie staat nog niet in Bouw7)')
      }
    }

    if (wil('contactpersoon_id')) {
      if (!d.contactpersoon_id) { body.contactPerson = null; geschreven.push('contactpersoon_id') }
      else {
        const { data: cp } = await supabase.from('contactpersonen').select('bouw7_id').eq('id', d.contactpersoon_id).maybeSingle()
        if (cp?.bouw7_id) { body.contactPerson = { id: Number(cp.bouw7_id) }; geschreven.push('contactpersoon_id') }
        else overgeslagen.push('contactpersoon (staat nog niet in Bouw7)')
      }
    }

    // De categorie is één veld: EVA kiest uit de Bouw7-lijst, dus de naam matcht altijd. Na een
    // geslaagde POST spiegelen we id + naam ook in EVA (zie onder) — anders zou de rest van EVA,
    // die op `bouw7_categorie_naam` filtert (servicedesk, planning, triggers), tot de eerstvolgende
    // sync nog de oude categorie zien.
    let nieuweCategorie: { id: number; name: string } | null = null
    if (wil('categorie')) {
      const naam = String(d.categorie ?? '').trim().toLowerCase()
      if (!naam) overgeslagen.push('categorie (leeg)')
      else {
        const cat = (await getBouw7Categorieen()).find(c => c.name.trim().toLowerCase() === naam)
        if (cat) { body.category = { id: cat.id }; nieuweCategorie = cat; geschreven.push('categorie') }
        else overgeslagen.push(`categorie "${d.categorie}" bestaat niet in Bouw7`)
      }
    }

    if (wil('object_id')) {
      if (!d.object_id) { body.propertyAsset = null; geschreven.push('object_id') }
      else {
        const { data: obj } = await supabase.from('vastgoed_objecten').select('bouw7_property_asset_id').eq('id', d.object_id).maybeSingle()
        if (obj?.bouw7_property_asset_id) { body.propertyAsset = { id: Number(obj.bouw7_property_asset_id) }; geschreven.push('object_id') }
        else overgeslagen.push('object (staat nog niet in Bouw7)')
      }
    }

    if (wil('vve_code')) {
      const attrId = await resolveCustomAttributeId(
        client,
        a => /vve/i.test(a.code ?? '') || /vve/i.test(a.name ?? '') || /vve/i.test(a.propertyName ?? ''),
      )
      if (attrId == null) overgeslagen.push('VvE-code (maatwerkveld niet gevonden)')
      else {
        const bestaand = Array.isArray(project.customAttributeValues) ? project.customAttributeValues : []
        body.customAttributeValues = mergeCustomAttributeValue(bestaand, attrId, String(d.vve_code ?? ''))
        geschreven.push('vve_code')
      }
    }

    if (Object.keys(body).length > 2) {
      await client.post('/project', body)
    }

    // Bouw7 heeft de categorie aangenomen → de spiegelkolommen in EVA meteen gelijktrekken.
    if (nieuweCategorie) {
      await supabase
        .from('dossiers')
        .update({ bouw7_categorie_id: nieuweCategorie.id, bouw7_categorie_naam: nieuweCategorie.name })
        .eq('id', dossierId)
    }

    // De interne notitie heeft een eigen endpoint; de sync leest hem terug als `opmerkingen`.
    if (wil('opmerkingen')) {
      await client.post('/project/set-internal-note', { id: Number(d.bouw7_id), note: d.opmerkingen ?? '' })
      geschreven.push('opmerkingen')
    }

    return { ok: true, geschreven, overgeslagen }
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Onbekende fout bij terugschrijven naar Bouw7.',
      // Een 400 op POST /project wijzigt niets; alles wat we daar in wilden zetten is dus níét geschreven.
      geschreven: [],
    }
  }
}

/**
 * Zet de aanneemsom (`fixedPrice`) op het Bouw7-project. Voedt Athena's omzetbudget en daarmee de
 * Bouw7-projectbewaking en -rapportages. Geverifieerd op 4202130: 1234.56 → revenue.budgeted 1234.56.
 */
export async function schrijfBouw7Aanneemsom(
  bouw7Id: string | number,
  bedragExclBtw: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const client = await getBouw7Client()
    const project = await client.get<{ type?: number }>(`/project/${bouw7Id}`)
    if (typeof project?.type !== 'number') return { ok: false, error: 'Bouw7-project heeft geen type; kan niet schrijven.' }
    await client.post('/project', {
      id: Number(bouw7Id),
      type: project.type,
      fixedPrice: (Math.round(bedragExclBtw * 100) / 100).toFixed(2),
    })
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Onbekende fout bij schrijven van de aanneemsom.' }
  }
}
