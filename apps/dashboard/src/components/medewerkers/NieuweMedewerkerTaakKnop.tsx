'use client'

import { useRouter } from 'next/navigation'
import NieuweTaakDialog from '@/components/taken/NieuweTaakDialog'
import type { DbTaskList } from '@/lib/taken/supabase/database.types'

/** "Nieuwe taak"-knop op de medewerkerpagina: maakt standaard een losse taak
 *  gekoppeld aan de medewerker, met optie om alsnog een actielijst te kiezen. */
export default function NieuweMedewerkerTaakKnop({ medewerker, lijsten }: {
  medewerker: { id: string; naam: string }
  lijsten?: DbTaskList[]
}) {
  const router = useRouter()
  return (
    <NieuweTaakDialog
      defaultMedewerker={medewerker}
      lijsten={lijsten}
      onSuccess={() => router.refresh()}
    />
  )
}
