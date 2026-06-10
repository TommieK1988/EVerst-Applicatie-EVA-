import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import PageHeader from '@/components/wagenpark/shared/PageHeader'
import { createClient } from '@/lib/wagenpark/supabase/server'
import { pgQuery } from '@/lib/wagenpark/db'
import { formatDatum, formatDatumMetDag, formatKm } from '@/lib/wagenpark/utils'
import VoertuigEditForm from '@/components/wagenpark/voertuigen/VoertuigEditForm'
import VoertuigBestuurderKoppeling from '@/components/wagenpark/voertuigen/VoertuigBestuurderKoppeling'
import RefreshRdwButton from '@/components/wagenpark/voertuigen/RefreshRdwButton'

export const dynamic = 'force-dynamic'

export default async function VoertuigDetailPage(
  props: {
    params: Promise<{ id: string }>
  }
) {
  const params = await props.params;
  const supabase = await createClient()

  const [voertuigRes, rdwRes, leaseRes, ritten30Res] = await Promise.all([
    supabase.from('voertuigen').select('*').eq('id', params.id).single(),
    supabase.from('rdw_data').select('*').eq('voertuig_id', params.id).maybeSingle(),
    supabase
      .from('lease_contracten')
      .select('*')
      .eq('voertuig_id', params.id)
      .eq('actief', true)
      .order('start_datum', { ascending: false }),
    supabase
      .from('ulu_trips')
      .select('id, start_datum, start_tijd, afstand_km, rit_type_berekend, score, adres_stop, bestuurder_naam_raw')
      .eq('voertuig_id', params.id)
      .order('start_datum', { ascending: false })
      .order('start_tijd', { ascending: false })
      .limit(30),
  ])

  const voertuig = voertuigRes.data
  if (!voertuig) notFound()

  const rdw = rdwRes.data
  const leases = leaseRes.data ?? []
  const ritten = ritten30Res.data ?? []

  // Huidige koppeling + alle beschikbare bestuurders
  const huidigeKoppeling = await pgQuery<{
    id: string
    ulu_user_id: number
    volledige_naam: string | null
    start_datum: string
  }>(
    `select vb.id, vb.ulu_user_id, u.volledige_naam, vb.start_datum::text
       from public.voertuig_bestuurders vb
       left join public.ulu_users u on u.id = vb.ulu_user_id
      where vb.voertuig_id = $1 and vb.eind_datum is null
      limit 1`,
    [params.id],
  )

  const beschikbareBestuurders = await pgQuery<{ id: number; volledige_naam: string | null }>(
    `select id, volledige_naam from public.ulu_users where actief order by volledige_naam nulls last`,
  )

  return (
    <>
      <PageHeader
        titel={`${voertuig.kenteken} — ${[voertuig.merk, voertuig.model].filter(Boolean).join(' ') || 'Onbekend'}`}
        omschrijving={`Status: ${voertuig.status}`}
        actions={
          <Link
            href="/wagenpark/voertuigen"
            className="inline-flex items-center gap-2 px-3 py-2 text-sm text-slate-600 hover:text-slate-900"
          >
            <ArrowLeft className="w-4 h-4" />
            Terug
          </Link>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Editable velden */}
        <section className="bg-white rounded-lg border p-5">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">Gegevens bewerken</h2>
          <VoertuigEditForm
            id={voertuig.id}
            kenteken={voertuig.kenteken}
            merk={voertuig.merk}
            model={voertuig.model}
            type={voertuig.type}
            kleur={voertuig.kleur}
            carrosserietype={voertuig.carrosserietype}
            bouwjaar={voertuig.bouwjaar}
            brandstof={voertuig.brandstof}
            opmerkingen={voertuig.opmerkingen}
          />
        </section>

        {/* Bestuurder koppeling */}
        <section className="bg-white rounded-lg border p-5">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">Toegewezen bestuurder</h2>
          <VoertuigBestuurderKoppeling
            voertuigId={voertuig.id}
            huidige={huidigeKoppeling[0] ?? null}
            beschikbaar={beschikbareBestuurders}
          />
        </section>

        {/* RDW */}
        <section className="bg-white rounded-lg border p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-slate-700">RDW-gegevens</h2>
            <RefreshRdwButton voertuigId={voertuig.id} kenteken={voertuig.kenteken} />
          </div>
          {!rdw ? (
            <p className="text-sm text-slate-500">
              Geen RDW-gegevens opgeslagen. Klik hierboven op "Refresh RDW" om ze op te halen.
            </p>
          ) : (
            <dl className="grid grid-cols-2 gap-y-2 text-sm">
              <dt className="text-slate-500">Brandstof</dt>
              <dd>{rdw.brandstof_omschrijving ?? '—'}</dd>
              <dt className="text-slate-500">Vervaldatum APK</dt>
              <dd
                className={
                  rdw.apk_vervaldatum &&
                  new Date(rdw.apk_vervaldatum).getTime() < Date.now() + 30 * 86_400_000
                    ? 'text-red-700 font-medium'
                    : ''
                }
              >
                {formatDatum(rdw.apk_vervaldatum)}
              </dd>
              <dt className="text-slate-500">Emissieklasse</dt>
              <dd>{rdw.milieuclassificatie ?? '—'}</dd>
              <dt className="text-slate-500">Catalogusprijs</dt>
              <dd>
                {rdw.catalogusprijs
                  ? `€ ${Number(rdw.catalogusprijs).toLocaleString('nl-NL', { minimumFractionDigits: 2 })}`
                  : '—'}
              </dd>
              <dt className="text-slate-500">Trekgewicht (geremd)</dt>
              <dd>{rdw.trekgewicht_geremd ? `${rdw.trekgewicht_geremd} kg` : '—'}</dd>
              <dt className="text-slate-500">Trekgewicht (ongeremd)</dt>
              <dd>{rdw.trekgewicht_ongeremd ? `${rdw.trekgewicht_ongeremd} kg` : '—'}</dd>
              <dt className="text-slate-500">Terugroepactie</dt>
              <dd
                className={rdw.terugroepactie_open ? 'text-red-700 font-medium' : ''}
                title={rdw.terugroepactie_status ?? undefined}
              >
                {rdw.terugroepactie_open
                  ? `Open — ${(rdw.terugroepactie_status ?? '').slice(0, 60)}${(rdw.terugroepactie_status ?? '').length > 60 ? '…' : ''}`
                  : rdw.laatst_opgehaald
                  ? 'Geen openstaande'
                  : '—'}
              </dd>
              <dt className="text-slate-500">WOK-status</dt>
              <dd className={rdw.wok_status ? 'text-orange-700 font-medium' : ''}>
                {rdw.wok_status ? 'Wacht op keuring' : 'Nee'}
              </dd>
              <dt className="text-slate-500">Massa ledig / max</dt>
              <dd>
                {rdw.massa_ledig_voertuig ?? '—'} / {rdw.toegestane_maximum_massa ?? '—'} kg
              </dd>
              <dt className="text-slate-500">Zitplaatsen</dt>
              <dd>{rdw.aantal_zitplaatsen ?? '—'}</dd>
              <dt className="text-slate-500">Eerste toelating</dt>
              <dd>{formatDatum(rdw.eerste_toelating)}</dd>
              <dt className="text-slate-500">Laatst opgehaald</dt>
              <dd>{formatDatum(rdw.laatst_opgehaald)}</dd>
            </dl>
          )}
        </section>

        {/* Lease */}
        <section className="bg-white rounded-lg border p-5">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">Leasecontracten</h2>
          {leases.length === 0 ? (
            <p className="text-sm text-slate-500">Geen actief leasecontract.</p>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Contractnummer</th>
                  <th>Start</th>
                  <th>Eind</th>
                  <th>Maandtermijn</th>
                </tr>
              </thead>
              <tbody>
                {leases.map((l) => (
                  <tr key={l.id}>
                    <td>{l.contractnummer ?? '—'}</td>
                    <td>{formatDatum(l.start_datum)}</td>
                    <td>{formatDatum(l.eind_datum)}</td>
                    <td>{l.maandtermijn_bedrag ? `€ ${l.maandtermijn_bedrag}` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {/* Laatste ritten */}
        <section className="bg-white rounded-lg border p-5 lg:col-span-2">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">
            Laatste 30 ritten
          </h2>
          {ritten.length === 0 ? (
            <p className="text-sm text-slate-500">Nog geen geïmporteerde ritten.</p>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Datum</th>
                  <th>Start</th>
                  <th>Bestuurder</th>
                  <th>Bestemming</th>
                  <th>Afstand</th>
                  <th>Type</th>
                  <th>Score</th>
                </tr>
              </thead>
              <tbody>
                {ritten.map((r) => (
                  <tr key={r.id}>
                    <td>{formatDatumMetDag(r.start_datum)}</td>
                    <td>{r.start_tijd?.slice(0, 5)}</td>
                    <td className="text-slate-700">{r.bestuurder_naam_raw ?? '—'}</td>
                    <td className="max-w-[260px] truncate">{r.adres_stop ?? '—'}</td>
                    <td>{formatKm(r.afstand_km ?? null, 1)}</td>
                    <td>
                      <span
                        className={
                          r.rit_type_berekend === 'prive'
                            ? 'text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600'
                            : 'text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700'
                        }
                      >
                        {r.rit_type_berekend}
                      </span>
                    </td>
                    <td
                      className={
                        r.score != null && r.score < 50
                          ? 'text-red-700 font-medium'
                          : r.score != null && r.score < 70
                          ? 'text-orange-700'
                          : ''
                      }
                    >
                      {r.score ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </>
  )
}
