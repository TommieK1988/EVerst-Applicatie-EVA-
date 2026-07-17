import type { Metadata } from 'next'
import { createClient as createServerClient } from '@everts/database/server'
import { vereisModuleToegang } from '@/lib/auth/rechten'
import { laadLayouts } from '@/app/actions/layouts'
import { getFormTakenVoorActieveDossiers } from '../actions'
import FormulierenActieveDossiers from '@/components/formulieren/FormulierenActieveDossiers'

export const metadata: Metadata = { title: 'Formulieren — Overzicht' }

export default async function FormulierenOverzichtPage() {
  await vereisModuleToegang('formulieren')

  let user_id: string | null = null
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sessionClient = (await createServerClient()) as any
    const { data: { user } } = await sessionClient.auth.getUser()
    user_id = user?.id ?? null
  } catch {
    // niet ingelogd of session unavailable
  }

  const [data, layouts] = await Promise.all([
    getFormTakenVoorActieveDossiers(),
    user_id ? laadLayouts(user_id, 'formulieren-overzicht') : [],
  ])

  return <FormulierenActieveDossiers data={data} layouts={layouts} user_id={user_id} />
}
