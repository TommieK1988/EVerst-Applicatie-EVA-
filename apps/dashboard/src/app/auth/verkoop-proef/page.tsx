/**
 * TIJDELIJKE VOORBEELDPAGINA — niet committen.
 *
 * Route onder /auth/ omdat `middleware.ts` die uitsluit van de login-redirect: zo is de layout op
 * echte breedte te bekijken zonder sessie. Gebruikt de échte TermijnenBlok en FactuurRegelVenster;
 * de tabellen die in VerkoopTab zelf staan zijn hier nagebouwd met dezelfde kolombreedtes, want
 * daar gaat de proef over.
 */
'use client'

import React, { useState } from 'react'
import { Card, CardHeader, CardBody } from '@/components/ui'
import { fmt, fmtPct, TH, TD } from '@/components/dossiers/tabs/tab-ui'
import TermijnenBlok from '@/components/dossiers/tabs/TermijnenBlok'
import FactuurRegelVenster from '@/components/dossiers/tabs/FactuurRegelVenster'
import MandaatIndicator from '@/components/dossiers/tabs/MandaatIndicator'
import type { VerkoopTermijn } from '@/lib/dossiers/actions'
import type { CodeRegelView } from '@/lib/dossiers/servicedesk'
import type { BtwTariefKeuze } from '@/lib/stamdata/btw'

const tabel: React.CSSProperties = { width: '100%', borderCollapse: 'collapse' }

const Kolommen = ({ children }: { children: React.ReactNode }) => (
  <div style={{
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(460px, 1fr))',
    alignItems: 'start',
    gap: 16,
  }}>{children}</div>
)
const Kolom = ({ children }: { children: React.ReactNode }) => (
  <div style={{ minWidth: 0 }}>{children}</div>
)

const termijnen: VerkoopTermijn[] = [1, 2, 3].map((n) => ({
  nummer: n,
  bouw7TermId: n,
  omschrijving: n === 1 ? 'Aanbetaling bij opdracht' : n === 2 ? 'Bij aanvang werkzaamheden' : 'Bij oplevering',
  percentage: n === 3 ? 40 : 30,
  bedrag: n === 3 ? 48250.4 : 36187.8,
  btwPercentage: 21,
  btwBedrag: n === 3 ? 10132.58 : 7599.44,
  bedragIncl: n === 3 ? 58382.98 : 43787.24,
  gefactureerd: n === 1,
  status: n === 1 ? 'betaald' : 'nog_te_factureren',
  invoiceableAt: null,
  vatTariffId: 2,
  statementId: 9,
}))

const tarieven: BtwTariefKeuze[] = [
  { id: '1', label: 'Hoog 21%', percentage: 21, verlegd: false, bouw7_id: 2 },
  { id: '2', label: 'Laag 9%', percentage: 9, verlegd: false, bouw7_id: 3 },
  { id: '3', label: 'Verlegd Hoog 21%', percentage: 0, verlegd: true, bouw7_id: 7 },
]

const codes: CodeRegelView[] = [
  {
    bewakingscode: '4300', bron: 'meerwerk', omschrijving: 'Extra herstelwerk kozijnen zuidgevel',
    inkoop: 4820.15, berekend: 6023.44, bedrag: 6023.44, opslagPct: 25, groepering: 'per_soort',
    btwTariefBouw7Id: null, meefactureren: true, groepen: [], boekingen: [],
    urenBedrag: 3800, kostenBedrag: 2223.44, urenAantal: 76.5,
    aantalBoekingen: 12, aantalGefactureerd: 0, alGefactureerdBedrag: 0,
    // Meer geboekt dan het mandaat: toont de indicator.
    inBouw7: true, vergrendeld: false, mandaat: 5000,
  },
  {
    bewakingscode: '4310', bron: 'stelpost', omschrijving: 'Stelpost schilderwerk buitenzijde',
    inkoop: 11240, berekend: 14050, bedrag: 5825.35, opslagPct: null, groepering: 'samen',
    btwTariefBouw7Id: null, meefactureren: true, groepen: [], boekingen: [],
    urenBedrag: 9000, kostenBedrag: 5050, urenAantal: 180,
    aantalBoekingen: 4, aantalGefactureerd: 9, alGefactureerdBedrag: 8224.65,
    inBouw7: true, vergrendeld: false, mandaat: null,
  },
  {
    bewakingscode: '4320', bron: 'meerwerk', omschrijving: 'Voorrijkosten en opstart',
    inkoop: 0, berekend: 950, bedrag: 0, opslagPct: null, groepering: 'samen',
    btwTariefBouw7Id: null, meefactureren: true, groepen: [], boekingen: [],
    urenBedrag: 0, kostenBedrag: 950, urenAantal: 0,
    aantalBoekingen: 0, aantalGefactureerd: 2, alGefactureerdBedrag: 950,
    // Binnen het mandaat: alleen het mandaat ter informatie.
    inBouw7: true, vergrendeld: true, mandaat: 2500,
  },
]
const alGefactureerdTotaal = codes.reduce((s, c) => s + c.alGefactureerdBedrag, 0)
const voorstelTotaal = codes.reduce((s, c) => s + (c.vergrendeld ? 0 : c.bedrag), 0)

