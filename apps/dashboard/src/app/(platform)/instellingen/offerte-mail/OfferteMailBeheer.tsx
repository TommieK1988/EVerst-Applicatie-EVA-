'use client'

import { useState, useTransition } from 'react'
import toast from 'react-hot-toast'
import { bewaarOfferteMailSjabloon } from '@/app/(platform)/everts-calc/actions/offerte-mail-instellingen'
import type { OfferteMailSjabloon } from '@/lib/everts-calc/offerte-mail'

const VARIABELEN = [
  '{offerte.nummer}', '{offerte.titel}', '{offerte.datum}', '{offerte.geldig_tot}',
  '{klant.bedrijf_of_naam}', '{dossier.contactpersoon}', '{dossier.werkadres}', '{bedrijf.naam}',
]

export default function OfferteMailBeheer({ initieel }: { initieel: OfferteMailSjabloon }) {
  const [onderwerp, setOnderwerp] = useState(initieel.onderwerp)
  const [tekst, setTekst] = useState(initieel.tekst)
  const [pending, start] = useTransition()

  function opslaan() {
    start(async () => {
      const res = await bewaarOfferteMailSjabloon({ onderwerp, tekst })
      if (res.ok) toast.success('Mailsjabloon opgeslagen')
      else toast.error(res.error)
    })
  }

  return (
    <div className="space-y-4">
      <label className="block">
        <span className="text-xs font-medium text-slate-500">Onderwerp</span>
        <input value={onderwerp} onChange={e => setOnderwerp(e.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-everts/30" />
      </label>
      <label className="block">
        <span className="text-xs font-medium text-slate-500">Bericht</span>
        <textarea value={tekst} onChange={e => setTekst(e.target.value)} rows={12}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-everts/30" />
      </label>
      <div className="text-xs text-slate-500">
        <span className="font-medium">Beschikbare variabelen:</span>{' '}
        {VARIABELEN.map(v => (
          <code key={v} className="mx-0.5 rounded bg-slate-100 px-1 py-0.5 text-[11px]">{v}</code>
        ))}
      </div>
      <button onClick={opslaan} disabled={pending}
        className="px-4 py-1.5 rounded-lg text-sm font-semibold bg-everts text-white hover:opacity-90 disabled:opacity-50">
        {pending ? 'Opslaan…' : 'Opslaan'}
      </button>
    </div>
  )
}
