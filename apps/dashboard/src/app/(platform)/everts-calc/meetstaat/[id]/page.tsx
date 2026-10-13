import type { Metadata } from 'next'
import MeetstaaatHoofdscherm from '@/components/everts-calc/meetstaat/MeetstaaatHoofdscherm'
import { getSchilderDropdownData } from '@/lib/everts-calc/services/schilderwerk'

export const metadata: Metadata = { title: 'Meetstaat' }

export default async function MeetstaaatPage(props: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ naam?: string; nummer?: string; terug?: string }>
}) {
  const params = await props.params;
  // Naam en nummer reizen mee vanuit de calculatie; ze staan op de afdruk en in de kop.
  const { naam, nummer, terug } = await props.searchParams
  // Alleen een pad binnen EVA, zodat de terugknop nooit naar een externe site wijst.
  const veiligTerug = /^\/(?![/\\])/.test(terug ?? '') ? terug : undefined
  const schilderData = await getSchilderDropdownData().catch(
    () => ({ onderdelen: [], types: [], behandelingen: [], combinaties: [] })
  )

  return (
    <MeetstaaatHoofdscherm
      projectId={params.id}
      schilderData={schilderData}
      printKop={{ naam, nummer }}
      terug={veiligTerug}
    />
  )
}
