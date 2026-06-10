'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { Loader2 } from 'lucide-react'
import { toggleGebruikerActief } from '@/services/houtrotherstel/gebruikers'

interface ToggleGebruikerActiefProps {
  userId: string
  actief: boolean
  naam: string
}

export default function ToggleGebruikerActief({ userId, actief, naam }: ToggleGebruikerActiefProps) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)

  const handleToggle = async () => {
    const actie = actief ? 'deactiveren' : 'activeren'
    if (!confirm(`Wilt u ${naam} ${actie}?`)) return

    setIsLoading(true)
    try {
      await toggleGebruikerActief(userId, !actief)
      toast.success(`${naam} is ${actief ? 'gedeactiveerd' : 'geactiveerd'}`)
      router.refresh()
    } catch (error: any) {
      toast.error(error.message || 'Wijziging mislukt')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <button
      onClick={handleToggle}
      disabled={isLoading}
      className={`text-xs font-medium px-2 py-1 rounded transition-colors disabled:opacity-50
        ${actief
          ? 'text-red-600 hover:bg-red-50'
          : 'text-green-600 hover:bg-green-50'
        }`}
    >
      {isLoading ? (
        <Loader2 className="w-3 h-3 animate-spin" />
      ) : (
        actief ? 'Deactiveren' : 'Activeren'
      )}
    </button>
  )
}
