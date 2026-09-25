'use client'

/**
 * Nacalculatie: de bewakingscodes van dit dossier die op werkelijke kosten afrekenen, en het
 * factuurvoorstel dat daaruit volgt.
 *
 * Het klaarzetten zelf gebeurt niet hier maar in het venster per post: daar stel je de regels
 * samen, dus daar hoort ook de knop die ze afdrukt. Dit blok is het overzicht.
 *
 * Wat hier níét in staat is net zo belangrijk als wat er wel in staat: werk dat in de aanneemsom
 * zit is via de termijnen al gefactureerd en hoort hier niet thuis. Alleen regie-meerwerkregels en
 * stelposten komen in aanmerking, en een stelpost die in de aanneemsom zit verrekent alleen zijn
 * verschil — die staat er apart bij, met de reden erbij, zodat zichtbaar is waaróm hij ontbreekt.
 */

import React, { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardHeader, CardBody } from '@/components/ui'
import { useDossierReadOnly } from '@/components/dossiers/DossierReadOnlyContext'
import { getRegieFactuurvoorstel, type RegieVoorstel } from '@/lib/dossiers/servicedesk'
import { laadBtwTarieven } from '@/lib/stamdata/btw-actions'
import type { BtwTariefKeuze } from '@/lib/stamdata/btw'
import FactuurRegelVenster from './FactuurRegelVenster'
import MandaatIndicator from './MandaatIndicator'

const fmt = (v: number) =>
  new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 }).format(v)

/** Waar een post vandaan komt, zoals hij onder de code staat. */
const BRON_LABEL: Record<RegieVoorstel['codes'][number]['bron'], string> = {
  regie:    'regiewerk',
  stelpost: 'stelpost',
  meerwerk: 'meerwerk (regie)',
}

