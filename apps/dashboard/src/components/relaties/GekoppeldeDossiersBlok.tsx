'use client'

/**
 * Gekoppelde dossiers op de relatiepagina.
 *
 * Twee tabellen, nooit één: als opdrachtgever gaat de bedragkolom over gefactureerde omzet,
 * als inkooppartij over ingekochte kosten. Een relatie kan beide zijn — die bedragen in één
 * kolom optellen zou onzin opleveren. Ze hebben daarom ook elk hun eigen scherm-sleutel, zodat
 * een opgeslagen kolomindeling van de ene tabel niet op de andere wordt losgelaten.
 */

import React, { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { GebruikerLayout } from '@everts/database'
import { Card, CardBody, CardHeader, Badge, Checkbox, EmptyState } from '@/components/ui'
import OverzichtTabel, { type KolomDefinitie } from '@/components/overzicht/OverzichtTabel'
import { FASE_LABEL } from '@/lib/dossiers/fase'
import { BETROKKEN_ROL_LABEL } from '@/lib/relaties/dossiers-types'
import type { RelatieDossier, RelatieDossiersData, RelatieDossierTotalen } from '@/lib/relaties/dossiers-types'

const euro = (n: number) =>
  n.toLocaleString('nl-NL', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })

const datum = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

const zacht: React.CSSProperties = { fontSize: 13, color: 'var(--fg-soft)' }
const getal: React.CSSProperties = { ...zacht, fontVariantNumeric: 'tabular-nums' }

/** Samenvattingsregel boven een tabel: hoeveel, hoeveel daarvan loopt nog, en voor hoeveel. */
function Samenvatting({
  totalen, bedragLabel, toonBedrag,
}: { totalen: RelatieDossierTotalen; bedragLabel: string; toonBedrag: boolean }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18, marginBottom: 12, fontSize: 12, color: 'var(--fg-muted)' }}>
      <span><strong style={{ color: 'var(--fg)' }}>{totalen.aantal}</strong> {totalen.aantal === 1 ? 'dossier' : 'dossiers'}</span>
      <span><strong style={{ color: 'var(--fg)' }}>{totalen.lopend}</strong> lopend</span>
      {toonBedrag && (
        <span>{bedragLabel} <strong style={{ color: 'var(--fg)' }}>{euro(totalen.bedrag)}</strong></span>
      )}
    </div>
  )
}

/** Kop van een tabel met de schakelaar voor afgesloten dossiers ernaast. */
function Kop({
  id, titel, toonAfgesloten, onToon, aantalAfgesloten,
}: {
  id: string; titel: string; toonAfgesloten: boolean
  onToon: (v: boolean) => void; aantalAfgesloten: number
}) {
  return (
    <CardHeader>
      <span>{titel}</span>
      {aantalAfgesloten > 0 && (
        <div className="flex items-center gap-2">
          <Checkbox
            id={id}
            checked={toonAfgesloten}
            onCheckedChange={(checked) => onToon(checked === true)}
          />
          <label htmlFor={id} className="text-[12px] font-medium cursor-pointer select-none">
            Toon afgesloten ({aantalAfgesloten})
          </label>
        </div>
      )}
    </CardHeader>
  )
}

