'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { Loader2, Save, LogOut } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { getRolLabel, getInitials } from '@/lib/utils'
import type { Profile } from '@/lib/types'

interface InstellingenFormProps {
  profile: Profile | null
}

export default function InstellingenForm({ profile }: InstellingenFormProps) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [name, setName] = useState(profile?.full_name || '')
  const [phone, setPhone] = useState(profile?.phone || '')

  const handleSave = async () => {
    setIsLoading(true)
    try {
      const supabase = createClient()
      const { error } = await supabase
        .from('profiles')
        .update({ full_name: name, phone })
        .eq('id', profile!.id)

      if (error) throw error
      toast.success('Profiel bijgewerkt')
      router.refresh()
    } catch (error: any) {
      toast.error(error.message || 'Opslaan mislukt')
    } finally {
      setIsLoading(false)
    }
  }

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  if (!profile) return null

  return (
    <div className="space-y-5">
      {/* Profiel kaart */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-16 h-16 bg-everts rounded-2xl flex items-center justify-center text-white text-xl font-bold">
            {getInitials(profile.full_name)}
          </div>
          <div>
            <div className="font-semibold text-slate-800 text-lg">{profile.full_name}</div>
            <div className="text-slate-500 text-sm">{profile.email}</div>
            <div className="mt-1">
              <span className="text-xs bg-everts-100 text-everts-dark px-2 py-0.5 rounded-full font-medium">
                {getRolLabel(profile.role)}
              </span>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Naam</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm
                focus:outline-none focus:ring-2 focus:ring-everts/20 focus:border-everts"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">E-mailadres</label>
            <input
              type="email"
              value={profile.email}
              disabled
              className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm bg-slate-50 text-slate-400 cursor-not-allowed"
            />
            <p className="text-xs text-slate-400 mt-1">E-mailadres kan niet worden gewijzigd</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Telefoonnummer</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="06-12345678"
              className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm
                focus:outline-none focus:ring-2 focus:ring-everts/20 focus:border-everts"
            />
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <button
            onClick={handleSave}
            disabled={isLoading}
            className="inline-flex items-center gap-2 bg-everts hover:bg-everts-dark disabled:bg-everts-light
              text-white font-medium px-5 py-2.5 rounded-lg text-sm transition-colors"
          >
            {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
            <Save className="w-4 h-4" />
            Opslaan
          </button>
        </div>
      </div>

      {/* App info */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h2 className="font-semibold text-slate-800 mb-4">Over HoutrotherstelApp</h2>
        <div className="space-y-2 text-sm text-slate-500">
          <div className="flex justify-between">
            <span>Versie</span>
            <span className="text-slate-700 font-medium">1.0.0</span>
          </div>
          <div className="flex justify-between">
            <span>Rol</span>
            <span className="text-slate-700 font-medium">{getRolLabel(profile.role)}</span>
          </div>
        </div>
      </div>

      {/* Uitloggen */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h2 className="font-semibold text-slate-800 mb-2">Sessie</h2>
        <p className="text-sm text-slate-500 mb-4">
          U bent ingelogd als {profile.email}
        </p>
        <button
          onClick={handleLogout}
          className="inline-flex items-center gap-2 text-red-600 hover:text-red-700
            border border-red-200 hover:border-red-300 bg-red-50 hover:bg-red-100
            font-medium px-4 py-2 rounded-lg text-sm transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Uitloggen
        </button>
      </div>
    </div>
  )
}
