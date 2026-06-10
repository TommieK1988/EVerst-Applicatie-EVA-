import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getParticulierById } from '@/lib/relaties/particulieren-actions'
import ParticulierDetailView from './ParticulierDetailView'

export async function generateMetadata(props: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const params = await props.params
  const p = await getParticulierById(params.id)
  if (!p) return { title: 'Particulier' }
  return { title: `${p.voornaam} ${p.achternaam}` }
}

export default async function ParticulierDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  const particulier = await getParticulierById(params.id)
  if (!particulier) notFound()

  return <ParticulierDetailView particulier={particulier} />
}
