import { Suspense } from 'react'
import { getDossierById, getMedewerkers, getFactuuradressen, getUniekeBouw7Categorieen, getDossierToggles, getDossierFinancieel, getWerkmaatschappijen } from '@/lib/dossiers/actions'
import { getDossierNotities } from '@/lib/dossiers/notities-actions'
import { getDossierDatums } from '@/lib/dossiers/datums'
import { LEGE_DOSSIER_DATUMS } from '@/lib/dossiers/datum-regels'
import { getCurrentMedewerker } from '@/lib/auth/rechten'
import { getGoedgekeurdMeerwerkExcl } from '@/lib/dossiers/meerwerk'
import { getOpdrachtOverzicht } from '@/lib/dossiers/opdracht-onderdelen'
import { TAB_TOGGLE_GATES } from '@/lib/dossiers/tab-gating'
import { getRelatieById } from '@/lib/relaties/actions'
import { getSjablonen, getUrgenteTakenVoorDossier } from '@/lib/taken/services/taken'
import type { Relatie, RelatieFactuuradres } from '@everts/database'
import { InformatieTab } from './tabs/InformatieTab'
import ActielijstenTab from './tabs/ActielijstenTab'
import { AanvraagCalculatieTab } from '@/components/everts-calc/calculatie/AanvraagCalculatieTab'
import { OpdrachtCalculatieTab } from '@/components/everts-calc/calculatie/OpdrachtCalculatieTab'
import { getQuotesVoorDossier } from '@/lib/everts-calc/services/quotes'
import { OpdrachtWerkbegrotingTab } from '@/components/everts-calc/werkbegroting/OpdrachtWerkbegrotingTab'
import DossierPlanningTab from '@/components/planning/DossierPlanningTab'
import VcaTab from './tabs/VcaTab'
import HoutrotTab from './tabs/HoutrotTab'
import { FinancieelTab } from './tabs/FinancieelTab'
import { InkoopTab } from './tabs/InkoopTab'
import { VerkoopTab } from './tabs/VerkoopTab'
import { UrenTab } from './tabs/UrenTab'
import MeerwerkTab from './tabs/MeerwerkTab'
import OpleveringTab from './tabs/OpleveringTab'
import BestandenTab from './tabs/BestandenTab'
import { DossierTabSkeleton } from './DossierTabSkeleton'
import { BreadcrumbTitle } from './BreadcrumbTitle'
import { DossierReadOnlyProvider } from './DossierReadOnlyContext'
import { isDossierAfgesloten } from './types'
import type { DossierSectie, DossierRij } from './types'

const TAB_LABELS: Record<string, string> = {
  bestanden:     'Bestanden',
  calculatie:    'Calculatie',
  werkbegroting: 'Werkbegroting',
  planning:      'Planning',
  vca:           'VCA',
  houtrot:       'Houtrot',
  inkoop:        'Inkoop',
  verkoop:       'Verkoop',
  uren:          'Uren',
  meerwerk:      'Meerwerk',
  oplevering:    'Oplevering',
  financieel:    'Financieel',
  formulieren:   'Formulieren',
}

type Props = { id: string; tab: string; sectie: DossierSectie }

/** Alleen-lezen banner voor afgesloten/vervallen/verloren dossiers. */
function AfgeslotenBanner() {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '9px 32px', fontSize: 12.5, fontWeight: 600,
      color: 'var(--neutral-700, #3a444c)',
      background: 'var(--neutral-100, #eef1f2)',
      borderBottom: '1px solid var(--border)',
    }}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
      Dit dossier is afgesloten en alleen-lezen — er kan niets meer worden gewijzigd.
    </div>
  )
}

export async function DossierTabContent({ id, tab, sectie }: Props) {
  const result = await getDossierById(id)
  const dossier = result.ok ? result.data : null
  const readOnly = dossier ? isDossierAfgesloten(dossier) : false

  return (
    <DossierReadOnlyProvider value={readOnly}>
      {readOnly && <AfgeslotenBanner />}
      {await renderTabContent({ id, tab, sectie }, dossier)}
    </DossierReadOnlyProvider>
  )
}

