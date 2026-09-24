'use client'

/**
 * De termijnentabel op de Verkoop-tab, met aanvinken en klaarzetten.
 *
 * Aanvinken kan alleen bij een termijn die nog geen factuurregel heeft; zodra er in Bouw7 een
 * factuur aan hangt is de termijn uit handen. Bij meer dan één termijn kies je of ze samen op één
 * conceptfactuur komen (één regel per termijn, zoals Bouw7 het zelf doet) of elk op een eigen
 * factuur. Dat laatste is gewoon de klaarzet-actie per termijn: elke termijn krijgt zo zijn eigen
 * idempotentiesleutel, dus een tweede klik na een half gelukte reeks maakt geen dubbelen.
 *
 * Staat er nog geen enkele termijn, dan is er niets te factureren maar wél iets aan te maken: het
 * termijnschema. Dat gaat via `TermijnschemaVenster`, dat zelf uitzoekt of de calculatie een
 * betalingsconditie kent.
 */

import React, { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { Button, RadioGroup, RadioGroupItem, useDialogen } from '@/components/ui'
import { useDossierReadOnly } from '@/components/dossiers/DossierReadOnlyContext'
import { zetTermijnenKlaar } from '@/lib/dossiers/termijnen'
import type { VerkoopTermijn, VerkoopTermijnStatus } from '@/lib/dossiers/actions'
import TermijnschemaVenster from './TermijnschemaVenster'
import { fmt, fmtPct, fmtDatum, TH, TD, LegeRij, type LegeCel } from './tab-ui'

const TERMIJN_STATUS: Record<VerkoopTermijnStatus, { label: string; kleur: string }> = {
  nog_te_factureren: { label: 'Nog te factureren', kleur: 'var(--amber-700, #b45309)' },
  concept: { label: 'Concept — niet verzonden', kleur: 'var(--orange-700, #c2410c)' },
  verzonden: { label: 'Verzonden', kleur: 'var(--accent)' },
  betaald: { label: 'Betaald', kleur: 'var(--green-700, #15803d)' },
  gefactureerd: { label: 'Gefactureerd', kleur: 'var(--accent)' },
}

export default function TermijnenBlok({ dossierId, termijnen, schemaMogelijk = true }: {
  dossierId: string
  termijnen: VerkoopTermijn[]
  /** Kent Bouw7 dit project überhaupt een termijnstaat toe? Zo niet, dan is er niets aan te maken. */
  schemaMogelijk?: boolean
}) {
  const router = useRouter()
  const readOnly = useDossierReadOnly()
  const { bevestig } = useDialogen()
  const [gekozen, setGekozen] = useState<Set<number>>(new Set())
  const [bezig, start] = useTransition()
  const [schemaOpen, setSchemaOpen] = useState(false)
  const [factuurWijze, setFactuurWijze] = useState<'samen' | 'apart'>('samen')

  // Aanmaken kan alleen op een leeg project; een bestaande termijnstaat is in Bouw7 gezet en blijft
  // daar het werk van de administratie.
  const kanSchemaMaken = !readOnly && schemaMogelijk && termijnen.length === 0

  const selecteerbaar = termijnen.filter(t => !t.gefactureerd)
  const kanKiezen = !readOnly && selecteerbaar.length > 0
  const selectie = selecteerbaar.filter(t => gekozen.has(t.bouw7TermId))
  const totaalExcl = selectie.reduce((s, t) => s + t.bedrag, 0)
  const totaalIncl = selectie.reduce((s, t) => s + t.bedragIncl, 0)

  function wissel(id: number, aan: boolean) {
    setGekozen(prev => {
      const next = new Set(prev)
      if (aan) next.add(id); else next.delete(id)
      return next
    })
  }

  const apart = factuurWijze === 'apart' && selectie.length > 1

  async function klaarzetten() {
    const ja = await bevestig({
      titel: apart ? `${selectie.length} conceptfacturen klaarzetten in Bouw7?` : 'Conceptfactuur klaarzetten in Bouw7?',
      omschrijving: (apart
        ? `${selectie.length} termijnen van samen ${fmt(totaalExcl)} excl. btw (${fmt(totaalIncl)} incl.) `
          + 'komen elk op een eigen conceptfactuur in Bouw7 te staan. '
        : `${selectie.length} termijn${selectie.length === 1 ? '' : 'en'} van samen ${fmt(totaalExcl)} `
          + `excl. btw (${fmt(totaalIncl)} incl.) komt als één conceptfactuur in Bouw7 te staan. `)
        + `De factu${apart ? 'ren krijgen' : 'ur krijgt'} nog geen factuurnummer; de administratie verstuurt ze daar.`,
      bevestigLabel: 'Klaarzetten',
    })
    if (!ja) return

    start(async () => {
      if (!apart) {
        const r = await zetTermijnenKlaar(dossierId, selectie.map(t => t.bouw7TermId))
        if (!r.ok) { toast.error(r.error, { duration: 9000 }); router.refresh(); return }
        toast.success(`Conceptfactuur klaargezet in Bouw7 — ${r.aantal} termijn${r.aantal === 1 ? '' : 'en'}, ${fmt(r.totaalExclBtw)} excl. btw.`)
        setGekozen(new Set())
        router.refresh()
        return
      }

      // Eén voor één: een fout bij termijn 3 mag 1 en 2 niet ongedaan maken, en moet wel gemeld
      // worden. Wat gelukt is gaat uit de selectie, zodat een tweede klik alleen de rest doet.
      const gelukt: number[] = []
      const fouten: string[] = []
      for (const t of selectie) {
        const r = await zetTermijnenKlaar(dossierId, [t.bouw7TermId])
        if (r.ok) gelukt.push(t.bouw7TermId)
        else fouten.push(`${t.omschrijving ?? `Termijn ${t.nummer}`}: ${r.error}`)
      }
      setGekozen(prev => {
        const next = new Set(prev)
        for (const id of gelukt) next.delete(id)
        return next
      })
      if (gelukt.length > 0) toast.success(`${gelukt.length} conceptfactu${gelukt.length === 1 ? 'ur' : 'ren'} klaargezet in Bouw7.`)
      if (fouten.length > 0) toast.error(fouten.join(' · '), { duration: 12000 })
      router.refresh()
    })
  }

  const tabel: React.CSSProperties = { width: '100%', borderCollapse: 'collapse' }
  const alleGekozen = selecteerbaar.length > 0 && selecteerbaar.every(t => gekozen.has(t.bouw7TermId))

  return (
    <>
      <table style={{ ...tabel, minWidth: kanKiezen ? 900 : 860 }}>
        <thead>
          <tr>
            {kanKiezen && (
              <TH>
                <input
                  type="checkbox"
                  checked={alleGekozen}
                  aria-label="Alle nog te factureren termijnen selecteren"
                  onChange={e => setGekozen(e.target.checked
                    ? new Set(selecteerbaar.map(t => t.bouw7TermId))
                    : new Set())}
                />
              </TH>
            )}
            <TH>#</TH>
            <TH breedte="35%">Omschrijving</TH>
            <TH right>%</TH>
            <TH right>Excl. BTW</TH>
            <TH right>BTW%</TH>
            <TH right>BTW</TH>
            <TH right>Incl. BTW</TH>
            <TH>Factureerbaar</TH>
            <TH>Status</TH>
          </tr>
        </thead>
        <tbody>
          {/* Nog geen termijnstaat: de kolommen blijven staan met een nulregel, zodat zichtbaar is
              welke gegevens een termijn draagt. De knop om er een aan te maken staat eronder. */}
          {termijnen.length === 0 && (
            <LegeRij velden={[
              ...(kanKiezen ? (['leeg'] as LegeCel[]) : []),
              'tekst', 'tekst', 'pct', 'bedrag', 'pct', 'bedrag', 'bedrag', 'tekst', 'tekst',
            ]} />
          )}
          {termijnen.map((tm) => (
            <tr key={tm.bouw7TermId}>
              {kanKiezen && (
                <TD>
                  {tm.gefactureerd ? null : (
                    <input
                      type="checkbox"
                      checked={gekozen.has(tm.bouw7TermId)}
                      disabled={bezig}
                      aria-label={`Termijn ${tm.nummer} selecteren`}
                      onChange={e => wissel(tm.bouw7TermId, e.target.checked)}
                    />
                  )}
                </TD>
              )}
              <TD>{tm.nummer}</TD>
              <TD wrap>{tm.omschrijving ?? '—'}</TD>
              <TD right>{fmtPct(tm.percentage)}</TD>
              <TD right>{fmt(tm.bedrag)}</TD>
              <TD right kleur="var(--neutral-500)">{fmtPct(tm.btwPercentage)}</TD>
              <TD right>{tm.btwBedrag > 0 ? fmt(tm.btwBedrag) : '—'}</TD>
              <TD right vet>{fmt(tm.bedragIncl)}</TD>
              <TD>{fmtDatum(tm.invoiceableAt)}</TD>
              <TD kleur={TERMIJN_STATUS[tm.status].kleur}>{TERMIJN_STATUS[tm.status].label}</TD>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ background: 'var(--neutral-50)', fontWeight: 600, fontSize: 12.5 }}>
            <td colSpan={kanKiezen ? 4 : 3} style={{ padding: '6px 12px', color: 'var(--neutral-600)' }}>Totaal</td>
            <td style={{ padding: '6px 12px', textAlign: 'right', color: 'var(--neutral-800)' }}>
              {fmt(termijnen.reduce((s, tm) => s + tm.bedrag, 0), true)}
            </td>
            <td style={{ padding: '6px 12px' }} />
            <td style={{ padding: '6px 12px', textAlign: 'right', color: 'var(--neutral-800)' }}>
              {fmt(termijnen.reduce((s, tm) => s + tm.btwBedrag, 0), true)}
            </td>
            <td style={{ padding: '6px 12px', textAlign: 'right', color: 'var(--neutral-800)' }}>
              {fmt(termijnen.reduce((s, tm) => s + tm.bedragIncl, 0), true)}
            </td>
            <td colSpan={2} style={{ padding: '6px 12px' }} />
          </tr>
        </tfoot>
      </table>

      {termijnen.length === 0 && schemaMogelijk && (
        <div style={{ padding: '10px 12px', borderTop: '1px solid var(--neutral-100)' }}>
          <span style={{ fontSize: 12.5, color: 'var(--neutral-500)' }}>Geen termijnen ingesteld in Bouw7.</span>
          {kanSchemaMaken && (
            <div style={{ marginTop: 10 }}>
              <Button variant="primary" onClick={() => setSchemaOpen(true)}>Termijnen aanmaken</Button>
            </div>
          )}
        </div>
      )}

      {kanSchemaMaken && (
        <TermijnschemaVenster
          dossierId={dossierId}
          open={schemaOpen}
          onSluit={() => setSchemaOpen(false)}
          onKlaar={() => router.refresh()}
        />
      )}

      {kanKiezen && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap',
          gap: 12, padding: '10px 12px', borderTop: '1px solid var(--neutral-100)',
        }}>
          <span style={{ fontSize: 12.5, color: 'var(--neutral-500)' }}>
            {selectie.length === 0
              ? 'Vink de termijnen aan die gefactureerd mogen worden.'
              : `${selectie.length} geselecteerd — ${fmt(totaalExcl)} excl. btw, ${fmt(totaalIncl)} incl.`}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 16, marginLeft: 'auto' }}>
            {selectie.length > 1 && (
              <RadioGroup
                value={factuurWijze}
                onValueChange={v => setFactuurWijze(v as 'samen' | 'apart')}
                disabled={bezig}
                aria-label="Hoe de termijnen gefactureerd worden"
                style={{ display: 'flex', gap: 16 }}
              >
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--neutral-700)', whiteSpace: 'nowrap', cursor: 'pointer' }}>
                  <RadioGroupItem value="samen" /> Samen op 1 factuur
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--neutral-700)', whiteSpace: 'nowrap', cursor: 'pointer' }}>
                  <RadioGroupItem value="apart" /> Elke termijn een eigen factuur
                </label>
              </RadioGroup>
            )}
            <Button variant="primary" onClick={klaarzetten} disabled={bezig || selectie.length === 0}>
              {bezig ? 'Bezig…' : apart ? `${selectie.length} facturen klaarzetten` : `Klaarzetten in Bouw7 (${selectie.length})`}
            </Button>
          </div>
        </div>
      )}
    </>
  )
}