/** Kolommen die beide tabellen delen: het dossier zelf, de fase, het jaar en het adres. */
function basisKolommen(rijen: RelatieDossier[]): KolomDefinitie<RelatieDossier>[] {
  return [
    {
      key: 'dossier', label: 'Dossier', vast: true, filterType: 'tekst', breedte: 300,
      sorteerWaarde: (d) => (d.dossiernummer ?? d.titel).toLowerCase(),
      render: (d) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
          <span style={{ fontWeight: 600 }}>{d.titel}</span>
          {d.dossiernummer && (
            <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>{d.dossiernummer}</span>
          )}
        </div>
      ),
    },
    {
      key: 'fase', label: 'Fase', filterType: 'select', breedte: 130,
      filterOpties: [...new Set(rijen.map((d) => FASE_LABEL[d.fase]))],
      sorteerWaarde: (d) => FASE_LABEL[d.fase],
      filterWaarde: (d) => FASE_LABEL[d.fase],
      render: (d) => <Badge tone={d.fase === 'afgesloten' ? 'neutral' : 'brand'}>{FASE_LABEL[d.fase]}</Badge>,
    },
    {
      key: 'jaar', label: 'Jaar', breedte: 80,
      sorteerWaarde: (d) => d.jaar ?? 0,
      render: (d) => <span style={zacht}>{d.jaar ?? '—'}</span>,
    },
    {
      key: 'adres', label: 'Werkadres', filterType: 'tekst', breedte: 240,
      sorteerWaarde: (d) => (d.adres ?? '').toLowerCase(),
      render: (d) => <span style={zacht}>{d.adres ?? '—'}</span>,
    },
    {
      key: 'activiteit', label: 'Laatste activiteit', breedte: 150, standaard_zichtbaar: false,
      sorteerWaarde: (d) => d.updated_at,
      render: (d) => <span style={zacht}>{datum(d.updated_at)}</span>,
    },
  ]
}

type TabelProps = {
  scherm: string
  rijen: RelatieDossier[]
  kolommen: KolomDefinitie<RelatieDossier>[]
  layouts: GebruikerLayout[]
  user_id: string | null
}

function DossierTabel({ scherm, rijen, kolommen, layouts, user_id }: TabelProps) {
  const router = useRouter()
  return (
    <OverzichtTabel
      scherm={scherm}
      data={rijen}
      kolommen={kolommen}
      layouts={layouts}
      user_id={user_id}
      dicht
      beginSortering={[{ id: 'jaar', desc: true }]}
      onRijKlik={(d) => { if (d.href) router.push(d.href) }}
    />
  )
}

type Props = {
  data: RelatieDossiersData
  /** Kolomindelingen per scherm-sleutel; leeg als er geen sessie is. */
  layouts: { klant: GebruikerLayout[]; inkoop: GebruikerLayout[] }
  user_id: string | null
}