async function renderTabContent({ id, tab, sectie }: Props, dossier: DossierRij | null) {
  const titleInjector = dossier ? <BreadcrumbTitle title={dossier.titel} /> : null

  if (tab === 'informatie' && dossier) {
    const [medewerkers, factuuradressen, relatie, sjablonen, urgenteTaken, categorieen, financieel, meerwerkEva, notities, currentMedewerker, werkmaatschappijen, datums, opdrachtOverzicht] = await Promise.all([
      getMedewerkers(),
      dossier.klant_id ? getFactuuradressen(dossier.klant_id) : Promise.resolve<RelatieFactuuradres[]>([]),
      dossier.klant_id ? getRelatieById(dossier.klant_id) : Promise.resolve<Relatie | null>(null),
      getSjablonen('dossier'),
      getUrgenteTakenVoorDossier(id),
      getUniekeBouw7Categorieen(),
      // Goedgekeurd meerwerk komt live uit Bouw7; alleen ophalen bij gekoppeld dossier.
      dossier.bouw7_id ? getDossierFinancieel(id).catch(() => null) : Promise.resolve(null),
      // EVA-native meerwerkregels (leidend zodra er goedgekeurde regels zijn).
      getGoedgekeurdMeerwerkExcl(id).catch(() => 0),
      getDossierNotities(id).catch(() => []),
      getCurrentMedewerker().catch(() => null),
      getWerkmaatschappijen().catch(() => []),
      // Procesdatums (aanvraag → financieel gereed) voor het Projectinformatie-blok.
      getDossierDatums(id).catch(() => LEGE_DOSSIER_DATUMS),
      // Opdracht-samenstelling (stelposten/opties + bewaking) — alleen voor opdracht-dossiers.
      sectie === 'opdracht' ? getOpdrachtOverzicht(id).catch(() => null) : Promise.resolve(null),
    ])

    // EVA-regels zijn leidend voor het meerwerk in het contracttotaal; bij afwezigheid van EVA-regels
    // valt het terug op het losse Bouw7-aggregaat (additionalWork.prognosis == .expected).
    const aw = financieel?.bouw7Financial?.additionalWork
    const meerwerkBouw7 = Number(aw?.prognosis ?? aw?.expected) || 0
    const meerwerk = meerwerkEva > 0 ? meerwerkEva : meerwerkBouw7

    return (
      <>
        {titleInjector}
        <InformatieTab
          dossier={dossier}
          sectie={sectie}
          medewerkers={medewerkers}
          factuuradressen={factuuradressen}
          relatie={relatie}
          sjablonen={sjablonen}
          urgenteTaken={urgenteTaken}
          categorieen={categorieen}
          meerwerk={meerwerk}
          notities={notities}
          currentMedewerkerId={currentMedewerker?.id ?? null}
          werkmaatschappijen={werkmaatschappijen}
          datums={datums}
          opdrachtOverzicht={opdrachtOverzicht}
        />
      </>
    )
  }

  if (tab === 'werkbegroting' && sectie === 'opdracht') {
    return (
      <>
        {titleInjector}
        <OpdrachtWerkbegrotingTab
          aanvraagId={id}
          naam={dossier?.titel ?? 'Opdracht'}
          nummer={dossier?.dossiernummer ?? ''}
        />
      </>
    )
  }

  // Opdracht: tabel met alle gekoppelde calculaties/offertes (incl. meerwerk) i.p.v.
  // de embedded calculatie-omgeving; die is via "Calculatie openen" alsnog bereikbaar.
  if (tab === 'calculatie' && sectie === 'opdracht') {
    const { projectId, projectAangemaakt, rijen } = await getQuotesVoorDossier(id)
      .catch(() => ({ projectId: null, projectAangemaakt: null, rijen: [] }))
    return (
      <>
        {titleInjector}
        <OpdrachtCalculatieTab
          dossierId={id}
          naam={dossier?.titel ?? 'Opdracht'}
          nummer={dossier?.dossiernummer ?? ''}
          clientNaam={dossier?.klant_naam ?? ''}
          projectId={projectId}
          projectAangemaakt={projectAangemaakt}
          rijen={rijen}
        />
      </>
    )
  }

  if (tab === 'calculatie' && (sectie === 'aanvraag' || sectie === 'offerte' || sectie === 'servicedesk')) {
    const { rijen } = await getQuotesVoorDossier(id).catch(() => ({ rijen: [] }))
    return (
      <>
        {titleInjector}
        <AanvraagCalculatieTab
          aanvraagId={id}
          naam={dossier?.titel ?? 'Aanvraag'}
          nummer={dossier?.dossiernummer ?? ''}
          clientNaam={dossier?.klant_naam ?? ''}
          initieelProjectId={(dossier as any)?.everts_calc_project_id ?? null}
          rijen={rijen}
        />
      </>
    )
  }

  if (tab === 'planning') {
    return (
      <>
        {titleInjector}
        <DossierPlanningTab dossier_id={id} />
      </>
    )
  }

  if (tab === 'taken') {
    return (
      <>
        {titleInjector}
        <ActielijstenTab dossier_id={id} dossier_titel={dossier?.titel} />
      </>
    )
  }

  if (tab === 'houtrot' && sectie === 'opdracht') {
    // Alleen bij een opdracht-dossier én wanneer de houtrot-toggle aanstaat; anders
    // valt de render door naar de generieke "niet beschikbaar"-weergave hieronder.
    const toggles = await getDossierToggles(id)
    const houtrotAan = toggles.some(t => t.sleutel === TAB_TOGGLE_GATES.houtrot && t.aan)
    if (houtrotAan) {
      return (
        <>
          {titleInjector}
          <HoutrotTab dossierId={id} />
        </>
      )
    }
  }

  if (tab === 'vca') {
    // Alleen tonen wanneer de VCA-toggle voor dit dossier aanstaat; anders valt
    // de render door naar de generieke "niet beschikbaar"-weergave hieronder.
    const toggles = await getDossierToggles(id)
    const vcaAan = toggles.some(t => t.sleutel === TAB_TOGGLE_GATES.vca && t.aan)
    if (vcaAan) {
      return (
        <>
          {titleInjector}
          <VcaTab dossierId={id} />
        </>
      )
    }
  }

  // De onderstaande tabs halen hun data live uit Bouw7. Ze zitten elk in een
  // <Suspense> zodat de pagina-shell + tabbalk meteen renderen en de (soms trage)
  // Bouw7-data daarna instreamt — een sloom Bouw7 blokkeert de navigatie niet meer.
  if (tab === 'financieel' && (sectie === 'opdracht' || sectie === 'servicedesk')) {
    return (
      <>
        {titleInjector}
        <Suspense fallback={<DossierTabSkeleton />}>
          <FinancieelTab dossierId={id} sectie={sectie} />
        </Suspense>
      </>
    )
  }

  // Inkoop/Verkoop zijn voor servicedesk samengevoegd in het Financieel-tab; alleen opdracht houdt ze los.
  if (tab === 'inkoop' && sectie === 'opdracht') {
    return (
      <>
        {titleInjector}
        <Suspense fallback={<DossierTabSkeleton />}>
          <InkoopTab dossierId={id} />
        </Suspense>
      </>
    )
  }

  if (tab === 'verkoop' && sectie === 'opdracht') {
    return (
      <>
        {titleInjector}
        <Suspense fallback={<DossierTabSkeleton />}>
          <VerkoopTab dossierId={id} />
        </Suspense>
      </>
    )
  }

  if (tab === 'uren' && sectie === 'opdracht') {
    return (
      <>
        {titleInjector}
        <Suspense fallback={<DossierTabSkeleton />}>
          <UrenTab dossierId={id} />
        </Suspense>
      </>
    )
  }

  if (tab === 'meerwerk' && sectie === 'opdracht') {
    return (
      <>
        {titleInjector}
        <Suspense fallback={<DossierTabSkeleton />}>
          <MeerwerkTab
            dossierId={id}
            naam={dossier?.titel ?? 'Meerwerk'}
            nummer={dossier?.dossiernummer ?? ''}
            clientNaam={dossier?.klant_naam ?? ''}
          />
        </Suspense>
      </>
    )
  }

  if (tab === 'oplevering' && sectie === 'opdracht') {
    return (
      <>
        {titleInjector}
        <OpleveringTab dossierId={id} />
      </>
    )
  }

  if (tab === 'bestanden') {
    return (
      <>
        {titleInjector}
        <Suspense fallback={<DossierTabSkeleton />}>
          <BestandenTab dossierId={id} />
        </Suspense>
      </>
    )
  }

  const tabLabel = tab === 'informatie' ? 'Informatie' : (TAB_LABELS[tab] ?? tab)

  return (
    <div style={{ padding: 'var(--page-pad-y, 28px) var(--page-pad-x, 32px)', maxWidth: 800 }}>
      {titleInjector}
      {dossier ? (
        <div style={{ marginBottom: 32 }}>
          <div style={{ fontSize: 10.5, color: 'var(--neutral-500, #6b757c)', fontWeight: 700, marginBottom: 4, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            {dossier.dossiernummer}
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--neutral-900, #161b20)', margin: 0, letterSpacing: '-0.02em', lineHeight: 1.1 }}>
            {dossier.titel}
          </h1>
          <div style={{ fontSize: 13, color: 'var(--neutral-500, #6b757c)', marginTop: 6, fontWeight: 500 }}>
            {dossier.klant_naam}
          </div>
        </div>
      ) : (
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--neutral-900, #161b20)', margin: 0, letterSpacing: '-0.02em', lineHeight: 1.1 }}>Dossier #{id}</h1>
        </div>
      )}

      <div style={{
        padding: '32px 28px',
        border: '1px dashed var(--border)',
        borderRadius: 10,
        background: 'var(--neutral-50, #f8fafa)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
        color: 'var(--neutral-500, #6b757c)',
      }}>
        <div style={{ fontSize: 28, opacity: 0.4 }}>◻</div>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--neutral-800, #232a30)' }}>{tabLabel}</div>
        <div style={{ fontSize: 12, fontWeight: 500, textAlign: 'center', maxWidth: 300 }}>
          Dit onderdeel wordt gevuld zodra de dossiers-tabel actief is.
        </div>
      </div>
    </div>
  )
}
