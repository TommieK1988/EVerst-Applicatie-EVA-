import type { Metadata } from 'next'
import { vereisSessie } from '@/lib/auth/rechten'
import { getAlleControlepunten, getDisciplines, magKwaliteitBeheren } from '@/lib/kwaliteit/bibliotheek'
import BibliotheekBeheer from './BibliotheekBeheer'

export const metadata: Metadata = { title: 'Kwaliteitsbibliotheek — KAM' }

export default async function KwaliteitBibliotheekPage() {
  await vereisSessie()

  const [punten, disciplines, magBeheren] = await Promise.all([
    getAlleControlepunten(),
    getDisciplines(false),
    magKwaliteitBeheren(),
  ])

  return (
    <BibliotheekBeheer
      punten={punten}
      disciplines={disciplines}
      magBeheren={magBeheren}
    />
  )
}