export default function ServicedeskRegiePaneel({ dossierId, verbergAlsLeeg, initieel, isHoofdroute }: {
  dossierId: string
  /** Op een opdracht-dossier is nacalculatie de uitzondering; toon het blok dan alleen als er iets is. */
  verbergAlsLeeg?: boolean
  /**
   * Het voorstel zoals de server het al heeft gelezen — de Verkoop-tab heeft het nodig voor het
   * contracttotaal. Doorgeven scheelt een tweede lezing van dezelfde snapshots, en het blok staat
   * er meteen in plaats van eerst "Nacalculatie laden…".
   */
  initieel?: RegieVoorstel | null
  /**
   * Rekent dit dossier op regie af? Dan is een leeg paneel geen eindpunt maar een beginpunt, en
   * moet de lege tekst dat zeggen. Verwijzen naar "de termijnen" klopt daar niet: die zijn er niet.
   */
  isHoofdroute?: boolean
}) {
  const router = useRouter()
  const readOnly = useDossierReadOnly()
  const [voorstel, setVoorstel] = useState<RegieVoorstel | null>(initieel ?? null)
  const [tarieven, setTarieven] = useState<BtwTariefKeuze[]>([])
  // Alleen de code onthouden, niet de hele regel: het venster slaat per handeling op en haalt
  // daarna opnieuw op. Met een bevroren kopie zou het scherm zijn eigen wijziging niet zien.
  const [openCode, setOpenCode] = useState<string | null>(null)

  function herlaad() {
    getRegieFactuurvoorstel(dossierId).then(setVoorstel).catch(() => setVoorstel(null))
  }
  // Kwam er al een voorstel van de server mee, dan is de eerste lezing overbodig; daarna haalt elke
  // bewerking hem gewoon opnieuw op.
  const eersteLezingOvergeslagen = useRef(initieel != null)
  useEffect(() => {
    if (eersteLezingOvergeslagen.current) { eersteLezingOvergeslagen.current = false; return }
    herlaad()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dossierId])

  useEffect(() => {
    laadBtwTarieven().then(setTarieven).catch(() => setTarieven([]))
  }, [])

  if (voorstel == null) {
    return verbergAlsLeeg ? null : <div className="text-[13px] text-neutral-500">Nacalculatie laden…</div>
  }
  const leeg = voorstel.codes.length === 0 && voorstel.buitenBeschouwing.length === 0
  if (verbergAlsLeeg && leeg) return null

  // Geen eigen paginamarge: dit paneel staat in een kolom van het Verkoop-tab, dat zijn marge al zet.
  return (
    <>
      <Card>
        <CardHeader>Nacalculatie — regie en stelposten</CardHeader>
        <CardBody>
          {leeg ? (
            <p className="text-[13px] text-neutral-500">
              {isHoofdroute
                ? 'Er staan nog geen kosten of uren op dit dossier om te factureren. Zodra er uren geschreven zijn of inkoopfacturen zijn geboekt, verschijnen ze hier als factuurregels.'
                : 'Dit dossier heeft geen bewakingscodes die op nacalculatie afrekenen. Werk in de aanneemsom wordt via de termijnen gefactureerd, niet hier.'}
            </p>
          ) : (
            <>
              {voorstel.codes.length > 0 && (
                // Zes kolommen passen niet altijd in de kaart; zonder deze bak liep de tabel er
                // gewoon buiten in plaats van te schuiven.
                <div className="-mx-1 overflow-x-auto px-1">
                <table className="w-full min-w-[560px] border-collapse">
                  <thead>
                    <tr className="border-b-2 border-neutral-200 text-left text-[10.5px] font-bold uppercase tracking-[0.04em] text-neutral-500">
                      <th className="py-1.5 pr-2">Bewakingscode</th>
                      <th className="py-1.5 px-2 text-right">Kosten</th>
                      <th className="py-1.5 px-2 text-right">Berekend</th>
                      <th className="py-1.5 px-2 text-right" title="Wat er van deze post al op een factuur staat">
                        Al gefactureerd
                      </th>
                      <th className="py-1.5 px-2 text-right">Op de factuur</th>
                      <th className="py-1.5 pl-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {voorstel.codes.map(c => (
                      <tr key={c.bewakingscode}
                          className="border-b border-neutral-100 text-[12.5px]"
                          style={{ opacity: c.meefactureren ? 1 : 0.5 }}>
                        <td className="py-1.5 pr-2">
                          <div className="text-neutral-800">{c.omschrijving}</div>
                          <div className="text-[10px] uppercase tracking-wide text-neutral-400">
                            <span className="font-mono normal-case">{c.bewakingscode}</span>
                            {' · '}{BRON_LABEL[c.bron]}
                            {c.aantalBoekingen > 0 ? ` · ${c.aantalBoekingen} boeking${c.aantalBoekingen === 1 ? '' : 'en'}` : ''}
                            {c.vergrendeld ? ' · gefactureerd' : ''}
                            {!c.inBouw7 ? ' · nog niet in Bouw7' : ''}
                            {!c.meefactureren && !c.vergrendeld ? ' · niet meenemen' : ''}
                          </div>
                          {c.mandaat != null && (
                            // Al gefactureerd telt mee: het gaat om wat er in totaal op deze post
                            // geboekt is, zoals het contracttotaal het ook telt.
                            <div className="mt-1">
                              <MandaatIndicator mandaat={c.mandaat} geboekt={c.berekend + c.alGefactureerdBedrag} />
                            </div>
                          )}
                        </td>
                        <td className="py-1.5 px-2 text-right tabular-nums text-neutral-500">{fmt(c.inkoop)}</td>
                        <td className="py-1.5 px-2 text-right tabular-nums text-neutral-500">{fmt(c.berekend)}</td>
                        {/* Een streepje en niet € 0,00: bij een post waar nog niets van weg is zou een
                            nul-bedrag net zo hard in beeld staan als een echt gefactureerd bedrag. */}
                        <td className="py-1.5 px-2 text-right tabular-nums text-neutral-500">
                          {c.alGefactureerdBedrag === 0
                            ? <span className="text-neutral-400">&mdash;</span>
                            : fmt(c.alGefactureerdBedrag)}
                        </td>
                        <td className="py-1.5 px-2 text-right tabular-nums font-semibold text-neutral-900">
                          {c.vergrendeld || !c.meefactureren ? '—' : fmt(c.bedrag)}
                          {!c.vergrendeld && c.meefactureren && c.groepen.length > 0 && (
                            <span className="ml-1 text-[9.5px] font-normal uppercase text-neutral-400">
                              {c.groepen.length === 1 ? '1 regel' : `${c.groepen.length} regels`}
                              {c.groepen.some(g => g.bedragOverride != null) ? ' · vast' : ''}
                            </span>
                          )}
                        </td>
                        <td className="py-1.5 pl-2 text-right">
                          <button
                            type="button"
                            onClick={() => setOpenCode(c.bewakingscode)}
                            className="rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-brand-600 transition-colors hover:bg-brand-50"
                          >
                            {c.vergrendeld || readOnly ? 'Bekijken' : 'Aanpassen'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="text-[12.5px] font-bold text-neutral-900">
                      <td className="pt-2.5" colSpan={3}>Totaal excl. btw</td>
                      <td className="pt-2.5 px-2 text-right tabular-nums font-normal text-neutral-500">
                        {voorstel.alGefactureerdBedrag === 0 ? '' : fmt(voorstel.alGefactureerdBedrag)}
                      </td>
                      <td className="pt-2.5 px-2 text-right tabular-nums">{fmt(voorstel.totaal)}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
                </div>
              )}

              {voorstel.buitenBeschouwing.length > 0 && (
                <div className="mt-3 rounded-md border border-neutral-200 bg-neutral-50/60 p-2.5">
                  <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-neutral-400">
                    Blijft buiten deze factuur
                  </div>
                  {voorstel.buitenBeschouwing.map(b => (
                    <div key={b.bewakingscode} className="text-[11.5px] text-neutral-600">
                      <span className="font-mono text-[10px] text-neutral-400">{b.bewakingscode}</span>{' '}
                      {b.omschrijving} — {b.reden}
                    </div>
                  ))}
                </div>
              )}

              {!readOnly && voorstel.regels.length > 0 && (
                <p className="mt-3 border-t border-neutral-100 pt-3 text-[11.5px] text-neutral-500">
                  Klaarzetten in Bouw7 gaat per post: open een post met &quot;Aanpassen&quot; en zet
                  hem daar klaar.
                </p>
              )}

              {voorstel.codes.some(c => !c.inBouw7) && (
                <p className="mt-2 text-[10.5px]" style={{ color: 'var(--warning-800, #9a3412)' }}>
                  Een code die nog niet in Bouw7 staat kan geen kosten verzamelen en blijft daarom op nul.
                  {voorstel.codes.some(c => !c.inBouw7 && c.bron === 'regie')
                    // De regiecode wordt niet met een knop uitgedeeld maar door de sync; staat hij
                    // er niet, dan is de Bouw7-write mislukt en helpt opnieuw verversen.
                    ? ' Ververs het dossier vanuit Bouw7 om het opnieuw te proberen.'
                    : ' Maak hem aan met "Codes toewijzen" bij de stelposten op de Informatie-tab.'}
                </p>
              )}

              {voorstel.alGefactureerd > 0 && (
                <p className="mt-2 text-[10.5px] text-neutral-400">
                  {voorstel.alGefactureerd} boeking{voorstel.alGefactureerd === 1 ? '' : 'en'} staat al op een factuur
                  en telt hier niet meer mee.
                </p>
              )}
            </>
          )}
        </CardBody>
      </Card>

      <FactuurRegelVenster
        dossierId={dossierId}
        code={voorstel.codes.find(c => c.bewakingscode === openCode) ?? null}
        tarieven={tarieven}
        readOnly={readOnly}
        onSluit={() => setOpenCode(null)}
        onBewaard={herlaad}
        onGefactureerd={() => { herlaad(); router.refresh() }}
      />
    </>
  )
}
