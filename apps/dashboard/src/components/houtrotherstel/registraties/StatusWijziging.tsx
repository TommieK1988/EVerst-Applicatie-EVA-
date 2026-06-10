'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { ChevronDown, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/houtrotherstel/supabase/client'
import { REGISTRATIE_STATUSSEN } from '@/lib/houtrotherstel/types'
import { getStatusColor } from '@/lib/houtrotherstel/utils'

interface StatusWijzigingProps {
  registratieId: string
  huidigeStatus: string
}

export default function StatusWijziging({ registratieId, huidigeStatus }: StatusWijzigingProps) {
  const router = useRouter()
  const [showMenu, setShowMenu] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  const handleStatusChange = async (nieuweStatus: string) => {
    setIsLoading(true)
    setShowMenu(false)

    try {
      const supabase = createClient()
      const updates: Record<string, unknown> = { status: nieuweStatus }

      if (nieuweStatus === 'afgerond') {
        updates.completed_at = new Date().toISOString()
      }

      const { error } = await supabase
        .from('repair_registrations')
        .update(updates)
        .eq('id', registratieId)

      if (error) throw error

      toast.success(`Status gewijzigd naar: ${REGISTRATIE_STATUSSEN[nieuweStatus as keyof typeof REGISTRATIE_STATUSSEN]}`)
      router.refresh()
    } catch (error: any) {
      toast.error(error.message || 'Status wijzigen mislukt')
    } finally {
      setIsLoading(false)
    }
  }

  const statussen = Object.entries(REGISTRATIE_STATUSSEN).filter(
    ([value]) => value !== huidigeStatus
  )

  return (
    <div className="relative">
      <button
        onClick={() => setShowMenu(!showMenu)}
        disabled={isLoading}
        className="inline-flex items-center gap-2 bg-slate-800 hover:bg-slate-700
          text-white font-medium px-4 py-2.5 rounded-lg text-sm transition-colors disabled:opacity-50"
      >
        {isLoading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <ChevronDown className="w-4 h-4" />
        )}
        Status wijzigen
      </button>

      {showMenu && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
          <div className="absolute right-0 top-full mt-2 w-52 bg-white border border-slate-200
            rounded-xl shadow-lg py-1 z-20">
            {statussen.map(([value, label]) => (
              <button
                key={value}
                onClick={() => handleStatusChange(value)}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-700
                  hover:bg-slate-50 transition-colors text-left"
              >
                <span className={`inline-block w-2 h-2 rounded-full ${
                  getStatusColor(value).includes('green') ? 'bg-green-500' :
                  getStatusColor(value).includes('blue') ? 'bg-everts-light' :
                  getStatusColor(value).includes('yellow') ? 'bg-yellow-500' :
                  getStatusColor(value).includes('red') ? 'bg-red-500' :
                  getStatusColor(value).includes('orange') ? 'bg-orange-500' :
                  'bg-slate-400'
                }`} />
                {label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
