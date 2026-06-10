import type { Metadata } from 'next'
import MaterialenBibliotheek from '@/components/bibliotheek/MaterialenBibliotheek'

export const metadata: Metadata = { title: 'Materialen' }

export default function MaterialenPage() {
  return <MaterialenBibliotheek />
}
