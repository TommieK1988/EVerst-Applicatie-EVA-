/**
 * POST /everts-calc/everts-calc/api/docx-templates/upload
 *
 * Ontvangt een .docx bestand als multipart/form-data en slaat het op in
 * Supabase Storage bucket "docx-templates" met de service role key
 * (bypasses RLS — server-only route).
 *
 * Form fields:
 *   file      — het .docx bestand
 *   layoutId  — ID van de layout (gebruikt als mapnaam)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const layoutId = formData.get('layoutId') as string | null

    if (!file || !layoutId) {
      return NextResponse.json({ error: 'file en layoutId zijn verplicht' }, { status: 400 })
    }

    if (!file.name.endsWith('.docx')) {
      return NextResponse.json({ error: 'Alleen .docx bestanden zijn toegestaan' }, { status: 400 })
    }

    // Service role client — bypasses RLS
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )

    const pad = `layouts/${layoutId}/${Date.now()}-${file.name}`
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

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

    return NextResponse.json({ url: publicUrl })
  } catch (err) {
    console.error('Docx template upload fout:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
