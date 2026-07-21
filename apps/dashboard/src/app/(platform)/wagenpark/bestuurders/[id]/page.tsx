import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import PageHeader from '@/components/wagenpark/shared/PageHeader'
import BestuurderEditForm from '@/components/wagenpark/bestuurders/BestuurderEditForm'
import BestuurderBijtellingToggle from '@/components/wagenpark/bestuurders/BestuurderBijtellingToggle'
import BestuurderActiefToggle from '@/components/wagenpark/bestuurders/BestuurderActiefToggle'
import BevindingRij from '@/components/wagenpark/bevindingen/BevindingRij'
import KmPrognose from '@/components/wagenpark/bestuurders/KmPrognose'
import AllowancesPaneel, { type AllowanceRij } from '@/components/wagenpark/bestuurders/AllowancesPaneel'
import RitTypeToggle from '@/components/wagenpark/ritten/RitTypeToggle'
import MedewerkerKoppeling, { type MedewerkerOptie } from '@/components/wagenpark/bestuurders/MedewerkerKoppeling'
import { pgQuery } from '@/lib/wagenpark/db'
import { magPriveRittenZien, ritTypeEffectiefSql } from '@/lib/wagenpark/privacy'
import { signaalSoort } from '@/lib/wagenpark/signalen'
import { formatDatum, formatDatumMetDag, formatKm } from '@/lib/wagenpark/utils'

export const dynamic = 'force-dynamic'

type UluUserDetail = {
  id: number
  volledige_naam: string | null
  firstname: string | null
  lastname: string | null
  email: string | null
  actief: boolean
  bijtelling_betaald: boolean
  prive_limiet_km_jaar: number | null
  zakelijk_verwacht_km_jaar: number | null
  opmerkingen: string | null
  laatst_gezien: string | null
  werktijd_start: string | null
  werktijd_eind: string | null
}

type Koppeling = {
  id: string
  voertuig_id: string
  kenteken: string
  merk: string | null
  model: string | null
  start_datum: string
  eind_datum: string | null
}

type Rit = {
  id: string
  start_datum: string
  start_tijd: string
  stop_tijd: string | null
  kenteken: string
  afstand_km: number | null
  rit_type_berekend: 'zakelijk' | 'prive' | null
  rit_type_override: 'zakelijk' | 'prive' | null
  rit_type_handmatig: boolean
  score: number | null
  adres_stop: string | null
}

/** Eén blok met bevindingen van dezelfde soort. Leeg blok blijft staan als "alles in orde". */
function BevindingenBlok({
  titel,
  toelichting,
  bevindingen,
  leegTekst,
}: {
  titel: string
  toelichting: React.ReactNode
  bevindingen: BevindingRow[]
  leegTekst: string
}) {
  const open = bevindingen.filter((b) => b.status === 'open').length
  return (
    <section className="bg-white rounded-lg border lg:col-span-2">
      <div className="px-5 py-3 border-b">
        <h2 className="text-sm font-semibold text-slate-700">
          {titel}
          {open > 0 && (
            <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700">
              {open} open
            </span>
          )}
        </h2>
        <p className="text-xs text-slate-500 mt-1">{toelichting}</p>
      </div>
      {bevindingen.length === 0 ? (
        <p className="text-sm text-slate-500 p-5">{leegTekst}</p>
      ) : (
        <div className="divide-y">
          {bevindingen.map((b) => (
            <BevindingRij key={b.id} bevinding={b} />
          ))}
        </div>
      )}
    </section>
  )
}

type BevindingRow = {
  id: string
  regel_code: string
  voertuig_id: string | null
  medewerker_id: string | null
  trip_id: string | null
  periode_start: string | null
  periode_eind: string | null
  ernst: 'info' | 'waarschuwing' | 'overtreding'
  omschrijving: string
  data: unknown
  status: string
  gegenereerd_op: string
  bestuurder_naam: string | null
  kenteken: string | null
  ulu_user_id: number | null
}

