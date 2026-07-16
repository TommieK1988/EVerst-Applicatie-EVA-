/**
 * POST /everts-calc/everts-calc/api/docx-templates/upload
 *
 * Ontvangt een .docx bestand als multipart/form-data en slaat het op in
 * Supabase Storage bucket "docx-templates" met de service role key
 * (bypasses RLS — server-only route).
 *
 * Form fields:
 *   file      — het .docx bestand
 *   layoutId  — ID van de layout/het sjabloon (gebruikt als mapnaam)
 *   prefix    — optioneel: 'layouts' (offertes, default) of 'documenten'
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { listDocxTags } from '@/lib/everts-calc/docx-utils'
import { vereisBeheerder, GeenToegangError } from '@/lib/auth/rechten'

export const dynamic = 'force-dynamic'

/**
 * Toegestane hoofdmappen in de bucket. Allowlist, geen vrije string: deze route
 * schrijft met de service-role, dus een ongecontroleerde prefix is path-traversal.
 */
const PREFIXEN = ['layouts', 'documenten'] as const

export async function POST(request: NextRequest) {
  // M1: template-beheer schrijft met de service-role naar storage — alleen voor beheerders.
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
    const prefix = (formData.get('prefix') as string | null) ?? 'layouts'

    if (!file || !layoutId) {
      return NextResponse.json({ error: 'file en layoutId zijn verplicht' }, { status: 400 })
    }

    if (!file.name.endsWith('.docx')) {
      return NextResponse.json({ error: 'Alleen .docx bestanden zijn toegestaan' }, { status: 400 })
    }

    if (!(PREFIXEN as readonly string[]).includes(prefix)) {
      return NextResponse.json({ error: 'Ongeldige prefix' }, { status: 400 })
    }

    // Service role client — bypasses RLS
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )

    const pad = `${prefix}/${layoutId}/${Date.now()}-${file.name}`
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Tags detecteren (best-effort) zodat de auteur ziet welke variabelen het template gebruikt
    let tags: string[] = []
    try {
      const PizZip = (await import('pizzip')).default
      tags = listDocxTags(new PizZip(buffer))
    } catch {
      /* tag-detectie is niet kritisch */
    }

    const { error } = await supabase.storage
      .from('docx-templates')
      .upload(pad, buffer, {
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        upsert: true,
      })

    if (error) throw error

    const { data: { publicUrl } } = supabase.storage
      .from('docx-templates')
      .getPublicUrl(pad)

    return NextResponse.json({ url: publicUrl, tags })
  } catch (err) {
    // M3: foutdetails niet naar de client lekken — alleen server-side loggen.
    console.error('Docx template upload fout:', err)
    return NextResponse.json({ error: 'Er ging iets mis' }, { status: 500 })
  }
}
