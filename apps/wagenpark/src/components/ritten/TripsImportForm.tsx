'use client'

import { useState } from 'react'
import { Upload, CheckCircle2, AlertTriangle } from 'lucide-react'
import toast from 'react-hot-toast'
import { importTripsAction, type TripsImportResult } from '@/app/actions/import-trips'

export default function TripsImportForm() {
  const [bezig, setBezig] = useState(false)
  const [result, setResult] = useState<TripsImportResult | null>(null)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const fd = new FormData(form)
    const file = fd.get('trips') as File | null
    if (!file || file.size === 0) {
      toast.error('Kies een bestand.')
      return
    }
    setBezig(true)
    try {
      const res = await importTripsAction(fd)
      setResult(res)
      if (res.ok) {
        toast.success(`Import klaar: ${res.tripsNieuw ?? 0} nieuwe ritten`)
        form.reset()
      } else {
        toast.error(res.error ?? 'Mislukt')
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Onbekende fout')
    } finally {
      setBezig(false)
    }
  }

  return (
    <>
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label htmlFor="trips" className="block text-sm font-medium mb-1">
            Ritten-export (xlsx)
          </label>
          <input
            id="trips"
            name="trips"
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="block w-full text-sm text-slate-600 file:mr-3 file:py-2 file:px-3 file:rounded file:border-0 file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200"
          />
        </div>
        <button
          type="submit"
          disabled={bezig}
          className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-md text-sm font-medium hover:bg-green-700 disabled:opacity-50"
        >
          <Upload className="w-4 h-4" />
          {bezig ? 'Bezig met importeren (kan even duren voor groot bestand)…' : 'Importeren'}
        </button>
      </form>

      {result?.ok && (
        <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-md text-sm">
          <div className="flex items-center gap-2 text-green-800 font-medium mb-2">
            <CheckCircle2 className="w-4 h-4" />
            Import geslaagd
          </div>
          <ul className="space-y-1 text-green-900">
            <li>Verwerkt: {result.tripsVerwerkt ?? 0} rijen (na deduplicatie)</li>
            <li>Nieuw toegevoegd: {result.tripsNieuw ?? 0}</li>
            <li>Al bestaand (aangevuld): {result.tripsOvergeslagen ?? 0}</li>
            <li>Parse-fouten: {result.tripsFouten ?? 0}</li>
            {result.periode && (
              <li>Periode: {result.periode.start} → {result.periode.eind}</li>
            )}
            {result.nieuweVoertuigen && result.nieuweVoertuigen.length > 0 && (
              <li>
                Nieuwe voertuigen: <strong>{result.nieuweVoertuigen.join(', ')}</strong>
              </li>
            )}
            {result.naamMatches != null && (
              <li>Bestuurder-namen gematcht: {result.naamMatches}</li>
            )}
            {result.naamGeenMatch && result.naamGeenMatch.length > 0 && (
              <li className="text-amber-800">
                <strong>Geen match ({result.naamGeenMatch.length}):</strong> {result.naamGeenMatch.join(', ')}
              </li>
            )}
            {result.bevindingen != null && (
              <li>Compliance-bevindingen: {result.bevindingen}</li>
            )}
          </ul>
        </div>
      )}

      {result && !result.ok && (
        <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-md text-sm">
          <div className="flex items-center gap-2 text-red-800 font-medium">
            <AlertTriangle className="w-4 h-4" />
            Import mislukt
          </div>
          <p className="mt-1 text-red-900">{result.error}</p>
        </div>
      )}
    </>
  )
}
