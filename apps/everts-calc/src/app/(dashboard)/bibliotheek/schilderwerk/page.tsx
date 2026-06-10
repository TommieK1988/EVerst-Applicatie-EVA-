import type { Metadata } from 'next'
import SchilderwerkBibliotheek from '@/components/bibliotheek/SchilderwerkBibliotheek'
import { getSchilderOnderdelen, getSchilderTypes, getSchilderBehandelingen } from '@/lib/services/schilderwerk'

export const metadata: Metadata = { title: 'Schilderwerk bibliotheek' }

export default async function SchilderwerkPage() {
  const [onderdelen, types, behandelingen] = await Promise.all([
    getSchilderOnderdelen(),
    getSchilderTypes(),
    getSchilderBehandelingen(),
  ])

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <SchilderwerkBibliotheek
        onderdelen={onderdelen}
        types={types}
        behandelingen={behandelingen}
      />
    </div>
  )
}
