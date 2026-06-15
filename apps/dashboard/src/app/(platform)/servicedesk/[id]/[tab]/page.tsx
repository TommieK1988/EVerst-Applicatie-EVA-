import type { Metadata } from 'next'
import { DossierTabContent } from '@/components/dossiers/DossierTabContent'

export const metadata: Metadata = { title: 'Servicedesk' }

export default async function ServicedeskTabPage(props: { params: Promise<{ id: string; tab: string }> }) {
  const params = await props.params;
  return <DossierTabContent id={params.id} tab={params.tab} sectie="servicedesk" />
}
