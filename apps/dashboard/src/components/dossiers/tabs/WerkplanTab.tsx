'use client'

/**
 * Werkplan op een opdracht-dossier: wat de uitvoering op dit werk moet weten. Werkvoorbereiding
 * vult het hier in; de uitvoering leest het ook op de telefoon (/m, tab Werkplan).
 */

import { useState, useTransition } from 'react'
import toast from 'react-hot-toast'
import { Button, Card, CardBody, CardHeader, FormField, FormSection, Input, Textarea } from '@/components/ui'
import { useDossierReadOnly } from '@/components/dossiers/DossierReadOnlyContext'
import { slaWerkplanOp } from '@/lib/dossiers/werkplan'
import {
  LEEG_WERKPLAN, PARKEREN_TEKST, REISKOSTEN_TEKST, REISUREN_TEKST, WERKTIJDEN_TEKST, werkplanSchema,
  type KleurMateriaal, type Werkplan, type WerkplanInvoer,
} from '@/lib/dossiers/werkplan-types'
import type { Betrokkene } from '@/lib/dossiers/betrokkenen-types'
import WerkafspraakKeuze from './werkplan/WerkafspraakKeuze'
import KleurenMaterialenTabel from './werkplan/KleurenMaterialenTabel'
import WerkplanBetrokkenen from './werkplan/WerkplanBetrokkenen'

/** Getallen staan in het formulier als tekst, zodat "1,5" halverwege het typen niet wegvalt. */
type Formulier = Omit<WerkplanInvoer, 'reisuren_uren' | 'reiskosten_km' | 'parkeren_max_per_dag' | 'kleuren_materialen'> & {
  reisuren_uren: string
  reiskosten_km: string
  parkeren_max_per_dag: string
  kleuren_materialen: KleurMateriaal[]
}

const alsTekst = (n: number | null | undefined) => (n == null ? '' : String(n).replace('.', ','))
const alsGetal = (s: string): number | null => {
  const t = s.trim().replace(',', '.')
  if (t === '') return null
  const n = Number(t)
  return Number.isFinite(n) ? n : NaN
}

function naarFormulier(w: Werkplan | null): Formulier {
  const bron: WerkplanInvoer = w ?? LEEG_WERKPLAN
  return {
    ...bron,
    reisuren_uren: alsTekst(bron.reisuren_uren),
    reiskosten_km: alsTekst(bron.reiskosten_km),
    parkeren_max_per_dag: alsTekst(bron.parkeren_max_per_dag),
    kleuren_materialen: bron.kleuren_materialen ?? [],
  }
}

function naarInvoer(f: Formulier): WerkplanInvoer {
  return {
    ...f,
    reisuren_uren: alsGetal(f.reisuren_uren),
    reiskosten_km: alsGetal(f.reiskosten_km),
    parkeren_max_per_dag: alsGetal(f.parkeren_max_per_dag),
  }
}

const datumTijd = (iso: string) =>
  new Date(iso).toLocaleString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

