'use client'

import { useRouter } from 'next/navigation'
import NieuweTaakDialog from '@/components/taken/NieuweTaakDialog'
import type { DbTaskList } from '@/lib/taken/supabase/database.types'
import { useDossierReadOnly } from './DossierReadOnlyContext'

/** Tab-niveau "Nieuwe taak"-knop op de dossier Taken-tab: maakt standaard een losse
 *  taak gekoppeld aan het dossier, met optie om alsnog een actielijst te kiezen. */
export default function NieuweDossierTaakKnop({ dossier, lijsten }: {
  dossier: { id: string; titel: string }
  lijsten?: DbTaskList[]
}) {
  const router = useRouter()
  const readOnly = useDossierReadOnly()
  if (readOnly) return null
  return (
    <NieuweTaakDialog
      defaultDossier={dossier}
      lijsten={lijsten}
      onSuccess={() => router.refresh()}
    />
  )
}
