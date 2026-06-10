import { Metadata } from 'next'
import PageHeader from '@/components/houtrotherstel/shared/PageHeader'
import BibliotheekTabel from '@/components/houtrotherstel/bibliotheek/BibliotheekTabel'

export const metadata: Metadata = { title: 'Bibliotheek' }

export default function BibliotheekPage() {
  return (
    <div className="space-y-0 pb-20 lg:pb-0">
      <div className="mb-5">
        <PageHeader
          title="Bibliotheek"
          description="Standaard reparaties met prijsopbouw"
        />
      </div>
      <BibliotheekTabel />
    </div>
  )
}
