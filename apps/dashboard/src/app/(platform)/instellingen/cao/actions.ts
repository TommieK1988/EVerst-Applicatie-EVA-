'use server'

import { createAdminClient } from '@everts/database/server'
import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import { vereisBeheerder, GeenToegangError } from '@/lib/auth/rechten'

type ActionResult = { ok: true } | { ok: false; error: string }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createAdminClient() as any

// CAO-documenten/loonschalen zijn salarisgegevens → alleen beheerders.
async function eisBeheer(): Promise<{ ok: false; error: string } | null> {
  try { await vereisBeheerder(); return null }
  catch (e) { if (e instanceof GeenToegangError) return { ok: false, error: e.message }; throw e }
}

/** Storage-pad van een CAO-PDF afleiden uit de opgeslagen pdf_url (volledige URL of kaal pad). */
function caoPad(pdfUrl?: string | null): string | null {
  if (!pdfUrl) return null
  const i = pdfUrl.indexOf('/cao-documenten/')
  if (i >= 0) return pdfUrl.slice(i + '/cao-documenten/'.length)
  return pdfUrl.startsWith('cao/') ? pdfUrl : null
}

/**
 * Verse signed URL (5 min) voor het inzien/downloaden van een CAO-PDF. De bucket
 * is privaat (salarisdata), dus er is geen publieke URL meer — beheerders halen
 * per klik een kortstondige link op.
 */
export async function getCaoSignedUrl(cao_id: string): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const nope = await eisBeheer(); if (nope) return nope
  const supabase = db()
  const { data: doc } = await supabase.from('cao_documenten').select('pdf_url').eq('id', cao_id).maybeSingle()
  const pad = caoPad(doc?.pdf_url)
  if (!pad) return { ok: false, error: 'Geen PDF gekoppeld' }
  const { data, error } = await supabase.storage.from('cao-documenten').createSignedUrl(pad, 300)
  if (error || !data?.signedUrl) return { ok: false, error: 'Kon downloadlink niet maken' }
  return { ok: true, url: data.signedUrl }
}

// ── CAO document uploaden + aanmaken ─────────────────────────────────────────

export async function uploadCaoDocument(
  formData: FormData
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const nope = await eisBeheer(); if (nope) return nope
  const supabase = db()
  const naam = (formData.get('naam') as string | null)?.trim()
  const werkmaatschappij_id = (formData.get('werkmaatschappij_id') as string | null) || null
  const file = formData.get('bestand') as File | null

  if (!naam) return { ok: false, error: 'Naam is verplicht' }
  if (!file || !file.size) return { ok: false, error: 'Geen bestand meegegeven' }

  // Bucket aanmaken als die nog niet bestaat. Privaat: salarisdata — inzien via
  // kortstondige signed URLs (getCaoSignedUrl), niet via een publieke URL.
  await supabase.storage.createBucket('cao-documenten', { public: false }).catch(() => null)

  const veiligNaam = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `cao/${Date.now()}_${veiligNaam}`
  const buffer = Buffer.from(await file.arrayBuffer())

  const { error: uploadErr } = await supabase.storage
    .from('cao-documenten')
    .upload(path, buffer, { contentType: 'application/pdf', upsert: true })

  if (uploadErr) return { ok: false, error: uploadErr.message }

  const { data: { publicUrl } } = supabase.storage.from('cao-documenten').getPublicUrl(path)

  const { data, error } = await supabase
    .from('cao_documenten')
    .insert({ naam, pdf_url: publicUrl, bestandsnaam: file.name, extractie_status: 'pending', werkmaatschappij_id })
    .select('id')
    .single()

  if (error) return { ok: false, error: error.message }
  return { ok: true, id: data.id }
}

