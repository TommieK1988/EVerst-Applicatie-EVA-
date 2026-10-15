import { NextResponse } from 'next/server'
import {
  opleverMomentTypeLabels, opleverMomentStatusLabels, opleverPuntStatusLabels,
  type OpleverPuntStatus,
} from '@everts/database'
import { getOplevermomentRapport, type OpleverPuntView } from '@/lib/dossiers/oplevering'
import { splitsFotos, bewijsOntbreekt } from '@/lib/dossiers/oplever-fotos'
import { getBedrijfsIdentiteit } from '@/lib/bedrijf/identiteit'

const esc = (s: unknown): string =>
  String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))

// 'nieuw' en 'afgewezen' filtert het rapport zelf al weg (nog niet beoordeeld resp. afgevallen);
// ze staan hier alleen zodat de opzoeking nooit `undefined` in de CSS-kleur oplevert.
const STATUS_KLEUR: Record<OpleverPuntStatus, string> = {
  nieuw: '#7a5a17', open: '#6b757c', in_behandeling: '#1d4e89', opgelost: '#7a5a17',
  geaccepteerd: '#1c7a3f', geweigerd: '#a12020', afgewezen: '#6b757c',
}

/**
 * Opleverrapportage als zelfstandige, printvriendelijke HTML (A4). Achter de EVA-login (middleware),
 * dus intern. Openen in een nieuw tabblad → "Print → Opslaan als PDF" of afdrukken voor de klant.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ momentId: string }> }) {
  const { momentId } = await params
  const rapport = await getOplevermomentRapport(momentId)
  if (!rapport) return new NextResponse('Oplevermoment niet gevonden', { status: 404 })

  const { dossier, moment, aandachtspunten, handtekeningen } = rapport
  const punten = rapport.punten.filter(p => !p.is_goed)
  const goed = rapport.punten.filter(p => p.is_goed)
  const datum = moment.opgeleverd_op
    ? new Date(moment.opgeleverd_op).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })
    : new Date(moment.created_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })

  /**
   * Eén punt als kaart met vaste hoogte: foto vooraf | foto na herstel | omschrijving. Elk fotovak
   * even groot (4:3); de foto past er in zijn geheel in, niet bijgesneden. Tekst die niet past wordt
   * afgekapt. Een ontbrekende na-foto blijft
   * zichtbaar als gestippeld vlak. Een goed uitgevoerd punt toont zijn eerste twee foto's.
   */
  const puntHtml = (p: OpleverPuntView, nummer: string, status: { label: string; kleur: string }) => {
    const { voor, na } = splitsFotos(p.fotos)
    const mist = bewijsOntbreekt(p.status, p.fotos, p.is_goed)
    const urls = p.is_goed ? [voor[0]?.url, voor[1]?.url] : [voor[0]?.url, na[0]?.url]
    const vak = (url: string | undefined, i: number) => {
      if (url) {
        const lbl = p.is_goed ? '' : `<span class="lbl">${i === 0 ? 'Voor' : 'Na herstel'}</span>`
        return `<div class="vak">${lbl}<img src="${esc(url)}" alt="foto" /></div>`
      }
      if (p.is_goed && i === 1) return '<div class="vak"></div>'
      const t = i === 0 ? 'geen foto' : mist ? 'geen foto na herstel' : 'nog geen foto na herstel'
      return `<div class="vak leeg${i === 1 && mist ? ' mist' : ''}">${t}</div>`
    }
    const nietGetoond = p.fotos.length - urls.filter(Boolean).length
    const laatste = p.reacties[p.reacties.length - 1]
    const meta = [
      p.deadline ? `deadline ${esc(p.deadline)}` : '',
      p.is_extra_werk ? 'Extra werk' : '',
      nietGetoond > 0 ? `+${nietGetoond} foto${nietGetoond > 1 ? "'s" : ''} in EVA` : '',
    ].filter(Boolean).join(' · ')
    return `
    <div class="punt">
      <div class="punt-kop">
        <span class="op">${esc(nummer)}</span>
        <span class="ruimte">${esc(p.ruimte ?? '')}</span>
        <span class="status" style="color:${status.kleur}">${esc(status.label)}</span>
      </div>
      <div class="blok">
        ${urls.map(vak).join('')}
        <div class="details">
          ${meta ? `<div class="meta">${meta}</div>` : ''}
          ${p.geweigerd_reden ? `<div class="afw">Afgewezen: ${esc(p.geweigerd_reden)}</div>` : ''}
          ${laatste ? `<div class="meta">${esc(laatste.auteur_naam ?? (laatste.auteur_type === 'onderaannemer' ? 'Onderaannemer' : 'Projectteam'))}: ${esc(laatste.opmerking ?? '')}</div>` : ''}
        </div>
      </div>
      <div class="omschr">${esc(p.omschrijving)}</div>
    </div>`
  }
  const opStatus = (p: OpleverPuntView) => ({ label: opleverPuntStatusLabels[p.status], kleur: STATUS_KLEUR[p.status] })
  const nr = (prefix: string, n: number) => `${prefix}${String(n).padStart(2, '0')}`

  const puntenHtml = punten.map(p => puntHtml(p, nr('OP', p.volgnummer), opStatus(p))).join('')

  const goedHtml = goed.length ? `
    <h2 class="nieuw">Goed uitgevoerd (${goed.length})</h2>
    <p class="uitleg">Werkzaamheden die bij de oplevering akkoord zijn bevonden.</p>
    ${goed.map((p, i) => puntHtml(p, nr('G', i + 1), { label: 'Goed uitgevoerd', kleur: '#1c7a3f' })).join('')}` : ''

  const tekstenHtml = ([['Algemene opmerkingen', moment.opmerking], ['Afspraken', moment.afspraken]] as const)
    .filter(([, t]) => t?.trim())
    .map(([kop, t], i) => `<h2${i === 0 ? ' class="nieuw"' : ''}>${kop}</h2><div class="vrij">${esc(t)}</div>`).join('')

  // Aandachtspunten horen bij het dossier, niet bij dit ene moment — vandaar een eigen hoofdstuk
  // met eigen nummerreeks (AP). Geen aandachtspunten = geen kopje.
  const aandachtspuntenHtml = aandachtspunten.length ? `
    <h2 class="nieuw">Aandachtspunten (${aandachtspunten.length})</h2>
    <p class="uitleg">Gemelde punten bij dit project die niet aan dit oplevermoment gekoppeld zijn.</p>
    ${aandachtspunten.map(p => puntHtml(p, nr('AP', p.volgnummer), opStatus(p))).join('')}` : ''

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

  // Merk en kleur komen uit Instellingen → Organisatiegegevens; dit rapport gaat naar de klant.
  const identiteit = await getBedrijfsIdentiteit()
  const merkkleur = identiteit.kleur_primair ?? '#009439'
  const afzender = identiteit.naam ? `Opgesteld via EVA — ${identiteit.naam}. ` : ''

  const html = `<!doctype html>
<html lang="nl"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Opleverrapport ${esc(dossier.nummer ?? '')}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; color: #1a1f24; margin: 0; background: #f4f6f5; }
  .page { max-width: 780px; margin: 0 auto; background: #fff; padding: 40px 44px; }
  .toolbar { max-width: 780px; margin: 12px auto; text-align: right; }
  .toolbar button { background: ${esc(merkkleur)}; color: #fff; border: none; border-radius: 8px; padding: 9px 18px; font-size: 14px; font-weight: 600; cursor: pointer; }
  header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid ${esc(merkkleur)}; padding-bottom: 16px; margin-bottom: 20px; }
  .merk { font-weight: 800; letter-spacing: 0.06em; font-size: 20px; }
  h1 { font-size: 20px; margin: 0 0 2px; }
  .sub { color: #6b757c; font-size: 13px; }
  .info { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 24px; font-size: 13px; margin-bottom: 22px; }
  .info .k { color: #8a938f; }
  h2 { font-size: 14px; text-transform: uppercase; letter-spacing: 0.05em; color: #4a545b; border-bottom: 1px solid #e4e8e7; padding-bottom: 6px; margin: 24px 0 12px; }
  .punt { border: 1px solid #e4e8e7; border-radius: 6px; margin-bottom: 10px; page-break-inside: avoid; overflow: hidden; }
  .punt-kop { display: flex; align-items: baseline; gap: 8px; background: #f4f6f6; padding: 5px 10px; }
  .op { font-size: 11px; font-weight: 700; color: #8a938f; }
  .ruimte { font-size: 13px; font-weight: 700; flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .status { font-size: 12px; font-weight: 700; }
  .blok { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; padding: 10px 10px 6px; }
  .vak { position: relative; aspect-ratio: 4 / 3; background: #f4f6f6; border-radius: 3px; }
  .vak:empty { background: none; }
  .vak img { width: 100%; height: 100%; object-fit: contain; display: block; }
  .vak .lbl { position: absolute; top: 0; left: 0; background: rgba(26,31,36,.65); color: #fff; font-size: 9.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; padding: 2px 6px; border-radius: 3px 0 3px 0; }
  .vak.leeg { border: 1px dashed #d5dbd9; border-radius: 3px; display: flex; align-items: center; justify-content: center; font-size: 11.5px; color: #8a938f; }
  .vak.leeg.mist { border-color: #a12020; color: #a12020; }
  .details { display: flex; flex-direction: column; gap: 4px; }
  .omschr { font-size: 13px; font-weight: 600; white-space: pre-line; padding: 0 10px 10px; height: 4.8em; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
  @media print { h2.nieuw { break-before: page; } }
  .meta { font-size: 11px; color: #6b757c; }
  .afw { font-size: 11px; color: #a12020; }
  .fotos { display: flex; flex-wrap: wrap; gap: 6px; }
  .fotos img { width: 92px; height: 92px; object-fit: cover; border-radius: 6px; border: 1px solid #e4e8e7; }
  .kol-kop { font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #8a938f; margin-bottom: 4px; }
  .vrij { font-size: 13px; white-space: pre-line; line-height: 1.5; }
  .uitleg { font-size: 12px; color: #6b757c; margin: -4px 0 10px; }
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
      <div class="merk">${esc(identiteit.naam)}</div>
    </header>

    <div class="info">
      <div><span class="k">Project:</span> ${esc(dossier.titel ?? '—')}</div>
      <div><span class="k">Projectnummer:</span> ${esc(dossier.nummer ?? '—')}</div>
      <div><span class="k">Opdrachtgever:</span> ${esc(dossier.klant ?? '—')}</div>
      <div><span class="k">Werkadres:</span> ${esc(dossier.werkadres ?? '—')}</div>
      <div><span class="k">Oplevering:</span> ${esc(moment.titel)}</div>
      <div><span class="k">Datum:</span> ${esc(datum)}</div>
    </div>

    <h2 class="nieuw">Opleverpunten (${punten.length}) · ${aantalGeaccepteerd} geaccepteerd</h2>
    ${punten.length ? puntenHtml : `<p style="font-size:13px;color:#6b757c">${goed.length
      ? 'Geen opleverpunten: de werkzaamheden zijn akkoord bevonden.' : 'Geen opleverpunten geregistreerd.'}</p>`}

    ${goedHtml}

    ${aandachtspuntenHtml}

    ${tekstenHtml}

    ${handtekeningenHtml}

    <footer>${esc(afzender)}Dit rapport geeft de opleverpunten en hun status weer op het moment van afdrukken.</footer>
  </div>
</body></html>`

  return new NextResponse(html, { headers: { 'content-type': 'text/html; charset=utf-8' } })
}
