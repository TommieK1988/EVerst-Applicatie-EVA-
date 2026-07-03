import { createAdminClient } from '@everts/database/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import type {
  Medewerker,
  MedewerkerSkill,
  MedewerkerBedrijfsmiddel,
  MedewerkerAttribuutDefinitie,
  MedewerkerAttribuutWaarde,
  MedewerkerBestand,
  MedewerkerAfwezigheid,
  Bouw7VrijeDag,
  Bedrijfsgegevens,
  Relatie,
  MedewerkerFunctie,
  MedewerkerAfdeling,
  Ploeg,
  PlanningUursoort,
  CaoDocument,
  CaoLoonschaal,
} from '@everts/database/platform-types'
import type { RoosterMetPauzes } from '@/components/planning/RoosterBeheer'
import RoosterBeheer from '@/components/planning/RoosterBeheer'
import SkillBeheer from '@/components/planning/SkillBeheer'
import { PageHeader, Card, CardBody, Avatar } from '@/components/ui'
import MedewerkerGegevensForm from '@/components/medewerkers/MedewerkerGegevensForm'
import BedrijfsmiddelenBeheer from '@/components/medewerkers/BedrijfsmiddelenBeheer'
import CustomAttributenBeheer from '@/components/medewerkers/CustomAttributenBeheer'
import BestandenBeheer from '@/components/medewerkers/BestandenBeheer'
import HandtekeningBeheer from '@/components/medewerkers/HandtekeningBeheer'
import GebruikerToegangBeheer from '@/components/medewerkers/GebruikerToegangBeheer'
import VerlofOverzicht from '@/components/medewerkers/VerlofOverzicht'
import BestuurderKoppeling, { type BestuurderOptie } from '@/components/medewerkers/BestuurderKoppeling'
import { pgQuery } from '@/lib/wagenpark/db'

export async function generateMetadata(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any
  const { data } = await supabase
    .from('medewerkers')
    .select('voornaam, tussenvoegsel, achternaam')
    .eq('id', params.id)
    .maybeSingle()

  if (!data) return { title: 'Medewerker' }
  const naam = [data.voornaam, data.tussenvoegsel, data.achternaam].filter(Boolean).join(' ')
  return { title: naam }
}

