'use client'

import React from 'react'
import Link from 'next/link'
import { Alert, Badge, Button, Card, CardBody, CardFooter, CardHeader, Spinner } from '@/components/ui'
import type { VerzamelVoorbeeld } from '@/lib/verzamelfactuur/types'
import { euro } from './format'

type Props = {
  voorbeeld: VerzamelVoorbeeld
  omschrijving: string
  magBewerken: boolean
  bezig: boolean
  onKlaarzetten: () => void
}

const aantalTekst = (n: number): string =>
  new Intl.NumberFormat('nl-NL', { maximumFractionDigits: 2 }).format(n)

/**
 * De factuur zoals hij in Bouw7 komt te staan: per bon een hoofdstuk met de regels eronder, en
 * onderaan de btw per tarief. Alleen-lezen — aanpassen doe je in de bon (link per hoofdstuk).
 */
export function VerzamelVoorbeeldWeergave({ voorbeeld, omschrijving, magBewerken, bezig, onKlaarzetten }: Props) {
  const geblokkeerd = voorbeeld.dossiers.filter(d => d.blokkade)
  const kan = magBewerken && geblokkeerd.length === 0 && voorbeeld.dossiers.length > 0

  return (
    <Card>
      <CardHeader>
        <span>Voorbeeld van de factuur</span>
        <Badge tone="neutral">Concept — nog geen factuurnummer</Badge>
      </CardHeader>
      <CardBody className="flex flex-col gap-5">
        <div className="grid grid-cols-2 gap-6">
          <div>
            <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-neutral-500">Factuur aan</div>
            <div className="mt-1 text-[14px] font-semibold text-neutral-900">{voorbeeld.factuurpartij.naam}</div>
            {voorbeeld.factuurpartij.btwVerlegd && <div className="text-[12px] text-neutral-500">Btw verlegd</div>}
          </div>
          <div>
            <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-neutral-500">Van</div>
            <div className="mt-1 text-[14px] text-neutral-900">{voorbeeld.werkmaatschappij}</div>
          </div>
        </div>

        {omschrijving.trim() && (
          <div className="whitespace-pre-line rounded-lg bg-neutral-50 px-4 py-3 text-[13px] text-neutral-800">
            {omschrijving.trim()}
          </div>
        )}

        {voorbeeld.leeg.length > 0 && (
          <Alert tone="warning" title={`${voorbeeld.leeg.length} bon${voorbeeld.leeg.length === 1 ? '' : 'nen'} zonder openstaande regels`}>
            Op {voorbeeld.leeg.map(d => d.kop).join(', ')} staat niets meer open om te factureren. Die gaan niet mee op deze factuur.
          </Alert>
        )}

        {geblokkeerd.length > 0 && (
          <Alert tone="error" title="Niet alle bonnen kunnen mee">
            Haal deze bon{geblokkeerd.length === 1 ? '' : 'nen'} uit de selectie of los het op in de bon.
          </Alert>
        )}

        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-neutral-200 text-left text-[10.5px] uppercase tracking-[0.08em] text-neutral-500">
              <th className="py-2 pr-2">Omschrijving</th>
              <th className="px-2 py-2 text-right">Aantal</th>
              <th className="px-2 py-2 text-right">Prijs</th>
              <th className="px-2 py-2">Btw</th>
              <th className="py-2 pl-2 text-right">Bedrag</th>
            </tr>
          </thead>
          {voorbeeld.dossiers.map(d => (
            <tbody key={d.id}>
              <tr className="border-b border-neutral-200 bg-neutral-50">
                <td colSpan={4} className="py-2 pl-2 pr-2 font-semibold text-neutral-900">
                  <Link href={`/servicedesk/${d.id}/verkoop`} target="_blank" className="hover:underline">{d.kop}</Link>
                  {d.referentie && <span className="ml-2 font-normal text-neutral-500">Ref. {d.referentie}</span>}
                </td>
                <td className="py-2 pr-2 text-right font-semibold tabular-nums">{euro(d.totaal)}</td>
              </tr>
              {d.blokkade && (
                <tr><td colSpan={5} className="px-2 py-2 text-[12.5px] text-error-700">{d.blokkade}</td></tr>
              )}
              {d.regels.map((r, i) => (
                <tr key={i} className="border-b border-neutral-100">
                  <td className="py-1.5 pl-4 pr-2 text-neutral-800">
                    {r.omschrijving}
                    {r.soort === 'termijn' && <Badge size="sm" tone="info" className="ml-2">Termijn</Badge>}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-neutral-600">
                    {aantalTekst(r.aantal)}{r.eenheid ? ` ${r.eenheid}` : ''}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-neutral-600">{euro(r.stukprijs)}</td>
                  <td className="px-2 py-1.5 text-neutral-600">{r.btwLabel}</td>
                  <td className="py-1.5 pl-2 text-right tabular-nums text-neutral-900">{euro(r.bedrag)}</td>
                </tr>
              ))}
              {d.waarschuwingen.map((w, i) => (
                <tr key={`w${i}`}><td colSpan={5} className="py-1 pl-4 text-[12px] text-warning-700">{w}</td></tr>
              ))}
            </tbody>
          ))}
        </table>

        <div className="ml-auto w-full max-w-[360px] text-[13px]">
          <div className="flex justify-between py-1">
            <span className="text-neutral-600">Totaal excl. btw</span>
            <span className="tabular-nums">{euro(voorbeeld.totaalExcl)}</span>
          </div>
          {voorbeeld.btwGroepen.map(g => (
            <div key={g.label} className="flex justify-between py-1 text-neutral-600">
              <span>{g.label} over {euro(g.grondslag)}</span>
              <span className="tabular-nums">{euro(g.btw)}</span>
            </div>
          ))}
          <div className="mt-1 flex justify-between border-t border-neutral-200 pt-2 font-semibold text-neutral-900">
            <span>Totaal incl. btw</span>
            <span className="tabular-nums">{euro(voorbeeld.totaalIncl)}</span>
          </div>
        </div>
      </CardBody>
      <CardFooter>
        <span className="mr-auto text-[12px] text-neutral-500">
          Iets anders op de factuur? Pas het aan in de bon en vernieuw het voorbeeld.
        </span>
        <Button onClick={onKlaarzetten} disabled={!kan || bezig}>
          {bezig ? <Spinner size="sm" /> : null}
          Klaarzetten in Bouw7
        </Button>
      </CardFooter>
    </Card>
  )
}