export default function GekoppeldeDossiersBlok({ data, layouts, user_id }: Props) {
  const [toonAfgeslotenKlant, setToonAfgeslotenKlant] = useState(false)
  const [toonAfgeslotenInkoop, setToonAfgeslotenInkoop] = useState(false)

  const klantRijen = useMemo(
    () => toonAfgeslotenKlant ? data.klant : data.klant.filter((d) => d.fase !== 'afgesloten'),
    [data.klant, toonAfgeslotenKlant],
  )
  const inkoopRijen = useMemo(
    () => toonAfgeslotenInkoop ? data.betrokken : data.betrokken.filter((d) => d.fase !== 'afgesloten'),
    [data.betrokken, toonAfgeslotenInkoop],
  )

  const klantKolommen = useMemo<KolomDefinitie<RelatieDossier>[]>(() => {
    const kolommen = basisKolommen(klantRijen)
    kolommen.splice(3, 0, {
      key: 'gefactureerd', label: 'Gefactureerd', breedte: 140,
      sorteerWaarde: (d) => d.bedrag ?? -1,
      render: (d) => <span style={getal}>{d.bedrag != null ? euro(d.bedrag) : '—'}</span>,
    })
    return kolommen
  }, [klantRijen])

  const inkoopKolommen = useMemo<KolomDefinitie<RelatieDossier>[]>(() => {
    const kolommen = basisKolommen(inkoopRijen)
    kolommen.splice(3, 0, {
      key: 'rollen', label: 'Betrokken als', filterType: 'select', breedte: 220,
      filterOpties: [...new Set(inkoopRijen.flatMap((d) => d.rollen.map((r) => BETROKKEN_ROL_LABEL[r])))],
      filterWaarde: (d) => d.rollen.map((r) => BETROKKEN_ROL_LABEL[r]),
      sorteerWaarde: (d) => d.rollen.map((r) => BETROKKEN_ROL_LABEL[r]).join(', '),
      render: (d) => (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {d.rollen.map((r) => <Badge key={r} tone="neutral">{BETROKKEN_ROL_LABEL[r]}</Badge>)}
        </div>
      ),
    })
    // Zonder recht op inkoopfacturen bestaat de bedragkolom niet — een lege kolom zou
    // suggereren dat er niets is ingekocht in plaats van dat het niet getoond wordt.
    if (data.toontInkoopbedragen) {
      kolommen.splice(4, 0, {
        key: 'ingekocht', label: 'Ingekocht (facturen)', breedte: 170,
        sorteerWaarde: (d) => d.bedrag ?? -1,
        render: (d) => <span style={getal}>{d.bedrag ? euro(d.bedrag) : '—'}</span>,
      })
    }
    return kolommen
  }, [inkoopRijen, data.toontInkoopbedragen])

  if (data.klant.length === 0 && data.betrokken.length === 0) {
    return (
      <Card>
        <CardHeader><span>Gekoppelde dossiers</span></CardHeader>
        <CardBody>
          <EmptyState
            size="sm" tone="neutral"
            title="Nog geen dossiers"
            description="Dossiers waarin deze relatie opdrachtgever is, of waarvoor bij haar is ingekocht, verschijnen hier."
          />
        </CardBody>
      </Card>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {data.klant.length > 0 && (
        <Card>
          <Kop
            id="toon-afgesloten-klant"
            titel="Dossiers als opdrachtgever"
            toonAfgesloten={toonAfgeslotenKlant}
            onToon={setToonAfgeslotenKlant}
            aantalAfgesloten={data.klantTotalen.aantal - data.klantTotalen.lopend}
          />
          <CardBody>
            <Samenvatting totalen={data.klantTotalen} bedragLabel="gefactureerd" toonBedrag />
            <DossierTabel
              scherm="relatie-dossiers" rijen={klantRijen} kolommen={klantKolommen}
              layouts={layouts.klant} user_id={user_id}
            />
            {data.klantTotalen.zonderFacturatiegegevens > 0 && (
              // De facturatiecijfers komen uit de management-sync; die kan achterlopen op de
              // dossiers. Een te laag totaal moet zichzelf verklaren in plaats van als
              // volledig te lezen — zelfde melding als op de objectpagina.
              <div style={{ marginTop: 10, fontSize: 11, color: 'var(--fg-muted)' }}>
                Van {data.klantTotalen.zonderFacturatiegegevens} uitgevoerde{' '}
                {data.klantTotalen.zonderFacturatiegegevens === 1 ? 'dossier' : 'dossiers'} zijn de
                facturatiegegevens nog niet opgehaald; die tellen nog niet mee in het totaal.
              </div>
            )}
          </CardBody>
        </Card>
      )}

      {data.betrokken.length > 0 && (
        <Card>
          <Kop
            id="toon-afgesloten-inkoop"
            titel="Dossiers als inkooppartij"
            toonAfgesloten={toonAfgeslotenInkoop}
            onToon={setToonAfgeslotenInkoop}
            aantalAfgesloten={data.betrokkenTotalen.aantal - data.betrokkenTotalen.lopend}
          />
          <CardBody>
            <Samenvatting
              totalen={data.betrokkenTotalen} bedragLabel="ingekocht"
              toonBedrag={data.toontInkoopbedragen}
            />
            <DossierTabel
              scherm="relatie-inkoopdossiers" rijen={inkoopRijen} kolommen={inkoopKolommen}
              layouts={layouts.inkoop} user_id={user_id}
            />
            {/* Eerlijk zijn over de dekking: wat in Bouw7 is besteld zonder dat er in EVA een
                inkoopfactuur, bestelling, uitvraag of opleverpunt aan hangt, staat hier niet. */}
            <div style={{ marginTop: 10, fontSize: 11, color: 'var(--fg-muted)' }}>
              Op basis van inkoopfacturen, bestellingen, uitvragen en opleverpunten die in EVA aan
              deze partij zijn gekoppeld.
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  )
}
