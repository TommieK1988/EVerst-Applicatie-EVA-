import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { createAdminClient, createClient as createServerClient } from '@everts/database/server'
import { laadLayouts } from '@/app/actions/layouts'
import { vereisRecht } from '@/lib/auth/rechten'
import { getObject, getObjectDossiers, getObjectRelaties, getObjectTotalen } from '@/lib/objecten/data'
import ObjectDetailView from './ObjectDetailView'

export const metadata: Metadata = { title: 'Object' }

export default async function ObjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { rechten } = await vereisRecht('objectenbeheer', 'lezen')

  const { id } = await params
  const object = await getObject(id)
  if (!object) notFound()

  let user_id: string | null = null
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sessionClient = (await createServerClient()) as any
    const { data: { user } } = await sessionClient.auth.getUser()
    user_id = user?.id ?? null
  } catch {
    // niet ingelogd of sessie niet beschikbaar — de tabel valt terug op de standaardkolommen
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any
  const [dossiers, totalen, objectRelaties, relatiesRes, layouts] = await Promise.all([
    getObjectDossiers(id),
    getObjectTotalen(id),
    getObjectRelaties(id),
    supabase.from('relaties').select('id, naam, bouw7_id').eq('actief', true).order('naam', { ascending: true }),
    user_id ? laadLayouts(user_id, 'object-dossiers') : [],
  ])

  const relaties = ((relatiesRes.data ?? []) as { id: string; naam: string; bouw7_id: string | null }[])
    .map(r => ({ id: r.id, naam: r.naam, heeftBouw7: !!r.bouw7_id }))

  return (
    <ObjectDetailView
      object={object}
      dossiers={dossiers}
      totalen={totalen}
      objectRelaties={objectRelaties}
      relaties={relaties}
      magSchrijven={rechten.objectenbeheer === 'schrijven' || rechten.objectenbeheer === 'beheren'}
      layouts={layouts}
      user_id={user_id}
    />
  )
}
