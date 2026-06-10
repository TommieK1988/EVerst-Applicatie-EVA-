import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { getActielijst, getDossierRedirectUrlVoorLijst } from '@/lib/taken/services/taken'
import ActielijstDetail from '@/components/taken/ActielijstDetail'

export const metadata: Metadata = { title: 'Actielijst' }

interface Props {
  params: Promise<{ id: string }>
}

export default async function ActielijstDetailPage(props: Props) {
  const params = await props.params;
  const lijst = await getActielijst(params.id)
  if (!lijst) notFound()

  // Niet-sjabloon lijsten horen bij een dossier → redirect naar dossier Taken-tab
  if (!lijst.is_template) {
    const redirectUrl = await getDossierRedirectUrlVoorLijst(params.id)
    if (redirectUrl) redirect(redirectUrl)
  }

  return <ActielijstDetail lijst={lijst} />
}
