import { Metadata } from 'next'
import RegistratieDetail from '@/components/houtrotherstel/registraties/RegistratieDetail'

export const metadata: Metadata = { title: 'Registratie' }

export default async function RegistratiePage({
  params,
}: {
  params: Promise<{ id: string; projectdeelId: string; locatieId: string; registratieId: string }>
}) {
  const { id, projectdeelId, locatieId, registratieId } = await params
  return (
    <RegistratieDetail
      projectId={id}
      projectdeelId={projectdeelId}
      locatieId={locatieId}
      registratieId={registratieId}
    />
  )
}
