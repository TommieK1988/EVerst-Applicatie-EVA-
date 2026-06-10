import { Metadata } from 'next'
import ResetPasswordForm from '@/components/auth/ResetPasswordForm'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Wachtwoord vergeten',
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-everts rounded-2xl mb-4 shadow-lg">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Wachtwoord vergeten</h1>
          <p className="text-slate-500 mt-1 text-sm">We sturen u een reset link</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl border border-slate-200/50 p-8">
          <ResetPasswordForm />
          <div className="mt-4 text-center">
            <Link href="/login" className="text-sm text-everts hover:underline">
              Terug naar inloggen
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
