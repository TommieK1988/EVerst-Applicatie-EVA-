import LoginForm from './LoginForm'

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo / Merk */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-everts rounded-2xl mb-4">
            <span className="text-white text-2xl font-bold">E</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">EvertsCalc</h1>
          <p className="text-sm text-slate-500 mt-1">Calculatiesoftware voor schilderwerk</p>
        </div>

        <LoginForm />

        <p className="text-center text-xs text-slate-400 mt-6">
          © {new Date().getFullYear()} Everts Schilderwerken
        </p>
      </div>
    </div>
  )
}
