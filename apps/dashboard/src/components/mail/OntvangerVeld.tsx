'use client'

/**
 * Invoerveld voor mailontvangers: kies contactpersonen en collega's uit een lijst
 * in plaats van adressen over te typen.
 *
 * De waarde blijft naar buiten toe gewoon een tekst met adressen gescheiden door `;`.
 * Alle verzendacties splitsen daar al op, dus dit veld kan overal ingezet worden
 * zonder dat de serverkant meeverandert. Handmatig typen blijft mogelijk — een adres
 * dat niet in EVA staat moet je nog steeds kwijt kunnen.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Command } from 'cmdk'
import { ChevronDown, Search, UserPlus, X } from 'lucide-react'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { getMailOntvangers, type MailOntvanger } from '@/lib/mail/ontvangers'

interface Props {
  /** Adressen gescheiden door `;` of `,` — hetzelfde formaat als de verzendacties verwachten. */
  waarde: string
  onChange: (waarde: string) => void
  /** Kandidaten uit `getMailOntvangers`. Een lege lijst laat het veld als vrij tekstveld werken. */
  ontvangers: MailOntvanger[]
  placeholder?: string
  disabled?: boolean
  /** Toont een spinnertekst zolang de kandidaten nog geladen worden. */
  laden?: boolean
  className?: string
}

/** Splitst het tekstveld in losse adressen. */
function splits(waarde: string): string[] {
  return waarde.split(/[,;\n]/).map(s => s.trim()).filter(Boolean)
}

const isAdres = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)

