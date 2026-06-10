'use client'

import { useState } from 'react'
import { RefreshCw, CheckCircle2, AlertTriangle } from 'lucide-react'
import toast from 'react-hot-toast'
import { syncUluAction, type UluSyncResult } from '@/app/actions/ulu-sync'

export default function SyncForm({ disabled }: { disabled?: boolean }) {
  const jaar = new Date().getFullYear()
  const [from, setFrom] = useState(`${jaar}-01-01`)
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10))
  const [bezig, setBezig] = useState(false)
  const [result, setResult] = useState<UluSyncResult | null>(null)

  async function run() {
    setBezig(true)
    setResult(null)
    try {
      const res = await syncUluAction(from, to)
      setResult(res)
      if (res.ok) {
        toast.success(`Sync klaar — ${res.tripsNieuw ?? 0} nieuwe ritten`)
      } else {
        toast.error(res.error ?? 'Sync mislukt')
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Onbekende fout')
    } finally {
      setBezig(false)
    }
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <label htmlFor="from" className="block text-sm font-medium mb-1">Vanaf</label>
          <input
            id="from"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            disabled={disabled || bezig}
            className="w-full rounded-md border px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label htmlFor="to" className="block text-sm font-medium mb-1">Tot en met</label>
          <input
            id="to"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            disabled={disabled || bezig}
            className="w-full rounded-md border px-3 py-2 text-sm"
          />
        </div>
      </div>

      <button
        type="button"
        onClick={run}
        disabled={disabled || bezig}
        className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-md text-sm font-medium hover:bg-green-700 disabled:opacity-50"
      >
        <RefreshCw className={`w-4 h-4 ${bezig ? 'animate-spin' : ''}`} />
        {bezig ? 'Bezig met syncen…' : 'Start ULU sync'}
      </button>

      {result?.ok && (
        <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-md text-sm">
          <div className="flex items-center gap-2 text-green-800 font-medium mb-2">
            <CheckCircle2 className="w-4 h-4" />
            Sync geslaagd in {((result.duur_ms ?? 0) / 1000).toFixed(1)}s
          </div>
          <ul className="space-y-1 text-green-900">
            <li>Voertuigen gezien: {result.voertuigenGezien ?? 0} (nieuw: {result.voertuigenNieuw ?? 0})</li>
            <li>RDW-data opgehaald: {result.voertuigenRdwOpgehaald ?? 0}</li>
            <li>Gebruikers gecached: {result.gebruikersGecached ?? 0}</li>
            <li>Trips opgehaald: {result.tripsOpgehaald ?? 0}</li>
            <li>Trips nieuw opgeslagen: {result.tripsNieuw ?? 0}</li>
            <li>Trips overgeslagen (al aanwezig): {result.tripsOvergeslagen ?? 0}</li>
            <li>Trips verrijkt met bestuurder-naam: {result.tripsVerrijkt ?? 0}</li>
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
            Sync mislukt
          </div>
          <p className="mt-1 text-red-900">{result.error}</p>
        </div>
      )}
    </>
  )
}
