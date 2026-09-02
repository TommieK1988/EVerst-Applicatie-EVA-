'use client'

import { useState } from 'react'
import { vraagInloglink } from './actions'

/**
 * Na het versturen tonen we altijd hetzelfde bevestigingsscherm, ook als het
 * adres onbekend is. Dat is geen slordigheid maar de bedoeling: zie de uitleg
 * in actions.ts.
 */
export function LoginFormulier() {
  const [email, setEmail] = useState('')
  const [bezig, setBezig] = useState(false)
  const [verstuurd, setVerstuurd] = useState(false)
  const [fout, setFout] = useState<string | null>(null)

  async function versturen(e: React.FormEvent) {
    e.preventDefault()
    if (bezig) return
    setBezig(true)
    setFout(null)
    const r = await vraagInloglink(email)
    setBezig(false)
    if (!r.ok) { setFout(r.error); return }
    setVerstuurd(true)
  }

  if (verstuurd) {
    return (
      <div className="mt-6 rounded-xl border border-success-200 bg-success-50 px-5 py-6 text-center">
        <div className="text-2xl">✓</div>
        <p className="mt-1 text-sm font-semibold text-success-800">Controleer uw mailbox</p>
        <p className="mt-1.5 text-[13px] leading-relaxed text-success-700">
          Als <span className="font-medium">{email}</span> bij ons bekend is, staat er nu een
          inloglink in uw mailbox. De link is één uur geldig.
        </p>
        <button
          type="button"
          onClick={() => { setVerstuurd(false); setFout(null) }}
          className="mt-4 text-xs font-semibold text-success-800 underline underline-offset-2"
        >
          Ander e-mailadres gebruiken
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={versturen} className="mt-6">
      <label htmlFor="portaal-email" className="block text-sm font-medium text-neutral-700">
        E-mailadres
      </label>
      <input
        id="portaal-email"
        type="email"
        required
        autoComplete="email"
        autoFocus
        value={email}
        onChange={e => setEmail(e.target.value)}
        placeholder="naam@bedrijf.nl"
        className="mt-1.5 w-full rounded-lg border border-neutral-300 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
      />

      {fout && <p className="mt-2 text-[13px] text-error-600">{fout}</p>}

      <button
        type="submit"
        disabled={bezig}
        className="mt-4 w-full rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-brand-700 disabled:opacity-60"
      >
        {bezig ? 'Bezig…' : 'Stuur mij een inloglink'}
      </button>
    </form>
  )
}