export default async function BestuurderDetailPage(
  props: {
    params: Promise<{ id: string }>
    searchParams: Promise<{ type?: string }>
  }
) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const userId = Number(params.id)
  if (!Number.isFinite(userId)) notFound()
  const magPrive = await magPriveRittenZien()
  const gevraagdType = searchParams.type === 'zakelijk' || searchParams.type === 'prive'
    ? searchParams.type
    : 'alle'
  // Zonder privé-recht: nooit privé tonen — forceer naar zakelijk.
  const typeFilter = !magPrive && gevraagdType !== 'zakelijk' ? 'zakelijk' : gevraagdType
  const eff = ritTypeEffectiefSql('t')

  const users = await pgQuery<UluUserDetail>(
    `select id, volledige_naam, firstname, lastname, email, actief, bijtelling_betaald,
            prive_limiet_km_jaar, zakelijk_verwacht_km_jaar, opmerkingen, laatst_gezien::text,
            werktijd_start::text, werktijd_eind::text
       from public.ulu_users where id = $1 limit 1`,
    [userId],
  )
  const user = users[0]
  if (!user) notFound()

  const koppelingen = await pgQuery<Koppeling>(
    `select vb.id, vb.voertuig_id, v.kenteken, v.merk, v.model,
            vb.start_datum::text, vb.eind_datum::text
       from public.voertuig_bestuurders vb
       join public.voertuigen v on v.id = vb.voertuig_id
      where vb.ulu_user_id = $1
      order by vb.start_datum desc`,
    [userId],
  )

  const ritten = await pgQuery<Rit>(
    `select t.id, t.start_datum::text, t.start_tijd::text, t.stop_tijd::text,
            t.kenteken,
            t.afstand_km::float,
            t.rit_type_berekend::text,
            t.rit_type_override::text,
            t.rit_type_handmatig,
            t.score, t.adres_stop,
            (${eff})::text as rit_type_effectief
       from public.ulu_trips t
      where t.user_id_ulu = $1
        and ($2 = 'alle' or (${eff})::text = $2)
        and ($3::boolean or (${eff})::text = 'zakelijk')
      order by t.start_datum desc, t.start_tijd desc
      limit 100`,
    [userId, typeFilter, magPrive],
  )

  // Bevindingen voor deze bestuurder (via trip OF via data->>user_id_ulu).
  // Ook de R8-parkeersignalen: die hangen aan een parkeer-record en kennen alleen
  // een bestuurdersnaam, dus die matchen we op naam.
  const bevindingen = await pgQuery<BevindingRow>(
    `
    select b.id, b.regel_code, b.voertuig_id, b.medewerker_id, b.trip_id,
           b.periode_start::text, b.periode_eind::text,
           b.ernst::text as ernst, b.omschrijving, b.data,
           b.status::text as status, b.gegenereerd_op::text,
           (select uu.volledige_naam from public.ulu_users uu where uu.id = $1::bigint) as bestuurder_naam,
           coalesce(
             v.kenteken,
             (select t2.kenteken from public.ulu_trips t2 where t2.id = b.trip_id limit 1)
           ) as kenteken,
           $1::int as ulu_user_id
      from public.compliance_bevindingen b
      left join public.voertuigen v on v.id = b.voertuig_id
     where (
       (select t.user_id_ulu from public.ulu_trips t where t.id = b.trip_id limit 1) = $1
       or (b.data->>'user_id_ulu')::bigint = $1
       or (
         b.regel_code = 'R8'
         and b.data->>'bestuurder' is not null
         and (
           b.data->>'bestuurder' = (select uu.volledige_naam from public.ulu_users uu where uu.id = $1)
           -- ULU levert bij parkeren de ruwe naam uit de rit; die wijkt soms af van volledige_naam.
           or b.data->>'bestuurder' in (
             select distinct t5.bestuurder_naam_raw from public.ulu_trips t5
              where t5.user_id_ulu = $1 and t5.bestuurder_naam_raw is not null
           )
         )
       )
     )
     order by b.status = 'open' desc,
              coalesce(b.periode_eind, b.periode_start, b.gegenereerd_op::date) desc,
              b.gegenereerd_op desc
     limit 100
    `,
    [userId],
  )

  // Km-totalen en prognose
  const kmTotalen = await pgQuery<{
    km_zakelijk: number
    km_prive: number
    dagen_in_periode: number
  }>(
    `
    -- Gebruik effectief rit_type (override > berekend, verlof telt als privé).
    -- Privé km alleen meetellen als de gebruiker privé mag zien.
    select
      coalesce(sum(case when (${eff}) = 'zakelijk' then t.afstand_km else 0 end), 0)::float as km_zakelijk,
      coalesce(sum(case when $2::boolean and (${eff}) = 'prive' then t.afstand_km else 0 end), 0)::float as km_prive,
      coalesce(
        greatest(1, (current_date - min(t.start_datum) + 1))::int,
        greatest(1, (current_date - date_trunc('year', now())::date + 1))::int
      ) as dagen_in_periode
    from public.ulu_trips t
    where t.user_id_ulu = $1
      and t.start_datum >= date_trunc('year', now())::date
    `,
    [userId, magPrive],
  )
  const tot = kmTotalen[0] ?? { km_zakelijk: 0, km_prive: 0, dagen_in_periode: 1 }

  // Allowances voor deze bestuurder
  const allowances = await pgQuery<AllowanceRij>(
    `select id, regel_code, categorie, reden, aangemaakt_op::text
       from public.compliance_allowances
      where ulu_user_id = $1 and actief = true
      order by regel_code, categorie nulls first`,
    [userId],
  )
  // Medewerker-koppeling (spiegelbeeld van de koppeling op de medewerker-pagina)
  let medewerkerGekoppeld: MedewerkerOptie | null = null
  let medewerkersBeschikbaar: MedewerkerOptie[] = []
  let medewerkerSuggestieId: string | null = null
  let koppelingFout: string | null = null
  try {
    const [gekoppeldRows, beschikbaarRows] = await Promise.all([
      pgQuery<MedewerkerOptie>(
        `select m.id::text as id,
                trim(concat_ws(' ', m.voornaam, m.tussenvoegsel, m.achternaam)) as naam,
                m.email
           from public.ulu_users uu
           join public.medewerkers m on m.id = uu.medewerker_id
          where uu.id = $1
          limit 1`,
        [userId],
      ),
      pgQuery<MedewerkerOptie>(
        `select m.id::text as id,
                trim(concat_ws(' ', m.voornaam, m.tussenvoegsel, m.achternaam)) as naam,
                m.email
           from public.medewerkers m
          where m.actief = true
            and not exists (select 1 from public.ulu_users u where u.medewerker_id = m.id)
          order by naam`,
      ),
    ])
    medewerkerGekoppeld = gekoppeldRows[0] ?? null
    medewerkersBeschikbaar = beschikbaarRows
    if (!medewerkerGekoppeld && user.email) {
      const mail = user.email.trim().toLowerCase()
      medewerkerSuggestieId = beschikbaarRows.find((m) => m.email?.trim().toLowerCase() === mail)?.id ?? null
    }
  } catch (e: unknown) {
    koppelingFout = e instanceof Error ? e.message : 'Onbekende fout'
  }

  // Drie soorten signalen, drie blokken — zie lib/wagenpark/signalen.ts.
  // Rit-gebonden bevindingen staan primair in de signaal-kolom op de
  // ritten-pagina; hier alleen als naslag.
  const bevParkeren = bevindingen.filter((b) => signaalSoort(b.regel_code) === 'parkeren')
  const bevPersoonlijk = bevindingen.filter((b) => signaalSoort(b.regel_code) === 'persoonlijk')
  const bevRitten = bevindingen.filter((b) => signaalSoort(b.regel_code) === 'rit')

  const factor = 365 / tot.dagen_in_periode
  const prognoseZakelijk = Math.round(tot.km_zakelijk * factor)
  const prognosePrive = Math.round(tot.km_prive * factor)
  const targetZakelijk = user.zakelijk_verwacht_km_jaar ?? 12000
  const targetPrive = user.bijtelling_betaald
    ? (user.prive_limiet_km_jaar ?? 8000)
    : (user.prive_limiet_km_jaar ?? 500)

  return (
    <>
      <PageHeader
        titel={user.volledige_naam ?? `ULU #${user.id}`}
        omschrijving={user.email ?? ''}
        actions={
          <Link
            href="/wagenpark/bestuurders"
            className="inline-flex items-center gap-2 px-3 py-2 text-sm text-slate-600 hover:text-slate-900"
          >
            <ArrowLeft className="w-4 h-4" />
            Terug
          </Link>
        }
      />

      <div className="mb-6">
        <KmPrognose
          km_zakelijk={tot.km_zakelijk}
          km_prive={tot.km_prive}
          prognose_zakelijk={prognoseZakelijk}
          prognose_prive={prognosePrive}
          target_zakelijk={targetZakelijk}
          target_prive={targetPrive}
          dagen={tot.dagen_in_periode}
          bijtelling={user.bijtelling_betaald}
          verbergPrive={!magPrive}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="bg-white rounded-lg border p-5">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">Instellingen</h2>
          <div className="flex items-center gap-3 mb-4">
            <span className="text-xs text-slate-500 w-24">Bijtelling:</span>
            <BestuurderBijtellingToggle
              userId={user.id}
              initial={user.bijtelling_betaald}
              naam={user.volledige_naam ?? `ULU #${user.id}`}
            />
            <span className="text-xs text-slate-500 w-24 ml-4">Status:</span>
            <BestuurderActiefToggle
              userId={user.id}
              initial={user.actief}
              naam={user.volledige_naam ?? `ULU #${user.id}`}
            />
          </div>
          <BestuurderEditForm
            userId={user.id}
            priveLimiet={user.prive_limiet_km_jaar}
            zakelijkVerwacht={user.zakelijk_verwacht_km_jaar}
            opmerkingen={user.opmerkingen}
            werktijdStart={user.werktijd_start}
            werktijdEind={user.werktijd_eind}
          />
          <div className="bg-slate-50 rounded p-3 text-xs text-slate-500 mt-4 space-y-1">
            <div><strong>Uit ULU:</strong></div>
            <div>Naam: {user.firstname ?? ''} {user.lastname ?? ''}</div>
            <div>E-mail: {user.email ?? '—'}</div>
            <div>Laatst gezien: {formatDatum(user.laatst_gezien)}</div>
          </div>
          <MedewerkerKoppeling
            ulu_user_id={user.id}
            gekoppeld={medewerkerGekoppeld}
            beschikbaar={medewerkersBeschikbaar}
            suggestie_id={medewerkerSuggestieId}
            fout={koppelingFout}
          />
        </section>

        <section className="bg-white rounded-lg border p-5">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">Voertuig-koppelingen (historie)</h2>
          {koppelingen.length === 0 ? (
            <p className="text-sm text-slate-500">Nog geen koppelingen. Ga naar een voertuig-detailpagina om deze bestuurder te koppelen.</p>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Kenteken</th>
                  <th>Auto</th>
                  <th>Van</th>
                  <th>Tot</th>
                </tr>
              </thead>
              <tbody>
                {koppelingen.map((k) => (
                  <tr key={k.id}>
                    <td>
                      <Link href={`/voertuigen/${k.voertuig_id}`} className=" hover:underline">
                        {k.kenteken}
                      </Link>
                    </td>
                    <td>{[k.merk, k.model].filter(Boolean).join(' ')}</td>
                    <td>{formatDatum(k.start_datum)}</td>
                    <td>{k.eind_datum ? formatDatum(k.eind_datum) : <span className="text-green-700">actief</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {/* Allowances */}
        <section className="bg-white rounded-lg border p-5 lg:col-span-2">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">
            Persistente allowances ({allowances.length})
          </h2>
          <p className="text-xs text-slate-500 mb-3">
            Regels die voor deze bestuurder zijn gemarkeerd als "altijd toegestaan".
            Nieuwe matching bevindingen worden automatisch geaccepteerd.
          </p>
          <AllowancesPaneel allowances={allowances} />
        </section>

        {/* Signalen — per soort, want ze vragen om verschillende actie */}
        <BevindingenBlok
          titel="Privé-kilometers & rijgedrag"
          toelichting="Signalen over een hele periode: privé-km ten opzichte van de limiet en het rijgedrag per week. Ze horen bij deze bestuurder, niet bij één rit."
          bevindingen={bevPersoonlijk}
          leegTekst="Geen signalen over privé-kilometers of rijgedrag."
        />

        <BevindingenBlok
          titel="Parkeren"
          toelichting="Hoge parkeerkosten per transactie, extreem lang parkeren en het maandtotaal aan parkeerkosten. De onderliggende records staan op de parkeren-pagina."
          bevindingen={bevParkeren}
          leegTekst="Geen parkeersignalen voor deze bestuurder."
        />

        <BevindingenBlok
          titel="Signalen op losse ritten"
          toelichting={
            <>
              Deze signalen hangen aan één rit en handel je normaal af vanuit de{' '}
              <Link href="/wagenpark/ritten" className="text-green-700 hover:underline">
                signaal-kolom op de ritten-pagina
              </Link>
              . Hier staan ze als naslag bij elkaar.
            </>
          }
          bevindingen={bevRitten}
          leegTekst="Geen openstaande signalen op losse ritten."
        />

        <section className="bg-white rounded-lg border lg:col-span-2">
          <div className="px-5 py-3 border-b flex items-center justify-between flex-wrap gap-2">
            <h2 className="text-sm font-semibold text-slate-700">
              Ritten ({ritten.length}{ritten.length === 100 ? ' van 100+' : ''})
            </h2>
            <div className="flex gap-2 text-xs">
              <a
                href={`/bestuurders/${userId}`}
                className={typeFilter === 'alle'
                  ? 'px-3 py-1 rounded-full bg-slate-900 text-white'
                  : 'px-3 py-1 rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200'}
              >
                Alle
              </a>
              <a
                href={`/bestuurders/${userId}?type=zakelijk`}
                className={typeFilter === 'zakelijk'
                  ? 'px-3 py-1 rounded-full bg-green-600 text-white'
                  : 'px-3 py-1 rounded-full bg-green-50 text-green-700 hover:bg-green-100'}
              >
                Alleen zakelijk
              </a>
              {magPrive && (
                <a
                  href={`/bestuurders/${userId}?type=prive`}
                  className={typeFilter === 'prive'
                    ? 'px-3 py-1 rounded-full bg-slate-900 text-white'
                    : 'px-3 py-1 rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200'}
                >
                  Alleen privé
                </a>
              )}
            </div>
          </div>

          <div className="px-5 py-2 text-xs text-slate-500 bg-slate-50 border-b">
            Klik op het <strong>type</strong>-badge om een rit handmatig van zakelijk ↔ privé te
            wisselen. Overrides blijven behouden bij volgende syncs. Een punt (●) duidt op een
            handmatige correctie; via <em>reset</em> ga je terug naar de automatische classificatie.
          </div>

          {ritten.length === 0 ? (
            <p className="text-sm text-slate-500 p-5">
              {typeFilter === 'alle'
                ? 'Geen ritten geïmporteerd voor deze bestuurder.'
                : `Geen ${typeFilter}-ritten met deze filter.`}
            </p>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Datum</th>
                  <th>Start</th>
                  <th>Einde rit</th>
                  <th>Kenteken</th>
                  <th>Bestemming</th>
                  <th>Afstand</th>
                  <th>Type</th>
                  <th>Score</th>
                </tr>
              </thead>
              <tbody>
                {ritten.map((r) => {
                  const effectief = (r.rit_type_override ?? r.rit_type_berekend) as 'zakelijk' | 'prive' | null
                  return (
                    <tr key={r.id}>
                      <td>{formatDatumMetDag(r.start_datum)}</td>
                      <td>{r.start_tijd.slice(0, 5)}</td>
                      <td>{r.stop_tijd ? r.stop_tijd.slice(0, 5) : '—'}</td>
                      <td className="">{r.kenteken}</td>
                      <td className="max-w-[240px] truncate">{r.adres_stop ?? '—'}</td>
                      <td>{formatKm(r.afstand_km, 1)}</td>
                      <td>
                        <RitTypeToggle
                          tripId={r.id}
                          initialType={effectief}
                          initialHandmatig={r.rit_type_handmatig}
                        />
                      </td>
                      <td className={
                        r.score != null && r.score < 50 ? 'text-red-700 font-medium'
                        : r.score != null && r.score < 70 ? 'text-orange-700' : ''
                      }>
                        {r.score ?? '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </>
  )
}
