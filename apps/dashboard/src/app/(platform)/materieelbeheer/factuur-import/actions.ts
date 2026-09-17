'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { GeenToegangError, type CurrentMedewerker } from '@/lib/auth/rechten'
import { vereisMaterieelMutatie } from '@/lib/materieel/auth'
import { MATERIEEL_BUCKET } from '@/lib/materieel/bestanden'
import { db } from '@/lib/materieel/db'
import { leesFactuur, MAX_PDF_BYTES } from '@/lib/materieel/factuur-import/extractie'
import { bouwVoorstel, type MedewerkerKandidaat, type Voorstel } from '@/lib/materieel/factuur-import/poort'
import { MATERIEEL_CATEGORIEEN } from '@/lib/materieel/types'
import type { ModuleRechten } from '@everts/database/platform-types'

type ActieResultaat<T = unknown> = { ok: true; data: T } | { ok: false; error: string }

async function gate(
  min: ModuleRechten = 'schrijven',
): Promise<{ ok: true; medewerker: CurrentMedewerker } | { ok: false; error: string }> {
  try {
    return { ok: true, medewerker: await vereisMaterieelMutatie(min) }
  } catch (e) {
    if (e instanceof GeenToegangError) return { ok: false, error: e.message }
    throw e
  }
}

/** Bestandsnaam veilig maken voor een storage-pad (zelfde regel als bestand-actions). */
function veiligeNaam(naam: string): string {
  return naam
    .normalize('NFKD').replace(/[^\w.\- ]/g, '')
    .trim().replace(/\s+/g, '-')
    .slice(0, 80) || 'factuur.pdf'
}

/* ── Stap 1: lezen ───────────────────────────────────────────────────────── */

export interface AnalyseResultaat {
  voorstel: Voorstel
  /** Waar de PDF tijdelijk staat, zodat stap 2 hem niet opnieuw hoeft te krijgen. */
  staging: string
  bestandsnaam: string
  kostenCent: number
}

/**
 * Leest een factuur en geeft een voorstel terug. Slaat nog niets op in het
 * register — de PDF gaat alleen alvast naar een staging-pad, zodat we hem bij
 * het opslaan aan elk object kunnen hangen zonder een tweede upload.
 */