export default function WerkplanTab({ dossierId, werkplan, betrokkenen, informatieHref }: {
  dossierId: string
  werkplan: Werkplan | null
  betrokkenen: Betrokkene[]
  informatieHref: string
}) {
  const readOnly = useDossierReadOnly()
  const [f, setF] = useState<Formulier>(() => naarFormulier(werkplan))
  const [fouten, setFouten] = useState<Record<string, string>>({})
  const [bezig, start] = useTransition()

  const zet = <K extends keyof Formulier>(veld: K, waarde: Formulier[K]) => setF(v => ({ ...v, [veld]: waarde }))

  function opslaan() {
    const invoer = naarInvoer(f)
    const check = werkplanSchema.safeParse(invoer)
    if (!check.success) {
      const per: Record<string, string> = {}
      for (const i of check.error.issues) {
        const k = String(i.path[0] ?? '')
        if (!per[k]) per[k] = i.message.startsWith('Expected number') ? 'Vul een getal in.' : i.message
      }
      setFouten(per)
      toast.error('Het werkplan is nog niet compleet.')
      return
    }
    setFouten({})
    start(async () => {
      const res = await slaWerkplanOp(dossierId, invoer)
      if (!res.ok) { toast.error(res.error); return }
      toast.success('Werkplan opgeslagen')
    })
  }

  const getalVeld = (veld: 'reisuren_uren' | 'reiskosten_km' | 'parkeren_max_per_dag', breed = 'w-20') => (
    <Input
      inputSize="sm" inputMode="decimal" className={`${breed} mx-1`} value={f[veld]} disabled={readOnly}
      aria-invalid={!!fouten[veld]} onChange={e => zet(veld, e.target.value)}
    />
  )
  const tekstVeld = (veld: 'werktijden_anders' | 'reisuren_anders' | 'parkeren_anders') => (
    <Input
      inputSize="sm" className="mx-1 w-72" value={f[veld] ?? ''} disabled={readOnly}
      aria-invalid={!!fouten[veld]} onChange={e => zet(veld, e.target.value)}
    />
  )

  return (
    <div className="flex max-w-[960px] flex-col gap-4 px-8 py-7">
      <Card>
        <CardHeader>
          <span>Werkplan</span>
          {werkplan && (
            <span className="text-[12px] font-normal text-neutral-500">
              Bijgewerkt {datumTijd(werkplan.bijgewerkt_op)}{werkplan.bijgewerkt_door_naam ? ` door ${werkplan.bijgewerkt_door_naam}` : ''}
            </span>
          )}
        </CardHeader>
        <CardBody>
          <FormSection title="Korte werkomschrijving">
            <FormField label="Werkomschrijving" upper required htmlFor="werkplan-omschrijving" error={fouten.werkomschrijving}>
              <Textarea
                id="werkplan-omschrijving" rows={14} value={f.werkomschrijving} disabled={readOnly}
                aria-invalid={!!fouten.werkomschrijving}
                onChange={e => zet('werkomschrijving', e.target.value)}
              />
            </FormField>
          </FormSection>

          <FormSection title="Overige betrokkenen">
            <WerkplanBetrokkenen betrokkenen={betrokkenen} informatieHref={informatieHref} />
          </FormSection>

          <FormSection title="Werkafspraken">
            <WerkafspraakKeuze
              titel="Afwijkende werktijden" waarde={f.werktijden_keuze} disabled={readOnly}
              fout={fouten.werktijden_anders} onChange={k => zet('werktijden_keuze', k)}
              opties={[
                { waarde: 'geen', tekst: WERKTIJDEN_TEKST.geen },
                { waarde: 'anders', tekst: WERKTIJDEN_TEKST.anders, invul: tekstVeld('werktijden_anders') },
              ]}
            />
            <WerkafspraakKeuze
              titel="Reisuren" waarde={f.reisuren_keuze} disabled={readOnly}
              fout={fouten.reisuren_uren ?? fouten.reisuren_vertrektijd ?? fouten.reisuren_anders}
              onChange={k => zet('reisuren_keuze', k)}
              opties={[
                { waarde: 'geen', tekst: REISUREN_TEKST.geen },
                { waarde: 'buiten_productief', tekst: REISUREN_TEKST.buiten_productief, invul: getalVeld('reisuren_uren') },
                {
                  waarde: 'binnen_productief', tekst: REISUREN_TEKST.binnen_productief,
                  invul: (
                    <Input
                      inputSize="sm" type="time" className="mx-1 w-28" value={f.reisuren_vertrektijd ?? ''} disabled={readOnly}
                      aria-invalid={!!fouten.reisuren_vertrektijd} onChange={e => zet('reisuren_vertrektijd', e.target.value)}
                    />
                  ),
                },
                { waarde: 'anders', tekst: REISUREN_TEKST.anders, invul: tekstVeld('reisuren_anders') },
              ]}
            />
            <WerkafspraakKeuze
              titel="Reiskosten" waarde={f.reiskosten_keuze} disabled={readOnly}
              fout={fouten.reiskosten_km} onChange={k => zet('reiskosten_keuze', k)}
              opties={[
                { waarde: 'geen', tekst: REISKOSTEN_TEKST.geen },
                { waarde: 'vergoeding', tekst: REISKOSTEN_TEKST.vergoeding, invul: getalVeld('reiskosten_km') },
              ]}
            />
            <WerkafspraakKeuze
              titel="Parkeren" waarde={f.parkeren_keuze} disabled={readOnly}
              fout={fouten.parkeren_max_per_dag ?? fouten.parkeren_anders} onChange={k => zet('parkeren_keuze', k)}
              opties={[
                { waarde: 'gratis', tekst: PARKEREN_TEKST.gratis },
                { waarde: 'zelf_betalen', tekst: PARKEREN_TEKST.zelf_betalen },
                { waarde: 'declareren', tekst: PARKEREN_TEKST.declareren, invul: getalVeld('parkeren_max_per_dag') },
                { waarde: 'anders', tekst: PARKEREN_TEKST.anders, invul: tekstVeld('parkeren_anders') },
              ]}
            />
          </FormSection>

          <FormSection title="Kleuren en materialen">
            <KleurenMaterialenTabel
              rijen={f.kleuren_materialen} disabled={readOnly}
              onChange={rijen => zet('kleuren_materialen', rijen)}
            />
          </FormSection>
        </CardBody>
        {!readOnly && (
          <div className="flex justify-end border-t border-neutral-200 px-[18px] py-3">
            <Button onClick={opslaan} loading={bezig}>Werkplan opslaan</Button>
          </div>
        )}
      </Card>
    </div>
  )
}
