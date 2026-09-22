'use client'

import React from 'react'
import { Card, CardHeader, CardBody } from '@/components/ui'
import type { OpdrachtOverzicht } from '@/lib/dossiers/opdracht-onderdelen'

const fmt = (v: number) =>
  new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 }).format(v)

/* ─── Financiële afrekenstand ───────────────────────────────────────────────
   Meerwerk is maar de helft van het verhaal: een stelpost rekent net zo goed af
   tegen een ander bedrag dan is afgesproken, en dat verschil landt uiteindelijk
   als meerwerkregel. Zolang die twee op aparte tabs staan, is hier niet te zien
   wat het project straks werkelijk oplevert. Dit blok zet ze onder elkaar:
   aanneemsom → stelposten → goedgekeurd meerwerk → verwachte eindafrekening.

   Aanwijzen en instellen van stelposten blijft op het tab Informatie; hier staan
   ze om te tonen en — als het saldo bekend is — te verrekenen. */
function RekenRegel({ label, bedrag, soort = 'normaal', titel, kleur }: {
  label: React.ReactNode
  bedrag: number | null
  soort?: 'normaal' | 'subtotaal' | 'eind'
  titel?: string
  kleur?: string
}) {
  const basis = 'flex items-baseline justify-between gap-3 py-1 text-[12.5px]'
  const klasse = soort === 'eind'
    ? `${basis} mt-1 border-t-2 border-neutral-300 pt-2 font-bold text-neutral-900`
    : soort === 'subtotaal'
      ? `${basis} mt-0.5 border-t border-neutral-200 pt-1.5 font-semibold text-neutral-800`
      : `${basis} text-neutral-600`
  return (
    <div className={klasse} title={titel}>
      {/* Bewust geen `truncate`: "Stelposten buiten de aanneemsom" past niet op één regel in deze
          smalle kolom, en een afgekapt label maakt een bedrag onnavolgbaar. */}
      <span className="min-w-0">{label}</span>
      <span className="shrink-0 tabular-nums" style={kleur ? { color: kleur } : undefined}>
        {bedrag != null ? fmt(bedrag) : '—'}
      </span>
    </div>
  )
}

