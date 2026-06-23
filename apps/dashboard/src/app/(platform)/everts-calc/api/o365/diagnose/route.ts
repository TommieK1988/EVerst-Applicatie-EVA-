/**
 * GET /everts-calc/api/o365/diagnose
 *
 * Hulp-endpoint om de Office 365 app-only koppeling live te krijgen. Open deze
 * URL in de browser (ingelogd in EVA).
 *
 * Modi:
 *   (geen params)        → controleert of het app-only token werkt (consent-check)
 *                          + valideert een eventueel ingestelde O365_PDF_DRIVE_ID
 *   ?shareLink=<url>     → resolvet een SharePoint/OneDrive-link naar de drive-id
 *                          die je in O365_PDF_DRIVE_ID moet zetten
 *
 * Geeft een leesbare HTML-pagina terug.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAppAccessToken } from '@/lib/o365/tokens'
import { appGraphGet } from '@/lib/o365/graph'

export const dynamic = 'force-dynamic'

interface DriveItem {
  id: string
  name?: string
  webUrl?: string
  parentReference?: { driveId?: string }
}
interface Drive {
  id: string
  name?: string
  driveType?: string
  webUrl?: string
}

function encodeShareUrl(url: string): string {
  const b64 = Buffer.from(url, 'utf-8').toString('base64')
  return 'u!' + b64.replace(/=+$/, '').replace(/\//g, '_').replace(/\+/g, '-')
}

function page(body: string): NextResponse {
  return new NextResponse(
    `<!DOCTYPE html><html lang="nl"><head><meta charset="utf-8"><title>O365 diagnose</title>
    <style>
      body{font-family:system-ui,sans-serif;max-width:720px;margin:2rem auto;padding:0 1rem;color:#1e293b;line-height:1.5}
      code{background:#f1f5f9;padding:.15rem .4rem;border-radius:4px;font-size:.9em;word-break:break-all}
      .ok{color:#059669}.fout{color:#dc2626}.kaart{border:1px solid #e2e8f0;border-radius:10px;padding:1rem 1.25rem;margin:1rem 0}
      h1{font-size:1.25rem}h2{font-size:1rem;margin-top:0}
      input{width:100%;padding:.5rem;border:1px solid #cbd5e1;border-radius:6px;font-size:.9rem}
      .big{font-size:1.05rem;font-weight:600}
      table{border-collapse:collapse;width:100%;font-size:.85rem}td,th{border:1px solid #e2e8f0;padding:.4rem .6rem;text-align:left}
    </style></head><body>${body}</body></html>`,
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  )
}

const FORM = `
  <div class="kaart">
    <h2>Drive-id zoeken</h2>
    <p>Plak een SharePoint/OneDrive-link naar de map of bibliotheek die je als tijdelijke
       conversie-locatie wilt gebruiken, en druk op Zoek.</p>
    <form method="get">
      <input name="shareLink" placeholder="https://contoso.sharepoint.com/sites/..." />
      <p><button type="submit">Zoek drive-id</button></p>
    </form>
  </div>`

export async function GET(request: NextRequest) {
  const shareLink = request.nextUrl.searchParams.get('shareLink')

  // 1. App-only token (consent-check)
  try {
    await getAppAccessToken()
  } catch (err) {
    return page(`
      <h1>Office 365 — diagnose</h1>
      <div class="kaart">
        <p class="fout big">❌ Geen app-only token</p>
        <p>${String(err).replace(/</g, '&lt;')}</p>
        <p>Controleer:</p>
        <ul>
          <li><code>O365_CLIENT_ID</code> / <code>O365_CLIENT_SECRET</code> ingesteld (en secret niet verlopen)</li>
          <li><code>O365_TENANT_ID</code> = de échte tenant-GUID (niet <code>common</code>)</li>
          <li>In Azure: <strong>Application permission</strong> <code>Files.ReadWrite.All</code> toegevoegd
              én <strong>admin consent</strong> verleend</li>
        </ul>
      </div>`)
  }

  // 2. Shate-link resolven → drive-id
  if (shareLink) {
    try {
      const token = encodeShareUrl(shareLink.trim())
      const item = await appGraphGet<DriveItem>(
        `/shares/${token}/driveItem?$select=id,name,webUrl,parentReference`,
      )
      const driveId = item.parentReference?.driveId
      if (!driveId) {
        return page(`<h1>O365 — diagnose</h1>
          <div class="kaart"><p class="fout">Kon de drive-id niet uit deze link halen.</p>
          <p>Plak een link naar een <strong>bestand of submap</strong> binnen de bibliotheek
          (niet de site-homepage).</p></div>${FORM}`)
      }
      return page(`
        <h1>Office 365 — diagnose</h1>
        <div class="kaart">
          <p class="ok big">✅ Gevonden</p>
          <p>Zet deze waarde in <code>O365_PDF_DRIVE_ID</code> (in <code>.env.local</code> én Vercel):</p>
          <p><code class="big">${driveId}</code></p>
          <table>
            <tr><th>Item</th><td>${item.name ?? '—'}</td></tr>
            <tr><th>WebUrl</th><td><a href="${item.webUrl ?? '#'}">${item.webUrl ?? '—'}</a></td></tr>
          </table>
        </div>${FORM}`)
    } catch (err) {
      return page(`<h1>O365 — diagnose</h1>
        <div class="kaart"><p class="fout">Resolven mislukt: ${String(err).replace(/</g, '&lt;')}</p>
        <p>Heeft de app leesrecht op deze site? (<code>Files.ReadWrite.All</code> of <code>Sites.Read.All</code>, met admin consent.)</p></div>${FORM}`)
    }
  }

  // 3. Geen params: token OK + huidige O365_PDF_DRIVE_ID valideren
  const pdfDriveId = process.env.O365_PDF_DRIVE_ID
  let driveStatus = `<p>⚠️ <code>O365_PDF_DRIVE_ID</code> is nog niet ingesteld.</p>`
  if (pdfDriveId) {
    try {
      const drive = await appGraphGet<Drive>(`/drives/${pdfDriveId}?$select=id,name,driveType,webUrl`)
      driveStatus = `<p class="ok">✅ <code>O365_PDF_DRIVE_ID</code> is geldig.</p>
        <table>
          <tr><th>Naam</th><td>${drive.name ?? '—'}</td></tr>
          <tr><th>Type</th><td>${drive.driveType ?? '—'}</td></tr>
          <tr><th>WebUrl</th><td><a href="${drive.webUrl ?? '#'}">${drive.webUrl ?? '—'}</a></td></tr>
        </table>`
    } catch (err) {
      driveStatus = `<p class="fout">❌ <code>O365_PDF_DRIVE_ID</code> is ingesteld maar werkt niet:
        ${String(err).replace(/</g, '&lt;')}</p>`
    }
  }

  return page(`
    <h1>Office 365 — diagnose</h1>
    <div class="kaart">
      <p class="ok big">✅ App-only token werkt (consent OK)</p>
      ${driveStatus}
    </div>
    ${FORM}`)
}
