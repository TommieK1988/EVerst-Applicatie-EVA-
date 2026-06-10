import type { Metadata } from 'next'
import BiblioteekBeheer from '@/components/bibliotheek/BiblioteekBeheer'
import { getBibliotheekItems } from '@/lib/services/bibliotheek'

export const metadata: Metadata = { title: 'Recepten bibliotheek' }

export default async function ReceptenPage() {
  const items = await getBibliotheekItems()
  return <BiblioteekBeheer items={items} />
}
