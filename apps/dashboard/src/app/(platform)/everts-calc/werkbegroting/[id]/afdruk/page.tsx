import type { Metadata } from 'next'
import WerkbegrotingAfdruk from '@/components/everts-calc/werkbegroting/WerkbegrotingAfdruk'

export const metadata: Metadata = { title: 'Werkbegroting – Afdruk' }

export default async function WerkbegrotingAfdrukPage(
  props: {
    params: Promise<{ id: string }>
    searchParams: Promise<{ naam?: string; nummer?: string; opdrachtgever?: string }>
  }
) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  return (
    <WerkbegrotingAfdruk
      projectId={params.id}
      projectNaamFallback={searchParams.naam}
      projectNummerFallback={searchParams.nummer}
      opdrachtgeverFallback={searchParams.opdrachtgever}
    />
  )
}
