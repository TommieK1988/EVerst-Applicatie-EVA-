'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2, CheckCircle } from 'lucide-react'
import { resetPasswordSchema, type ResetPasswordFormValues } from '@/lib/validations'
import { createClient } from '@/lib/supabase/client'

export default function ResetPasswordForm() {
  const [isLoading, setIsLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { register, handleSubmit, formState: { errors } } = useForm<ResetPasswordFormValues>({
    resolver: zodResolver(resetPasswordSchema),
  })

  const onSubmit = async (data: ResetPasswordFormValues) => {
    setIsLoading(true)
    setError(null)

    try {
      const supabase = createClient()
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        data.email,
        { redirectTo: `${window.location.origin}/update-password` }
      )

      if (resetError) {
        setError('Er is een fout opgetreden. Controleer het e-mailadres.')
        return
      }

      setSuccess(true)
    } catch {
      setError('Er is een onverwachte fout opgetreden.')
    } finally {
      setIsLoading(false)
    }
  }

  if (success) {
    return (
      <div className="text-center py-4">
        <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" />
        <h3 className="font-semibold text-slate-800 mb-2">E-mail verstuurd</h3>
        <p className="text-sm text-slate-500">
          Als dit e-mailadres bekend is, ontvangt u een link om uw wachtwoord te resetten.
          Controleer ook uw spam-map.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <p className="text-sm text-slate-600">
        Vul uw e-mailadres in. Als het bekend is, sturen we een reset link.
      </p>

      <div>
        <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1.5">
          E-mailadres
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          {...register('email')}
          className={`w-full px-4 py-2.5 rounded-lg border text-sm transition-colors
            focus:outline-none focus:ring-2 focus:ring-everts/20 focus:border-everts
            ${errors.email ? 'border-red-300 bg-red-50' : 'border-slate-300'}`}
          placeholder="naam@bedrijf.nl"
          disabled={isLoading}
        />
        {errors.email && (
          <p className="mt-1.5 text-xs text-red-600">{errors.email.message}</p>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      <button
        type="submit"
        disabled={isLoading}
        className="w-full bg-everts hover:bg-everts-dark disabled:bg-everts-light
          text-white font-medium py-2.5 px-4 rounded-lg text-sm transition-colors
          flex items-center justify-center gap-2"
      >
        {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
        {isLoading ? 'Bezig...' : 'Reset link versturen'}
      </button>
    </form>
  )
}
