import { notFound, redirect } from 'next/navigation'
import { Suspense } from 'react'
import { getDossierById, getDossierToggles } from '@/lib/dossiers/actions'
import { TAB_TOGGLE_GATES } from '@/lib/dossiers/tab-gating'
import HoutrotView from '@/components/mobiel/dossier-tabs/HoutrotView'
import AppHeader from '@/components/mobiel/AppHeader'
import DossierInfoView, { type DossierInfo } from '@/components/mobiel/DossierInfoView'
import DossierTabStrip, { DOSSIER_TABS, type DossierTabKey } from '@/components/mobiel/DossierTabStrip'
import { dossierStatusBadge } from '@/components/mobiel/dossier-status'
import DetailplanningView from '@/components/mobiel/dossier-tabs/DetailplanningView'
import KostengroepenView from '@/components/mobiel/dossier-tabs/KostengroepenView'
import FormulierenView from '@/components/mobiel/dossier-tabs/FormulierenView'
import BestandenView from '@/components/mobiel/dossier-tabs/BestandenView'

export const metadata = { title: 'Dossier · EVA Mobiel' }

const fmtDatum = (iso: string) =>
  new Date(iso).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })
const fmtBedrag = (v: number) =>
  new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 }).format(v)

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

  // DossierRij bevat losjes-getypeerde Bouw7/werkadres-velden — zelfde aanpak als de desktop-tab.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d = res.data as Record<string, any>
  const { label } = dossierStatusBadge(res.data)
  const kop = d.dossiernummer ? `${d.dossiernummer}` : (d.titel ?? 'Dossier')

  return (
    <>
      <AppHeader title={kop} sub={d.titel ?? undefined} backHref="/m/dossiers" />
      <DossierTabStrip id={id} active={actief} houtrotAan={houtrotAan} />

      {actief === 'informatie' && <InformatieTab d={d} statusLabel={label} />}
      {actief === 'houtrot' && <HoutrotView dossierId={id} />}
      {actief === 'planning' && <DetailplanningView dossierId={id} />}
      {actief === 'kostengroepen' && (
        <Suspense fallback={<TabLaden />}><KostengroepenView dossierId={id} /></Suspense>
      )}
      {actief === 'formulieren' && <FormulierenView dossierId={id} />}
      {actief === 'bestanden' && (
        <Suspense fallback={<TabLaden />}><BestandenView dossierId={id} /></Suspense>
      )}
    </>
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function InformatieTab({ d, statusLabel }: { d: Record<string, any>; statusLabel: string }) {
  const werkadres = [
    d.werkadres_straat,
    [d.werkadres_postcode, d.werkadres_stad].filter(Boolean).join(' '),
  ].filter(Boolean).join(', ') || null

  const info: DossierInfo = {
    titel: d.titel,
    dossiernummer: d.dossiernummer ?? null,
    statusLabel,
    statusColor: dossierStatusBadge(d as never).color,
    klant_naam: d.klant_naam ?? null,
    categorie: d.categorie ?? d.bouw7_categorie_naam ?? null,
    fase: statusLabel,
    begindatum: d.verwacht_startdatum ? fmtDatum(d.verwacht_startdatum) : null,
    einddatum: d.verwacht_einddatum ? fmtDatum(d.verwacht_einddatum) : null,
    referentie: d.referentie ?? null,
    contact_naam: d.contactpersoon_naam ?? null,
    contact_telefoon: d.contactpersoon_telefoon ?? null,
    contact_email: d.contactpersoon_email ?? null,
    werkadres,
    rollen: [
      { label: 'Projectleider', naam: d.projectleider_naam ?? null },
      { label: 'Uitvoerder', naam: d.uitvoerder_naam ?? null },
      { label: 'Werkvoorbereider', naam: d.werkvoorbereider_naam ?? null },
      { label: 'Calculator', naam: d.calculator_naam ?? null },
      { label: 'Teamleider', naam: d.teamleider_naam ?? null },
      { label: 'Controller', naam: d.controller_naam ?? null },
    ],
    aanneemsom: d.bedrag_excl_btw != null ? fmtBedrag(d.bedrag_excl_btw) : null,
    totaalIncl: d.bedrag_incl_btw != null ? fmtBedrag(d.bedrag_incl_btw) : null,
  }

  return <DossierInfoView info={info} />
}
