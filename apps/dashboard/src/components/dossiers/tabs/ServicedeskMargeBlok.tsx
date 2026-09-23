'use client'

/**
 * Bovenaan de Facturatie-pagina van een servicedeskbon: wat heeft het gekost, wat gaat eruit, en
 * wat houden we eraan over.
 *
 * Dit is de enige vraag die op een bon telt en het antwoord stond nergens bij elkaar. De kosten
 * stonden op Inkoop, het factuurvoorstel eronder op deze pagina, en de marge nergens — die moest
 * je zelf uitrekenen uit twee schermen. Nu staat het op één regel, en de knop die de regiefactuur
 * opstelt staat er direct naast.
 *
 * **De opbrengst komt van de route waarlangs de bon werkelijk afrekent.** Bij regie is dat de
 * opgestelde regiefactuur — het voorstel plus wat er al gefactureerd is — en geen verwachting.
 * Bij een aanneemsom is het de contractwaarde inclusief goedgekeurd meerwerk. Die twee door
 * elkaar halen levert een marge op die nergens op slaat: een aangenomen bon heeft geen
 * regievoorstel en zou op honderd procent verlies uitkomen.
 */

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardBody, Button } from '@/components/ui'
import { useDossierReadOnly } from '@/components/dossiers/DossierReadOnlyContext'
import { getRegieFactuurvoorstel, type RegieVoorstel } from '@/lib/dossiers/servicedesk'
import { laadBtwTarieven } from '@/lib/stamdata/btw-actions'
import type { BtwTariefKeuze } from '@/lib/stamdata/btw'
import FactuurRegelVenster from './FactuurRegelVenster'

const fmt = (v: number) =>
  new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 }).format(v)

const rond = (n: number) => Math.round(n * 100) / 100

