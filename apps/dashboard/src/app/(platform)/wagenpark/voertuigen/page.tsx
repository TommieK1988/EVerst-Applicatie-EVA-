import Link from 'next/link'
import { Car, Plus } from 'lucide-react'
import PageHeader from '@/components/wagenpark/shared/PageHeader'
import EmptyState from '@/components/wagenpark/shared/EmptyState'
import VoertuigStatusSelect from '@/components/wagenpark/voertuigen/VoertuigStatusSelect'
import { createClient } from '@/lib/wagenpark/supabase/server'

export const dynamic = 'force-dynamic'

type VoertuigRij = {
  id: string
  kenteken: string
  merk: string | null
  model: string | null
  type: string | null
  brandstof: string | null
  status: string
}

export default async function VoertuigenPage(
  props: {
    searchParams: Promise<{ toonGearchiveerd?: string }>
  }
) {
  const searchParams = await props.searchParams;
  const toonGearchiveerd = searchParams.toonGearchiveerd === '1'
  const supabase = await createClient()
  let q = supabase
    .from('voertuigen')
    .select('id, kenteken, merk, model, type, brandstof, status')
    .order('kenteken')
  if (!toonGearchiveerd) {
    q = q.in('status', ['actief', 'in_onderhoud'])
  }
  const { data: voertuigen, error } = await q.returns<VoertuigRij[]>()

  // Huidige bestuurder per voertuig — via active voertuig_bestuurders
  const laatsteBestuurder = new Map<string, string>()
  if (voertuigen && voertuigen.length > 0) {
    const ids = voertuigen.map((v) => v.id)
    const { data: koppelingen } = await supabase
      .from('voertuig_bestuurders')
      .select('voertuig_id, ulu_user_id')
      .in('voertuig_id', ids)
      .is('eind_datum', null)
      .returns<Array<{ voertuig_id: string; ulu_user_id: number | null }>>()
    const userIds = [...new Set((koppelingen ?? []).map((k) => k.ulu_user_id).filter((x): x is number => x != null))]
    if (userIds.length > 0) {
      const { data: users } = await supabase
        .from('ulu_users')
        .select('id, volledige_naam')
        .in('id', userIds)
        .returns<Array<{ id: number; volledige_naam: string | null }>>()
      const byId = new Map((users ?? []).map((u) => [u.id, u.volledige_naam]))
      for (const k of koppelingen ?? []) {
        if (k.ulu_user_id && byId.get(k.ulu_user_id)) {
          laatsteBestuurder.set(k.voertuig_id, byId.get(k.ulu_user_id) as string)
        }
      }
    }

    // Fallback: bestuurder uit meest recente trip (voor voertuigen zonder koppeling)
    const zonder = ids.filter((id) => !laatsteBestuurder.has(id))
    if (zonder.length > 0) {
      const { data: recentTrips } = await supabase
        .from('ulu_trips')
        .select('voertuig_id, bestuurder_naam_raw, start_datum')
        .in('voertuig_id', zonder)
        .order('start_datum', { ascending: false })
        .limit(500)
        .returns<Array<{ voertuig_id: string; bestuurder_naam_raw: string | null; start_datum: string }>>()
      for (const t of recentTrips ?? []) {
        if (!laatsteBestuurder.has(t.voertuig_id) && t.bestuurder_naam_raw) {
          laatsteBestuurder.set(t.voertuig_id, t.bestuurder_naam_raw)
        }
      }
    }
  }

  return (
    <>
      <PageHeader
        titel="Voertuigen"
        omschrijving="Alle auto's, werkbussen en aanhangers in het wagenpark."
        actions={
          <Link
            href="/wagenpark/voertuigen/nieuw"
            className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-md text-sm hover:bg-green-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Nieuw voertuig
          </Link>
        }
      />

      <div className="mb-3 flex gap-2 text-sm">
        <Link
          href="?"
          className={
            !toonGearchiveerd
              ? 'px-3 py-1 rounded-full bg-slate-900 text-white text-xs'
              : 'px-3 py-1 rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 text-xs'
          }
        >
          Actief
        </Link>
        <Link
          href="?toonGearchiveerd=1"
          className={
            toonGearchiveerd
              ? 'px-3 py-1 rounded-full bg-slate-900 text-white text-xs'
              : 'px-3 py-1 rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 text-xs'
          }
        >
          Alles (incl. gearchiveerd)
        </Link>
      </div>

      {error || !voertuigen || voertuigen.length === 0 ? (
        <EmptyState
          titel="Geen voertuigen"
          omschrijving="Voeg handmatig toe of doe een ULU-sync."
          icon={Car}
        />
      ) : (
        <div className="bg-white rounded-lg border overflow-hidden">
          <table className="data-table">
            <thead>
              <tr>
                <th>Kenteken</th>
                <th>Merk / Model</th>
                <th>Huidige bestuurder</th>
                <th>Type</th>
                <th>Brandstof</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {voertuigen.map((v) => (
                <tr key={v.id}>
                  <td className="">{v.kenteken}</td>
                  <td>{[v.merk, v.model].filter(Boolean).join(' ') || '—'}</td>
                  <td className="text-slate-700">
                    {laatsteBestuurder.get(v.id) ?? <span className="text-slate-400">—</span>}
                  </td>
                  <td className="capitalize text-slate-600">{v.type ?? '—'}</td>
                  <td className="capitalize text-slate-600">{v.brandstof ?? '—'}</td>
                  <td>
                    <VoertuigStatusSelect id={v.id} initial={v.status} />
                  </td>
                  <td className="text-right">
                    <Link
                      href={`/voertuigen/${v.id}`}
                      className="text-sm text-green-700 hover:underline"
                    >
                      Details
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
