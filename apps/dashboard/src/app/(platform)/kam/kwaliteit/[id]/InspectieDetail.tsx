'use client'

import React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import type { InspectieContext } from '@/lib/kwaliteit/inspecties'
import { heropenInspectie } from '@/lib/kwaliteit/inspecties'
import {
  kwaliteitAspectLabels,
  kwaliteitBronTypeLabels,
  kwaliteitErnstLabels,
  kwaliteitResultaatStatusLabels,
} from '@everts/database/kwaliteit-types'
import type { KwaliteitEis, KwaliteitResultaatStatus } from '@everts/database/kwaliteit-types'
import { eenheidLabel, eisOmschrijving, getalNL, samenvatting, steekproefSignaal } from '@/lib/kwaliteit/regels'
import { PageHeader, Badge, Card, CardHeader, CardBody } from '@/components/ui'
import { useDialogen } from '@/components/ui/dialogen'
import KwaliteitRapportageKnop from '@/components/documenten/KwaliteitRapportageKnop'

const STATUS_TONE: Record<KwaliteitResultaatStatus, 'success' | 'error' | 'warning' | 'neutral'> = {
  voldoet: 'success',
  voldoet_niet: 'error',
  nader_onderzoek: 'warning',
  niet_beoordeeld: 'neutral',
  nvt: 'neutral',
}

const zacht = { fontSize: 13, color: 'var(--fg-muted)' } as const

/**
 * Het inspectiedetail op de desktop: nakijken, rapport opstellen, en zo nodig heropenen.
 *
 * Toont álle beoordeelde punten — ook de niet-beoordeelde en de N.v.t. Dat is het hele punt van
 * §59.3: wat niet is beoordeeld mag nergens als goedgekeurd worden gelezen, dus het staat er
 * gewoon bij.
 */
