/**
 * POST /everts-calc/api/docx-templates/graph
 *
 * Resolvet een SharePoint/OneDrive deel-link (of drive+item-id) naar een
 * Microsoft Graph driveItem, zodat een offerte-layout kan verwijzen naar een
 * Word-template die in SharePoint/OneDrive leeft en daar in Word Online wordt
 * bewerkt.
 *
 * Body (JSON), één van:
 *   { shareLink: "https://contoso.sharepoint.com/..." }
 *   { driveId, itemId }
 *
 * Antwoord: { drive_id, item_id, web_url, naam }
 *
 * App-only Graph — vereist admin-consent (Sites.Read.All of Files.Read.All).
 */

import { NextRequest, NextResponse } from 'next/server'
import { appGraphGet } from '@/lib/o365/graph'

export const dynamic = 'force-dynamic'

interface DriveItem {
  id: string
  name?: string
  webUrl?: string
  parentReference?: { driveId?: string }
}

/** Codeert een deel-URL naar een Graph sharing-token (u!-formaat). */
function encodeShareUrl(url: string): string {
  const b64 = Buffer.from(url, 'utf-8').toString('base64')
  return 'u!' + b64.replace(/=+$/, '').replace(/\//g, '_').replace(/\+/g, '-')
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { shareLink?: string; driveId?: string; itemId?: string }

    let item: DriveItem
    if (body.shareLink) {
      const token = encodeShareUrl(body.shareLink.trim())
      item = await appGraphGet<DriveItem>(
        `/shares/${token}/driveItem?$select=id,name,webUrl,parentReference`,
      )
    } else if (body.driveId && body.itemId) {
      item = await appGraphGet<DriveItem>(
        `/drives/${body.driveId}/items/${body.itemId}?$select=id,name,webUrl,parentReference`,
      )
    } else {
      return NextResponse.json({ error: 'Geef een shareLink of driveId+itemId op.' }, { status: 400 })
    }

    const driveId = item.parentReference?.driveId
    if (!driveId || !item.id) {
      return NextResponse.json({ error: 'Kon het bestand niet resolven via Graph.' }, { status: 502 })
    }

    if (item.name && !item.name.toLowerCase().endsWith('.docx')) {
      return NextResponse.json(
        { error: `Het gekoppelde bestand is geen .docx (${item.name}).` },
        { status: 422 },
      )
    }

    return NextResponse.json({
      drive_id: driveId,
      item_id: item.id,
      web_url: item.webUrl ?? null,
      naam: item.name ?? null,
    })
  } catch (err) {
    console.error('Graph template resolve fout:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
