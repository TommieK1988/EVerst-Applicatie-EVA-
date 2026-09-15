import { notFound } from 'next/navigation'
import { PageHeader, Card, CardBody } from '@/components/ui'
import { vereisHandboekBeheerPagina } from '@/lib/handboek/auth'
import {
  haalBeheerContacten, haalBeheerSectie, haalPopulatie, haalWerkmaatschappijKenmerken,
} from '@/lib/handboek/beheer'
import SectieEditor from '@/components/handboek/beheer/SectieEditor'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ sectieId: string }> }) {
  const { sectieId } = await params
  const sectie = await haalBeheerSectie(sectieId)
  return { title: sectie?.titel ?? 'Handboek' }
}

export default async function Page({ params }: { params: Promise<{ sectieId: string }> }) {
  await vereisHandboekBeheerPagina('lezen')
  const { sectieId } = await params

  const [sectie, werkmaatschappijen, populatie, contacten] = await Promise.all([
    haalBeheerSectie(sectieId),
    haalWerkmaatschappijKenmerken(),
    haalPopulatie(),
    haalBeheerContacten(),
  ])
  if (!sectie) notFound()

  return (
    <div className="eva-page">
      <PageHeader
        eyebrow={sectie.soort === 'situatie' ? 'Wat te doen bij…' : 'Handboek'}
        title={sectie.titel}
      />
      <Card>
        <CardBody>
          <SectieEditor
            sectie={sectie}
            werkmaatschappijen={werkmaatschappijen}
            populatie={populatie.groepen}
            totaal={populatie.totaal}
            contacten={contacten}
          />
        </CardBody>
      </Card>
    </div>
  )
}