const facturen = [
  { factuurnummer: '2026-0412', datum: '14-05-2026', vervaldatum: '13-06-2026', bedragExcl: 36187.8, btwBedrag: 7599.44, bedrag: 43787.24, betaald: true },
  { factuurnummer: '2026-0587', datum: '02-07-2026', vervaldatum: '01-08-2026', bedragExcl: 8224.65, btwBedrag: 1727.18, bedrag: 9951.83, betaald: false },
]

const proefCode: CodeRegelView = {
  ...codes[0],
  groepen: [
    {
      groepSleutel: 'uur:Timmerman', omschrijving: 'Timmerwerk kozijnen', eigenOmschrijving: null,
      berekend: 3800, bedragOverride: null, bedrag: 3800, aantal: 76.5, stukprijs: 49.67,
      eenheid: 'uur', btwTariefBouw7Id: null, meefactureren: true, aantalBoekingen: 8,
      handmatig: false, los: false, gefactureerd: false,
    },
    {
      groepSleutel: 'kost:Materiaal', omschrijving: 'Materiaal', eigenOmschrijving: null,
      berekend: 2223.44, bedragOverride: null, bedrag: 2223.44, aantal: 1, stukprijs: 2223.44,
      eenheid: null, btwTariefBouw7Id: 3, meefactureren: true, aantalBoekingen: 4,
      handmatig: false, los: false, gefactureerd: false,
    },
    {
      groepSleutel: 'los:abc', omschrijving: 'Voorrijkosten', eigenOmschrijving: 'Voorrijkosten',
      berekend: 0, bedragOverride: 85, bedrag: 255, aantal: 3, stukprijs: 85,
      eenheid: 'dag', btwTariefBouw7Id: null, meefactureren: true, aantalBoekingen: 0,
      handmatig: false, los: true, gefactureerd: false,
    },
  ],
  boekingen: [
    {
      sleutel: 'uur:1', bronType: 'uur', bronBouw7Id: '1', datum: '2026-06-03',
      omschrijving: 'Timmerman — J. de Vries', herkomst: 'J. de Vries', soort: 'Timmerman',
      aantal: 8, eenheid: 'uur', inkoopBedrag: 312, verkoopTarief: 49.67, opslagPct: 27.35,
      verkoopBedrag: 397.36, handmatigePrijs: false, uitgesloten: false, gefactureerd: false,
      groepSleutel: 'uur:Timmerman', handmatigToegewezen: false,
    },
    {
      sleutel: 'kost:2', bronType: 'kost', bronBouw7Id: '2', datum: '2026-06-11',
      omschrijving: 'Hout en beslag', herkomst: 'Isero', soort: 'Materiaal',
      aantal: null, eenheid: null, inkoopBedrag: 1778.75, verkoopTarief: null, opslagPct: 25,
      verkoopBedrag: 2223.44, handmatigePrijs: false, uitgesloten: false, gefactureerd: false,
      groepSleutel: 'kost:Materiaal', handmatigToegewezen: false,
    },
    {
      sleutel: 'uur:3', bronType: 'uur', bronBouw7Id: '3', datum: '2026-05-28',
      omschrijving: 'Timmerman — A. Bakker', herkomst: 'A. Bakker', soort: 'Timmerman',
      aantal: 6.5, eenheid: 'uur', inkoopBedrag: 253.5, verkoopTarief: 49.67, opslagPct: 27.35,
      verkoopBedrag: 322.86, handmatigePrijs: false, uitgesloten: false, gefactureerd: true,
      groepSleutel: 'uur:Timmerman', handmatigToegewezen: false,
    },
  ],
}

