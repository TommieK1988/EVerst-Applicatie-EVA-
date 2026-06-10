import { pgQuery } from '@/lib/db'

type ScoreRij = {
  volledige_naam: string | null
  maand: string
  rit_type: string
  gem_score: string
  aantal_ritten: string
  totale_km: string
}

type RankingEntry = {
  naam: string
  score: number
  ritten: number
  km: number
}

type MaandGroep = {
  maand: string
  label: string
  zakelijk: RankingEntry[]
  prive: RankingEntry[]
}

function maandLabel(maandStr: string): string {
  const d = new Date(maandStr)
  return d.toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' })
}

function ScoreBadge({ score }: { score: number }) {
  const cls =
    score >= 85
      ? 'bg-green-100 text-green-700'
      : score >= 70
      ? 'bg-yellow-100 text-yellow-700'
      : 'bg-red-100 text-red-700'
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${cls}`}>
      {score.toFixed(1)}
    </span>
  )
}

function RankingLijst({ entries }: { entries: RankingEntry[] }) {
  if (entries.length === 0) {
    return <p className="text-xs text-slate-400 py-2">Geen data</p>
  }
  return (
    <ol className="space-y-2">
      {entries.map((e, i) => (
        <li key={e.naam} className="flex items-center gap-3">
          <span className="w-5 text-xs font-bold text-slate-400 shrink-0">{i + 1}</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-800 truncate">{e.naam}</p>
            <p className="text-xs text-slate-400">
              {e.ritten} ritten · {Math.round(e.km).toLocaleString('nl-NL')} km
            </p>
          </div>
          <ScoreBadge score={e.score} />
        </li>
      ))}
    </ol>
  )
}

export default async function RijscoreRanking() {
  const rows = await pgQuery<ScoreRij>(`
    SELECT
      u.volledige_naam,
      DATE_TRUNC('month', t.start_datum)::date::text AS maand,
      COALESCE(t.rit_type_override, t.rit_type_berekend) AS rit_type,
      ROUND(AVG(t.score)::numeric, 1)::text            AS gem_score,
      COUNT(*)::text                                    AS aantal_ritten,
      ROUND(SUM(t.afstand_km)::numeric, 0)::text       AS totale_km
    FROM ulu_trips t
    JOIN ulu_users u ON u.id = t.user_id_ulu
    WHERE t.score IS NOT NULL
      AND t.user_id_ulu IS NOT NULL
      AND t.start_datum >= (DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '6 months')
    GROUP BY u.volledige_naam, DATE_TRUNC('month', t.start_datum), COALESCE(t.rit_type_override, t.rit_type_berekend)
    HAVING COUNT(*) >= 3
    ORDER BY maand DESC, gem_score DESC
  `)

  // Group by month
  const maanden = new Map<string, MaandGroep>()
  for (const r of rows) {
    if (!maanden.has(r.maand)) {
      maanden.set(r.maand, {
        maand: r.maand,
        label: maandLabel(r.maand),
        zakelijk: [],
        prive: [],
      })
    }
    const groep = maanden.get(r.maand)!
    const entry: RankingEntry = {
      naam: r.volledige_naam ?? '(onbekend)',
      score: parseFloat(r.gem_score),
      ritten: parseInt(r.aantal_ritten),
      km: parseFloat(r.totale_km),
    }
    if (r.rit_type === 'zakelijk') groep.zakelijk.push(entry)
    else if (r.rit_type === 'prive') groep.prive.push(entry)
  }

  // Rows are already sorted by score DESC within each month (from SQL ORDER BY)
  // But after grouping into Map we need to keep top-5 per category
  const maandLijst = Array.from(maanden.values())

  if (maandLijst.length === 0) {
    return null
  }

  const huidigeMaand = maandLijst[0]
  const historieMaanden = maandLijst.slice(1)

  return (
    <div className="space-y-6 mb-8">
      {/* Afgelopen maand — hoofdwidget */}
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
          Beste rijders — {huidigeMaand.label}
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-white rounded-lg border p-5">
            <h3 className="text-sm font-semibold text-slate-700 mb-4">
              Zakelijk
            </h3>
            <RankingLijst entries={huidigeMaand.zakelijk.slice(0, 5)} />
          </div>
          <div className="bg-white rounded-lg border p-5">
            <h3 className="text-sm font-semibold text-slate-700 mb-4">
              Privé
            </h3>
            <RankingLijst entries={huidigeMaand.prive.slice(0, 5)} />
          </div>
        </div>
      </div>

      {/* Historisch overzicht */}
      {historieMaanden.length > 0 && (
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
            Historisch overzicht rijscores
          </h2>
          <div className="bg-white rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="text-left px-4 py-2 text-xs font-medium text-slate-500">Maand</th>
                  <th className="text-left px-4 py-2 text-xs font-medium text-slate-500">Beste zakelijk</th>
                  <th className="text-center px-3 py-2 text-xs font-medium text-slate-500">Score</th>
                  <th className="text-left px-4 py-2 text-xs font-medium text-slate-500">Beste privé</th>
                  <th className="text-center px-3 py-2 text-xs font-medium text-slate-500">Score</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {historieMaanden.map((m) => (
                  <tr key={m.maand} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 font-medium text-slate-700 capitalize">{m.label}</td>
                    <td className="px-4 py-2.5 text-slate-600">{m.zakelijk[0]?.naam ?? '—'}</td>
                    <td className="px-3 py-2.5 text-center">
                      {m.zakelijk[0] ? <ScoreBadge score={m.zakelijk[0].score} /> : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">{m.prive[0]?.naam ?? '—'}</td>
                    <td className="px-3 py-2.5 text-center">
                      {m.prive[0] ? <ScoreBadge score={m.prive[0].score} /> : <span className="text-slate-300">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
