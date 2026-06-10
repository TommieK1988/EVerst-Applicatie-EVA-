import { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/houtrotherstel/supabase/server'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import StandaardReparatieForm from '@/components/houtrotherstel/reparaties/StandaardReparatieForm'

export const metadata: Metadata = { title: 'Nieuwe standaard reparatie' }

export default async function NieuweStandaardReparatiePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user!.id)
    .single()

  if (profile?.role !== 'admin') {
    redirect('/houtrotherstel/standaard-reparaties')
  }

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
