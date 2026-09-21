'use client'

/**
 * Mogelijke dubbele relaties, met samenvoegen per groep.
 *
 * Bewust een voorstellenlijst en geen automatische opschoning. Het sterkste signaal (hetzelfde
 * KvK-nummer) is betrouwbaar, maar een gelijkende naam is dat niet: "Nationaal Grondbezit",
 * "… Alfa B.V." en "… Romeo Foxtrot B.V." delen een adres en zijn drie eigen bedrijven. Die
 * laatste beoordeling is mensenwerk — daarom kiest de gebruiker zelf de blijver en ziet hij
 * per rij wat eraan hangt.
 */

import React, { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { Badge, Button, Card, CardBody, CardHeader, EmptyState, useDialogen } from '@/components/ui'
import {
  voegRelatiesSamen, maakRelatieSamenvoegingOngedaan,
  type DubbelRelatieGroep, type DubbelRelatie, type RelatieSamenvoegingLog,
} from '@/lib/relaties/ontdubbelen-relaties'

const ZEKERHEID_TONE = { zeker: 'success', waarschijnlijk: 'warning', mogelijk: 'neutral' } as const
const ZEKERHEID_LABEL = { zeker: 'Zeker', waarschijnlijk: 'Waarschijnlijk', mogelijk: 'Mogelijk' } as const

const TYPE_LABEL: Record<string, string> = {
  opdrachtgever: 'Opdrachtgever',
  leverancier: 'Leverancier',
  onderaannemer: 'Onderaannemer',
}

/** Kleine tekstknop in een kaart; `stopPropagation` omdat de kaart zelf ook klikbaar is. */
function KaartActie({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={e => { e.stopPropagation(); onClick() }}
      style={{
        background: 'none', border: 'none', padding: 0, cursor: 'pointer',
        color: 'var(--fg-muted)', textDecoration: 'underline', fontSize: 11,
      }}
    >
      {children}
    </button>
  )
}

/** "7 dossiers · 9 facturen" — alleen wat er daadwerkelijk aan hangt. */
function watErAanHangt(r: DubbelRelatie): string {
  const delen: string[] = []
  if (r.dossiers) delen.push(`${r.dossiers} dossier${r.dossiers === 1 ? '' : 's'}`)
  if (r.debiteuren) delen.push(`${r.debiteuren} verkoopfactu${r.debiteuren === 1 ? 'ur' : 'ren'}`)
  if (r.inkoopfacturen) delen.push(`${r.inkoopfacturen} inkoopfactu${r.inkoopfacturen === 1 ? 'ur' : 'ren'}`)
  if (r.contactpersonen) delen.push(`${r.contactpersonen} contactperso${r.contactpersonen === 1 ? 'on' : 'nen'}`)
  return delen.length > 0 ? delen.join(' · ') : 'niets aan gekoppeld'
}

function RelatieKaart({ relatie, gekozen, blijver, onKies, onUitsluiten }: {
  relatie: DubbelRelatie
  gekozen: boolean
  blijver: boolean
  onKies: () => void
  onUitsluiten: () => void
}) {
  return (
    <div
      onClick={onKies}
      style={{
        flex: '1 1 260px', minWidth: 260, cursor: 'pointer',
        padding: '10px 12px', borderRadius: 8,
        border: `1px solid ${blijver ? 'var(--accent)' : 'var(--border)'}`,
        background: blijver ? 'var(--bg-active)' : gekozen ? 'var(--bg-subtle)' : 'var(--bg)',
        opacity: gekozen || blijver ? 1 : 0.55,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
        <Link
          href={`/relaties/${relatie.id}`}
          onClick={e => e.stopPropagation()}
          style={{ fontSize: 13, fontWeight: 700, color: 'var(--fg)', textDecoration: 'none' }}
        >
          {relatie.naam}
        </Link>
        {blijver && <Badge tone="brand" size="sm">Blijft</Badge>}
        {!blijver && gekozen && <Badge tone="warning" size="sm">Gaat op in de blijver</Badge>}
        {!relatie.actief && <Badge tone="neutral" size="sm">Inactief</Badge>}
      </div>
      <div style={{ fontSize: 12, color: 'var(--fg-muted)', lineHeight: 1.6 }}>
        {relatie.types.map(t => TYPE_LABEL[t] ?? t).join(' · ') || 'geen rol'}
        {relatie.plaats && <> — {relatie.plaats}</>}
        <br />
        {relatie.kvk ? `KvK ${relatie.kvk}` : 'geen KvK'}
        {relatie.email && <> · {relatie.email}</>}
        <br />
        {watErAanHangt(relatie)}
        {' · '}{relatie.bouw7 ? 'staat in Bouw7' : 'alleen in EVA'}
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 8, paddingTop: 6, borderTop: '1px solid var(--border)' }}>
        {!blijver
          ? <KaartActie onClick={onUitsluiten}>{gekozen ? 'Niet meenemen' : 'Tóch meenemen'}</KaartActie>
          : <span style={{ fontSize: 11, color: 'var(--fg-muted)' }}>Deze rij blijft bestaan</span>}
      </div>
    </div>
  )
}

function Groep({ groep }: { groep: DubbelRelatieGroep }) {
  const [blijverId, setBlijverId] = useState(groep.relaties[0].id)
  const [uitgesloten, setUitgesloten] = useState<string[]>([])
  const [bezig, startTransition] = useTransition()
  const router = useRouter()
  const { bevestig } = useDialogen()

  const verliezers = groep.relaties.filter(r => r.id !== blijverId && !uitgesloten.includes(r.id))
  const blijver = groep.relaties.find(r => r.id === blijverId)!

  function kies(relatie: DubbelRelatie) {
    if (relatie.id === blijverId) return
    setUitgesloten(prev => prev.filter(i => i !== relatie.id))
    setBlijverId(relatie.id)
  }

  // De rollen die de blijver ná het samenvoegen draagt — dat is voor de meeste paren precies
  // de winst, dus het staat in de bevestiging.
  const rollenNa = [...new Set([blijver, ...verliezers].flatMap(r => r.types))]
    .map(t => TYPE_LABEL[t] ?? t)

  async function samenvoegen() {
    if (verliezers.length === 0) return
    const ok = await bevestig({
      titel: `${verliezers.length === 1 ? 'Eén relatie' : `${verliezers.length} relaties`} samenvoegen in ${blijver.naam}?`,
      omschrijving:
        `Dossiers, facturen, contactpersonen en Bouw7-koppelingen verhuizen naar de blijver, die daarna `
        + `${rollenNa.join(' én ')} is. Lege velden worden aangevuld; ingevulde velden blijven staan. `
        + 'De Bouw7-contacten blijven allebei bestaan — ze hangen voortaan aan één EVA-relatie. Dit is terug te draaien.',
      bevestigLabel: 'Samenvoegen',
    })
    if (!ok) return
    startTransition(async () => {
      const res = await voegRelatiesSamen(blijverId, verliezers.map(r => r.id))
      if (!res.ok) { toast.error(res.error); return }
      toast.success(res.waarschuwing ?? 'Samengevoegd')
      router.refresh()
    })
  }

  return (
    <Card>
      <CardHeader>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Badge tone={ZEKERHEID_TONE[groep.zekerheid]} size="sm">{ZEKERHEID_LABEL[groep.zekerheid]}</Badge>
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--fg-muted)' }}>{groep.reden}</span>
        </span>
        <Button variant="primary" size="sm" onClick={samenvoegen} disabled={bezig || verliezers.length === 0}>
          {bezig ? 'Bezig…' : `Samenvoegen in ${blijver.naam}`}
        </Button>
      </CardHeader>
      <CardBody>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {groep.relaties.map(r => (
            <RelatieKaart
              key={r.id}
              relatie={r}
              blijver={r.id === blijverId}
              gekozen={!uitgesloten.includes(r.id)}
              onKies={() => kies(r)}
              onUitsluiten={() => setUitgesloten(prev => prev.includes(r.id) ? prev.filter(i => i !== r.id) : [...prev, r.id])}
            />
          ))}
        </div>
        <div style={{ marginTop: 8, fontSize: 11, color: 'var(--fg-muted)' }}>
          Klik op een kaart om die als blijver te kiezen — dat is de rij die blijft bestaan.
        </div>
      </CardBody>
    </Card>
  )
}

