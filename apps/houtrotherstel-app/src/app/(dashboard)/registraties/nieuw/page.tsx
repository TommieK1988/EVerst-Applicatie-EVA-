import { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import NieuweRegistratieClient from '@/components/registraties/NieuweRegistratieClient'

export const metadata: Metadata = { title: 'Nieuwe registratie' }

export default async function NieuweRegistratiePage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>
}) {
  const params = await searchParams

  return (
    <div className="max-w-4xl space-y-6 pb-24 lg:pb-8">
      <div>
        <Link
          href="/registraties"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-4 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Terug naar registraties
        </Link>
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Nieuwe registratie</h1>
        <p className="text-slate-500 text-sm mt-1">Leg een houtrotherstel vast</p>
      </div>

      <NieuweRegistratieClient defaultProjectId={params.project} />
    </div>
  )
}
