/**
 * POST /everts-calc/api/docx-templates/valideer
 *
 * Analyseert een .docx-template proactief: geeft alle tags mét omringende tekst en
 * structurele problemen (ongebalanceerde loops, losse accolades) terug, zodat de
 * gebruiker fouten kan lokaliseren zonder te renderen.
 *
 * Body (JSON): één van
 *   { drive_id, item_id }   – SharePoint/OneDrive-template via Graph
 *   { template_url }        – Supabase-storage-URL
 */

import { NextRequest, NextResponse } from 'next/server'
import { appGraphGetRaw } from '@/lib/o365/graph'
import { analyseerTemplate } from '@/lib/everts-calc/docx-utils'
import { vereisRecht, GeenToegangError } from '@/lib/auth/rechten'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  // Object-level authz: alleen gebruikers met everts_calc-leesrecht.
  try {
    await vereisRecht('everts_calc', 'lezen')
  } catch (e) {
    if (e instanceof GeenToegangError) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })
    throw e
  }

  try {
    const body = (await request.json().catch(() => ({}))) as {
      template_url?: string
      drive_id?: string
      item_id?: string
    }

    let buffer: Buffer
    if (body.drive_id && body.item_id) {
      buffer = await appGraphGetRaw(`/drives/${body.drive_id}/items/${body.item_id}/content`)
    } else if (body.template_url) {
      const res = await fetch(body.template_url)
      if (!res.ok) {
        return NextResponse.json({ error: `Template ophalen mislukt: HTTP ${res.status}` }, { status: 502 })
      }
      buffer = Buffer.from(await res.arrayBuffer())
    } else {
      return NextResponse.json({ error: 'Geen template opgegeven' }, { status: 400 })
    }

    const PizZip = (await import('pizzip')).default
    const analyse = analyseerTemplate(new PizZip(buffer))
    return NextResponse.json(analyse)
  } catch (err) {
    console.error('Template validatie fout:', err)
    return NextResponse.json({ error: 'Kon het template niet analyseren' }, { status: 500 })
  }
}
