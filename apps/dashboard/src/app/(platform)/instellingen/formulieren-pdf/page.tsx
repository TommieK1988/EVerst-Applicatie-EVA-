import type { Metadata } from 'next'
import { getPdfConfig } from './actions'
import { PdfInstellingenClient } from './PdfInstellingenClient'

export const metadata: Metadata = { title: 'Instellingen › Formulier PDF-opmaak' }

export default async function FormulierenPdfPage() {
  const result = await getPdfConfig()

  if (!result.ok) {
    return (
      <div style={{ padding: 32 }}>
        <p style={{ color: '#dc2626', fontSize: 14 }}>
          Fout bij laden: {result.error}. Controleer of de database-migratie is uitgevoerd.
        </p>
      </div>
    )
  }

  return (
    <div style={{ padding: '32px', maxWidth: 720 }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ margin: '0 0 6px', fontSize: 22, fontWeight: 700, color: 'var(--text)' }}>
          Formulier PDF-opmaak
        </h1>
        <p style={{ margin: 0, fontSize: 14, color: 'var(--text-muted)' }}>
          Universele opmaak voor alle PDF-rapporten van ingediende formulieren. Het logo en de bedrijfsnaam worden automatisch uit de huisstijl-instellingen gehaald.
        </p>
      </div>
      <PdfInstellingenClient config={result.config} logoUrl={result.logoUrl} />
    </div>
  )
}
