'use client'

/**
 * De termijnentabel op de Verkoop-tab, met aanvinken en klaarzetten.
 *
 * Aanvinken kan alleen bij een termijn die nog geen factuurregel heeft; zodra er in Bouw7 een
 * factuur aan hangt is de termijn uit handen. De knop maakt van de hele selectie één
 * conceptfactuur — dat is ook precies hoe Bouw7 het zelf doet als je daar meerdere termijnen
 * tegelijk factureert: één regel per termijn.
 */

import React, { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { Button, useDialogen } from '@/components/ui'
import { useDossierReadOnly } from '@/components/dossiers/DossierReadOnlyContext'
import { zetTermijnenKlaar, maakTermijnschemaInBouw7 } from '@/lib/dossiers/termijnen'
import { laadBtwTarieven } from '@/lib/stamdata/btw-actions'
import type { BtwTariefKeuze } from '@/lib/stamdata/btw'
import type { VerkoopTermijn, VerkoopTermijnStatus } from '@/lib/dossiers/actions'
import { fmt, fmtPct, fmtDatum, TH, TD } from './tab-ui'

const TERMIJN_STATUS: Record<VerkoopTermijnStatus, { label: string; kleur: string }> = {
  nog_te_factureren: { label: 'Nog te factureren', kleur: 'var(--amber-700, #b45309)' },
  concept: { label: 'Concept — niet verzonden', kleur: 'var(--orange-700, #c2410c)' },
  verzonden: { label: 'Verzonden', kleur: 'var(--accent)' },
  betaald: { label: 'Betaald', kleur: 'var(--green-700, #15803d)' },
  gefactureerd: { label: 'Gefactureerd', kleur: 'var(--accent)' },
}

export default function TermijnenBlok({ dossierId, termijnen, offerteTermijnen }: {
  dossierId: string
  termijnen: VerkoopTermijn[]
  /** Aantal termijnen dat de betalingsconditie op de offerte kent; 0 = geen schema beschikbaar. */
  offerteTermijnen: number
}) {
  const router = useRouter()
  const readOnly = useDossierReadOnly()
  const { bevestig } = useDialogen()
  const [gekozen, setGekozen] = useState<Set<number>>(new Set())
  const [bezig, start] = useTransition()
  const [tarieven, setTarieven] = useState<BtwTariefKeuze[]>([])
  const [tariefId, setTariefId] = useState<number | null>(null)

  const kanSchemaMaken = !readOnly && termijnen.length === 0 && offerteTermijnen > 0
  useEffect(() => {
    if (!kanSchemaMaken) return
    laadBtwTarieven().then(t => {
      setTarieven(t)
      const standaard = t.find(x => !x.verlegd && Math.abs(x.percentage - 21) < 0.01) ?? t[0]
      if (standaard) setTariefId(standaard.bouw7_id ?? null)
    }).catch(() => setTarieven([]))
  }, [kanSchemaMaken])

  async function schemaAanmaken() {
    if (tariefId == null) return
    const ja = await bevestig({
      titel: 'Termijnschema aanmaken in Bouw7?',
      omschrijving: `De ${offerteTermijnen} termijnen van de betalingsconditie op de offerte worden op de `
        + 'aanneemsom omgerekend en als termijnstaat in Bouw7 gezet. Er wordt nog niets gefactureerd.',
      bevestigLabel: 'Aanmaken',
    })
    if (!ja) return
    start(async () => {
      const r = await maakTermijnschemaInBouw7(dossierId, tariefId)
      if (!r.ok) { toast.error(r.error, { duration: 9000 }); router.refresh(); return }
      const extra = r.overgeslagen.length > 0
        ? ` ${r.overgeslagen.length} termijn(en) overgeslagen omdat er al een factuur aan hangt.` : ''
      toast.success(`Termijnschema in Bouw7 gezet — ${r.aangemaakt} nieuw, ${r.bijgewerkt} bijgewerkt.${extra}`)
      router.refresh()
    })
  }

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

  async function klaarzetten() {
    const ja = await bevestig({
      titel: 'Conceptfactuur klaarzetten in Bouw7?',
      omschrijving: `${selectie.length} termijn${selectie.length === 1 ? '' : 'en'} van samen ${fmt(totaalExcl)} `
        + `excl. btw (${fmt(totaalIncl)} incl.) komt als één conceptfactuur in Bouw7 te staan. `
        + 'De factuur krijgt nog geen factuurnummer; de administratie verstuurt hem daar.',
      bevestigLabel: 'Klaarzetten',
    })
    if (!ja) return

    start(async () => {
      const r = await zetTermijnenKlaar(dossierId, selectie.map(t => t.bouw7TermId))
      if (!r.ok) { toast.error(r.error, { duration: 9000 }); router.refresh(); return }
      toast.success(`Conceptfactuur klaargezet in Bouw7 — ${r.aantal} termijn${r.aantal === 1 ? '' : 'en'}, ${fmt(r.totaalExclBtw)} excl. btw.`)
      setGekozen(new Set())
      router.refresh()
    })
  }

  const tabel: React.CSSProperties = { width: '100%', borderCollapse: 'collapse' }
  const alleGekozen = selecteerbaar.length > 0 && selecteerbaar.every(t => gekozen.has(t.bouw7TermId))

  if (termijnen.length === 0) {
    return (
      <div style={{ padding: '12px', fontSize: 13, color: 'var(--neutral-500)' }}>
        <p style={{ margin: 0 }}>Geen termijnen ingesteld in Bouw7.</p>
        {kanSchemaMaken && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5 }}>
              <span>Btw</span>
              <select
                value={tariefId ?? ''}
                onChange={e => setTariefId(e.target.value ? Number(e.target.value) : null)}
                disabled={bezig}
                aria-label="Btw-tarief voor de termijnen"
                style={{
                  border: '1px solid var(--neutral-200)', borderRadius: 4,
                  padding: '2px 6px', fontSize: 12.5, background: 'white',
                }}
              >
                {tarieven.map(t => (
                  <option key={t.bouw7_id ?? t.label} value={t.bouw7_id ?? ''}>{t.label}</option>
                ))}
              </select>
            </label>
            <Button variant="primary" onClick={schemaAanmaken} disabled={bezig || tariefId == null}>
              {bezig ? 'Bezig…' : `Termijnschema uit de offerte aanmaken (${offerteTermijnen})`}
            </Button>
          </div>
        )}
      </div>
    )
  }

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
              {fmt(termijnen.reduce((s, tm) => s + tm.bedrag, 0))}
            </td>
            <td style={{ padding: '6px 12px' }} />
            <td style={{ padding: '6px 12px', textAlign: 'right', color: 'var(--neutral-800)' }}>
              {fmt(termijnen.reduce((s, tm) => s + tm.btwBedrag, 0))}
            </td>
            <td style={{ padding: '6px 12px', textAlign: 'right', color: 'var(--neutral-800)' }}>
              {fmt(termijnen.reduce((s, tm) => s + tm.bedragIncl, 0))}
            </td>
            <td colSpan={2} style={{ padding: '6px 12px' }} />
          </tr>
        </tfoot>
      </table>

      {kanKiezen && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 12, padding: '10px 12px', borderTop: '1px solid var(--neutral-100)',
        }}>
          <span style={{ fontSize: 12.5, color: 'var(--neutral-500)' }}>
            {selectie.length === 0
              ? 'Vink de termijnen aan die gefactureerd mogen worden.'
              : `${selectie.length} geselecteerd — ${fmt(totaalExcl)} excl. btw, ${fmt(totaalIncl)} incl.`}
          </span>
          <Button variant="primary" onClick={klaarzetten} disabled={bezig || selectie.length === 0}>
            {bezig ? 'Bezig…' : `Klaarzetten in Bouw7 (${selectie.length})`}
          </Button>
        </div>
      )}
    </>
  )
}
