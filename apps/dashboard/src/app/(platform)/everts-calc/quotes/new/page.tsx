'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { FileText, Building2, ChevronRight, Check, ArrowLeft } from 'lucide-react'
import { maakQuote, maakClient } from '@/app/(platform)/everts-calc/actions/quotes'
import type { QuoteType } from '@/lib/everts-calc/types-quotes'
import { Button } from '@/components/ui/button'
import { Card, CardBody } from '@/components/ui/card'

const STAPPEN = ['Type', 'Klant', 'Gegevens'] as const

export default function NieuweQuotePage() {
  const router = useRouter()
  const [stap, setStap] = useState(0)
  const [isPending, startTransition] = useTransition()

  // Formuliervelden
  const [type, setType] = useState<QuoteType>('verkoopofferte')
  const [clientId, setClientId] = useState<string>('')
  const [nieuwKlant, setNieuwKlant] = useState(false)
  const [klantNaam, setKlantNaam] = useState('')
  const [klantBedrijf, setKlantBedrijf] = useState('')
  const [klantEmail, setKlantEmail] = useState('')
  const [titel, setTitel] = useState('Offerte')
  const [referentie, setReferentie] = useState('')
  const [datum, setDatum] = useState(new Date().toISOString().split('T')[0])
  const [geldigheidDagen, setGeldigheidDagen] = useState(30)

  const geldig_tot = (() => {
    const d = new Date(datum)
    d.setDate(d.getDate() + geldigheidDagen)
    return d.toISOString().split('T')[0]
  })()

  async function submit() {
    startTransition(async () => {
      let resolvedClientId: string | null = clientId || null

      if (nieuwKlant && klantNaam) {
        resolvedClientId = await maakClient({
          naam: klantNaam,
          bedrijfsnaam: klantBedrijf || undefined,
          email: klantEmail || undefined,
        })
      }

      await maakQuote({
        type,
        client_id: resolvedClientId,
        titel: titel || 'Offerte',
        referentie: referentie || undefined,
        datum,
        geldig_tot,
      })
    })
  }

  return (
    <div className="flex flex-col h-full overflow-hidden bg-slate-50">
      {/* Header */}
      <div className="flex-shrink-0 px-6 py-4 border-b border-slate-200 bg-white flex items-center gap-4">
        <Button variant="ghost" size="icon-md" onClick={() => router.back()}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="text-lg font-semibold text-slate-800">Nieuwe offerte</h1>
          <p className="text-sm text-slate-500">Stap {stap + 1} van {STAPPEN.length}: {STAPPEN[stap]}</p>
        </div>
      </div>

      {/* Stepper */}
      <div className="flex-shrink-0 bg-white border-b border-slate-200">
        <div className="max-w-2xl mx-auto px-6 py-3 flex items-center gap-2">
          {STAPPEN.map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <button
                onClick={() => i < stap && setStap(i)}
                className={`flex items-center gap-2 text-sm font-medium transition-colors ${
                  i === stap
                    ? 'text-everts'
                    : i < stap
                      ? 'text-green-600 cursor-pointer hover:text-green-700'
                      : 'text-slate-400'
                }`}
              >
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-colors ${
                  i === stap
                    ? 'border-everts bg-everts text-white'
                    : i < stap
                      ? 'border-green-500 bg-green-500 text-white'
                      : 'border-slate-300 text-slate-400'
                }`}>
                  {i < stap ? <Check className="w-3 h-3" /> : i + 1}
                </span>
                {s}
              </button>
              {i < STAPPEN.length - 1 && (
                <ChevronRight className="w-4 h-4 text-slate-300" />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Formulier inhoud */}
      <div className="flex-1 overflow-auto py-8">
        <div className="max-w-2xl mx-auto px-6 space-y-4">

          {/* Stap 1: Type kiezen */}
          {stap === 0 && (
            <div className="space-y-4">
              <h2 className="text-base font-semibold text-slate-700">Kies het type document</h2>
              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => setType('verkoopofferte')}
                  className={`p-5 rounded-xl border-2 text-left transition-all ${
                    type === 'verkoopofferte'
                      ? 'border-everts bg-everts/5 ring-1 ring-everts/20'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <FileText className={`w-8 h-8 mb-3 ${type === 'verkoopofferte' ? 'text-everts' : 'text-slate-400'}`} />
                  <div className="font-semibold text-slate-800 mb-1">Verkoopofferte</div>
                  <div className="text-xs text-slate-500 leading-relaxed">
                    Klantgericht document met verkoopprijzen. Geschikt om naar de klant te sturen.
                  </div>
                </button>
                <button
                  onClick={() => setType('interne_calculatie')}
                  className={`p-5 rounded-xl border-2 text-left transition-all ${
                    type === 'interne_calculatie'
                      ? 'border-purple-500 bg-purple-50 ring-1 ring-purple-200'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <Building2 className={`w-8 h-8 mb-3 ${type === 'interne_calculatie' ? 'text-purple-600' : 'text-slate-400'}`} />
                  <div className="font-semibold text-slate-800 mb-1">Interne calculatie</div>
                  <div className="text-xs text-slate-500 leading-relaxed">
                    Intern document met kostprijzen, uren en marges. Niet bedoeld voor de klant.
                  </div>
                </button>
              </div>
            </div>
          )}

          {/* Stap 2: Klant */}
          {stap === 1 && (
            <div className="space-y-4">
              <h2 className="text-base font-semibold text-slate-700">Klantgegevens</h2>
              <Card>
                <CardBody className="space-y-4">
                {!nieuwKlant ? (
                  <>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1.5">Klant-ID (optioneel)</label>
                      <input
                        type="text"
                        value={clientId}
                        onChange={(e) => setClientId(e.target.value)}
                        placeholder="UUID van bestaande klant (later: zoekfunctie)"
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-everts/30 focus:border-everts"
                      />
                      <p className="mt-1 text-xs text-slate-400">Laat leeg om later in te vullen</p>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => setNieuwKlant(true)}>
                      + Nieuwe klant aanmaken
                    </Button>
                  </>
                ) : (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-slate-700">Nieuwe klant</span>
                      <Button variant="ghost" size="sm" onClick={() => setNieuwKlant(false)}>
                        Annuleren
                      </Button>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1.5">Naam *</label>
                      <input
                        type="text"
                        value={klantNaam}
                        onChange={(e) => setKlantNaam(e.target.value)}
                        placeholder="Contactpersoon naam"
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-everts/30 focus:border-everts"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1.5">Bedrijfsnaam</label>
                      <input
                        type="text"
                        value={klantBedrijf}
                        onChange={(e) => setKlantBedrijf(e.target.value)}
                        placeholder="Optioneel"
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-everts/30 focus:border-everts"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1.5">E-mail</label>
                      <input
                        type="email"
                        value={klantEmail}
                        onChange={(e) => setKlantEmail(e.target.value)}
                        placeholder="Optioneel"
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-everts/30 focus:border-everts"
                      />
                    </div>
                  </>
                )}
                </CardBody>
              </Card>
            </div>
          )}

          {/* Stap 3: Basisgegevens */}
          {stap === 2 && (
            <div className="space-y-4">
              <h2 className="text-base font-semibold text-slate-700">Basisgegevens</h2>
              <Card>
                <CardBody className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Titel *</label>
                  <input
                    type="text"
                    value={titel}
                    onChange={(e) => setTitel(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-everts/30 focus:border-everts"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Referentie / projectnummer</label>
                  <input
                    type="text"
                    value={referentie}
                    onChange={(e) => setReferentie(e.target.value)}
                    placeholder="Optioneel"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-everts/30 focus:border-everts"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1.5">Offertedatum *</label>
                    <input
                      type="date"
                      value={datum}
                      onChange={(e) => setDatum(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-everts/30 focus:border-everts"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1.5">Geldig (dagen)</label>
                    <input
                      type="number"
                      value={geldigheidDagen}
                      onChange={(e) => setGeldigheidDagen(Number(e.target.value))}
                      min={1}
                      max={365}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-everts/30 focus:border-everts"
                    />
                  </div>
                </div>
                <p className="text-xs text-slate-400">Geldig tot: {new Date(geldig_tot).toLocaleDateString('nl-NL')}</p>
                </CardBody>
              </Card>
            </div>
          )}

          {/* Navigatieknoppen */}
          <div className="flex items-center justify-between pt-2">
            <Button
              variant="outline"
              size="lg"
              onClick={() => setStap(s => Math.max(0, s - 1))}
              disabled={stap === 0}
            >
              Vorige
            </Button>

            {stap < STAPPEN.length - 1 ? (
              <Button
                variant="primary"
                size="lg"
                onClick={() => setStap(s => Math.min(STAPPEN.length - 1, s + 1))}
              >
                Volgende
                <ChevronRight className="w-4 h-4" />
              </Button>
            ) : (
              <Button
                variant="primary"
                size="lg"
                onClick={submit}
                disabled={isPending || !titel}
                loading={isPending}
              >
                {isPending ? 'Aanmaken…' : 'Offerte aanmaken'}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
