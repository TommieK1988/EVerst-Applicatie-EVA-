import { getDossierById, getMedewerkers, getFactuuradressen, getUniekeBouw7Categorieen } from '@/lib/dossiers/actions'
import { getRelatieById } from '@/lib/relaties/actions'
import { getSjablonen, getUrgenteTakenVoorDossier } from '@/lib/taken/services/taken'
import type { Relatie, RelatieFactuuradres } from '@everts/database'
import { InformatieTab } from './tabs/InformatieTab'
import ActielijstenTab from './tabs/ActielijstenTab'
import { AanvraagCalculatieTab } from '@/components/everts-calc/calculatie/AanvraagCalculatieTab'
import { OpdrachtWerkbegrotingTab } from '@/components/everts-calc/werkbegroting/OpdrachtWerkbegrotingTab'
import DossierPlanningTab from '@/components/planning/DossierPlanningTab'
import VcaTab from './tabs/VcaTab'
import { FinancieelTab } from './tabs/FinancieelTab'
import { BreadcrumbTitle } from './BreadcrumbTitle'
import type { DossierSectie } from './types'

const TAB_LABELS: Record<string, string> = {
  bestanden:     'Bestanden',
  calculatie:    'Calculatie',
  werkbegroting: 'Werkbegroting',
  planning:      'Planning',
  vca:           'VCA',
  inkoop:        'Inkoop',
  verkoop:       'Verkoop',
  meerwerk:      'Meerwerk',
  financieel:    'Financieel',
  formulieren:   'Formulieren',
}

type Props = { id: string; tab: string; sectie: DossierSectie }

export async function DossierTabContent({ id, tab, sectie }: Props) {
  const result = await getDossierById(id)
  const dossier = result.ok ? result.data : null

  const titleInjector = dossier ? <BreadcrumbTitle title={dossier.titel} /> : null

  if (tab === 'informatie' && dossier) {
    const [medewerkers, factuuradressen, relatie, sjablonen, urgenteTaken, categorieen] = await Promise.all([
      getMedewerkers(),
      dossier.klant_id ? getFactuuradressen(dossier.klant_id) : Promise.resolve<RelatieFactuuradres[]>([]),
      dossier.klant_id ? getRelatieById(dossier.klant_id) : Promise.resolve<Relatie | null>(null),
      getSjablonen(),
      getUrgenteTakenVoorDossier(id),
      getUniekeBouw7Categorieen(),
    ])

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

  if (tab === 'calculatie' && sectie === 'aanvraag') {
    return (
      <>
        {titleInjector}
        <AanvraagCalculatieTab
          aanvraagId={id}
          naam={dossier?.titel ?? 'Aanvraag'}
          nummer={dossier?.dossiernummer ?? ''}
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

  if (tab === 'vca') {
    return (
      <>
        {titleInjector}
        <VcaTab dossierId={id} />
      </>
    )
  }

  if (tab === 'financieel' && sectie === 'opdracht') {
    return (
      <>
        {titleInjector}
        <FinancieelTab dossierId={id} />
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
        border: '1px dashed var(--neutral-200, #e3e8ea)',
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