export default function AfrekenstandBlok({ overzicht, meerwerkExcl, readOnly, bezig, onVerreken }: {
  overzicht: OpdrachtOverzicht
  meerwerkExcl: number
  readOnly: boolean
  bezig: boolean
  onVerreken: (id: string) => void
}) {
  const stelposten = overzicht.stelposten.filter(sp => sp.in_opdracht)
  const orderbasis = overzicht.aanneemsomInclStelposten
  const contractNu = orderbasis == null ? null : orderbasis + meerwerkExcl
  // Alleen saldi die nog niet als meerwerkregel zijn geboekt: een verrekende stelpost zit al in
  // `meerwerkExcl`. Beide optellen zou hetzelfde verschil twee keer meetellen.
  const openSaldo = stelposten
    .filter(sp => sp.verrekenSaldo != null && !sp.verrekendMeerwerkId)
    .reduce((s, sp) => s + (sp.verrekenSaldo ?? 0), 0)
  const verwacht = contractNu == null ? null : contractNu + openSaldo
  const zonderAfrekening = stelposten.filter(sp => sp.verrekenSaldo == null && !sp.verrekendMeerwerkId)

  return (
    <Card>
      <CardHeader>Financiële afrekenstand</CardHeader>
      <CardBody>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div>
            <div className="mb-2 text-[10.5px] font-bold uppercase tracking-[0.04em] text-neutral-500">
              Stelposten in de opdracht
            </div>
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b-2 border-neutral-200 text-left text-[10.5px] font-bold uppercase tracking-[0.04em] text-neutral-500">
                    <th className="py-1.5 pr-2">Code</th>
                    <th className="py-1.5 px-2">Omschrijving</th>
                    <th className="py-1.5 px-2 text-right">Afgesproken</th>
                    <th className="py-1.5 px-2 text-right">Werkelijk</th>
                    <th className="py-1.5 px-2 text-right">Saldo</th>
                    <th className="py-1.5 pl-2 text-right">Verrekening</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Geen stelposten: de kolommen blijven staan met een nulregel. */}
                  {stelposten.length === 0 && (
                    <tr className="border-b border-neutral-100 text-[12.5px] text-neutral-400">
                      <td className="py-2 pr-2 font-mono text-[11px]">—</td>
                      <td className="py-2 px-2">—</td>
                      <td className="py-2 px-2 text-right tabular-nums">{fmt(0)}</td>
                      <td className="py-2 px-2 text-right tabular-nums">{fmt(0)}</td>
                      <td className="py-2 px-2 text-right tabular-nums">{fmt(0)}</td>
                      <td className="py-2 pl-2 text-right">—</td>
                    </tr>
                  )}
                  {stelposten.map(sp => (
                    <tr key={sp.id} className="border-b border-neutral-100 text-[12.5px] align-top">
                      <td className="py-2 pr-2 font-mono text-[11px] text-neutral-500">{sp.bewakingscode ?? '—'}</td>
                      <td className="py-2 px-2">
                        <div className="text-neutral-800">{sp.omschrijving}</div>
                        <div className="mt-0.5 text-[10.5px] text-neutral-400">
                          {sp.in_aanneemsom ? 'in aanneemsom' : 'apart factureren'}
                          {sp.grondslag === 'eenheidsprijzen' && ' · op eenheidsprijzen'}
                          {sp.grondslag === 'geboekte_kosten' && ' · op geboekte kosten'}
                          {(sp.grondslag == null || sp.grondslag === 'vast') && ' · vast bedrag'}
                        </div>
                      </td>
                      <td className="py-2 px-2 text-right tabular-nums text-neutral-800">
                        {sp.bedrag_excl_btw != null ? fmt(sp.bedrag_excl_btw) : '—'}
                      </td>
                      <td className="py-2 px-2 text-right tabular-nums text-neutral-600">
                        {sp.werkelijkVerkoop != null ? fmt(sp.werkelijkVerkoop) : '—'}
                      </td>
                      <td
                        className="py-2 px-2 text-right tabular-nums font-semibold"
                        style={sp.verrekenSaldo == null ? undefined
                          : { color: sp.verrekenSaldo > 0 ? '#d97706' : sp.verrekenSaldo < 0 ? '#009439' : undefined }}
                      >
                        {sp.verrekenSaldo != null ? fmt(sp.verrekenSaldo) : '—'}
                      </td>
                      <td className="py-2 pl-2 text-right whitespace-nowrap">
                        {sp.verrekendMeerwerkId ? (
                          <span
                            className="text-[11px] font-semibold text-neutral-400"
                            title="Het verschil staat al als meerwerkregel in de lijst hieronder."
                          >
                            verrekend
                          </span>
                        ) : sp.verrekenSaldo != null && sp.verrekenSaldo !== 0 && !readOnly ? (
                          <button
                            className="text-[11px] font-medium text-brand-600 hover:underline disabled:opacity-50"
                            disabled={bezig}
                            onClick={() => onVerreken(sp.id)}
                            title="Maak van het verschil één meer-/minderwerkregel (status Aangevraagd, dus via klantakkoord)."
                          >
                            Verrekenen
                          </button>
                        ) : (
                          <span className="text-neutral-300">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            {stelposten.length === 0 && (
              <p className="mt-3 text-[11px] text-neutral-500">
                Geen stelposten aangewezen. Dat doe je op het tab Informatie, in het blok met de financiële totalen.
              </p>
            )}
            {zonderAfrekening.length > 0 && (
              <p className="mt-3 text-[11px] text-neutral-500">
                {zonderAfrekening.length === 1
                  ? 'Eén stelpost heeft nog geen afrekenbedrag'
                  : `${zonderAfrekening.length} stelposten hebben nog geen afrekenbedrag`}
                : ze rekenen af als vast bedrag, of de werkelijke hoeveelheid is nog niet ingevuld.
                Daar valt dus nog niets te verrekenen — de afrekenwijze stel je in op het tab Informatie.
              </p>
            )}
          </div>

          <div className="lg:border-l lg:border-neutral-200 lg:pl-6">
            <div className="mb-2 text-[10.5px] font-bold uppercase tracking-[0.04em] text-neutral-500">
              Opbouw (excl. btw)
            </div>
            <RekenRegel
              label={`Aanneemsom${overzicht.aanneemsomBron === 'bouw7' ? ' (Bouw7)' : overzicht.aanneemsomBron === 'offerte' ? ' (offerte)' : ''}`}
              bedrag={overzicht.aanneemsom}
            />
            {overzicht.stelpostenInAanneemsomTotaal > 0 && (
              <RekenRegel
                label={<span className="pl-3 text-neutral-400">waarvan stelposten</span>}
                bedrag={overzicht.stelpostenInAanneemsomTotaal}
                titel="Carve-out: zit al in de aanneemsom en telt er niet nog eens bij op."
              />
            )}
            {overzicht.stelpostenApartTotaal > 0 && (
              <RekenRegel
                label="Stelposten buiten de aanneemsom"
                bedrag={overzicht.stelpostenApartTotaal}
                titel="Apart te factureren — tellen bij de orderbasis op."
              />
            )}
            <RekenRegel soort="subtotaal" label="Orderbasis" bedrag={orderbasis} />
            <RekenRegel
              label={meerwerkExcl < 0 ? 'Goedgekeurd minderwerk' : 'Goedgekeurd meerwerk'}
              bedrag={meerwerkExcl}
              kleur={meerwerkExcl < 0 ? '#009439' : undefined}
            />
            <RekenRegel soort="subtotaal" label="Contracttotaal nu" bedrag={contractNu} />
            {openSaldo !== 0 && (
              <RekenRegel
                label="Nog te verrekenen stelposten"
                bedrag={openSaldo}
                kleur={openSaldo < 0 ? '#009439' : '#d97706'}
                titel="Saldi die bekend zijn maar nog niet als meer-/minderwerkregel zijn geboekt."
              />
            )}
            <RekenRegel
              soort="eind"
              label="Verwachte eindafrekening"
              bedrag={verwacht}
              titel="Contracttotaal plus de stelpostsaldi die nog verrekend moeten worden. Exclusief btw."
            />
            {overzicht.aanneemsom == null && (
              <p className="mt-3 text-[11px] text-neutral-500">
                Er is nog geen aanneemsom bekend, dus de opbouw hierboven is onvolledig.
              </p>
            )}
          </div>
        </div>
      </CardBody>
    </Card>
  )
}
