import type { Metadata } from 'next'
import MaterialenBibliotheek from '@/components/everts-calc/bibliotheek/MaterialenBibliotheek'

export const metadata: Metadata = { title: 'Materialen' }

export default function MaterialenPage() {
  return <MaterialenBibliotheek />
}
