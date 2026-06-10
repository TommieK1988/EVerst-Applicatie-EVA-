import { Metadata } from 'next'
import { Suspense } from 'react'
import RegistratiesLijst from '@/components/houtrotherstel/registraties/RegistratiesLijst'

export const metadata: Metadata = { title: 'Registraties' }

export default function RegistratiesPage() {
  return (
    <Suspense>
      <RegistratiesLijst />
    </Suspense>
  )
}