export async function verwijderCaoDocument(id: string): Promise<ActionResult> {
  const nope = await eisBeheer(); if (nope) return nope
  const { error } = await db().from('cao_documenten').update({ actief: false }).eq('id', id)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

// ── AI extractie ──────────────────────────────────────────────────────────────

type Loonregel = { schaal: string; trede: string; bruto_maand: number | null }

const loonregelSchema = z.array(z.object({
  schaal:      z.string(),
  trede:       z.string(),
  bruto_maand: z.number().nullable(),
}))

export async function extraheerLoonschalen(cao_id: string): Promise<ActionResult & { regels?: Loonregel[]; raw?: string }> {
  const nope = await eisBeheer(); if (nope) return nope
  const supabase = db()

  // pdf_url ophalen en storage-pad afleiden (bucket is privaat → download via service-role)
  const { data: doc } = await supabase.from('cao_documenten').select('pdf_url').eq('id', cao_id).maybeSingle()
  const pad = caoPad(doc?.pdf_url)
  if (!pad) return { ok: false, error: 'Geen PDF gekoppeld aan dit document' }

  // Status: bezig
  await supabase.from('cao_documenten').update({ extractie_status: 'bezig', extractie_fout: null }).eq('id', cao_id)

  try {
    // PDF ophalen als base64 via service-role download (privaat bucket)
    const { data: blob, error: dlErr } = await supabase.storage.from('cao-documenten').download(pad)
    if (dlErr || !blob) throw new Error('PDF ophalen mislukt')
    const buffer = await blob.arrayBuffer()
    const base64 = Buffer.from(buffer).toString('base64')

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const message = await (client.messages.create as any)({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'document',
              source: { type: 'base64', media_type: 'application/pdf', data: base64 },
            },
            {
              type: 'text',
              text: `Dit is een CAO (Collectieve Arbeidsovereenkomst) document.

Extraheer ALLE loonschalen en treden uit het document als een JSON array.
Gebruik dit exacte formaat — geen uitleg, alleen de JSON array:

[
  { "schaal": "A", "trede": "1", "bruto_maand": 2500.00 },
  { "schaal": "A", "trede": "2", "bruto_maand": 2650.00 },
  { "schaal": "B", "trede": "1", "bruto_maand": 2800.00 }
]

Regels:
- "schaal" is de loongroep of functieschaal (bijv. "A", "B", "I", "II", "1", "2")
- "trede" is het ervaringsniveau binnen de schaal (bijv. "1", "2", "3", "junior", "senior")
- "bruto_maand" is het bruto maandsalaris in euro's (getal, geen €-teken)
- Als er een uurloon staat: vermenigvuldig met 173 voor het maandsalaris
- Als een waarde ontbreekt of onduidelijk is: gebruik null
- Geef ALLEEN de JSON array terug, geen uitleg of tekst eromheen`,
            },
          ],
        },
      ],
    })

    const rawText = message.content[0]?.type === 'text' ? message.content[0].text.trim() : ''

    // JSON extraheren (soms omringd met markdown code blocks)
    const jsonMatch = rawText.match(/\[[\s\S]*\]/)
    if (!jsonMatch) throw new Error('Geen geldige JSON array ontvangen van AI')

    const parsed = loonregelSchema.safeParse(JSON.parse(jsonMatch[0]))
    if (!parsed.success) throw new Error('AI-uitvoer heeft onverwacht formaat')

    const regels = parsed.data

    // Bestaande regels verwijderen en opnieuw invoegen
    await supabase.from('cao_loonschalen').delete().eq('cao_id', cao_id)
    if (regels.length > 0) {
      await supabase.from('cao_loonschalen').insert(
        regels.map((r, i) => ({ cao_id, schaal: r.schaal, trede: r.trede, bruto_maand: r.bruto_maand, volgorde: i }))
      )
    }

    await supabase.from('cao_documenten').update({ extractie_status: 'gereed' }).eq('id', cao_id)
    return { ok: true, regels, raw: rawText }

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await supabase.from('cao_documenten').update({ extractie_status: 'fout', extractie_fout: msg }).eq('id', cao_id)
    return { ok: false, error: msg }
  }
}

// ── Loonschalen handmatig bijwerken ──────────────────────────────────────────

export async function upsertLoonschaal(cao_id: string, raw: unknown, id?: string): Promise<ActionResult> {
  const nope = await eisBeheer(); if (nope) return nope
  const schema = z.object({
    schaal:      z.string().min(1),
    trede:       z.string().min(1),
    bruto_maand: z.coerce.number().nullable(),
    volgorde:    z.coerce.number().default(0),
  })
  const p = schema.safeParse(raw)
  if (!p.success) return { ok: false, error: p.error.errors[0]?.message ?? 'Ongeldig' }
  const { error } = id
    ? await db().from('cao_loonschalen').update(p.data).eq('id', id)
    : await db().from('cao_loonschalen').insert({ ...p.data, cao_id })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function verwijderLoonschaal(id: string): Promise<ActionResult> {
  const nope = await eisBeheer(); if (nope) return nope
  const { error } = await db().from('cao_loonschalen').delete().eq('id', id)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
