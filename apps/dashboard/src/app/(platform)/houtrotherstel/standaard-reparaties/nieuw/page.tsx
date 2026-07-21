import { Metadata } from 'next'
import { vereisModuleToegang } from '@/lib/auth/rechten'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import StandaardReparatieForm from '@/components/houtrotherstel/reparaties/StandaardReparatieForm'

export const metadata: Metadata = { title: 'Nieuwe standaard reparatie' }

export default async function NieuweStandaardReparatiePage() {
  // De prijzenbibliotheek is beheer-werk: gate op EVA-rechten i.p.v. het oude
  // houtrot-eigen profiles.role.
  await vereisModuleToegang('houtrotherstel', 'beheren')

  return (
    <div className="max-w-3xl space-y-6 pb-20 lg:pb-0">
      <div>
        <Link
          href="/houtrotherstel/standaard-reparaties"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-4 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Terug
        </Link>
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Nieuwe standaard reparatie</h1>
      </div>

      <StandaardReparatieForm />
    </div>
  )
}