export default function RelatieDubbelenPaneel({ groepen, recent }: {
  groepen: DubbelRelatieGroep[]
  recent: RelatieSamenvoegingLog[]
}) {
  const [bezig, startTransition] = useTransition()
  const router = useRouter()

  function ongedaan(log: RelatieSamenvoegingLog) {
    startTransition(async () => {
      const res = await maakRelatieSamenvoegingOngedaan(log.id)
      if (!res.ok) { toast.error(res.error); return }
      toast.success(`${log.verliezer_naam} staat weer los`)
      router.refresh()
    })
  }

  const terugdraaibaar = recent.filter(r => !r.teruggedraaid_op)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <p style={{ fontSize: 12, color: 'var(--fg-muted)', margin: 0, maxWidth: 720, lineHeight: 1.6 }}>
        Bouw7 geeft een bedrijf één rol tegelijk, dus wie zowel opdrachtgever als leverancier is
        staat er twee keer — en dan zie je op het ene scherm de helft van de administratie.
        Samenvoegen maakt er één relatie met beide rollen van; de Bouw7-contacten blijven
        allebei bestaan.
      </p>

      {groepen.length === 0 ? (
        <EmptyState
          title="Geen dubbele relaties gevonden"
          description="Er zijn geen relaties die op hetzelfde bedrijf lijken."
        />
      ) : (
        groepen.map(g => <Groep key={g.sleutel} groep={g} />)
      )}

      {terugdraaibaar.length > 0 && (
        <Card>
          <CardHeader><span>Recent samengevoegd</span></CardHeader>
          <CardBody>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {terugdraaibaar.map(r => (
                <div key={r.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, fontSize: 12, color: 'var(--fg-soft)' }}>
                  <span>
                    <strong style={{ color: 'var(--fg)' }}>{r.verliezer_naam}</strong> is opgegaan in{' '}
                    <Link href={`/relaties/${r.blijver_id}`} style={{ color: 'var(--fg)' }}>{r.blijver_naam}</Link>
                    {' · '}{new Date(r.created_at).toLocaleString('nl-NL', { dateStyle: 'short', timeStyle: 'short' })}
                  </span>
                  <Button variant="ghost" size="sm" onClick={() => ongedaan(r)} disabled={bezig}>Ongedaan maken</Button>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  )
}
