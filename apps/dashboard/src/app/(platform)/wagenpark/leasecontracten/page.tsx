import { FileText } from 'lucide-react'
import PageHeader from '@/components/wagenpark/shared/PageHeader'
import EmptyState from '@/components/wagenpark/shared/EmptyState'
import { createClient } from '@/lib/wagenpark/supabase/server'
import { formatDatum } from '@/lib/wagenpark/utils'

export const dynamic = 'force-dynamic'

export default async function LeasePage() {
  const supabase = await createClient()
  const { data: contracten } = await supabase
    .from('lease_contracten')
    .select('*, voertuigen(kenteken, merk, model)')
    .order('start_datum', { ascending: false })

  return (
    <>
      <PageHeader
        titel="Leasecontracten"
        omschrijving="Overzicht van alle (actieve en historische) lease-contracten per voertuig."
      />

      {!contracten || contracten.length === 0 ? (
        <EmptyState
          titel="Nog geen leasecontracten"
          omschrijving="Leasecontracten kun je straks per voertuig toevoegen in het detail-scherm."
          icon={FileText}
        />
      ) : (
        <div className="bg-white rounded-lg border overflow-hidden">
          <table className="data-table">
            <thead>
              <tr>
                <th>Voertuig</th>
                <th>Contract #</th>
                <th>Start</th>
                <th>Eind</th>
                <th>Maand</th>
                <th>Km-bundel</th>
                <th>Bijtelling %</th>
              </tr>
            </thead>
            <tbody>
              {contracten.map((c: any) => (
                <tr key={c.id}>
                  <td>
                    <span className="font-mono">{c.voertuigen?.kenteken ?? '—'}</span>
                    <span className="text-xs text-slate-500 ml-2">
                      {[c.voertuigen?.merk, c.voertuigen?.model].filter(Boolean).join(' ')}
                    </span>
                  </td>
                  <td>{c.contractnummer ?? '—'}</td>
                  <td>{formatDatum(c.start_datum)}</td>
                  <td>{formatDatum(c.eind_datum)}</td>
                  <td>{c.maandtermijn_bedrag ? `€ ${c.maandtermijn_bedrag}` : '—'}</td>
                  <td>{c.km_bundel_per_jaar ?? '—'}</td>
                  <td>{c.bijtelling_percentage ? `${c.bijtelling_percentage}%` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
