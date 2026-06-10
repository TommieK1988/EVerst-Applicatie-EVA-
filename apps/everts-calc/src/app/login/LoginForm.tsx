'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Loader2, Mail, Lock, Eye, EyeOff } from 'lucide-react'

export default function LoginForm() {
  const router = useRouter()
  const [email, setEmail]       = useState('')
  const [wachtwoord, setWachtwoord] = useState('')
  const [toonWachtwoord, setToonWachtwoord] = useState(false)
  const [laden, setLaden]       = useState(false)
  const [fout, setFout]         = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLaden(true)
    setFout(null)

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password: wachtwoord })

    if (error) {
      setFout(
        error.message === 'Invalid login credentials'
          ? 'Ongeldig e-mailadres of wachtwoord'
          : error.message
      )
      setLaden(false)
      return
    }

    router.push('/projecten')
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-4">
      <h2 className="text-base font-semibold text-slate-800">Inloggen</h2>

      {fout && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2.5">
          {fout}
        </div>
      )}

      {/* E-mail */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-slate-700" htmlFor="email">
          E-mailadres
        </label>
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="naam@everts.nl"
            className="w-full pl-9 pr-3 py-2.5 text-sm rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:border-everts/50 focus:outline-none focus:ring-2 focus:ring-everts/20 transition-colors"
          />
        </div>
      </div>

      {/* Wachtwoord */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-slate-700" htmlFor="wachtwoord">
          Wachtwoord
        </label>
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            id="wachtwoord"
            type={toonWachtwoord ? 'text' : 'password'}
            autoComplete="current-password"
            required
            value={wachtwoord}
            onChange={e => setWachtwoord(e.target.value)}
            placeholder="••••••••"
            className="w-full pl-9 pr-10 py-2.5 text-sm rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:border-everts/50 focus:outline-none focus:ring-2 focus:ring-everts/20 transition-colors"
          />
          <button
            type="button"
            onClick={() => setToonWachtwoord(v => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            tabIndex={-1}
          >
            {toonWachtwoord ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
      </div>

      <button
        type="submit"
        disabled={laden}
        className="w-full py-2.5 bg-everts text-white rounded-lg text-sm font-semibold
                   hover:bg-everts/90 disabled:opacity-60 disabled:cursor-not-allowed
                   flex items-center justify-center gap-2 transition-colors"
      >
        {laden && <Loader2 className="w-4 h-4 animate-spin" />}
        {laden ? 'Inloggen...' : 'Inloggen'}
      </button>
    </form>
  )
}
