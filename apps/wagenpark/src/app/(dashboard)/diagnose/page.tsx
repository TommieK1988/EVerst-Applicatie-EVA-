import { createServiceRoleClient } from '@/lib/supabase/service-role'
import PageHeader from '@/components/shared/PageHeader'

export const dynamic = 'force-dynamic'

const VERWACHTE_TABELLEN = [
  'voertuigen',
  'voertuig_bestuurders',
  'lease_contracten',
  'rdw_data',
  'ulu_imports',
  'ulu_trips',
  'ulu_parking',
  'handboek_regels',
  'compliance_bevindingen',
  'compliance_feedback',
]

export default async function DiagnosePage() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '(niet gezet)'
  const projectId = url.match(/https:\/\/([^.]+)\./)?.[1] ?? 'onbekend'
  const hasAnon = !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const hasServiceRole = !!process.env.SUPABASE_SERVICE_ROLE_KEY

  let tabellenInDb: string[] = []
  let tabellenCheckError: string | null = null
  const perTabelCheck: Record<string, { ok: boolean; error?: string }> = {}

  try {
    const supabase = createServiceRoleClient()

    // Check elke verwachte tabel met een SELECT head:true
    for (const tbl of VERWACHTE_TABELLEN) {
      const { error } = await supabase.from(tbl).select('*', { head: true, count: 'exact' }).limit(1)
      perTabelCheck[tbl] = error ? { ok: false, error: error.message } : { ok: true }
    }

    // Probeer ook via information_schema (werkt alleen als we rechten hebben)
    // We doen dit via een simpele query — als het faalt is dat prima.
    const { data: infoData } = await supabase
      .rpc('noop_never_exists_just_to_test' as never)
      .select()
      .limit(0)
    // RPC faalt altijd, niet erg; we willen alleen testen of de client verbinding heeft
    void infoData
  } catch (e) {
    tabellenCheckError = e instanceof Error ? e.message : String(e)
  }

  const alleTabellenGevonden = Object.values(perTabelCheck).every((v) => v.ok)

  return (
    <>
      <PageHeader
        titel="Diagnose"
        omschrijving="Wat ziet de Wagenpark-app daadwerkelijk in de Supabase-database."
      />

      <div className="space-y-6">
        <section className="bg-white rounded-lg border p-5">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">Verbinding</h2>
          <dl className="grid grid-cols-2 gap-y-2 text-sm">
            <dt className="text-slate-500">Supabase URL</dt>
            <dd className="font-mono text-xs">{url}</dd>
            <dt className="text-slate-500">Project ID</dt>
            <dd className="font-mono">{projectId}</dd>
            <dt className="text-slate-500">NEXT_PUBLIC_SUPABASE_ANON_KEY</dt>
            <dd>{hasAnon ? '✅ aanwezig' : '❌ ontbreekt'}</dd>
            <dt className="text-slate-500">SUPABASE_SERVICE_ROLE_KEY</dt>
            <dd>{hasServiceRole ? '✅ aanwezig' : '❌ ontbreekt'}</dd>
          </dl>
        </section>

        <section className="bg-white rounded-lg border p-5">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">Tabellen-check</h2>
          {tabellenCheckError && (
            <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-900">
              <strong>Verbindingsfout:</strong> {tabellenCheckError}
            </div>
          )}
          <table className="data-table">
            <thead>
              <tr>
                <th>Tabel</th>
                <th>Status</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {VERWACHTE_TABELLEN.map((tbl) => {
                const r = perTabelCheck[tbl]
                return (
                  <tr key={tbl}>
                    <td className="font-mono">public.{tbl}</td>
                    <td>
                      {r?.ok ? (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                          gevonden
                        </span>
                      ) : (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                          ontbreekt
                        </span>
                      )}
                    </td>
                    <td className="text-xs text-slate-500">{r?.error ?? 'OK'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          {alleTabellenGevonden ? (
            <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded text-sm text-green-900">
              ✅ Alle tabellen gevonden. Import zou moeten werken. Als dat toch niet lukt,
              run dan in Supabase: <code className="px-1 rounded bg-green-100">notify pgrst, &apos;reload schema&apos;;</code>
            </div>
          ) : (
            <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded text-sm text-amber-900">
              ⚠️ Niet alle tabellen bestaan. Mogelijke oorzaken:
              <ul className="list-disc ml-5 mt-1 space-y-1">
                <li>
                  De migratie <code>20260417_wagenpark.sql</code> is in een <strong>ander
                  Supabase-project</strong> uitgevoerd. Log in op{' '}
                  <a
                    href="https://supabase.com/dashboard"
                    target="_blank"
                    rel="noreferrer"
                    className="underline"
                  >
                    supabase.com/dashboard
                  </a>
                  , open project met ID <code className="px-1 rounded bg-amber-100">{projectId}</code>,
                  open SQL Editor en run de migratie daar.
                </li>
                <li>
                  De migratie is in hetzelfde project gerund, maar het schema is nog niet
                  herladen. Run:{' '}
                  <code className="px-1 rounded bg-amber-100">notify pgrst, &apos;reload schema&apos;;</code>
                </li>
              </ul>
            </div>
          )}
        </section>
      </div>
    </>
  )
}
