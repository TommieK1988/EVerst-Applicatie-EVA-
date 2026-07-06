'use client'
import { useRouter } from 'next/navigation'
import { DossierLijst } from '@/components/dossiers/DossierLijst'
import type { DossierRij, DossierSubstatus, StatusDef } from '@/components/dossiers/types'
import type { GebruikerLayout } from '@everts/database/platform-types'

/**
 * Eindstatussen die op de Afgesloten-tab voorkomen. Bepaalt label + badge-kleur in de statuskolom
 * (DossierLijst valt terug op de substatus-key wanneer een status hier niet in staat).
 */
const AFGESLOTEN_STATUSSEN: StatusDef<DossierSubstatus>[] = [
  { key: 'financieel_afgesloten' as DossierSubstatus, label: 'Financieel afgesloten' },
  { key: 'verloren' as DossierSubstatus,              label: 'Verloren'              },
  { key: 'vervallen' as DossierSubstatus,             label: 'Vervallen'             },
]

/** Route-segment per hoofdstatus zodat een gemengde lijst naar het juiste sectie-detail linkt. */
const HOOFDSTATUS_ROUTE: Record<string, string> = {
  aanvraag: 'aanvragen',
  offerte:  'offertes',
  opdracht: 'opdrachten',
}

type Props = {
  dossiers: DossierRij[]
  layouts: GebruikerLayout[]
  user_id: string | null
}

export function AfgeslotenLijst({ dossiers, layouts, user_id }: Props) {
  const router = useRouter()

  return (
    <DossierLijst
      scherm="dossiers-afgesloten"
      statussen={AFGESLOTEN_STATUSSEN}
      dossiers={dossiers}
      layouts={layouts}
      user_id={user_id}
      onDossierKlik={d => {
        const segment = HOOFDSTATUS_ROUTE[d.hoofdstatus] ?? 'opdrachten'
        router.push(`/${segment}/${d.id}/informatie`)
      }}
    />
  )
}
