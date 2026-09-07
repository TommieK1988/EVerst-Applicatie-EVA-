import type { Metadata } from 'next'
import { DossierTabContent } from '@/components/dossiers/DossierTabContent'
import { dossierMetadata } from '@/lib/dossiers/paginatitel'
import { redirectOudeTab } from '@/lib/dossiers/oude-tabs'

export async function generateMetadata(props: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await props.params
  return dossierMetadata(id, 'Opdracht')
}

export default async function OpdrachtTabPage(props: {
  params: Promise<{ id: string; tab: string }>
  // `deel` kiest het onderdeel binnen een tab die er meerdere heeft (KAM/VGM).
  searchParams: Promise<{ deel?: string }>
}) {
  const [params, query] = await Promise.all([props.params, props.searchParams])
  redirectOudeTab('opdracht', params.id, params.tab)
  return <DossierTabContent id={params.id} tab={params.tab} sectie="opdracht" deel={query.deel} />
}
