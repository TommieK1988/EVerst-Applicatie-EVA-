'use client'

import React, { useMemo, useState } from 'react'
import type { GebruikerLayout } from '@everts/database'
import OverzichtTabel, { type KolomDefinitie } from '@/components/overzicht/OverzichtTabel'
import { SyncKnop, type SyncUitkomst } from '@/components/eva/SyncKnop'
import { Button } from '@/components/ui'
import InkoopfactuurPaneel from '@/components/inkoopfacturen/InkoopfactuurPaneel'
import FactuurVenster from '@/components/inkoopfacturen/FactuurVenster'
import { ververAlleInkoopfacturen, markeerBetalen, type ActieResultaat } from '@/lib/inkoopfacturen/actions'
import { inkoopStatusLabel, INKOOP_STATUS_BETAALBAAR } from '@/lib/bouw7/inkoop-status'
import { vervalKleur, dossierHref, type InkoopfactuurRij } from '@/lib/inkoopfacturen/types'

/**
 * Bedrijfsbreed inkoopfacturen-overzicht.
 *
 * De tabbladen zijn geen filters op smaak maar de vragen die het scherm moet beantwoorden:
 * wat moet ík doen, wat ligt er nog open, wat mag betaald worden, wat staat op de betaallijst.
 * "Te accorderen door mij" staat vooraan met een teller — dat vervangt de melding per factuur.
 */

type Tab = 'mijn' | 'open' | 'goedgekeurd' | 'betalen' | 'alles'

const TABS: { key: Tab; label: string }[] = [
  { key: 'mijn',        label: 'Te accorderen door mij' },
  { key: 'open',        label: 'Openstaand' },
  { key: 'goedgekeurd', label: 'Goedgekeurd' },
  { key: 'betalen',     label: 'Betalen' },
  { key: 'alles',       label: 'Alles' },
]

function euro(n: number | null): string {
  if (n == null) return '—'
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(n)
}
function datum(d: string | null): string {
  return d ? new Date(d).toLocaleDateString('nl-NL') : '—'
}

const VERVAL_KLEUR: Record<string, string> = {
  verlopen: '#dc2626', bijna: '#f59e0b', ok: 'var(--fg-soft)', geen: 'var(--fg-soft)',
}

/**
 * Statusstip in plaats van een tekstkolom. De volledige tekst zit in de tooltip en het
 * select-filter; de kolom zelf kostte anders 150px voor een woord dat op elke rij hetzelfde is.
 */
function StatusStip({ rij }: { rij: InkoopfactuurRij }) {
  const s = rij.bouw7_status
  const vorm =
    s === 2 || s === 4 ? { teken: '✓', kleur: '#16a34a' }
    : s === 5          ? { teken: '✕', kleur: '#dc2626' }
    : s === 1          ? { teken: '○', kleur: '#f59e0b' }
    :                    { teken: '·', kleur: 'var(--fg-soft)' }
  const titel = inkoopStatusLabel(s) + (rij.mijn_beurt ? ' — jij bent aan zet' : '')
  return (
    <span title={titel} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      <span style={{ color: vorm.kleur, fontWeight: 800, fontSize: 14, lineHeight: 1 }}>{vorm.teken}</span>
      {rij.mijn_beurt && (
        <span title="Jij bent aan zet" style={{
          width: 6, height: 6, borderRadius: '50%', background: '#2563eb', flexShrink: 0,
        }} />
      )}
      {rij.markering_betalen && (
        <span title="Aangemerkt om te betalen" style={{
          fontSize: 9, fontWeight: 800, color: '#0f766e', letterSpacing: '0.03em',
        }}>€</span>
      )}
    </span>
  )
}

const STATUS_OPTIES = ['Concept', 'Ter goedkeuring', 'Goedgekeurd', 'Betaald', 'Afgekeurd']

