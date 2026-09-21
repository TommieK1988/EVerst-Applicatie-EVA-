'use client'

/**
 * Mogelijke dubbele contactpersonen, met samenvoegen per groep.
 *
 * Bewust een voorstellenlijst en geen automatische opschoning: het sterkste signaal
 * (hetzelfde e-mailadres) is in de praktijk óók het adres van een gedeelde postbus. De
 * suggestielaag filtert de bekende postbussen er al uit, maar de laatste beoordeling is
 * mensenwerk — daarom kiest de gebruiker zelf de blijver en ziet hij per rij wat eraan hangt.
 *
 * "Beide behouden" is daarvan de andere helft, en beantwoordt een andere vraag dan "Dit is een
 * postbus": daar is de rij zelf geen mens, hier zijn het twee mensen die op elkaar lijken.
 * Zonder dat oordeel komt een paar naamgenoten bij elke herberekening terug — een lijst die
 * nooit leeg raakt leert iedereen hem over te slaan. Het gaat per paar de database in en is
 * onderaan terug te draaien.
 */

import React, { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { Badge, Button, Card, CardBody, CardHeader, EmptyState, useDialogen } from '@/components/ui'
import { contactpersoonSoortLabels, type ContactpersoonSoort } from '@everts/database'
import {
  voegContactpersonenSamen, maakSamenvoegingOngedaan, zetContactpersoonSoort,
  markeerCpNietDubbel, maakCpNietDubbelOngedaan,
  type DubbelGroep, type DubbelPersoon, type SamenvoegingLog, type CpNietDubbelMarkering,
} from '@/lib/relaties/ontdubbelen'

const ZEKERHEID_TONE = { zeker: 'success', waarschijnlijk: 'warning', mogelijk: 'neutral' } as const
const ZEKERHEID_LABEL = { zeker: 'Zeker', waarschijnlijk: 'Waarschijnlijk', mogelijk: 'Mogelijk' } as const

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

function PersoonKaart({ persoon, gekozen, blijver, beoordeeld, onKies, onUitsluiten, onPostbus }: {
  persoon: DubbelPersoon
  gekozen: boolean
  blijver: boolean
  /** Van dit paar is al vastgesteld dat het twee verschillende mensen zijn. */
  beoordeeld: boolean
  onKies: () => void
  onUitsluiten: () => void
  onPostbus: () => void
}) {
  return (
    <div
      onClick={onKies}
      style={{
        flex: '1 1 240px', minWidth: 240, cursor: 'pointer',
        padding: '10px 12px', borderRadius: 8,
        border: `1px solid ${blijver ? 'var(--accent)' : 'var(--border)'}`,
        background: blijver ? 'var(--bg-active)' : gekozen ? 'var(--bg-subtle)' : 'var(--bg)',
        opacity: gekozen || blijver ? 1 : 0.55,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <Link
          href={`/relaties/contactpersonen/${persoon.id}`}
          onClick={e => e.stopPropagation()}
          style={{ fontSize: 13, fontWeight: 700, color: 'var(--fg)', textDecoration: 'none' }}
        >
          {persoon.naam}
        </Link>
        {blijver && <Badge tone="brand" size="sm">Blijft</Badge>}
        {!blijver && gekozen && <Badge tone="warning" size="sm">Gaat op in de blijver</Badge>}
        {!blijver && !gekozen && beoordeeld && <Badge tone="neutral" size="sm">Andere persoon</Badge>}
      </div>
      <div style={{ fontSize: 12, color: 'var(--fg-muted)', lineHeight: 1.6 }}>
        {persoon.organisaties.length > 0
          ? persoon.organisaties.map(o => o.naam).join(' · ')
          : 'Geen organisatie'}
        {persoon.functie && <> — {persoon.functie}</>}
        <br />
        {persoon.email ?? 'geen e-mail'}
        {persoon.mobiel && <> · {persoon.mobiel}</>}
        <br />
        {persoon.dossiers > 0 && <>{persoon.dossiers} dossier{persoon.dossiers === 1 ? '' : 's'} · </>}
        {persoon.bouw7 ? 'staat in Bouw7' : 'alleen in EVA'}
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 8, paddingTop: 6, borderTop: '1px solid var(--border)' }}>
        {!blijver && (
          <KaartActie onClick={onUitsluiten}>{gekozen ? 'Niet meenemen' : 'Tóch meenemen'}</KaartActie>
        )}
        {blijver && <span style={{ fontSize: 11, color: 'var(--fg-muted)' }}>Deze rij blijft bestaan</span>}
        <KaartActie onClick={onPostbus}>Dit is een postbus</KaartActie>
      </div>
    </div>
  )
}

function Groep({ groep }: { groep: DubbelGroep }) {
  const [blijverId, setBlijverId] = useState(groep.personen[0].id)
  // Paren die al als "andere persoon" zijn weggezet doen niet mee. De groep staat er alleen nog
  // om de paren die wél open staan; zonder deze startwaarde zou "Samenvoegen" een eerder
  // genomen beslissing stil terugdraaien.
  const [uitgesloten, setUitgesloten] = useState<string[]>(groep.personen[0].geenDubbelMet)
  const [bezig, startTransition] = useTransition()
  const router = useRouter()
  const { bevestig } = useDialogen()

  const verliezers = groep.personen.filter(p => p.id !== blijverId && !uitgesloten.includes(p.id))
  const blijver = groep.personen.find(p => p.id === blijverId)!

  function kies(persoon: DubbelPersoon) {
    if (persoon.id === blijverId) return
    // Tweede klik op een verliezer sluit hem uit: niet elke naamgenoot is dezelfde mens. De al
    // beoordeelde paren van de nieuwe blijver komen er automatisch bij.
    setUitgesloten(prev => [...new Set([...prev.filter(i => i !== persoon.id), ...persoon.geenDubbelMet])])
    setBlijverId(persoon.id)
  }

  async function geenDubbel() {
    // Mét organisatie: bij "zelfde naam, verder geen overeenkomst" staat er anders twee keer
    // dezelfde naam in de vraag en is er niets te beoordelen.
    const namen = groep.personen.map(p => p.organisaties[0] ? `${p.naam} (${p.organisaties[0].naam})` : p.naam)
    const ok = await bevestig({
      titel: groep.personen.length === 2 ? 'Beide behouden?' : 'Alle rijen behouden?',
      omschrijving:
        `${namen.join(' en ')} blijven los van elkaar bestaan. Deze groep verdwijnt uit de lijst en `
        + 'komt niet meer terug. Er verandert niets aan de contactpersonen zelf — terug te draaien '
        + 'onderaan dit scherm.',
      bevestigLabel: 'Beide behouden',
    })
    if (!ok) return
    startTransition(async () => {
      const res = await markeerCpNietDubbel(groep.personen.map(p => p.id))
      if (!res.ok) { toast.error(res.error); return }
      toast.success('Gemarkeerd als geen dubbel')
      router.refresh()
    })
  }

  async function samenvoegen() {
    if (verliezers.length === 0) return
    const ok = await bevestig({
      titel: `${verliezers.length === 1 ? 'Eén rij' : `${verliezers.length} rijen`} samenvoegen in ${blijver.naam}?`,
      omschrijving:
        'Alle organisaties, dossiers, notities en Bouw7-koppelingen verhuizen naar de blijver. '
        + 'Lege velden van de blijver worden aangevuld; ingevulde velden blijven staan. Dit is terug te draaien.',
      bevestigLabel: 'Samenvoegen',
    })
    if (!ok) return
    startTransition(async () => {
      const res = await voegContactpersonenSamen(blijverId, verliezers.map(p => p.id))
      if (!res.ok) { toast.error(res.error); return }
      toast.success(res.waarschuwing ?? 'Samengevoegd')
      router.refresh()
    })
  }

  async function markeer(persoon: DubbelPersoon, soort: ContactpersoonSoort) {
    startTransition(async () => {
      const res = await zetContactpersoonSoort(persoon.id, soort)
      if (!res.ok) { toast.error(res.error); return }
      toast.success(`${persoon.naam} staat nu als ${contactpersoonSoortLabels[soort].toLowerCase()} en komt niet meer als dubbel terug`)
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
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Button variant="ghost" size="sm" onClick={geenDubbel} disabled={bezig}>
            {groep.personen.length === 2 ? 'Beide behouden' : 'Geen dubbel'}
          </Button>
          <Button variant="primary" size="sm" onClick={samenvoegen} disabled={bezig || verliezers.length === 0}>
            {bezig ? 'Bezig…' : `Samenvoegen in ${blijver.naam}`}
          </Button>
        </span>
      </CardHeader>
      <CardBody>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {groep.personen.map(p => (
            <PersoonKaart
              key={p.id}
              persoon={p}
              blijver={p.id === blijverId}
              gekozen={!uitgesloten.includes(p.id)}
              beoordeeld={p.geenDubbelMet.includes(blijverId)}
              onKies={() => kies(p)}
              onUitsluiten={() => setUitgesloten(prev => prev.includes(p.id) ? prev.filter(i => i !== p.id) : [...prev, p.id])}
              onPostbus={() => markeer(p, 'postbus')}
            />
          ))}
        </div>
        <div style={{ marginTop: 8, fontSize: 11, color: 'var(--fg-muted)' }}>
          Klik op een kaart om die als blijver te kiezen — dat is de rij die blijft bestaan.
          Zijn het twee verschillende mensen? Kies dan “{groep.personen.length === 2 ? 'Beide behouden' : 'Geen dubbel'}”,
          dan verdwijnt deze groep voorgoed uit de lijst.
        </div>
      </CardBody>
    </Card>
  )
}

export default function DubbelenPaneel({ groepen, recent, nietDubbel }: {
  groepen: DubbelGroep[]
  recent: SamenvoegingLog[]
  nietDubbel: CpNietDubbelMarkering[]
}) {
  const [bezig, startTransition] = useTransition()
  const router = useRouter()

  function weerBeoordelen(markering: CpNietDubbelMarkering) {
    startTransition(async () => {
      const res = await maakCpNietDubbelOngedaan(markering.id)
      if (!res.ok) { toast.error(res.error); return }
      toast.success('Staat weer in de lijst')
      router.refresh()
    })
  }

  function ongedaan(log: SamenvoegingLog) {
    startTransition(async () => {
      const res = await maakSamenvoegingOngedaan(log.id)
      if (!res.ok) { toast.error(res.error); return }
      toast.success(`${log.verliezer_naam} staat weer los`)
      router.refresh()
    })
  }

  const terugdraaibaar = recent.filter(r => !r.teruggedraaid_op)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <p style={{ fontSize: 12, color: 'var(--fg-muted)', margin: 0, maxWidth: 720, lineHeight: 1.6 }}>
        Bouw7 kan een contactpersoon maar aan één bedrijf hangen, dus wie voor twee
        opdrachtgevers werkt staat er twee keer. Hieronder de rijen die waarschijnlijk dezelfde
        mens zijn. Gedeelde postbussen (info@, crediteuren@) blijven buiten deze lijst — die
        zijn geen dubbele persoon.
      </p>

      {groepen.length === 0 ? (
        <EmptyState
          title="Geen dubbelen gevonden"
          description={nietDubbel.length > 0
            ? 'Alles is beoordeeld: wat erop leek is samengevoegd of als geen dubbel weggezet.'
            : 'Er zijn geen contactpersonen die op dezelfde mens lijken.'}
        />
      ) : (
        groepen.map(g => <Groep key={g.sleutel} groep={g} />)
      )}

      {nietDubbel.length > 0 && (
        <Card>
          <CardHeader><span>Beoordeeld als geen dubbel</span></CardHeader>
          <CardBody>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {nietDubbel.map(m => (
                <div key={m.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, fontSize: 12, color: 'var(--fg-soft)' }}>
                  <span>
                    <strong style={{ color: 'var(--fg)' }}>{m.namen[0]}</strong> en{' '}
                    <strong style={{ color: 'var(--fg)' }}>{m.namen[1]}</strong> zijn twee personen
                    {' · '}{new Date(m.created_at).toLocaleString('nl-NL', { dateStyle: 'short', timeStyle: 'short' })}
                  </span>
                  <Button variant="ghost" size="sm" onClick={() => weerBeoordelen(m)} disabled={bezig}>
                    Toch beoordelen
                  </Button>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
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
                    <Link href={`/relaties/contactpersonen/${r.blijver_id}`} style={{ color: 'var(--fg)' }}>{r.blijver_naam}</Link>
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
