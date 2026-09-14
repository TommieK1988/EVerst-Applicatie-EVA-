'use client'

import React, { useMemo, useState, useTransition } from 'react'
import toast from 'react-hot-toast'
import type { MedewerkerAfdeling } from '@everts/database/platform-types'
import { stelUrenGoedkeurderIn } from './actions'
import { Card, CardBody, EmptyState } from '@/components/ui'
import type { MedewerkerOptie } from './FunctiesAfdelingenBeheer'

/**
 * Wie de uren van kantoorpersoneel goedkeurt.
 *
 * De gewone route loopt via het DOSSIER: eerst de teamleider, dan de projectleider. Dat klopt voor
 * de buitendienst, maar niet voor kantoor — een calculator boekt op van alles, en zijn uren horen
 * bij zijn eigen leidinggevende. Wie hier wordt aangewezen VERVANGT de dossierroute voor álle uren
 * van die medewerker.
 *
 * Alleen medewerkers buiten Uitvoering staan in deze lijst: de buitendienst loopt altijd via het
 * dossier, en die route hier kunnen doorbreken zou de teamleiderstap stilletjes uitschakelen.
 */

const UITVOERING = 'uitvoering'
const ZONDER_AFDELING = '— Zonder afdeling —'

const norm = (v: string | null | undefined) => (v ?? '').trim().toLowerCase()

export function medewerkerNaam(m: MedewerkerOptie): string {
  return [m.voornaam, m.tussenvoegsel, m.achternaam].filter(Boolean).join(' ')
}

export default function UrenGoedkeurderBeheer({
  medewerkers: initieel,
  afdelingen,
}: {
  medewerkers: MedewerkerOptie[]
  afdelingen: MedewerkerAfdeling[]
}) {
  const [medewerkers, setMedewerkers] = useState<MedewerkerOptie[]>(initieel)
  const [isPending, startTransition] = useTransition()
  const [bezigMet, setBezigMet] = useState<string | null>(null)

  // Alleen wie goedkeuren kan ook echt: zonder account komt iemand nooit op het keurscherm,
  // en dan blijven de uren staan zonder dat iemand ziet waarom.
  const kandidaten = useMemo(
    () => medewerkers.filter(m => m.auth_user_id != null)
      .sort((a, b) => medewerkerNaam(a).localeCompare(medewerkerNaam(b), 'nl')),
    [medewerkers],
  )

  // Groeperen op afdeling, in de volgorde van de afdelingenlijst; wie geen afdeling heeft
  // staat onderaan, want die is nog niet ingedeeld en niet per se kantoor.
  const groepen = useMemo(() => {
    const volgorde = new Map<string, number>(
      afdelingen.map(a => [norm(a.naam), a.volgorde]),
    )
    const perAfdeling = new Map<string, MedewerkerOptie[]>()
    for (const m of medewerkers) {
      if (norm(m.afdeling) === UITVOERING) continue
      const sleutel = m.afdeling?.trim() || ZONDER_AFDELING
      const lijst = perAfdeling.get(sleutel) ?? []
      lijst.push(m)
      perAfdeling.set(sleutel, lijst)
    }
    return [...perAfdeling.entries()]
      .map(([naam, leden]) => ({
        naam,
        leden: leden.sort((a, b) => medewerkerNaam(a).localeCompare(medewerkerNaam(b), 'nl')),
        volgorde: naam === ZONDER_AFDELING ? 9_999 : (volgorde.get(norm(naam)) ?? 9_998),
      }))
      .sort((a, b) => a.volgorde - b.volgorde || a.naam.localeCompare(b.naam, 'nl'))
  }, [medewerkers, afdelingen])

  function kies(medewerkerId: string, goedkeurderId: string) {
    const vorige = medewerkers.find(m => m.id === medewerkerId)?.uren_goedkeurder_id ?? null
    const nieuw = goedkeurderId || null
    if (nieuw === vorige) return

    // Meteen tonen, bij een fout terugdraaien: een keuzelijst die pas na een rondje server
    // omspringt voelt kapot, en dit scherm zet er vaak meerdere achter elkaar.
    setMedewerkers(prev => prev.map(m => m.id === medewerkerId ? { ...m, uren_goedkeurder_id: nieuw } : m))
    setBezigMet(medewerkerId)
    startTransition(async () => {
      const r = await stelUrenGoedkeurderIn(medewerkerId, nieuw)
      setBezigMet(null)
      if (!r.ok) {
        setMedewerkers(prev => prev.map(m => m.id === medewerkerId ? { ...m, uren_goedkeurder_id: vorige } : m))
        toast.error(r.error)
        return
      }
      toast.success(nieuw ? 'Goedkeurder ingesteld' : 'Weer via het dossier')
    })
  }

  const totaalIngesteld = medewerkers.filter(
    m => norm(m.afdeling) !== UITVOERING && m.uren_goedkeurder_id,
  ).length

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 600, color: 'var(--fg)', margin: 0 }}>
          Uren goedkeuren
        </h3>
        <span style={{ fontSize: 10, color: 'var(--fg-muted)' }}>
          {totaalIngesteld === 0
            ? 'Nog niemand ingesteld'
            : `${totaalIngesteld} medewerker${totaalIngesteld === 1 ? '' : 's'} met een vaste goedkeurder`}
        </span>
      </div>

      <p style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--fg-muted)', margin: '0 0 14px', maxWidth: 760 }}>
        Normaal keurt de teamleider of de projectleider van het dossier de uren goed. Voor
        medewerkers buiten Uitvoering kun je hier één vaste goedkeurder aanwijzen: die keurt dan
        <strong style={{ color: 'var(--fg)' }}> alle </strong>
        uren van die medewerker, ongeacht op welk project ze staan. Laat je het leeg, dan blijft
        het dossier bepalen wie beoordeelt. Uitvoering staat er bewust niet tussen — daar hoort de
        teamleider als eerste te kijken.
      </p>

      {groepen.length === 0 ? (
        <EmptyState size="sm" tone="neutral" title="Alle medewerkers vallen onder Uitvoering." />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16, alignItems: 'start' }}>
          {groepen.map(groep => (
            <Card key={groep.naam}>
              <CardBody className="py-3 px-3.5">
                <div style={{
                  fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em',
                  color: 'var(--fg-muted)', marginBottom: 8,
                }}>
                  {groep.naam}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {groep.leden.map(m => (
                    <div key={m.id} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, alignItems: 'center' }}>
                      <span style={{
                        fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--fg)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {medewerkerNaam(m)}
                      </span>
                      <select
                        className="eva-input"
                        style={{ width: '100%', fontSize: 12 }}
                        value={m.uren_goedkeurder_id ?? ''}
                        disabled={isPending && bezigMet === m.id}
                        onChange={e => kies(m.id, e.target.value)}
                      >
                        <option value="">— Via het dossier —</option>
                        {kandidaten.filter(k => k.id !== m.id).map(k => (
                          <option key={k.id} value={k.id}>{medewerkerNaam(k)}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
