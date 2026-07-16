import { notFound } from 'next/navigation'
import { createAdminClient } from '@everts/database/server'
import type { MaterieelObject } from '@/lib/materieel/types'
import MaterieelForm from '@/components/materieel/MaterieelForm'

export const dynamic = 'force-dynamic'

export default async function MaterieelBewerkenPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any
  const { data } = await supabase.from('materieel_objecten').select('*').eq('id', id).maybeSingle()
  if (!data) notFound()
  return <MaterieelForm bestaand={data as MaterieelObject} />
}
