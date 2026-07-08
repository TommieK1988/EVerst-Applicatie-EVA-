import { NextResponse } from 'next/server'
import {
  opleverMomentTypeLabels, opleverMomentStatusLabels, opleverPuntStatusLabels,
  type OpleverPuntStatus,
} from '@everts/database'
import { getOplevermomentRapport } from '@/lib/dossiers/oplevering'

const esc = (s: unknown): string =>
  String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))

const STATUS_KLEUR: Record<OpleverPuntStatus, string> = {
  open: '#6b757c', in_behandeling: '#1d4e89', opgelost: '#7a5a17', geaccepteerd: '#1c7a3f', geweigerd: '#a12020',
}

/**
 * Opleverrapportage als zelfstandige, printvriendelijke HTML (A4). Achter de EVA-login (middleware),
 * dus intern. Openen in een nieuw tabblad → "Print → Opslaan als PDF" of afdrukken voor de klant.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ momentId: string }> }) {
  const { momentId } = await params
  const rapport = await getOplevermomentRapport(momentId)
  if (!rapport) return new NextResponse('Oplevermoment niet gevonden', { status: 404 })

  const { dossier, moment, punten, handtekeningen } = rapport
  const datum = moment.opgeleverd_op
    ? new Date(moment.opgeleverd_op).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })
    : new Date(moment.created_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })

  const puntenHtml = punten.map(p => `
    <div class="punt">
      <div class="punt-kop">
        <span class="op">OP${String(p.volgnummer).padStart(2, '0')}</span>
        <span class="omschr">${esc(p.omschrijving)}</span>
        <span class="status" style="color:${STATUS_KLEUR[p.status]}">${esc(opleverPuntStatusLabels[p.status])}</span>
      </div>
      <div class="meta">
        ${p.ruimte ? `<span>${esc(p.ruimte)}</span>` : ''}
        ${p.deadline ? `<span>deadline ${esc(p.deadline)}</span>` : ''}
        ${p.is_extra_werk ? `<span class="ew">Extra werk</span>` : ''}
      </div>
      ${p.geweigerd_reden ? `<div class="afw">Afgewezen: ${esc(p.geweigerd_reden)}</div>` : ''}
      ${p.fotos.length ? `<div class="fotos">${p.fotos.map(f => `<img src="${esc(f.url)}" alt="foto" />`).join('')}</div>` : ''}
      ${p.reacties.length ? `<div class="reacties">${p.reacties.map(r => `
        <div class="reactie">
          <strong>${esc(r.auteur_naam ?? (r.auteur_type === 'onderaannemer' ? 'Onderaannemer' : 'Everts'))}</strong>
          ${r.opmerking ? `<span>${esc(r.opmerking)}</span>` : ''}
          ${r.foto_urls.length ? `<div class="fotos">${r.foto_urls.map(u => `<img src="${esc(u)}" alt="foto" />`).join('')}</div>` : ''}
        </div>`).join('')}</div>` : ''}
    </div>`).join('')

  const handtekeningenHtml = handtekeningen.length ? `
    <div class="section">
      <h2>Ondertekening</h2>
      <div class="handtekeningen">
        ${handtekeningen.map(h => `
          <div class="ht">
            ${h.handtekening_url
              ? `<img src="${esc(h.handtekening_url)}" alt="handtekening" />`
              : `<div class="akkoord">✓ Akkoord op afstand</div>`}
            <div class="ht-meta">
              <div class="rol">${esc(h.rol.charAt(0).toUpperCase() + h.rol.slice(1))}</div>
              ${h.naam ? `<div>${esc(h.naam)}</div>` : ''}
              <div class="dt">${new Date(h.akkoord_op).toLocaleDateString('nl-NL')}</div>
            </div>
          </div>`).join('')}
      </div>
    </div>` : ''

  const aantalGeaccepteerd = punten.filter(p => p.status === 'geaccepteerd').length

  const html = `<!doctype html>
<html lang="nl"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Opleverrapport ${esc(dossier.nummer ?? '')}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; color: #1a1f24; margin: 0; background: #f4f6f5; }
  .page { max-width: 780px; margin: 0 auto; background: #fff; padding: 40px 44px; }
  .toolbar { max-width: 780px; margin: 12px auto; text-align: right; }
  .toolbar button { background: #009439; color: #fff; border: none; border-radius: 8px; padding: 9px 18px; font-size: 14px; font-weight: 600; cursor: pointer; }
  header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #009439; padding-bottom: 16px; margin-bottom: 20px; }
  .merk { font-weight: 800; letter-spacing: 0.06em; font-size: 20px; }
  h1 { font-size: 20px; margin: 0 0 2px; }
  .sub { color: #6b757c; font-size: 13px; }
  .info { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 24px; font-size: 13px; margin-bottom: 22px; }
  .info .k { color: #8a938f; }
  h2 { font-size: 14px; text-transform: uppercase; letter-spacing: 0.05em; color: #4a545b; border-bottom: 1px solid #e4e8e7; padding-bottom: 6px; margin: 24px 0 12px; }
  .punt { border: 1px solid #e4e8e7; border-radius: 8px; padding: 12px 14px; margin-bottom: 10px; page-break-inside: avoid; }
  .punt-kop { display: flex; align-items: baseline; gap: 8px; }
  .op { font-size: 11px; font-weight: 700; color: #a4adb2; }
  .omschr { font-size: 14px; font-weight: 600; flex: 1; }
  .status { font-size: 12px; font-weight: 700; }
  .meta { font-size: 11.5px; color: #6b757c; margin-top: 3px; display: flex; gap: 10px; }
  .meta .ew { color: #7a5a17; font-weight: 600; }
  .afw { font-size: 12px; color: #a12020; margin-top: 4px; }
  .fotos { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
  .fotos img { width: 92px; height: 92px; object-fit: cover; border-radius: 6px; border: 1px solid #e4e8e7; }
  .reacties { margin-top: 8px; border-top: 1px dashed #e4e8e7; padding-top: 8px; }
  .reactie { font-size: 12.5px; margin-bottom: 6px; }
  .reactie strong { margin-right: 6px; }
  .handtekeningen { display: flex; flex-wrap: wrap; gap: 24px; }
  .ht { border: 1px solid #e4e8e7; border-radius: 8px; padding: 10px 14px; min-width: 200px; }
  .ht img { height: 54px; max-width: 180px; object-fit: contain; }
  .ht .akkoord { color: #1c7a3f; font-weight: 600; font-size: 13px; padding: 16px 0; }
  .ht-meta { font-size: 12px; color: #6b757c; margin-top: 6px; }
  .ht-meta .rol { font-weight: 700; color: #3a444c; }
  footer { margin-top: 32px; border-top: 1px solid #e4e8e7; padding-top: 12px; font-size: 11px; color: #8a938f; }
  @media print {
    body { background: #fff; }
    .toolbar { display: none; }
    .page { max-width: none; padding: 0; }
    @page { margin: 16mm; }
  }
</style></head>
<body>
  <div class="toolbar"><button onclick="window.print()">Afdrukken / opslaan als PDF</button></div>
  <div class="page">
    <header>
      <div>
        <h1>Opleverrapport</h1>
        <div class="sub">${esc(opleverMomentTypeLabels[moment.type])} · ${esc(opleverMomentStatusLabels[moment.status])}</div>
      </div>
      <div class="merk">EVERTS.</div>
    </header>

    <div class="info">
      <div><span class="k">Project:</span> ${esc(dossier.titel ?? '—')}</div>
      <div><span class="k">Projectnummer:</span> ${esc(dossier.nummer ?? '—')}</div>
      <div><span class="k">Opdrachtgever:</span> ${esc(dossier.klant ?? '—')}</div>
      <div><span class="k">Werkadres:</span> ${esc(dossier.werkadres ?? '—')}</div>
      <div><span class="k">Oplevering:</span> ${esc(moment.titel)}</div>
      <div><span class="k">Datum:</span> ${esc(datum)}</div>
    </div>

    <h2>Opleverpunten (${punten.length}) · ${aantalGeaccepteerd} geaccepteerd</h2>
    ${punten.length ? puntenHtml : '<p style="font-size:13px;color:#6b757c">Geen opleverpunten geregistreerd.</p>'}

    ${handtekeningenHtml}

    <footer>Opgesteld via EVA — Everts. Dit rapport geeft de opleverpunten en hun status weer op het moment van afdrukken.</footer>
  </div>
</body></html>`

  return new NextResponse(html, { headers: { 'content-type': 'text/html; charset=utf-8' } })
}