export default async function MedewerkerDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any

  const [
    medewerkerRes,
    roosterRes,
    skillsRes,
    werkmaatschappijenRes,
    relatiesRes,
    bedrijfsmiddelenRes,
    attribuutDefRes,
    attribuutWaardenRes,
    bestandenRes,
    voertuigRes,
    functiesRes,
    afdelingenRes,
    caoDocumentenRes,
    caoSchalenRes,
    ploegenRes,
    uursoortenRes,
    afwezigheidRes,
    vrijeDagenRes,
  ] = await Promise.all([
    supabase.from('medewerkers').select('*').eq('id', params.id).maybeSingle(),
    supabase
      .from('medewerker_roosters')
      .select('*, medewerker_rooster_pauzes(*)')
      .eq('medewerker_id', params.id)
      .order('geldig_vanaf', { ascending: false }),
    supabase
      .from('medewerker_skills')
      .select('*')
      .eq('medewerker_id', params.id)
      .order('skill_naam', { ascending: true }),
    supabase
      .from('bedrijfsgegevens')
      .select('id, naam')
      .eq('type', 'werkmaatschappij')
      .order('naam'),
    supabase
      .from('relaties')
      .select('id, naam, types')
      .overlaps('types', ['leverancier', 'onderaannemer'])
      .eq('actief', true)
      .order('naam'),
    supabase
      .from('medewerker_bedrijfsmiddelen')
      .select('*')
      .eq('medewerker_id', params.id)
      .order('type'),
    supabase
      .from('medewerker_attribuut_definities')
      .select('*')
      .eq('actief', true)
      .order('volgorde'),
    supabase
      .from('medewerker_attribuut_waarden')
      .select('*')
      .eq('medewerker_id', params.id),
    supabase
      .from('medewerker_bestanden')
      .select('*')
      .eq('medewerker_id', params.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('voertuig_bestuurders')
      .select('voertuig_id, voertuigen(id, kenteken, merk, model)')
      .eq('medewerker_id', params.id)
      .is('eind_datum', null)
      .maybeSingle(),
    supabase.from('medewerker_functies').select('*').eq('actief', true).order('volgorde').order('naam'),
    supabase.from('medewerker_afdelingen').select('*').eq('actief', true).order('volgorde').order('naam'),
    supabase.from('cao_documenten').select('id, naam, werkmaatschappij_id').eq('actief', true).order('created_at', { ascending: false }),
    supabase.from('cao_loonschalen').select('*').order('volgorde'),
    supabase.from('ploegen').select('id, naam').eq('actief', true).order('volgorde').order('naam'),
    supabase.from('planning_uursoorten').select('id, naam').eq('actief', true).order('volgorde').order('naam'),
    supabase
      .from('medewerker_afwezigheid')
      .select('*')
      .eq('medewerker_id', params.id)
      .gte('start_datum', `${new Date().getFullYear() - 1}-01-01`)
      .order('start_datum', { ascending: false }),
    supabase
      .from('bouw7_vrije_dagen')
      .select('*')
      .order('start_datum', { ascending: false }),
  ])

  if (!medewerkerRes.data) notFound()

  const medewerker = medewerkerRes.data as Medewerker
  const roosters = ((roosterRes.data ?? []) as (RoosterMetPauzes & { medewerker_rooster_pauzes: unknown[] })[]).map(r => ({
    ...r,
    pauzes: r.medewerker_rooster_pauzes ?? [],
  })) as RoosterMetPauzes[]
  const skills = (skillsRes.data ?? []) as MedewerkerSkill[]
  const werkmaatschappijen = (werkmaatschappijenRes.data ?? []) as Pick<Bedrijfsgegevens, 'id' | 'naam'>[]
  const relaties = (relatiesRes.data ?? []) as Pick<Relatie, 'id' | 'naam' | 'types'>[]
  const functies = (functiesRes.data ?? []) as MedewerkerFunctie[]
  const afdelingen = (afdelingenRes.data ?? []) as MedewerkerAfdeling[]

  // Afdeling-standaard rechten voor deze medewerker (basis voor override-weergave)
  const afdelingStandaardRechten =
    afdelingen.find(a => a.naam === medewerker.afdeling)?.standaard_rechten ?? {}
  const caoDocumenten = (caoDocumentenRes.data ?? []) as Pick<CaoDocument, 'id' | 'naam' | 'werkmaatschappij_id'>[]
  const caoSchalen = (caoSchalenRes.data ?? []) as CaoLoonschaal[]
  const ploegen = (ploegenRes.data ?? []) as Pick<Ploeg, 'id' | 'naam'>[]
  const uursoorten = (uursoortenRes.data ?? []) as Pick<PlanningUursoort, 'id' | 'naam'>[]
  const bedrijfsmiddelen = (bedrijfsmiddelenRes.data ?? []) as MedewerkerBedrijfsmiddel[]
  const attribuutDefinities = (attribuutDefRes.data ?? []) as MedewerkerAttribuutDefinitie[]
  const attribuutWaarden = (attribuutWaardenRes.data ?? []) as MedewerkerAttribuutWaarde[]
  const bestanden = (bestandenRes.data ?? []) as MedewerkerBestand[]

  const voertuigKoppeling = voertuigRes.data?.voertuigen
    ? {
        voertuig_id: voertuigRes.data.voertuigen.id as string,
        kenteken:    voertuigRes.data.voertuigen.kenteken as string,
        merk:        voertuigRes.data.voertuigen.merk as string | null,
        model:       voertuigRes.data.voertuigen.model as string | null,
      }
    : null

  // Verlof: individuele afwezigheid + org-brede vrije dagen (recent of jaarlijks herhalend)
  const afwezigheid = (afwezigheidRes.data ?? []) as MedewerkerAfwezigheid[]
  const vorigJaarStart = `${new Date().getFullYear() - 1}-01-01`
  const vrijeDagen = ((vrijeDagenRes.data ?? []) as Bouw7VrijeDag[])
    .filter(v => v.herhaalt_jaarlijks || v.eind_datum >= vorigJaarStart)

  // Wagenpark-bestuurder (ulu_users) via de directe Postgres-pooler.
  // Bij ontbrekende DATABASE_URL breekt de kaart niet: het blok toont dan de fout.
  let bestuurderGekoppeld: BestuurderOptie | null = null
  let bestuurdersBeschikbaar: BestuurderOptie[] = []
  let bestuurderSuggestieId: string | null = null
  let bestuurderFout: string | null = null
  try {
    const [gekoppeldRows, beschikbaarRows] = await Promise.all([
      pgQuery<{ id: string; volledige_naam: string | null; email: string | null }>(
        'SELECT id::text AS id, volledige_naam, email FROM public.ulu_users WHERE medewerker_id = $1 LIMIT 1',
        [params.id],
      ),
      pgQuery<{ id: string; volledige_naam: string | null; email: string | null }>(
        'SELECT id::text AS id, volledige_naam, email FROM public.ulu_users WHERE actief AND medewerker_id IS NULL ORDER BY volledige_naam',
      ),
    ])
    bestuurderGekoppeld = gekoppeldRows[0] ?? null
    bestuurdersBeschikbaar = beschikbaarRows
    if (!bestuurderGekoppeld && medewerker.email) {
      const mail = medewerker.email.trim().toLowerCase()
      bestuurderSuggestieId = beschikbaarRows.find(b => b.email?.trim().toLowerCase() === mail)?.id ?? null
    }
  } catch (e: unknown) {
    bestuurderFout = e instanceof Error ? e.message : 'Onbekende fout'
  }

  const naam = [medewerker.voornaam, medewerker.tussenvoegsel, medewerker.achternaam]
    .filter(Boolean).join(' ')
  return (
    <div className="eva-page-full">
      {/* Breadcrumb */}
      <div style={{ marginBottom: 12 }}>
        <Link
          href="/medewerkers"
          style={{ fontSize: 11, color: 'var(--fg-muted)', textDecoration: 'none' }}
        >
          ← Medewerkers
        </Link>
      </div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
        <Avatar name={naam} src={medewerker.foto_url ?? undefined} size="lg" />
        <div style={{ flex: 1 }}>
          <PageHeader
            eyebrow={medewerker.extern ? 'Extern' : 'Intern'}
            title={naam}
            status={{
              label: medewerker.actief ? 'Actief' : 'Inactief',
              tone: medewerker.actief ? 'success' : 'neutral',
              dot: true,
            }}
          />
          <p className="eva-page-desc" style={{ marginTop: 2 }}>
            {[medewerker.functie, medewerker.afdeling].filter(Boolean).join(' · ')}
            {medewerker.email && ` · ${medewerker.email}`}
          </p>
        </div>
      </div>
      {/* Secties: 2 kolommen van 50%, vallen automatisch terug naar 1 kolom op smalle schermen */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(480px, 1fr))', gap: 16, marginTop: 28, alignItems: 'start' }}>

        {/* Linkerkolom */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>

          {/* Gegevens (persoonlijk + organisatie + tarieven) */}
          <Card>
            <CardBody>
              <MedewerkerGegevensForm
                medewerker={medewerker}
                werkmaatschappijen={werkmaatschappijen}
                relaties={relaties}
                functies={functies}
                afdelingen={afdelingen}
                ploegen={ploegen}
                uursoorten={uursoorten}
                caoDocumenten={caoDocumenten}
                caoSchalen={caoSchalen}
              />
            </CardBody>
          </Card>

          {/* Verlof & afwezigheid */}
          <Card>
            <CardBody>
              <VerlofOverzicht
                afwezigheid={afwezigheid}
                vrijeDagen={vrijeDagen}
              />
            </CardBody>
          </Card>
        </div>

        {/* Rechterkolom */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>

          {/* Toegang & gebruiker */}
          <Card>
            <CardBody>
              <GebruikerToegangBeheer
                medewerker_id={params.id}
                medewerker_email={medewerker.email}
                gebruiker_type={medewerker.gebruiker_type}
                auth_user_id={medewerker.auth_user_id}
                o365_email={medewerker.o365_email}
                rechten_override={medewerker.rechten_override}
                afdeling_standaard_rechten={afdelingStandaardRechten}
              />
            </CardBody>
          </Card>

          {/* Wagenpark-bestuurder */}
          <Card>
            <CardBody>
              <BestuurderKoppeling
                medewerker_id={params.id}
                gekoppeld={bestuurderGekoppeld}
                beschikbaar={bestuurdersBeschikbaar}
                suggestie_id={bestuurderSuggestieId}
                fout={bestuurderFout}
              />
            </CardBody>
          </Card>

          {/* Bedrijfsmiddelen */}
          <Card>
            <CardBody>
              <BedrijfsmiddelenBeheer
                medewerker_id={params.id}
                initial={bedrijfsmiddelen}
                actief_voertuig={voertuigKoppeling}
              />
            </CardBody>
          </Card>

          {/* Handtekening */}
          <Card>
            <CardBody>
              <HandtekeningBeheer
                medewerker_id={params.id}
                initial_url={medewerker.handtekening_url}
              />
            </CardBody>
          </Card>

          {/* Custom attributen */}
          {(attribuutDefinities.length > 0) && (
            <Card>
              <CardBody>
                <CustomAttributenBeheer
                  medewerker_id={params.id}
                  definities={attribuutDefinities}
                  initial_waarden={attribuutWaarden}
                />
              </CardBody>
            </Card>
          )}

          {/* Werkrooster */}
          <Card>
            <CardBody>
              <RoosterBeheer
                medewerker_id={params.id}
                initial={roosters}
              />
            </CardBody>
          </Card>

          {/* Skills */}
          <Card>
            <CardBody>
              <SkillBeheer
                medewerker_id={params.id}
                initial={skills.map(s => s.skill_naam)}
              />
            </CardBody>
          </Card>

          {/* Bestanden */}
          <Card>
            <CardBody>
              <BestandenBeheer
                medewerker_id={params.id}
                initial={bestanden}
              />
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}

