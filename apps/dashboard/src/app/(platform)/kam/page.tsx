import type { Metadata } from 'next'
import { getVcaOpdrachten } from './actions'
import { VcaOpdrachtenTabel } from './VcaOpdrachtenTabel'

export const metadata: Metadata = { title: 'KAM / VGM — Dashboard' }

export default async function KamDashboardPage() {
  const vcaOpdrachten = await getVcaOpdrachten()

  const totaal = vcaOpdrachten.length

  return (
    <div style={{ padding: '32px', width: '100%', boxSizing: 'border-box' }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ margin: '0 0 6px', fontSize: 24, fontWeight: 700, color: 'var(--text)' }}>
          KAM / VGM — Dashboard
        </h1>
        <p style={{ margin: 0, fontSize: 14, color: 'var(--text-muted)' }}>
          De lopende opdrachten waarop de VCA-toggle aanstaat, met per opdracht de voortgang
          van de VCA-acties uit de actielijst en de formulieren die daarbij horen.
        </p>
      </div>

      {totaal === 0 ? (
        <div style={{
          padding: '48px 32px', textAlign: 'center',
          border: '1px dashed var(--border)', borderRadius: 12,
          color: 'var(--text-muted)',
        }}>
          <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.4 }}>🛡</div>
          <p style={{ fontSize: 15, fontWeight: 500, marginBottom: 8 }}>Geen opdrachten met VCA</p>
          <p style={{ fontSize: 13 }}>
            Zet op een opdracht de VCA-toggle aan; die verschijnt dan hier met de voortgang
            van de bijbehorende acties en formulieren.
          </p>
        </div>
      ) : (
        <VcaOpdrachtenTabel rijen={vcaOpdrachten} />
      )}
    </div>
  )
}
