import type { Metadata } from 'next'
import { DossierTabContent } from '@/components/dossiers/DossierTabContent'
import { dossierMetadata } from '@/lib/dossiers/paginatitel'

export async function generateMetadata(props: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await props.params
  return dossierMetadata(id, 'Offerte')
}

export default async function OfferteTabPage(props: { params: Promise<{ id: string; tab: string }> }) {
  const params = await props.params;
  return <DossierTabContent id={params.id} tab={params.tab} sectie="offerte" />
}