export default function ServicedeskMargeBlok({
  dossierId, initieel, geboekteKosten, prognoseKosten, opRegie, contractwaarde,
}: {
  dossierId: string
  /** Het voorstel dat de server al heeft gelezen; scheelt een tweede lezing van dezelfde snapshots. */
  initieel: RegieVoorstel | null
  /** Geboekte kosten uit de projectbewaking — dezelfde bron als het Management Dashboard. */
  geboekteKosten: number
  /**
   * Prognose-kosten uit de bewaking. Op een bon zonder werkbegroting komt die uit de calculatie
   * (zie `neemPrognoseOverUitCalculatie`); is er geen calculatie, dan staat hij op nul en laten we
   * de regel weg in plaats van een nul te tonen die niets betekent.
   */
  prognoseKosten: number
  /** Rekent deze bon op werkelijke kosten af? Dan is het regievoorstel de opbrengst. */
  opRegie: boolean
  /** De aanneemsom inclusief goedgekeurd meerwerk — de opbrengst van een aangenomen bon. */
  contractwaarde: number
}) {
  const router = useRouter()
  const readOnly = useDossierReadOnly()
  const [voorstel, setVoorstel] = useState<RegieVoorstel | null>(initieel)
  const [tarieven, setTarieven] = useState<BtwTariefKeuze[]>([])
  const [openCode, setOpenCode] = useState<string | null>(null)

  useEffect(() => { laadBtwTarieven().then(setTarieven).catch(() => setTarieven([])) }, [])

  function herlaad() {
    getRegieFactuurvoorstel(dossierId).then(setVoorstel).catch(() => {})
  }

  const teFactureren = rond(voorstel?.totaal ?? 0)
  const alGefactureerd = rond(voorstel?.alGefactureerdBedrag ?? 0)
  const opbrengst = opRegie ? rond(teFactureren + alGefactureerd) : rond(contractwaarde)
  const marge = rond(opbrengst - geboekteKosten)
  // Percentage op de opbrengst, niet op de kosten: zo lees je het als "hiervan houden we over",
  // gelijk aan hoe de marge op een calculatie en in het Management Dashboard wordt gerekend.
  const margePct = opbrengst > 0 ? Math.round((marge / opbrengst) * 1000) / 10 : null

  /**
   * De post waarvoor de knop het venster opent.
   *
   * Op een bon is dat vrijwel altijd de opvangcode Regiewerkzaamheden — één code waar alles op
   * binnenkomt. Staan er meer posten (een stelpost, een meerwerkregel op regie), dan opent de knop
   * die ene regiepost en bewerk je de rest per post in het overzicht eronder. Eén knop die zou
   * moeten raden welke van vier posten je bedoelt is erger dan een knop die de voor de hand
   * liggende opent.
   */
  const hoofdpost = voorstel?.codes.find(c => c.bron === 'regie' && !c.vergrendeld)
    ?? voorstel?.codes.find(c => !c.vergrendeld && c.meefactureren)
    ?? null

  return (
    <>
      <Card>
        <CardBody>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.10em] text-neutral-500">
                Kosten en opbrengst
              </div>

              <table className="w-full max-w-md border-collapse text-[13px]">
                <tbody>
                  <Regel label="Geboekte kosten" waarde={fmt(geboekteKosten)} />
                  {prognoseKosten > 0 && (
                    <Regel
                      label="Prognose kosten"
                      waarde={fmt(prognoseKosten)}
                      toelichting="Uit de calculatie; een bon wordt niet begroot."
                    />
                  )}
                  {opRegie ? (
                    <>
                      {alGefactureerd > 0 && <Regel label="Al gefactureerd" waarde={fmt(alGefactureerd)} />}
                      <Regel
                        label={alGefactureerd > 0 ? 'Nog te factureren' : 'Te factureren'}
                        waarde={fmt(teFactureren)}
                        toelichting="Volgens de opgestelde regiefactuur."
                      />
                    </>
                  ) : (
                    <Regel
                      label="Aanneemsom"
                      waarde={fmt(contractwaarde)}
                      toelichting="Inclusief goedgekeurd meerwerk."
                    />
                  )}
                  <tr className="border-t border-neutral-200">
                    <td className="py-1.5 pr-3 font-semibold text-neutral-800">Marge</td>
                    <td className={`py-1.5 text-right font-semibold tabular-nums ${
                      marge < 0 ? 'text-red-700 dark:text-red-400' : 'text-neutral-900 dark:text-neutral-100'
                    }`}>
                      {fmt(marge)}
                      {margePct != null && (
                        <span className="ml-2 font-normal text-neutral-500">
                          {margePct.toLocaleString('nl-NL', { minimumFractionDigits: 1 })}%
                        </span>
                      )}
                    </td>
                  </tr>
                </tbody>
              </table>

              {opbrengst === 0 && geboekteKosten > 0 && (
                <p className="mt-2 max-w-md text-[11.5px] text-amber-800 dark:text-amber-300">
                  Er staan wel kosten op deze bon maar er is nog niets te factureren. Stel de
                  regiefactuur op om de geboekte uren en kosten om te zetten in factuurregels.
                </p>
              )}
            </div>

            {/* De knop alleen waar er iets te factureren valt. Op een aangenomen bon zonder
                regiepost loopt de facturatie via de termijnstaat eronder, en die heeft zijn eigen
                knop — twee primaire knoppen naast elkaar laten je raden welke de jouwe is. */}
            {!readOnly && (voorstel?.codes.length ?? 0) > 0 && (
              <div className="flex flex-col items-end gap-1">
                <Button
                  variant="primary"
                  onClick={() => hoofdpost && setOpenCode(hoofdpost.bewakingscode)}
                  disabled={!hoofdpost}
                >
                  Regiefactuur opstellen
                </Button>
                <span className="max-w-[220px] text-right text-[11px] leading-snug text-neutral-500">
                  {hoofdpost
                    ? 'Stel de factuurregels samen en zet ze klaar in Bouw7.'
                    : 'Er is nog geen post om te factureren.'}
                </span>
              </div>
            )}
          </div>
        </CardBody>
      </Card>

      <FactuurRegelVenster
        dossierId={dossierId}
        code={voorstel?.codes.find(c => c.bewakingscode === openCode) ?? null}
        tarieven={tarieven}
        readOnly={readOnly}
        onSluit={() => setOpenCode(null)}
        onBewaard={herlaad}
        onGefactureerd={() => { herlaad(); router.refresh() }}
      />
    </>
  )
}

function Regel({ label, waarde, toelichting }: {
  label: string; waarde: string; toelichting?: string
}) {
  return (
    <tr>
      <td className="py-1 pr-3 text-neutral-600 dark:text-neutral-400">
        {label}
        {toelichting && (
          <span className="ml-1.5 text-[10.5px] text-neutral-400">{toelichting}</span>
        )}
      </td>
      <td className="py-1 text-right tabular-nums text-neutral-800 dark:text-neutral-200">{waarde}</td>
    </tr>
  )
}
