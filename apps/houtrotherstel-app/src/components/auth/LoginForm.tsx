'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Eye, EyeOff, Loader2 } from 'lucide-react'
import { loginSchema, type LoginFormValues } from '@/lib/validations'
import { createClient } from '@/lib/supabase/client'

export default function LoginForm() {
  const router = useRouter()
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  })

  const onSubmit = async (data: LoginFormValues) => {
    setIsLoading(true)
    setError(null)

    try {
      const supabase = createClient()
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: data.email,
        password: data.password,
      })

      if (authError) {
        if (authError.message.includes('Invalid login credentials')) {
          setError('E-mailadres of wachtwoord is onjuist.')
        } else if (authError.message.includes('Email not confirmed')) {
          setError('Bevestig eerst uw e-mailadres via de verificatiemail.')
        } else {
          setError('Er is een fout opgetreden. Probeer het opnieuw.')
        }
        return
      }

      router.push('/dashboard')
      router.refresh()
    } catch {
      setError('Er is een onverwachte fout opgetreden.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      {/* E-mail veld */}
      <div>
        <label
          htmlFor="email"
          className="block text-sm font-medium text-slate-700 mb-1.5"
        >
          E-mailadres
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          {...register('email')}
          className={`w-full px-4 py-2.5 rounded-lg border text-sm transition-colors
            focus:outline-none focus:ring-2 focus:ring-everts/20 focus:border-everts
            ${errors.email
              ? 'border-red-300 bg-red-50'
              : 'border-slate-300 bg-white hover:border-slate-400'
            }`}
          placeholder="naam@bedrijf.nl"
          disabled={isLoading}
        />
        {errors.email && (
          <p className="mt-1.5 text-xs text-red-600">{errors.email.message}</p>
        )}
      </div>

      {/* Wachtwoord veld */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label
            htmlFor="password"
            className="block text-sm font-medium text-slate-700"
          >
            Wachtwoord
          </label>
          <Link
            href="/reset-password"
            className="text-xs text-everts hover:text-everts-dark hover:underline"
          >
            Wachtwoord vergeten?
          </Link>
        </div>
        <div className="relative">
          <input
            id="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            {...register('password')}
            className={`w-full px-4 py-2.5 pr-11 rounded-lg border text-sm transition-colors
              focus:outline-none focus:ring-2 focus:ring-everts/20 focus:border-everts
              ${errors.password
                ? 'border-red-300 bg-red-50'
                : 'border-slate-300 bg-white hover:border-slate-400'
              }`}
            placeholder="••••••••"
            disabled={isLoading}
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            tabIndex={-1}
          >
            {showPassword ? (
              <EyeOff className="w-4 h-4" />
            ) : (
              <Eye className="w-4 h-4" />
            )}
          </button>
        </div>
        {errors.password && (
          <p className="mt-1.5 text-xs text-red-600">
            {errors.password.message}
          </p>
        )}
      </div>

      {/* Foutmelding */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Submit knop */}
      <button
        type="submit"
        disabled={isLoading}
        className="w-full bg-everts hover:bg-everts-dark disabled:bg-everts-light
          text-white font-medium py-2.5 px-4 rounded-lg text-sm
          transition-colors focus:outline-none focus:ring-2 focus:ring-everts focus:ring-offset-2
          flex items-center justify-center gap-2"
      >
        {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
        {isLoading ? 'Bezig met inloggen...' : 'Inloggen'}
      </button>
    </form>
  )
}
