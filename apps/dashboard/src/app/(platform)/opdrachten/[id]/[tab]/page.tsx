import type { Metadata } from 'next'
import { DossierTabContent } from '@/components/dossiers/DossierTabContent'

export const metadata: Metadata = { title: 'Opdracht' }

export default async function OpdrachtTabPage(props: { params: Promise<{ id: string; tab: string }> }) {
  const params = await props.params;
  return <DossierTabContent id={params.id} tab={params.tab} sectie="opdracht" />
}