export default function VerkoopProef() {
  const [open, setOpen] = useState(false)
  return (
    <div className="eva" style={{ background: 'var(--bg)', minHeight: '100vh' }}>
      <div style={{ padding: '28px 32px', maxWidth: 1100 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          <Kolommen>
            <Kolom>
              <Card>
                <CardHeader>Overzicht</CardHeader>
                <CardBody style={{ padding: 0, overflowX: 'auto' }}>
                  <table style={tabel}>
                    <thead>
                      <tr>
                        <TH />
                        <TH right breedte={104}>Excl. BTW</TH>
                        <TH right breedte={92}>BTW</TH>
                        <TH right breedte={104}>Incl. BTW</TH>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <TD wrap>Aanneemsom</TD>
                        <TD right>{fmt(120626, true)}</TD>
                        <TD right kleur="var(--neutral-400)">—</TD>
                        <TD right kleur="var(--neutral-400)">—</TD>
                      </tr>
                      <tr>
                        <TD wrap>
                          Goedgekeurd meerwerk — regie en stelposten
                          <span style={{ fontSize: 11, color: 'var(--neutral-400)', marginLeft: 6 }}>via nacalculatie</span>
                        </TD>
                        <TD right accent>{fmt(20999.44, true)}</TD>
                        <TD right kleur="var(--neutral-400)">—</TD>
                        <TD right kleur="var(--neutral-400)">—</TD>
                      </tr>
                      <tr style={{ borderTop: '1px solid var(--neutral-100)' }}>
                        <TD vet wrap>Contracttotaal</TD>
                        <TD right vet>{fmt(141625.44, true)}</TD>
                        <TD right kleur="var(--neutral-400)">—</TD>
                        <TD right kleur="var(--neutral-400)">—</TD>
                      </tr>
                      <tr>
                        <TD wrap>BTW {fmtPct(21)}</TD>
                        <TD right>{fmt(120626, true)}</TD>
                        <TD right>{fmt(25331.46, true)}</TD>
                        <TD right>{fmt(145957.46, true)}</TD>
                      </tr>
                      <tr style={{ background: 'var(--neutral-50)' }}>
                        <TD vet wrap>Totaal</TD>
                        <TD right vet>{fmt(141625.44, true)}</TD>
                        <TD right vet>{fmt(25331.46, true)}</TD>
                        <TD right vet accent>{fmt(166956.9, true)}</TD>
                      </tr>
                    </tbody>
                  </table>
                </CardBody>
              </Card>
            </Kolom>
            <Kolom>
              <Card>
                <CardHeader>Verkoopfacturen</CardHeader>
                <CardBody style={{ padding: 0, overflowX: 'auto' }}>
                  <table style={{ ...tabel, minWidth: 520 }}>
                    <thead>
                      <tr>
                        <TH>Factuurnr.</TH>
                        <TH>Datum</TH>
                        <TH>Vervaldatum</TH>
                        <TH right>Excl. BTW</TH>
                        <TH right>BTW</TH>
                        <TH right>Incl. BTW</TH>
                        <TH>Status</TH>
                      </tr>
                    </thead>
                    <tbody>
                      {facturen.map((f, i) => (
                        <tr key={i}>
                          <TD wrap>{f.factuurnummer}</TD>
                          <TD>{f.datum}</TD>
                          <TD>{f.vervaldatum}</TD>
                          <TD right>{fmt(f.bedragExcl)}</TD>
                          <TD right kleur="var(--neutral-500)">{fmt(f.btwBedrag)}</TD>
                          <TD right vet>{fmt(f.bedrag)}</TD>
                          <TD kleur={f.betaald ? 'var(--accent)' : undefined}>{f.betaald ? 'Betaald' : 'Open'}</TD>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{ background: 'var(--neutral-50)', fontWeight: 600, fontSize: 12.5 }}>
                        <td colSpan={3} style={{ padding: '6px 12px', color: 'var(--neutral-600)' }}>Totaal</td>
                        <td style={{ padding: '6px 12px', textAlign: 'right' }}>{fmt(44412.45)}</td>
                        <td style={{ padding: '6px 12px', textAlign: 'right' }}>{fmt(9326.62)}</td>
                        <td style={{ padding: '6px 12px', textAlign: 'right' }}>{fmt(53739.07)}</td>
                        <td style={{ padding: '6px 12px' }} />
                      </tr>
                    </tfoot>
                  </table>
                </CardBody>
              </Card>
            </Kolom>
          </Kolommen>

          <Kolommen>
            <Kolom>
              <Card>
                <CardHeader>Termijnen</CardHeader>
                <CardBody style={{ padding: 0, overflowX: 'auto' }}>
                  <TermijnenBlok dossierId="proef" termijnen={termijnen} />
                </CardBody>
              </Card>
            </Kolom>
            <Kolom>
              <Card>
                <CardHeader>Nacalculatie — regie en stelposten</CardHeader>
                <CardBody>
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="border-b-2 border-neutral-200 text-left text-[10.5px] font-bold uppercase tracking-[0.04em] text-neutral-500">
                        <th className="py-1.5 pr-2">Bewakingscode</th>
                        <th className="py-1.5 px-2 text-right">Kosten</th>
                        <th className="py-1.5 px-2 text-right">Berekend</th>
                        <th className="py-1.5 px-2 text-right">Al gefactureerd</th>
                        <th className="py-1.5 px-2 text-right">Op de factuur</th>
                        <th className="py-1.5 pl-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {codes.map(c => (
                        <tr key={c.bewakingscode} className="border-b border-neutral-100 text-[12.5px]">
                          <td className="py-1.5 pr-2">
                            <div className="text-neutral-800">{c.omschrijving}</div>
                            <div className="text-[10px] uppercase tracking-wide text-neutral-400">
                              <span className="font-mono normal-case">{c.bewakingscode}</span>
                              {' · '}{c.bron === 'stelpost' ? 'stelpost' : 'meerwerk (regie)'}
                              {c.aantalBoekingen > 0 ? ' · ' + c.aantalBoekingen + ' boekingen' : ''}
                              {c.vergrendeld ? ' · gefactureerd' : ''}
                            </div>
                            {c.mandaat != null && (
                              <div className="mt-1">
                                <MandaatIndicator mandaat={c.mandaat} geboekt={c.berekend + c.alGefactureerdBedrag} />
                              </div>
                            )}
                          </td>
                          <td className="py-1.5 px-2 text-right tabular-nums text-neutral-500">{fmt(c.inkoop)}</td>
                          <td className="py-1.5 px-2 text-right tabular-nums text-neutral-500">{fmt(c.berekend)}</td>
                          <td className="py-1.5 px-2 text-right tabular-nums text-neutral-500">
                            {c.alGefactureerdBedrag === 0
                              ? <span className="text-neutral-400">&mdash;</span>
                              : fmt(c.alGefactureerdBedrag)}
                          </td>
                          <td className="py-1.5 px-2 text-right tabular-nums font-semibold text-neutral-900">
                            {c.vergrendeld ? '—' : fmt(c.bedrag)}
                          </td>
                          <td className="py-1.5 pl-2 text-right">
                            <button type="button" onClick={() => setOpen(true)}
                              className="rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-brand-600 hover:bg-brand-50">
                              {c.vergrendeld ? 'Bekijken' : 'Aanpassen'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="text-[12.5px] font-bold text-neutral-900">
                        <td className="pt-2.5" colSpan={3}>Totaal excl. btw</td>
                        <td className="pt-2.5 px-2 text-right tabular-nums font-normal text-neutral-500">
                          {fmt(alGefactureerdTotaal)}
                        </td>
                        <td className="pt-2.5 px-2 text-right tabular-nums">{fmt(voorstelTotaal)}</td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                  <p className="mt-3 border-t border-neutral-100 pt-3 text-[11.5px] text-neutral-500">
                    Klaarzetten in Bouw7 gaat per post: open een post met &quot;Aanpassen&quot; en zet
                    hem daar klaar.
                  </p>
                </CardBody>
              </Card>
            </Kolom>
          </Kolommen>

        </div>
      </div>

      <FactuurRegelVenster
        dossierId="proef"
        code={open ? proefCode : null}
        tarieven={tarieven}
        onSluit={() => setOpen(false)}
        onBewaard={() => {}}
        onGefactureerd={() => {}}
      />
    </div>
  )
}
