import React from 'react'
import { getDossierBestanden, getAppZichtbareBestandSleutels } from '@/lib/dossiers/bestanden'
import { getDossierSharePointBestanden } from '@/lib/dossiers/sharepoint-bestanden'
import {
  bouw7Rij, sharePointRij, bestandUrl, formatteerGrootte, naamMetExtensie, type BestandRij,
} from '@/lib/dossiers/bestand-rijen'

/**
 * Mobiele Bestanden-tab: de bestanden die op de Bestanden-tab in EVA zijn aangevinkt
 * met "In app" — Bouw7 én SharePoint.
 *
 * De twee bronnen worden hier net zo samengevoegd als op de desktoptab en daarna
 * gefilterd op de vrijgegeven sleutels. Bewust dezelfde opbouw en niet een eigen
 * lijstje: zo kan een naam of datum op de telefoon nooit uit de pas gaan lopen met
 * wat de collega op kantoor aanvinkte. Openen gaat via `/api/dossier-bestand`, dat
 * voor allebei de bronnen het servertoken toevoegt.
 *
 * Zware live-calls → in `<Suspense>` gewikkeld door de pagina.
 */
export default async function BestandenView({ dossierId }: { dossierId: string }) {
  const [bouw7, sharepoint, sleutels] = await Promise.all([
    getDossierBestanden(dossierId).catch(() => null),
    getDossierSharePointBestanden(dossierId).catch(() => null),
    getAppZichtbareBestandSleutels(dossierId).catch(() => [] as string[]),
  ])

  // Opt-in: alleen wat in EVA is aangevinkt komt op de telefoon.
  const vrijgegeven = new Set(sleutels)
  const bestanden: BestandRij[] = [
    ...(bouw7?.bestanden ?? []).map(bouw7Rij),
    ...(sharepoint?.status === 'gematcht' ? sharepoint.bestanden.map(sharePointRij) : []),
  ]
    .filter(r => vrijgegeven.has(r.sleutel))
    .sort((a, b) => (b.datum ?? '').localeCompare(a.datum ?? '') || a.naam.localeCompare(b.naam))

  if (bestanden.length === 0) {
    return (
      <div style={{ textAlign: 'center', color: '#6b757c', padding: '40px 16px', fontSize: 14 }}>
        Er zijn voor dit dossier geen bestanden vrijgegeven voor de app.
      </div>
    )
  }

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {bestanden.map((b) => {
        const meta = [
          b.categorie,
          b.bron,
          b.grootte == null ? null : formatteerGrootte(b.grootte),
          b.datum,
        ].filter(Boolean).join(' · ')
        return (
          <a
            key={b.sleutel}
            href={bestandUrl(b)}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'block', padding: '12px 14px', background: 'var(--bg-elev)',
              border: '1px solid var(--border)', borderRadius: 12, textDecoration: 'none',
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg)', wordBreak: 'break-word' }}>
              {naamMetExtensie(b.naam, b.extensie)}
            </div>
            {meta && <div style={{ fontSize: 12, color: '#6b757c', marginTop: 2 }}>{meta}</div>}
          </a>
        )
      })}
    </div>
  )
}
