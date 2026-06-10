import type { Metadata } from 'next'
import Instellingen from '@/components/instellingen/Instellingen'

export const metadata: Metadata = { title: 'Instellingen' }

export default function InstellingenPage() {
  return <Instellingen />
}