export default function OntvangerVeld({
  waarde, onChange, ontvangers, placeholder = 'Adres typen of kiezen…', disabled, laden, className,
}: Props) {
  const [open, setOpen] = useState(false)
  const [concept, setConcept] = useState('')
  const invoerRef = useRef<HTMLInputElement>(null)

  const gekozen = useMemo(() => splits(waarde), [waarde])
  const gekozenSet = useMemo(() => new Set(gekozen.map(a => a.toLowerCase())), [gekozen])

  /** Naam bij een adres, zodat een chip "Jan de Vries" toont in plaats van het adres. */
  const naamPerAdres = useMemo(() => {
    const m = new Map<string, string>()
    for (const o of ontvangers) m.set(o.email.toLowerCase(), o.naam)
    return m
  }, [ontvangers])

  function zet(adressen: string[]) {
    // Dubbele adressen weren: dezelfde persoon twee keer in het Aan-veld is altijd fout.
    const uniek: string[] = []
    const gezien = new Set<string>()
    for (const a of adressen) {
      const k = a.toLowerCase()
      if (gezien.has(k)) continue
      gezien.add(k)
      uniek.push(a)
    }
    onChange(uniek.join('; '))
  }

  function voegToe(adres: string) {
    const a = adres.trim()
    if (a) zet([...gekozen, a])
  }

  function verwijder(adres: string) {
    zet(gekozen.filter(a => a !== adres))
  }

  /** Wat er in het typeveld staat vastleggen als adres (Enter, scheidingsteken, of verlaten). */
  function legVast() {
    if (!concept.trim()) return
    for (const a of splits(concept)) voegToe(a)
    setConcept('')
  }

  const groepen = useMemo(() => {
    const map = new Map<string, MailOntvanger[]>()
    for (const o of ontvangers) {
      if (gekozenSet.has(o.email.toLowerCase())) continue
      if (!map.has(o.groep)) map.set(o.groep, [])
      map.get(o.groep)!.push(o)
    }
    return [...map.entries()]
  }, [ontvangers, gekozenSet])

  return (
    <div className={className}>
      <div
        onClick={() => !disabled && invoerRef.current?.focus()}
        className={[
          'flex min-h-[36px] w-full flex-wrap items-center gap-1 rounded-md border bg-white px-1.5 py-1',
          'border-neutral-300 transition-[border-color,box-shadow] [transition-duration:120ms]',
          'focus-within:border-brand-500 focus-within:ring-[3px] focus-within:ring-brand-100',
          disabled ? 'cursor-not-allowed bg-neutral-50' : 'cursor-text',
        ].join(' ')}
      >
        {gekozen.map(adres => {
          const naam = naamPerAdres.get(adres.toLowerCase())
          const geldig = isAdres(adres)
          return (
            <span
              key={adres}
              title={naam ? `${naam} · ${adres}` : adres}
              className={[
                'inline-flex max-w-full items-center gap-1 rounded px-1.5 py-[3px] text-[12px] leading-none',
                geldig
                  ? 'bg-neutral-100 text-neutral-800'
                  : 'bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200',
              ].join(' ')}
            >
              <span className="truncate">{naam ?? adres}</span>
              {!disabled && (
                <button
                  type="button"
                  onClick={e => { e.stopPropagation(); verwijder(adres) }}
                  aria-label={`${naam ?? adres} verwijderen`}
                  className="shrink-0 rounded-sm p-[1px] text-neutral-400 hover:bg-neutral-200 hover:text-neutral-700"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </span>
          )
        })}

        <input
          ref={invoerRef}
          value={concept}
          disabled={disabled}
          onChange={e => {
            // Een scheidingsteken betekent "dit adres is af" — meteen als chip vastleggen.
            if (/[,;]/.test(e.target.value)) {
              const delen = splits(e.target.value)
              const rest = /[,;]\s*$/.test(e.target.value) ? '' : (delen.pop() ?? '')
              for (const a of delen) voegToe(a)
              setConcept(rest)
            } else {
              setConcept(e.target.value)
            }
          }}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === 'Tab') {
              if (concept.trim()) { e.preventDefault(); legVast() }
            } else if (e.key === 'Backspace' && !concept && gekozen.length > 0) {
              verwijder(gekozen[gekozen.length - 1])
            }
          }}
          onBlur={legVast}
          placeholder={gekozen.length === 0 ? placeholder : ''}
          className="h-[26px] min-w-[120px] flex-1 bg-transparent px-1 text-[12.5px] text-neutral-900 outline-none placeholder:text-neutral-400 disabled:cursor-not-allowed"
        />

        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              disabled={disabled}
              title="Kies een contactpersoon of collega"
              onClick={e => e.stopPropagation()}
              className="ml-auto flex shrink-0 items-center gap-1 rounded px-1.5 py-1 text-[11.5px] font-medium text-brand-600 hover:bg-brand-50 disabled:opacity-40"
            >
              <UserPlus className="h-3.5 w-3.5" />
              Kies
              <ChevronDown className="h-3 w-3" />
            </button>
          </PopoverTrigger>
          {/*
            De kiezer wordt naar document.body geportaleerd en staat standaard op z-50 —
            onder élk mailvenster (die zitten op z-[60] t/m z-[400]). Zonder deze z-index
            opent de lijst achter het venster en lijkt de knop niets te doen.
            Hoog genoeg voor alle vier de mailvensters, en bewust lager dan de
            toasts en de zijpanelen (z-[1000]) die er juist overheen horen.
          */}
          <PopoverContent align="end" className="z-[500] w-[340px] p-0">
            <Command className="overflow-hidden">
              <div className="flex items-center gap-2 border-b border-neutral-100 px-3">
                <Search className="h-4 w-4 shrink-0 text-neutral-400" />
                <Command.Input
                  placeholder="Zoek op naam of adres…"
                  className="h-10 flex-1 bg-transparent text-[13px] text-neutral-900 outline-none placeholder:text-neutral-400"
                />
              </div>
              <Command.List className="max-h-72 overflow-y-auto p-1">
                <Command.Empty className="px-3 py-6 text-center text-[12.5px] text-neutral-500">
                  {laden ? 'Adressen laden…' : 'Niemand gevonden — typ het adres zelf in het veld.'}
                </Command.Empty>
                {groepen.map(([groep, opties]) => (
                  <Command.Group
                    key={groep}
                    heading={groep}
                    className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-bold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.08em] [&_[cmdk-group-heading]]:text-neutral-500"
                  >
                    {opties.map(o => (
                      <Command.Item
                        key={`${groep}:${o.email}`}
                        // Naam én adres in de zoekwaarde, zodat beide werken om te zoeken.
                        value={`${o.naam} ${o.email} ${o.subtitel ?? ''}`}
                        onSelect={() => { voegToe(o.email); setOpen(false) }}
                        className="flex cursor-pointer items-start gap-2 rounded-md px-3 py-1.5 transition-colors data-[selected=true]:bg-neutral-50"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[12.5px] font-medium leading-tight text-neutral-900">{o.naam}</div>
                          <div className="truncate text-[11px] text-neutral-500">
                            {o.email}{o.subtitel ? ` · ${o.subtitel}` : ''}
                          </div>
                        </div>
                      </Command.Item>
                    ))}
                  </Command.Group>
                ))}
              </Command.List>
            </Command>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  )
}

/**
 * Laadt de kandidaat-ontvangers voor een mailvenster.
 *
 * Bewust fail-soft: lukt het laden niet, dan blijft de lijst leeg en werkt het veld
 * als een gewoon tekstveld. Mailen mag nooit blokkeren op de kiezer.
 */
export function useMailOntvangers(
  actief: boolean,
  input: { dossierId?: string | null; relatieId?: string | null },
): { ontvangers: MailOntvanger[]; laden: boolean } {
  const [ontvangers, setOntvangers] = useState<MailOntvanger[]>([])
  const [laden, setLaden] = useState(false)
  const { dossierId, relatieId } = input

  useEffect(() => {
    if (!actief) return
    let afgebroken = false
    setLaden(true)
    getMailOntvangers({ dossierId, relatieId })
      .then(lijst => { if (!afgebroken) setOntvangers(lijst) })
      .catch(() => { if (!afgebroken) setOntvangers([]) })
      .finally(() => { if (!afgebroken) setLaden(false) })
    return () => { afgebroken = true }
  }, [actief, dossierId, relatieId])

  return { ontvangers, laden }
}
