import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Download, Clock } from 'lucide-react'
import PageHeader from '@/components/wagenpark/shared/PageHeader'
import EmptyState from '@/components/wagenpark/shared/EmptyState'
import WerktijdenAdminKnoppen from '@/components/wagenpark/werktijden/WerktijdenAdminKnoppen'
import { magPriveRittenZien } from '@/lib/wagenpark/privacy'
import {
  beschikbareMaanden,
  leesMaandrapporten,
  MAAND_NAMEN,
} from '@/lib/wagenpark/maandrapport'

export const dynamic = 'force-dynamic'

function urenLabel(min: number | null): string {
  if (min == null) return '—'
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  return `${h}u${String(m).padStart(2, '0')}`
}

export default async function WerktijdenPage({
  searchParams,
}: {
  searchParams: Promise<{ maand?: string }>
}) {
  // AVG-gate: woonadres-nabijheid + privé-ritten → alleen Directie/beheer.
  if (!(await magPriveRittenZien())) redirect('/')

  const params = await searchParams
  let maanden: { jaar: number; maand: number }[] = []
  let verbindingsfout: string | null = null
  try {
    maanden = await beschikbareMaanden()
  } catch (e) {
    verbindingsfout = e instanceof Error ? e.message : String(e)
  }

  // Gekozen maand uit ?maand=YYYY-MM, anders de nieuwste beschikbare.
  let gekozen: { jaar: number; maand: number } | null = null
  if (params.maand && /^\d{4}-\d{1,2}$/.test(params.maand)) {
    const [j, m] = params.maand.split('-').map(Number)
    gekozen = { jaar: j, maand: m }
  } else if (maanden.length > 0) {
    gekozen = maanden[0]
  }

  const rapporten = gekozen
    ? await leesMaandrapporten(gekozen.jaar, gekozen.maand).catch(() => [])
    : []

  const maandKey = (x: { jaar: number; maand: number }) =>
    `${x.jaar}-${String(x.maand).padStart(2, '0')}`

  return (
    <>
      <PageHeader
        titel="Werktijden"
        omschrijving="Aanwezigheid op de werkplek uit de rittenregistratie: aankomst, vertrek, te laat / te vroeg — o.b.v. de ingeplande projectlocatie van die dag (straal 500 m) en het rooster."
        actions={<WerktijdenAdminKnoppen />}
      />

      <div className="mb-4 p-3 rounded-md bg-amber-50 border border-amber-200 text-xs text-amber-900">
        <strong>Vertrouwelijk.</strong> Deze analyse gebruikt woon- en werkadres-nabijheid en
        (deels privé-)ritten. Alleen zichtbaar voor Directie/beheer. Behandel de gegevens en het
        PDF-rapport conform de AVG.
      </div>

      {verbindingsfout ? (
        <div className="p-4 bg-red-50 border border-red-200 rounded text-sm text-red-900">
          <strong>Geen verbinding met de database.</strong> {verbindingsfout}
        </div>
      ) : maanden.length === 0 ? (
        <EmptyState
          titel="Nog geen maandanalyse"
          omschrijving="Er is nog geen maandrapport gegenereerd. Zorg eerst dat de adressen gegeocodeerd zijn en draai daarna 'Maandrapport nu' — of wacht op de automatische maandelijkse run."
          icon={Clock}
        />
      ) : (
        <section className="bg-white rounded-lg border">
          {/* Maand-kiezer */}
          <div className="px-5 py-3 border-b flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              {maanden.map((x) => {
                const actief = gekozen && x.jaar === gekozen.jaar && x.maand === gekozen.maand
                return (
                  <Link
                    key={maandKey(x)}
                    href={`/wagenpark/werktijden?maand=${maandKey(x)}`}
                    className={`px-3 py-1.5 rounded-md text-sm border ${
                      actief
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {MAAND_NAMEN[x.maand - 1]} {x.jaar}
                  </Link>
                )
              })}
            </div>
            {gekozen && rapporten.length > 0 && (
              <a
                href={`/wagenpark/werktijden/rapport?jaar=${gekozen.jaar}&maand=${gekozen.maand}`}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-sm border bg-white hover:bg-slate-50"
              >
                <Download className="w-4 h-4" /> Download PDF
              </a>
            )}
          </div>

          {/* Tabel per bestuurder */}
          {rapporten.length === 0 ? (
            <div className="p-6 text-sm text-slate-500">
              Geen gegevens voor deze maand.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-500 border-b">
                    <th className="px-5 py-2 font-medium">Bestuurder</th>
                    <th className="px-3 py-2 font-medium text-right">Gewerkte dagen</th>
                    <th className="px-3 py-2 font-medium text-right">Te laat</th>
                    <th className="px-3 py-2 font-medium text-right">Te vroeg</th>
                    <th className="px-3 py-2 font-medium text-right">Gem. netto/dag</th>
                    <th className="px-5 py-2 font-medium">Let op</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rapporten.map((b) => {
                    const waarschuwing =
                      !b.heeft_werk_coord || !b.heeft_woon_coord
                        ? [
                            !b.heeft_werk_coord ? 'geen werkadres' : null,
                            !b.heeft_woon_coord ? 'geen woonadres' : null,
                          ]
                            .filter(Boolean)
                            .join(', ')
                        : ''
                    return (
                      <tr key={b.user_id_ulu} className="hover:bg-slate-50">
                        <td className="px-5 py-2 font-medium text-slate-800">
                          <Link
                            href={`/wagenpark/bestuurders/${b.user_id_ulu}`}
                            className="hover:underline"
                          >
                            {b.volledige_naam ?? `Bestuurder #${b.user_id_ulu}`}
                          </Link>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{b.gewerkte_dagen}</td>
                        <td
                          className={`px-3 py-2 text-right tabular-nums ${
                            b.dagen_te_laat > 0 ? 'text-red-700 font-semibold' : 'text-slate-400'
                          }`}
                        >
                          {b.dagen_te_laat > 0
                            ? `${b.dagen_te_laat}× (${b.totaal_te_laat_minuten} min)`
                            : '—'}
                        </td>
                        <td
                          className={`px-3 py-2 text-right tabular-nums ${
                            b.dagen_te_vroeg > 0 ? 'text-red-700 font-semibold' : 'text-slate-400'
                          }`}
                        >
                          {b.dagen_te_vroeg > 0
                            ? `${b.dagen_te_vroeg}× (${b.totaal_te_vroeg_minuten} min)`
                            : '—'}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {urenLabel(b.gemiddelde_netto_minuten)}
                        </td>
                        <td className="px-5 py-2 text-xs text-amber-700">{waarschuwing}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-md text-xs text-blue-900">
        <strong>Hoe werkt het?</strong> De werkplek is de <strong>ingeplande projectlocatie</strong>{' '}
        van die dag (dossier-werkadres uit de planning); is er die dag geen planning, dan valt de
        werkplek terug op het bedrijfsadres. Aankomst = de eerste rit die binnen 500 m van een
        ingeplande locatie eindigt; vertrek = de laatste rit die binnen 500 m ervan start. De grens
        (te laat / te vroeg) komt uit het rooster (dagstart/dageind), met verlof als uitzondering.
        Pas de straal en marges aan via{' '}
        <Link href="/wagenpark/instellingen" className="underline">Instellingen</Link> (regel R11).
        Ontbreekt er een coördinaat? Draai dan eerst “Adressen geocoderen”.
      </div>
    </>
  )
}