function maakKolommen(openFactuur: (r: InkoopfactuurRij) => void): KolomDefinitie<InkoopfactuurRij>[] {
  return [
    {
      key: 'status', label: '', breedte: 58,
      filterType: 'select', filterOpties: STATUS_OPTIES,
      sorteerWaarde: r => `${r.mijn_beurt ? 0 : 1}-${r.bouw7_status ?? 99}`,
      filterWaarde: r => inkoopStatusLabel(r.bouw7_status),
      render: r => <StatusStip rij={r} />,
    },
    {
      key: 'factuurnummer', label: 'Factuurnr.', vast: true, breedte: 118, filterType: 'tekst',
      sorteerWaarde: r => r.factuurnummer ?? '',
      render: r => (
        <button
          onClick={e => { e.stopPropagation(); openFactuur(r) }}
          title="Factuur openen"
          style={{
            fontSize: 13, fontWeight: 600, color: 'var(--accent, #2563eb)',
            background: 'none', border: 0, padding: 0, cursor: 'pointer', textAlign: 'left',
          }}
        >
          {r.factuurnummer ?? '—'}
        </button>
      ),
    },
    {
      key: 'leverancier_naam', label: 'Leverancier', breedte: 200, filterType: 'tekst',
      sorteerWaarde: r => (r.leverancier_naam ?? '').toLowerCase(),
      render: r => <span style={{ fontSize: 13 }}>{r.leverancier_naam ?? '—'}</span>,
    },
    {
      key: 'project', label: 'Project', breedte: 210,
      filterType: 'select',
      filterOpties: ['Opdracht', 'Servicedesk', 'Aanvraag', 'Offerte', 'Project zonder dossier', 'Overhead'],
      sorteerWaarde: r => (r.project_naam ?? '').toLowerCase(),
      filterWaarde: r =>
        r.bouw7_project_id == null ? 'Overhead'
          : r.dossier_sectie === 'servicedesk' ? 'Servicedesk'
          : r.dossier_sectie === 'opdrachten' ? 'Opdracht'
          : r.dossier_sectie === 'aanvragen' ? 'Aanvraag'
          : r.dossier_sectie === 'offertes' ? 'Offerte'
          : 'Project zonder dossier',
      render: r => {
        if (r.bouw7_project_id == null) {
          return <span style={{ fontSize: 12, color: 'var(--fg-soft)', fontStyle: 'italic' }}>— overhead</span>
        }
        const label = [r.project_nummer, r.project_naam].filter(Boolean).join(' · ') || '—'
        const href = dossierHref(r)
        return href
          ? <a href={href} onClick={e => e.stopPropagation()}
               style={{ fontSize: 13, color: 'var(--accent, #2563eb)', textDecoration: 'none' }}>{label}</a>
          : <span style={{ fontSize: 13 }} title="Dit Bouw7-project heeft geen dossier in EVA">{label}</span>
      },
    },
    {
      key: 'bewakingscode', label: 'Bewakingscode', breedte: 160, filterType: 'tekst',
      sorteerWaarde: r => r.bewakingscode ?? '',
      // Drie toestanden, en dat verschil is echt: 188 van de 559 facturen hebben een code,
      // 153 hangen aan een leverbon die in Bouw7 níét op een bewakingscode is geboekt
      // (daar heet dat "kosten zonder bewaking"), en de rest heeft helemaal geen leverbon —
      // dat zijn de overheadfacturen. Eén streepje voor alle drie zou het scherm laten lijken
      // alsof de koppeling stuk is.
      render: r => {
        if (r.bewakingscode) {
          return (
            <span style={{ fontSize: 12.5 }} title={r.bewakingscode_naam ?? undefined}>
              <strong>{r.bewakingscode}</strong>
              {r.bewakingscode_naam ? <span style={{ color: 'var(--fg-soft)' }}> · {r.bewakingscode_naam}</span> : null}
            </span>
          )
        }
        if (r.bon_nummer) {
          return <span style={{ fontSize: 12, color: 'var(--fg-soft)', fontStyle: 'italic' }}
                       title="De leverbon in Bouw7 is niet op een bewakingscode geboekt">zonder code</span>
        }
        return <span style={{ fontSize: 12, color: 'var(--fg-soft)' }} title="Geen leverbon">—</span>
      },
    },
    {
      key: 'bedrag_excl', label: 'Excl. btw', breedte: 108,
      sorteerWaarde: r => r.bedrag_excl ?? 0,
      render: r => <span style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>{euro(r.bedrag_excl)}</span>,
    },
    {
      key: 'btw_bedrag', label: 'Btw', breedte: 96,
      sorteerWaarde: r => r.btw_bedrag ?? 0,
      render: r => <span style={{ fontSize: 13, color: 'var(--fg-soft)', fontVariantNumeric: 'tabular-nums' }}>{euro(r.btw_bedrag)}</span>,
    },
    {
      key: 'bedrag_incl', label: 'Incl. btw', breedte: 112,
      sorteerWaarde: r => r.bedrag_incl ?? 0,
      render: r => <span style={{ fontSize: 13, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{euro(r.bedrag_incl)}</span>,
    },
    {
      key: 'vervaldatum', label: 'Vervaldatum', breedte: 150,
      // Sorteren op dagen, zodat het meest urgente bovenaan komt — niet op de datumtekst.
      sorteerWaarde: r => r.dagen_tot_vervaldatum ?? 9999,
      render: r => {
        const d = r.dagen_tot_vervaldatum
        const bij = d == null ? '' : d < 0 ? ` (${-d} dgn te laat)` : d === 0 ? ' (vandaag)' : ` (${d} dgn)`
        return <span style={{ fontSize: 13, color: VERVAL_KLEUR[vervalKleur(d)] }}>{datum(r.vervaldatum)}{bij}</span>
      },
    },
    {
      key: 'bouw7_opmerking', label: 'Opmerking', breedte: 240, filterType: 'tekst',
      sorteerWaarde: r => r.bouw7_opmerking ?? '',
      render: r => <span style={{ fontSize: 12.5, color: 'var(--fg-soft)' }} title={r.bouw7_opmerking ?? undefined}>
        {r.bouw7_opmerking ?? '—'}
      </span>,
    },
    {
      key: 'huidige_goedkeurder_naam', label: 'Huidige fiatteur', breedte: 160, filterType: 'tekst',
      sorteerWaarde: r => (r.huidige_goedkeurder_naam ?? '').toLowerCase(),
      render: r => <span style={{ fontSize: 13 }}>{r.huidige_goedkeurder_naam ?? '—'}</span>,
    },
    {
      key: 'factuurdatum', label: 'Factuurdatum', standaard_zichtbaar: false, breedte: 120,
      sorteerWaarde: r => r.factuurdatum ?? '',
      render: r => <span style={{ fontSize: 13 }}>{datum(r.factuurdatum)}</span>,
    },
    {
      key: 'divisie_naam', label: 'Administratie', standaard_zichtbaar: false, breedte: 200,
      filterType: 'select',
      sorteerWaarde: r => r.divisie_naam ?? '',
      filterWaarde: r => r.divisie_naam,
      render: r => <span style={{ fontSize: 12, color: 'var(--fg-soft)' }}>{r.divisie_naam ?? '—'}</span>,
    },
    {
      key: 'bon_nummer', label: 'Bon/order', standaard_zichtbaar: false, breedte: 180, filterType: 'tekst',
      sorteerWaarde: r => r.bon_nummer ?? r.ordernummer ?? '',
      render: r => <span style={{ fontSize: 12, color: 'var(--fg-soft)' }}>{r.bon_nummer ?? r.ordernummer ?? '—'}</span>,
    },
    {
      key: 'betalen', label: 'Betalen', standaard_zichtbaar: false, breedte: 100,
      filterType: 'select', filterOpties: ['Ja', 'Nee'],
      sorteerWaarde: r => (r.markering_betalen ? 0 : 1),
      filterWaarde: r => (r.markering_betalen ? 'Ja' : 'Nee'),
      render: r => r.markering_betalen
        ? <span style={{ fontSize: 12.5, fontWeight: 700, color: '#0f766e' }}>Ja</span>
        : <span style={{ fontSize: 12.5, color: 'var(--fg-soft)' }}>—</span>,
    },
  ]
}

type Props = {
  rijen: InkoopfactuurRij[]
  mijnBeurt: number
  allesZien: boolean
  layouts: GebruikerLayout[]
  user_id: string | null
  laatsteSync: string | null
  magAccorderen: boolean
  magBetalen: boolean
}

export default function InkoopfacturenOverzicht({
  rijen, mijnBeurt, allesZien, layouts, user_id, laatsteSync, magAccorderen, magBetalen,
}: Props) {
  const [tab, setTab] = useState<Tab>(mijnBeurt > 0 ? 'mijn' : 'open')
  const [geopend, setGeopend] = useState<InkoopfactuurRij | null>(null)
  const [factuurVenster, setFactuurVenster] = useState<InkoopfactuurRij | null>(null)
  const [selectie, setSelectie] = useState<InkoopfactuurRij[]>([])
  const [melding, setMelding] = useState<string | null>(null)

  const kolommen = useMemo(() => maakKolommen(setFactuurVenster), [])

  const zichtbaar = useMemo(() => {
    switch (tab) {
      case 'mijn':        return rijen.filter(r => r.mijn_beurt)
      case 'open':        return rijen.filter(r => r.status === 'open' && !r.datum_betaald)
      case 'goedgekeurd': return rijen.filter(r => r.bouw7_status === INKOOP_STATUS_BETAALBAAR && !r.datum_betaald)
      case 'betalen':     return rijen.filter(r => r.markering_betalen && !r.datum_betaald)
      default:            return rijen
    }
  }, [rijen, tab])

  // `null` = de tabel heeft nog niets teruggemeld; een lege array is een geldig filterresultaat.
  // Met een lengte-check zou een filter dat niets oplevert het ONGEFILTERDE totaal tonen — precies
  // op het moment dat je je afvraagt of je filter wel klopt.
  const [gefilterd, setGefilterd] = useState<InkoopfactuurRij[] | null>(null)
  const basis = gefilterd ?? zichtbaar
  const totaalIncl = useMemo(() => basis.reduce((s, r) => s + (r.bedrag_incl ?? 0), 0), [basis])
  const totaalExcl = useMemo(() => basis.reduce((s, r) => s + (r.bedrag_excl ?? 0), 0), [basis])
  const aantalBetalen = useMemo(() => rijen.filter(r => r.markering_betalen && !r.datum_betaald).length, [rijen])

  async function zetBetalen(aan: boolean) {
    const res: ActieResultaat = await markeerBetalen(selectie.map(r => r.id), aan)
    setMelding(res.ok
      ? `${selectie.length} factuur${selectie.length === 1 ? '' : 'en'} ${aan ? 'op de betaallijst gezet' : 'van de betaallijst gehaald'}.`
      : res.error)
  }

  return (
    <div className="eva-page-full" style={{ paddingTop: 18, paddingBottom: 28 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        {TABS.map(t => {
          const actief = tab === t.key
          const teller = t.key === 'mijn' ? mijnBeurt : t.key === 'betalen' ? aantalBetalen : 0
          return (
            <button
              key={t.key}
              onClick={() => { setTab(t.key); setSelectie([]); setGefilterd(null) }}
              style={{
                fontSize: 13, fontWeight: actief ? 700 : 500, padding: '6px 12px',
                borderRadius: 8, cursor: 'pointer',
                border: `1px solid ${actief ? 'var(--fg)' : 'var(--border)'}`,
                background: actief ? 'var(--fg)' : 'transparent',
                color: actief ? 'var(--bg)' : 'var(--fg-soft)',
              }}
            >
              {t.label}
              {teller > 0 && (
                <span style={{
                  marginLeft: 6, fontSize: 11, fontWeight: 800, padding: '1px 6px', borderRadius: 999,
                  background: actief ? 'var(--bg)' : '#2563eb',
                  color: actief ? 'var(--fg)' : 'white',
                }}>{teller}</span>
              )}
            </button>
          )
        })}

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ fontSize: 12, color: 'var(--fg-soft)', fontVariantNumeric: 'tabular-nums' }}>
            {basis.length} facturen · {euro(totaalExcl)} excl. · <strong>{euro(totaalIncl)}</strong> incl.
          </span>
          <SyncKnop
            laatsteSync={laatsteSync}
            onSync={async (): Promise<SyncUitkomst> => {
              const res = await ververAlleInkoopfacturen()
              return { ok: res.ok, melding: res.ok ? undefined : res.error }
            }}
          />
        </div>
      </div>

      {!allesZien && (
        <p style={{ fontSize: 12, color: 'var(--fg-soft)', margin: '0 0 10px' }}>
          Je ziet de facturen die aan een project hangen, plus de facturen waarvan jij de
          goedkeurder bent. Overheadfacturen (abonnementen, leasing) zijn niet zichtbaar.
        </p>
      )}

      {melding && <p style={{ fontSize: 13, margin: '0 0 10px' }}>{melding}</p>}

      {magBetalen && selectie.length > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
          padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', marginBottom: 10,
        }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>{selectie.length} geselecteerd</span>
          <Button size="sm" onClick={() => zetBetalen(true)}>Markeren als betalen</Button>
          <Button variant="ghost" size="sm" onClick={() => zetBetalen(false)}>Markering weghalen</Button>
        </div>
      )}

      <OverzichtTabel
        scherm="inkoopfacturen"
        data={zichtbaar}
        kolommen={kolommen}
        layouts={layouts}
        user_id={user_id}
        dicht
        beginSortering={[{ id: 'vervaldatum', desc: false }]}
        onRijKlik={r => setGeopend(r)}
        onGefilterd={setGefilterd}
        onSelectie={magBetalen ? setSelectie : undefined}
        selecteerbaar={magBetalen}
        exportExtraRijen={rows => [
          ['Aantal facturen', rows.length],
          ['Totaal excl. btw', rows.reduce((s, r) => s + (r.bedrag_excl ?? 0), 0)],
          ['Totaal btw', rows.reduce((s, r) => s + (r.btw_bedrag ?? 0), 0)],
          ['Totaal incl. btw', rows.reduce((s, r) => s + (r.bedrag_incl ?? 0), 0)],
        ]}
      />

      <InkoopfactuurPaneel
        rij={geopend}
        magAccorderen={magAccorderen}
        onFactuurOpenen={setFactuurVenster}
        onClose={() => setGeopend(null)}
      />

      <FactuurVenster rij={factuurVenster} onClose={() => setFactuurVenster(null)} />
    </div>
  )
}
