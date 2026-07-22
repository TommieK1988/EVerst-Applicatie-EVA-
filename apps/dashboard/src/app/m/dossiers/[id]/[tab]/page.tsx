import { notFound, redirect } from 'next/navigation'
import { Suspense } from 'react'
import { getDossierById, getDossierToggles } from '@/lib/dossiers/actions'
import { TAB_TOGGLE_GATES } from '@/lib/dossiers/tab-gating'
import HoutrotView from '@/components/mobiel/dossier-tabs/HoutrotView'
import AppHeader from '@/components/mobiel/AppHeader'
import DossierInfoView, { type DossierInfo } from '@/components/mobiel/DossierInfoView'
import DossierActiesBlok from '@/components/mobiel/DossierActiesBlok'
import { getTakenVoorDossier } from '@/lib/taken/services/taken'
import DossierTabStrip, { DOSSIER_TABS, type DossierTabKey } from '@/components/mobiel/DossierTabStrip'
import { dossierStatusBadge } from '@/components/mobiel/dossier-status'
import DetailplanningView from '@/components/mobiel/dossier-tabs/DetailplanningView'
import VoortgangView from '@/components/mobiel/dossier-tabs/VoortgangView'
import FormulierenView from '@/components/mobiel/dossier-tabs/FormulierenView'
import BestandenView from '@/components/mobiel/dossier-tabs/BestandenView'
import OpleveringView from '@/components/mobiel/dossier-tabs/OpleveringView'

export const metadata = { title: 'Dossier · EVA Mobiel' }

const fmtDatum = (iso: string) =>
  new Date(iso).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })

const TabLaden = () => (
  <div style={{ textAlign: 'center', color: '#6b757c', padding: '40px 16px', fontSize: 14 }}>Laden…</div>
)

export default async function MobielDossierTabPage(
  { params }: { params: Promise<{ id: string; tab: string }> }
) {
  const { id, tab } = await params

  const geldig = DOSSIER_TABS.some(t => t.key === tab)
  if (!geldig) redirect(`/m/dossiers/${id}/informatie`)
  const actief = tab as DossierTabKey

  const res = await getDossierById(id)
  if (!res.ok) notFound()

  // Houtrot verschijnt alleen bij dossiers waar de toggle aanstaat.
  const toggles = await getDossierToggles(id).catch(() => [])
  const houtrotAan = toggles.some(t => t.sleutel === TAB_TOGGLE_GATES.houtrot && t.aan)
  if (actief === 'houtrot' && !houtrotAan) redirect(`/m/dossiers/${id}/informatie`)

  // Oplevering (Fase 9) hoort bij een opdracht, niet bij een aanvraag.
  const isOpdracht = (res.data as { hoofdstatus?: string }).hoofdstatus === 'opdracht'
  if (actief === 'oplevering' && !isOpdracht) redirect(`/m/dossiers/${id}/informatie`)

  // DossierRij bevat losjes-getypeerde Bouw7/werkadres-velden — zelfde aanpak als de desktop-tab.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d = res.data as Record<string, any>
  const { label } = dossierStatusBadge(res.data)
  const kop = d.dossiernummer ? `${d.dossiernummer}` : (d.titel ?? 'Dossier')

  return (
    <>
      <AppHeader title={kop} sub={d.titel ?? undefined} backHref="/m/dossiers" />
      <DossierTabStrip id={id} active={actief} houtrotAan={houtrotAan} isOpdracht={isOpdracht} />

      {actief === 'informatie' && (
        <>
          <InformatieTab d={d} statusLabel={label} />
          {/* Acties apart in Suspense: de takenquery mag de infokaarten niet ophouden. */}
          <Suspense fallback={null}><ActiesBlok dossierId={id} /></Suspense>
        </>
      )}
      {actief === 'houtrot' && <HoutrotView dossierId={id} />}
      {/* Ook planning in Suspense: zonder dat blokkeert de query de hele render,
          waardoor kopbalk én tabstrip pas verschijnen als de data binnen is. */}
      {actief === 'planning' && (
        <Suspense fallback={<TabLaden />}><DetailplanningView dossierId={id} /></Suspense>
      )}
      {actief === 'voortgang' && (
        <Suspense fallback={<TabLaden />}><VoortgangView dossierId={id} /></Suspense>
      )}
      {actief === 'oplevering' && (
        <Suspense fallback={<TabLaden />}><OpleveringView dossierId={id} /></Suspense>
      )}
      {actief === 'formulieren' && <FormulierenView dossierId={id} />}
      {actief === 'bestanden' && (
        <Suspense fallback={<TabLaden />}><BestandenView dossierId={id} /></Suspense>
      )}
    </>
  )
}

async function ActiesBlok({ dossierId }: { dossierId: string }) {
  const taken = await getTakenVoorDossier(dossierId).catch(() => [])
  return (
    <div style={{ padding: '0 16px 16px' }}>
      <DossierActiesBlok taken={taken} />
    </div>
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function InformatieTab({ d, statusLabel }: { d: Record<string, any>; statusLabel: string }) {
  const werkadres = [
    d.werkadres_straat,
    [d.werkadres_postcode, d.werkadres_stad].filter(Boolean).join(' '),
  ].filter(Boolean).join(', ') || null

  // Bewust kaal voor de buitendienst: geen bedragen, geen volledige rollenlijst.
  const info: DossierInfo = {
    titel: d.titel,
    dossiernummer: d.dossiernummer ?? null,
    statusLabel,
    statusColor: dossierStatusBadge(d as never).color,
    klant_naam: d.klant_naam ?? null,
    begindatum: d.verwacht_startdatum ? fmtDatum(d.verwacht_startdatum) : null,
    einddatum: d.verwacht_einddatum ? fmtDatum(d.verwacht_einddatum) : null,
    contact_naam: d.contactpersoon_naam ?? null,
    contact_telefoon: d.contactpersoon_telefoon ?? null,
    werkadres,
    uitvoerder: d.uitvoerder_naam ?? null,
    projectleider: d.projectleider_naam ?? null,
  }

  return <DossierInfoView info={info} />
}
