import React from 'react'
import { getDossierBestanden, getAppZichtbareBestandIds } from '@/lib/dossiers/bestanden'

/**
 * Mobiele Bestanden-tab: projectbestanden live uit Bouw7 (read-only). Download
 * loopt via de EVA-proxy `/api/bouw7/bestand/{fileHash}` (voegt de token toe).
 * Zware live-call → in `<Suspense>` gewikkeld door de pagina.
 */
function formatGrootte(bytes: number | null): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} kB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default async function BestandenView({ dossierId }: { dossierId: string }) {
  const [data, zichtbaarIds] = await Promise.all([
    getDossierBestanden(dossierId).catch(() => null),
    getAppZichtbareBestandIds(dossierId).catch(() => [] as number[]),
  ])

  // Opt-in: alleen wat in EVA is aangevinkt komt op de telefoon.
  const zichtbaar = new Set(zichtbaarIds)
  const bestanden = (data?.bestanden ?? []).filter(b => zichtbaar.has(b.id))

  if (!data || !data.beschikbaar || bestanden.length === 0) {
    return (
      <div style={{ textAlign: 'center', color: '#6b757c', padding: '40px 16px', fontSize: 14 }}>
        Er zijn voor dit dossier geen bestanden vrijgegeven voor de app.
      </div>
    )
  }

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {bestanden.map((b) => {
        const meta = [b.categorie, formatGrootte(b.grootte), b.datum].filter(Boolean).join(' · ')
        const inner = (
          <>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg)', wordBreak: 'break-word' }}>
              {b.naam}{b.extensie ? `.${b.extensie}` : ''}
            </div>
            {meta && <div style={{ fontSize: 12, color: '#6b757c', marginTop: 2 }}>{meta}</div>}
          </>
        )
        const style: React.CSSProperties = {
          display: 'block', padding: '12px 14px', background: 'var(--bg-elev)',
          border: '1px solid var(--border)', borderRadius: 12, textDecoration: 'none',
        }
        return b.fileHash ? (
          <a key={b.id} href={`/api/bouw7/bestand/${b.fileHash}`} target="_blank" rel="noopener noreferrer" style={style}>
            {inner}
          </a>
        ) : (
          <div key={b.id} style={{ ...style, opacity: 0.7 }}>{inner}</div>
        )
      })}
    </div>
  )
}