export default function InspectieDetail({
  context,
  disciplines,
}: {
  context: InspectieContext
  disciplines: { code: string; naam: string }[]
}) {
  const router = useRouter()
  const { vraagTekst, meld } = useDialogen()
  const [bezig, setBezig] = React.useState(false)

  const naamPerCode = React.useMemo(() => new Map(disciplines.map(d => [d.code, d.naam])), [disciplines])
  const puntPerId = React.useMemo(
    () => new Map(context.controlepunten.map(p => [p.id, p])),
    [context.controlepunten],
  )
  const telling = samenvatting(context.resultaten, context.afwijkingen)
  const signaal = steekproefSignaal(context.inspectie.steekproef_bekeken, context.inspectie.steekproef_afwijkend)

  // Resultaten gegroepeerd per discipline, in de volgorde van de bibliotheek.
  const groepen = React.useMemo(() => {
    const perCode = new Map<string, typeof context.resultaten>()
    for (const r of context.resultaten) {
      const p = puntPerId.get(r.controlepunt_id)
      if (!p) continue
      perCode.set(p.discipline_code, [...(perCode.get(p.discipline_code) ?? []), r])
    }
    return [...perCode.entries()].map(([code, rijen]) => ({
      code,
      naam: naamPerCode.get(code) ?? code,
      rijen: rijen.sort((a, b) =>
        (puntPerId.get(a.controlepunt_id)?.volgorde ?? 0) - (puntPerId.get(b.controlepunt_id)?.volgorde ?? 0)),
    }))
  }, [context.resultaten, puntPerId, naamPerCode])

  // Alleen daadwerkelijk uitgevoerde metingen; dat is ook wat het rapport toont.
  const metingen = context.resultaten.filter(r => r.gemeten_waarde !== null && r.gemeten_waarde !== undefined)

  async function heropen() {
    const reden = await vraagTekst({
      titel: 'Inspectie heropenen',
      omschrijving: 'De inspectie wordt weer bewerkbaar. Geef aan waarom dat nodig is; dit wordt vastgelegd.',
      placeholder: 'Bijv. verkeerde locatie bij KA-2026-004',
      verplicht: true,
      bevestigLabel: 'Heropenen',
    })
    if (!reden) return
    setBezig(true)
    const res = await heropenInspectie(context.inspectie.id, reden)
    setBezig(false)
    if (res.ok) { toast.success('Inspectie heropend'); router.refresh() }
    else await meld({ titel: 'Heropenen lukte niet', omschrijving: res.error })
  }

  const definitief = context.inspectie.status === 'definitief'

  return (
    <div className="eva-page-full">
      <PageHeader
        eyebrow="Kwaliteitsinspectie"
        title={[context.inspectie.inspectienummer, context.dossier.titel]}
        status={definitief ? { label: 'Definitief', tone: 'success' } : { label: 'Concept', tone: 'neutral' }}
        actions={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <KwaliteitRapportageKnop dossierId={context.dossier.id} inspectieId={context.inspectie.id} />
            {definitief && (
              <button
                type="button"
                onClick={() => void heropen()}
                disabled={bezig}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                Heropenen
              </button>
            )}
          </div>
        }
      />

      {/* Kop: wie, wanneer, waar, en wat er is bekeken. */}
      <Card style={{ marginBottom: 16 }}>
        <CardBody>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
            <Gegeven label="Datum" waarde={new Date(context.inspectie.datum).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })
              + (context.inspectie.tijd ? ` · ${context.inspectie.tijd.slice(0, 5)}` : '')} />
            <Gegeven label="Inspecteur" waarde={context.inspecteurNaam ?? '—'} />
            <Gegeven label="Opdrachtgever" waarde={context.dossier.opdrachtgever ?? '—'} />
            <Gegeven label="Projectnummer" waarde={context.dossier.dossiernummer ?? '—'} />
            <Gegeven label="Adres" waarde={context.dossier.werkadres || '—'} />
            <Gegeven label="Weer" waarde={context.inspectie.weer ?? '—'} />
            <Gegeven label="Werkzaamheden" waarde={context.inspectie.werkzaamheden_omschrijving ?? '—'} />
            <Gegeven label="Gelopen gebied" waarde={context.inspectie.gebied_omschrijving ?? '—'} />
            <Gegeven
              label="Disciplines"
              waarde={(context.inspectie.discipline_codes ?? []).map(c => naamPerCode.get(c) ?? c).join(', ') || '—'}
            />
            {context.inspectie.steekproef_bekeken !== null && (
              <Gegeven
                label="Steekproef"
                waarde={`${context.inspectie.steekproef_afwijkend ?? 0} van ${context.inspectie.steekproef_bekeken} afwijkend`}
              />
            )}
          </div>

          {context.inspectie.heropen_reden && (
            <p style={{ margin: '14px 0 0', fontSize: 12.5, color: 'var(--warning-700)' }}>
              Heropend: {context.inspectie.heropen_reden}
            </p>
          )}
          {signaal && (
            <p style={{ margin: '10px 0 0', fontSize: 13, color: 'var(--warning-700)' }}>{signaal}</p>
          )}
        </CardBody>
      </Card>

      {/* Samenvatting — bewust zonder kwaliteitspercentage. */}
      <Card style={{ marginBottom: 16 }}>
        <CardHeader>Samenvatting</CardHeader>
        <CardBody>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 22 }}>
            <Teller label="beoordeeld" waarde={telling.beoordeeld} />
            <Teller label="voldoen" waarde={telling.voldoet} kleur="var(--success-700)" />
            <Teller label="technische afwijkingen" waarde={telling.technisch} />
            <Teller label="esthetische afwijkingen" waarde={telling.esthetisch} />
            <Teller label="kritieke afwijkingen" waarde={telling.kritiek} kleur={telling.kritiek > 0 ? 'var(--error-700)' : undefined} />
            <Teller label="niet beoordeeld" waarde={telling.niet_beoordeeld} />
            <Teller label="nader onderzoek" waarde={telling.nader_onderzoek} />
            <Teller label="positieve waarnemingen" waarde={context.waarnemingen.length} kleur="var(--success-700)" />
          </div>
          <p style={{ margin: '14px 0 0', ...zacht }}>
            Niet beoordeelde onderdelen tellen niet als goedgekeurd. Deze inspectie is een steekproef
            van wat op het inspectiemoment zichtbaar en bereikbaar was.
          </p>
        </CardBody>
      </Card>

      {/* Uitgevoerde metingen. */}
      {metingen.length > 0 && (
        <Card style={{ marginBottom: 16 }}>
          <CardHeader>Technische metingen</CardHeader>
          <CardBody>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--fg-muted)', fontSize: 12 }}>
                  <th style={{ padding: '6px 8px 6px 0' }}>Onderdeel</th>
                  <th style={{ padding: '6px 8px' }}>Locatie</th>
                  <th style={{ padding: '6px 8px', textAlign: 'right' }}>Meting</th>
                  <th style={{ padding: '6px 8px', textAlign: 'right' }}>Eis</th>
                  <th style={{ padding: '6px 0 6px 8px' }}>Resultaat</th>
                </tr>
              </thead>
              <tbody>
                {metingen.map(r => {
                  const punt = puntPerId.get(r.controlepunt_id)
                  const eis = (r.toegepaste_eis ?? {}) as KwaliteitEis
                  return (
                    <tr key={r.id} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ padding: '8px 8px 8px 0' }}>
                        <strong>{punt?.code}</strong> {punt?.titel}
                      </td>
                      <td style={{ padding: '8px', color: 'var(--fg-muted)' }}>{r.meetlocatie ?? '—'}</td>
                      <td style={{ padding: '8px', textAlign: 'right', fontWeight: 600 }}>
                        {getalNL(r.gemeten_waarde)}{eis.eenheid ? ' ' + eenheidLabel(eis.eenheid) : ''}
                      </td>
                      <td style={{ padding: '8px', textAlign: 'right', color: 'var(--fg-muted)' }}>
                        {eis.geen_waarde_bekend ? 'geen generieke waarde' : eisOmschrijving(eis)}
                      </td>
                      <td style={{ padding: '8px 0 8px 8px' }}>
                        <Badge tone={STATUS_TONE[r.status]}>{kwaliteitResultaatStatusLabels[r.status]}</Badge>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </CardBody>
        </Card>
      )}

      {/* Alle beoordeelde punten per discipline. */}
      {groepen.map(groep => (
        <Card key={groep.code} style={{ marginBottom: 16 }}>
          <CardHeader>{groep.naam}</CardHeader>
          <CardBody>
            {groep.rijen.map(r => {
              const punt = puntPerId.get(r.controlepunt_id)
              const eis = (r.toegepaste_eis ?? {}) as KwaliteitEis
              const bevindingen = context.afwijkingen.filter(a => a.resultaat_id === r.id)
              return (
                <div key={r.id} style={{ padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', justifyContent: 'space-between' }}>
                    <div style={{ minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>
                        <span style={{ color: 'var(--fg-muted)', fontWeight: 500 }}>{punt?.code} · </span>
                        {punt?.korte_vraag}
                      </p>
                      <p style={{ margin: '3px 0 0', ...zacht }}>
                        {punt ? kwaliteitAspectLabels[punt.kwaliteitsaspect] : ''}
                        {eis.bron_type ? ` · Bron: ${kwaliteitBronTypeLabels[eis.bron_type]}${eis.bron_document ? ' — ' + eis.bron_document : ''}` : ''}
                      </p>
                      {r.opmerking && <p style={{ margin: '6px 0 0', fontSize: 13 }}>{r.opmerking}</p>}
                    </div>
                    <Badge tone={STATUS_TONE[r.status]}>{kwaliteitResultaatStatusLabels[r.status]}</Badge>
                  </div>

                  {bevindingen.map(b => (
                    <div key={b.id} style={{
                      marginTop: 10, padding: '10px 12px', borderRadius: 10,
                      background: 'var(--bg)', border: '1px solid var(--border)',
                    }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', marginBottom: 4, flexWrap: 'wrap' }}>
                        <strong style={{ fontSize: 12.5 }}>{b.afwijkingsnummer}</strong>
                        <Badge tone={b.ernst === 'kritiek' ? 'error' : b.ernst === 'technisch' ? 'warning' : 'neutral'}>
                          {kwaliteitErnstLabels[b.ernst]}
                        </Badge>
                        <span style={zacht}>{b.locatie ?? '—'}</span>
                      </div>
                      <p style={{ margin: 0, fontSize: 13 }}>{b.omschrijving}</p>
                      {b.voorgestelde_actie && (
                        <p style={{ margin: '4px 0 0', ...zacht }}>Actie: {b.voorgestelde_actie}</p>
                      )}
                      <FotoRij urls={context.fotos.filter(f => f.afwijking_id === b.id).map(f => f.url)} />
                    </div>
                  ))}
                </div>
              )
            })}

            {/* Positieve waarnemingen van deze discipline. */}
            {context.waarnemingen.filter(w => w.discipline_code === groep.code).map(w => (
              <div key={w.id} style={{
                marginTop: 10, padding: '10px 12px', borderRadius: 10,
                background: 'var(--success-50)', border: '1px solid var(--success-300)',
              }}>
                <p style={{ margin: 0, fontSize: 13.5, fontWeight: 600, color: 'var(--success-700)' }}>
                  ✓ {w.omschrijving}{w.locatie ? ` — ${w.locatie}` : ''}
                </p>
                <FotoRij urls={context.fotos.filter(f => f.waarneming_id === w.id).map(f => f.url)} />
              </div>
            ))}
          </CardBody>
        </Card>
      ))}

      {groepen.length === 0 && (
        <p style={{ ...zacht, textAlign: 'center', padding: '32px 0' }}>
          Er is nog niets beoordeeld in deze inspectie.
        </p>
      )}

      <p style={{ marginTop: 20 }}>
        <Link href="/kam/kwaliteit" style={{ fontSize: 13.5, color: 'var(--fg-muted)' }}>
          ← Alle kwaliteitsinspecties
        </Link>
      </p>
    </div>
  )
}

function Gegeven({ label, waarde }: { label: string; waarde: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--fg-muted)' }}>
        {label}
      </div>
      <div style={{ fontSize: 13.5, marginTop: 2 }}>{waarde}</div>
    </div>
  )
}

function Teller({ label, waarde, kleur }: { label: string; waarde: number; kleur?: string }) {
  return (
    <div>
      <div style={{ fontSize: 26, fontWeight: 800, lineHeight: 1.1, color: kleur ?? 'var(--fg)' }}>{waarde}</div>
      <div style={{ fontSize: 12, color: 'var(--fg-muted)' }}>{label}</div>
    </div>
  )
}

function FotoRij({ urls }: { urls: string[] }) {
  if (urls.length === 0) return null
  return (
    <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
      {urls.map(url => (
        <a key={url} href={url} target="_blank" rel="noreferrer">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="" style={{
            width: 72, height: 72, objectFit: 'cover', borderRadius: 8,
            border: '1px solid var(--border)',
          }} />
        </a>
      ))}
    </div>
  )
}
