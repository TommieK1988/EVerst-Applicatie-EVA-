import type { Metadata } from 'next'
import MaterieelForm from '@/components/materieel/MaterieelForm'

export const metadata: Metadata = { title: 'Nieuw materieel' }

export default function NieuwMaterieelPage() {
  return <MaterieelForm />
}
