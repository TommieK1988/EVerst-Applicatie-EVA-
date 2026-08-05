'use client'

import { useState, useTransition } from 'react'
import toast from 'react-hot-toast'
import { bewaarBestellingMailSjablonen } from './actions'
import type { BestellingMailSjablonen } from '@/lib/bouw7/bestelling-mail-sjabloon'

/** Los meegegeven zodat de client-bundel niet de server-only sjabloonmodule hoeft te importeren. */
type Props = { initieel: BestellingMailSjablonen; variabelen: readonly string[] }

const TABS = [
  { key: 'inkooporder', label: 'Inkooporder', uitleg: 'Materiaal en diensten bij een leverancier.' },
  { key: 'oa_contract', label: 'Onderaannemersopdracht', uitleg: 'Werk dat een onderaannemer voor vaste prijs uitvoert.' },
] as const

export default function InkoopMailBeheer({ initieel, variabelen }: Props) {
  const [sjablonen, setSjablonen] = useState<BestellingMailSjablonen>(initieel)
  const [tab, setTab] = useState<(typeof TABS)[number]['key']>('inkooporder')
  const [pending, start] = useTransition()

  const huidig = sjablonen[tab]
  const wijzig = (veld: 'onderwerp' | 'tekst', waarde: string) =>
    setSjablonen(s => ({ ...s, [tab]: { ...s[tab], [veld]: waarde } }))

  function opslaan() {
    start(async () => {
      const res = await bewaarBestellingMailSjablonen(sjablonen)
      if (res.ok) toast.success('Mailteksten opgeslagen')
      else toast.error(res.error)
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-1 border-b border-slate-200">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
              tab === t.key ? 'border-everts text-everts' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      <p className="text-xs text-slate-500">{TABS.find(t => t.key === tab)?.uitleg}</p>

      <label className="block">
        <span className="text-xs font-medium text-slate-500">Onderwerp</span>
        <input value={huidig.onderwerp} onChange={e => wijzig('onderwerp', e.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-everts/30" />
      </label>
      <label className="block">
        <span className="text-xs font-medium text-slate-500">Bericht</span>
        <textarea value={huidig.tekst} onChange={e => wijzig('tekst', e.target.value)} rows={12}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-everts/30" />
      </label>

      <div className="text-xs text-slate-500">
        <span className="font-medium">Beschikbare variabelen:</span>{' '}
        {variabelen.map(v => (
          <code key={v} className="mx-0.5 rounded bg-slate-100 px-1 py-0.5 text-[11px]">{v}</code>
        ))}
      </div>
      <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
        Onder het bericht komt automatisch een blokje met ordernummer, project, werkadres,
        lever- of startdatum, bedrag en betaalafspraak. Zet die gegevens dus niet zelf in de tekst.
        Je naam komt uit je Outlook-handtekening.
      </p>

      <button onClick={opslaan} disabled={pending}
        className="px-4 py-1.5 rounded-lg text-sm font-semibold bg-everts text-white hover:opacity-90 disabled:opacity-50">
        {pending ? 'Opslaan…' : 'Opslaan'}
      </button>
    </div>
  )
}