export async function analyseerFactuur(formData: FormData): Promise<ActieResultaat<AnalyseResultaat>> {
  const g = await gate(); if (!g.ok) return g

  const file = formData.get('bestand') as File | null
  if (!file || file.size === 0) return { ok: false, error: 'Kies eerst een factuur (PDF).' }
  if (file.size > MAX_PDF_BYTES) return { ok: false, error: 'De PDF is groter dan 10 MB.' }
  if ((file.type || '').toLowerCase() !== 'application/pdf') {
    return { ok: false, error: 'Alleen een PDF kan gelezen worden.' }
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const gelezen = await leesFactuur(buffer, file.name)
  if (!gelezen.ok || !gelezen.data) {
    return { ok: false, error: gelezen.fout ?? 'De factuur kon niet gelezen worden.' }
  }

  const client = db()

  // Al eerder ingelezen? Alleen tellen, niet blokkeren — soms wil je bewust
  // aanvullen omdat de vorige keer een regel is overgeslagen.
  let alIngelezen = 0
  if (gelezen.data.factuurnummer) {
    const { count } = await client
      .from('materieel_objecten')
      .select('id', { count: 'exact', head: true })
      .eq('details->>factuur', gelezen.data.factuurnummer)
    alIngelezen = count ?? 0
  }

  const { data: mw } = await client
    .from('medewerkers')
    .select('id, voornaam, tussenvoegsel, achternaam, actief')
    .order('achternaam', { ascending: true })

  const staging = `factuur-import/${g.medewerker.id}/${Date.now()}-${veiligeNaam(file.name)}`
  const { error: upErr } = await client.storage
    .from(MATERIEEL_BUCKET)
    .upload(staging, buffer, { contentType: 'application/pdf', upsert: false })
  if (upErr) return { ok: false, error: `De factuur kon niet worden opgeslagen: ${upErr.message}` }

  return {
    ok: true,
    data: {
      voorstel: bouwVoorstel({
        extractie: gelezen.data,
        medewerkers: (mw ?? []) as MedewerkerKandidaat[],
        alIngelezen,
      }),
      staging,
      bestandsnaam: file.name,
      kostenCent: gelezen.kostenCent,
    },
  }
}

/* ── Stap 2: opslaan ─────────────────────────────────────────────────────── */

/**
 * Wat het scherm terugstuurt. Bewust een eigen schema en niet het voorstel zelf:
 * de gebruiker mag alles aanpassen, dus wat hier binnenkomt is invoer van de
 * browser en wordt opnieuw gevalideerd. Het voorstel uit stap 1 is geen bewijs.
 */
const bewaarSchema = z.object({
  staging: z.string().min(1).max(400),
  bestandsnaam: z.string().min(1).max(200),
  leverancier: z.string().trim().max(200).nullable(),
  factuurnummer: z.string().trim().max(100).nullable(),
  factuurdatum: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  bonnummer: z.string().trim().max(100).nullable(),
  administratie: z.string().trim().max(200).nullable(),
  naamOpFactuur: z.string().trim().max(200).nullable(),
  regels: z.array(z.object({
    omschrijving: z.string().trim().min(1).max(200),
    categorie: z.enum(MATERIEEL_CATEGORIEEN),
    merk: z.string().trim().max(200).nullable(),
    type: z.string().trim().max(200).nullable(),
    serienummer: z.string().trim().max(200).nullable(),
    aankoopdatum: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    aantal: z.number().int().min(1).max(200),
    stukprijs: z.number().min(0).max(1_000_000).nullable(),
    artikelcode: z.string().trim().max(100).nullable(),
    opmerkingen: z.string().trim().max(1000).nullable(),
    medewerkerId: z.string().uuid().nullable(),
  })).min(1).max(100),
})
export type BewaarInvoer = z.infer<typeof bewaarSchema>

export interface BewaarResultaat {
  aangemaakt: number
  /** Objecten waaraan de factuur-PDF niet gehangen kon worden. */
  zonderFactuur: number
}

/**
 * Zet de aangevinkte regels om in echte objecten.
 *
 * Elk object krijgt zijn eigen kopie van de factuur-PDF als document. Dat is
 * bewust geen gedeeld bestand: één factuur weggooien bij één object zou anders
 * de bijlage onder alle andere objecten vandaan trekken.
 */
export async function bewaarVoorstel(ruw: unknown): Promise<ActieResultaat<BewaarResultaat>> {
  const g = await gate(); if (!g.ok) return g

  const parsed = bewaarSchema.safeParse(ruw)
  if (!parsed.success) {
    const eerste = parsed.error.issues[0]
    return { ok: false, error: `Ongeldige invoer: ${eerste?.path.join('.') || '?'} — ${eerste?.message ?? ''}` }
  }
  const invoer = parsed.data
  const client = db()

  // De staging-PDF moet van deze gebruiker zijn; het pad komt uit de browser.
  if (!invoer.staging.startsWith(`factuur-import/${g.medewerker.id}/`)) {
    return { ok: false, error: 'Deze factuur hoort niet bij jouw import.' }
  }

  const basis = {
    bron: 'Factuurimport',
    factuur: invoer.factuurnummer,
    factuurdatum: invoer.factuurdatum,
    bon: invoer.bonnummer,
    administratie: invoer.administratie,
    naam_op_factuur: invoer.naamOpFactuur,
    ingelezen_op: new Date().toISOString().slice(0, 10),
  }

  const rijen = invoer.regels.flatMap((r) =>
    Array.from({ length: r.aantal }, () => ({
      omschrijving: r.omschrijving,
      categorie: r.categorie,
      merk: r.merk,
      type: r.type,
      // Eén serienummer hoort bij één exemplaar. Bij meerdere stuks op dezelfde
      // regel weten we niet welk nummer bij welk stuk hoort, dus dan geen.
      serienummer: r.aantal === 1 ? r.serienummer : null,
      aankoopdatum: r.aankoopdatum ?? invoer.factuurdatum,
      leverancier: invoer.leverancier,
      aanschafwaarde: r.stukprijs,
      status: r.medewerkerId ? 'in_gebruik' : 'beschikbaar',
      toewijzing_niveau: r.medewerkerId ? 'persoonlijk' : 'algemeen',
      toegewezen_medewerker_id: r.medewerkerId,
      opmerkingen: r.opmerkingen,
      details: { ...basis, artikelcode: r.artikelcode },
      created_by: g.medewerker.id,
    })),
  )

  const { data, error } = await client.from('materieel_objecten').insert(rijen).select('id')
  if (error) return { ok: false, error: error.message }

  const ids = ((data ?? []) as { id: string }[]).map((r) => r.id)

  // Historie voor alles wat meteen aan iemand hangt.
  const toewijzingen = ids
    .map((id, i) => ({ id, medewerkerId: rijen[i].toegewezen_medewerker_id }))
    .filter((t) => t.medewerkerId)
    .map((t) => ({
      object_id: t.id,
      niveau: 'persoonlijk',
      medewerker_id: t.medewerkerId,
      door: g.medewerker.id,
      opmerking: `Toegewezen bij het inlezen van factuur ${invoer.factuurnummer ?? invoer.bestandsnaam}`,
    }))
  if (toewijzingen.length > 0) await client.from('materieel_toewijzingen').insert(toewijzingen)

  // De factuur als bijlage onder elk object.
  let zonderFactuur = 0
  for (const id of ids) {
    const doel = `${id}/${Date.now()}-${veiligeNaam(invoer.bestandsnaam)}`
    const { error: kopieErr } = await client.storage.from(MATERIEEL_BUCKET).copy(invoer.staging, doel)
    if (kopieErr) { zonderFactuur++; continue }
    const { error: docErr } = await client.from('materieel_documenten').insert({
      object_id: id,
      type: 'factuur',
      bestandsnaam: invoer.bestandsnaam,
      storage_path: doel,
      mimetype: 'application/pdf',
      geupload_door: g.medewerker.id,
    })
    if (docErr) {
      await client.storage.from(MATERIEEL_BUCKET).remove([doel])
      zonderFactuur++
    }
  }

  // De staging-kopie heeft zijn werk gedaan.
  await client.storage.from(MATERIEEL_BUCKET).remove([invoer.staging])

  revalidatePath('/materieelbeheer')
  revalidatePath('/materieelbeheer/dashboard')
  return { ok: true, data: { aangemaakt: ids.length, zonderFactuur } }
}

/** De staging-PDF opruimen als de gebruiker het voorstel weggooit. */
export async function verwerpVoorstel(staging: string): Promise<ActieResultaat> {
  const g = await gate(); if (!g.ok) return g
  if (!staging.startsWith(`factuur-import/${g.medewerker.id}/`)) {
    return { ok: false, error: 'Deze factuur hoort niet bij jouw import.' }
  }
  await db().storage.from(MATERIEEL_BUCKET).remove([staging])
  return { ok: true, data: null }
}
