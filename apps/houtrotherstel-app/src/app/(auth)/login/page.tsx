import { Metadata } from 'next'
import LoginForm from '@/components/auth/LoginForm'

export const metadata: Metadata = {
  title: 'Inloggen',
}

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-everts-dark to-everts flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo / Header */}
        <div className="text-center mb-8">
          <img
            src="/logo-volledig.png"
            alt="Everts onderhoud & renovatie"
            className="h-20 w-auto mx-auto mb-2 drop-shadow-lg"
          />
        </div>

        {/* Login kaart */}
        <div className="bg-white rounded-2xl shadow-xl border border-white/10 p-8">
          <h2 className="text-xl font-semibold text-slate-800 mb-6">
            Inloggen
          </h2>
          <LoginForm />
        </div>

        <p className="text-center text-xs text-white/40 mt-6">
          © 2024 Everts Groep. Alle rechten voorbehouden.
        </p>
      </div>
    </div>
  )
}
