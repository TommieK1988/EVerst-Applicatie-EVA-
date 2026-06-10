import type { Metadata } from 'next'
import MeetstaaatHoofdscherm from '@/components/everts-calc/meetstaat/MeetstaaatHoofdscherm'
import { getSchilderDropdownData } from '@/lib/everts-calc/services/schilderwerk'

export const metadata: Metadata = { title: 'Meetstaat' }

export default async function MeetstaaatPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const schilderData = await getSchilderDropdownData().catch(
    () => ({ onderdelen: [], types: [], behandelingen: [], combinaties: [] })
  )

  return (
    <MeetstaaatHoofdscherm
      projectId={params.id}
      schilderData={schilderData}
    />
  )
}
