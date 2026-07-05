/**
 * POST /everts-calc/api/briefpapier/upload
 *
 * Ontvangt een briefpapier-PDF als multipart/form-data en slaat het op in
 * Supabase Storage bucket "docx-templates" onder briefpapier/{layoutId}/...
 * met de service role key (bypasses RLS — server-only route).
 *
 * Het briefpapier wordt later als achtergrond onder elke offerte-pagina gelegd.
 *
 * Form fields:
 *   file      — het .pdf bestand
 *   layoutId  — ID van de layout (gebruikt als mapnaam)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { vereisBeheerder, GeenToegangError } from '@/lib/auth/rechten'

export const dynamic = 'force-dynamic'

const BUCKET = 'docx-templates'

export async function POST(request: NextRequest) {
  // Service-role upload naar een publieke bucket → alleen beheerders (layoutbeheer).
  try {
    await vereisBeheerder()
  } catch (e) {
    if (e instanceof GeenToegangError) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })
    throw e
  }
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const layoutId = formData.get('layoutId') as string | null

    if (!file || !layoutId) {
      return NextResponse.json({ error: 'file en layoutId zijn verplicht' }, { status: 400 })
    }

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      return NextResponse.json({ error: 'Alleen .pdf bestanden zijn toegestaan' }, { status: 400 })
    }

    // Service role client — bypasses RLS
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )

    const pad = `briefpapier/${layoutId}/${Date.now()}-${file.name.replace(/[^a-z0-9._-]/gi, '_')}`
    const buffer = Buffer.from(await file.arrayBuffer())

    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(pad, buffer, { contentType: 'application/pdf', upsert: true })

    if (error) throw error

    const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(pad)

    return NextResponse.json({ url: publicUrl })
  } catch (err) {
    console.error('Briefpapier upload fout:', err)
    return NextResponse.json({ error: 'Er ging iets mis' }, { status: 500 })
  }
}
