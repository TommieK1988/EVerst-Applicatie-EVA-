'use client'

/**
 * "Bon afronden" op de Info-tab van een servicedeskbon (mobiel).
 *
 * Twee dingen die de monteur op locatie doet:
 *  1. Pakbonnen fotograferen — de projectleider weet dan welke inkoopfacturen er nog komen,
 *     lang voordat die in Bouw7 binnen zijn. Kan op elk moment, niet pas bij het afronden:
 *     de pakbon krijg je bij de groothandel, vaak dagen voor het werk klaar is.
 *  2. De bon gereed melden, met wat er gedaan is en eventueel een handtekening voor akkoord van wie er ter plekke is.
 *
 * Data komt als props van de server (`ServicedeskAfrondenView`); na elke actie een
 * `router.refresh()` in plaats van eigen client-state, zodat het scherm altijd de database volgt.
 */

import React, { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import BottomSheet from '@/components/mobiel/BottomSheet'
import SpraakTextarea from '@/components/mobiel/SpraakTextarea'
import HandtekeningPad from '@/components/planning/werkbon/HandtekeningPad'
import { verkleinFoto } from '@/lib/foto/verkleinFoto'
import {
  meldServicedeskGereed, voegPakbonToe, verwijderPakbon,
} from '@/lib/dossiers/servicedesk-afronden'
import type { ServicedeskAfronding } from '@/lib/dossiers/servicedesk-afronden-types'
import {
  GRIJS, GROEN, OPPERVLAK, RAND, TEKST, VLAK, label, primaireKnop, secundaireKnop, veld,
} from '@/components/mobiel/oplevering/stijl'

const fmtMoment = (iso: string) =>
  new Date(iso).toLocaleString('nl-NL', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Amsterdam',
  })

const kaart: React.CSSProperties = {
  background: OPPERVLAK, border: `1px solid ${RAND}`, borderRadius: 14,
  padding: 16, display: 'flex', flexDirection: 'column', gap: 12,
}

const kop: React.CSSProperties = { fontSize: 15, fontWeight: 700, color: TEKST }

export default function ServicedeskAfrondenBlok({ dossierId, afronding, magBewerken }: {
  dossierId: string
  afronding: ServicedeskAfronding
  /** Onwaar op een afgesloten bon: dan alleen lezen. */
  magBewerken: boolean
}) {
  const [gereedOpen, setGereedOpen] = useState(false)
  const { gereedmelding } = afronding

  return (
    <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={kaart}>
        <div style={kop}>Bon gereed melden</div>

        {gereedmelding ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: GROEN }}>
              ✓ Gereed gemeld{gereedmelding.gemeldDoorNaam ? ` door ${gereedmelding.gemeldDoorNaam}` : ''}
              {' · '}{fmtMoment(gereedmelding.gemeldOp)}
            </div>
            <div style={{
              fontSize: 15, color: TEKST, whiteSpace: 'pre-wrap', lineHeight: 1.45,
              background: VLAK, borderRadius: 10, padding: '10px 12px',
            }}>
              {gereedmelding.uitgevoerdeWerkzaamheden}
            </div>
            {gereedmelding.handtekeningUrl && (
              <div>
                <div style={label}>
                  Afgetekend{gereedmelding.getekendDoor ? ` door ${gereedmelding.getekendDoor}` : ''}
                </div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={gereedmelding.handtekeningUrl} alt="Handtekening"
                  style={{ width: '100%', maxHeight: 140, objectFit: 'contain', background: '#fafafa', border: `1px solid ${RAND}`, borderRadius: 10 }}
                />
              </div>
            )}
            {magBewerken && (
              <button type="button" onClick={() => setGereedOpen(true)} style={secundaireKnop}>
                Opnieuw gereed melden
              </button>
            )}
          </div>
        ) : magBewerken ? (
          <>
            <div style={{ fontSize: 14, color: GRIJS, lineHeight: 1.45 }}>
              Klaar op locatie? Noteer wat je hebt gedaan en laat eventueel aftekenen voor akkoord.
            </div>
            <button type="button" onClick={() => setGereedOpen(true)} style={primaireKnop}>
              Bon gereed melden
            </button>
          </>
        ) : (
          <div style={{ fontSize: 14, color: GRIJS }}>Deze bon is niet gereed gemeld.</div>
        )}
      </div>

      <PakbonnenKaart dossierId={dossierId} afronding={afronding} magBewerken={magBewerken} />

      {gereedOpen && (
        <GereedSheet dossierId={dossierId} onSluit={() => setGereedOpen(false)} />
      )}
    </div>
  )
}

function GereedSheet({ dossierId, onSluit }: { dossierId: string; onSluit: () => void }) {
  const router = useRouter()
  const [werkzaamheden, setWerkzaamheden] = useState('')
  const [handtekening, setHandtekening] = useState<string | null>(null)
  const [getekendDoor, setGetekendDoor] = useState('')
  const [bezig, setBezig] = useState(false)

  const kanVersturen = werkzaamheden.trim().length > 0 && !bezig

  async function verstuur() {
    if (!kanVersturen) return
    setBezig(true)
    const res = await meldServicedeskGereed(dossierId, {
      uitgevoerdeWerkzaamheden: werkzaamheden,
      handtekeningB64: handtekening,
      getekendDoor: getekendDoor || null,
    })
    setBezig(false)
    if (!res.ok) { toast.error(res.error); return }
    if (res.waarschuwing) toast(res.waarschuwing, { icon: '⚠️', duration: 6000 })
    else toast.success('Bon gereed gemeld')
    onSluit()
    router.refresh()
  }

  return (
    <BottomSheet titel="Bon gereed melden" onSluit={onSluit}>
      <div>
        <label htmlFor="sd-werkzaamheden" style={label}>Uitgevoerde werkzaamheden</label>
        <SpraakTextarea
          id="sd-werkzaamheden"
          value={werkzaamheden}
          onChange={setWerkzaamheden}
          placeholder="Bijv. lekkende kraan in de keuken vervangen, afvoer doorgespoten"
          rows={5}
          style={{ ...veld, resize: 'vertical' }}
        />
      </div>

      <div>
        <div style={label}>Handtekening voor akkoord (optioneel)</div>
        <HandtekeningPad onChange={setHandtekening} hoogte={180} />
      </div>

      {handtekening && (
        <div>
          <label htmlFor="sd-getekend-door" style={label}>Naam ondertekenaar</label>
          <input
            id="sd-getekend-door"
            value={getekendDoor}
            onChange={e => setGetekendDoor(e.target.value)}
            placeholder="Wie tekent er?"
            autoComplete="off"
            style={veld}
          />
        </div>
      )}

      <button
        type="button" onClick={verstuur} disabled={!kanVersturen}
        style={{ ...primaireKnop, opacity: kanVersturen ? 1 : 0.5 }}
      >
        {bezig ? 'Bezig…' : 'Gereed melden'}
      </button>
    </BottomSheet>
  )
}

function PakbonnenKaart({ dossierId, afronding, magBewerken }: {
  dossierId: string
  afronding: ServicedeskAfronding
  magBewerken: boolean
}) {
  const router = useRouter()
  const cameraRef = useRef<HTMLInputElement>(null)
  const galerijRef = useRef<HTMLInputElement>(null)
  const [opmerking, setOpmerking] = useState('')
  const [bezig, setBezig] = useState(false)
  const { pakbonnen } = afronding

  async function upload(files: FileList | null) {
    if (!files || files.length === 0) return
    setBezig(true)
    let gelukt = 0
    for (const file of Array.from(files)) {
      const fd = new FormData()
      fd.append('foto', await verkleinFoto(file))
      if (opmerking.trim()) fd.append('opmerking', opmerking.trim())
      const res = await voegPakbonToe(dossierId, fd)
      if (res.ok) gelukt++
      else toast.error(res.error)
    }
    setBezig(false)
    if (gelukt > 0) {
      toast.success(gelukt === 1 ? 'Pakbon toegevoegd' : `${gelukt} pakbonnen toegevoegd`)
      setOpmerking('')
      router.refresh()
    }
  }

  async function verwijder(id: string) {
    if (!window.confirm('Deze pakbon verwijderen?')) return
    const res = await verwijderPakbon(id)
    if (!res.ok) { toast.error(res.error); return }
    router.refresh()
  }

  return (
    <div style={kaart}>
      <div>
        <div style={kop}>Pakbonnen{pakbonnen.length > 0 ? ` (${pakbonnen.length})` : ''}</div>
        <div style={{ fontSize: 13, color: GRIJS, marginTop: 2, lineHeight: 1.4 }}>
          Maak een foto van elke pakbon. Dan weet de projectleider welke inkoopfacturen er nog komen.
        </div>
      </div>

      {pakbonnen.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          {pakbonnen.map(p => (
            <div key={p.id} style={{ position: 'relative', minWidth: 0 }}>
              <a href={p.fotoUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'block' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={p.fotoUrl} alt={p.opmerking ?? 'Pakbon'}
                  style={{ width: '100%', aspectRatio: '3 / 4', objectFit: 'cover', borderRadius: 8, border: `1px solid ${RAND}`, display: 'block' }}
                />
              </a>
              {magBewerken && p.isEigen && (
                <button
                  type="button" onClick={() => verwijder(p.id)} aria-label="Pakbon verwijderen"
                  style={{
                    position: 'absolute', top: 4, right: 4, width: 28, height: 28, borderRadius: 999,
                    border: 'none', background: 'rgba(22,27,32,0.65)', color: '#fff', fontSize: 16,
                    lineHeight: '28px', padding: 0, cursor: 'pointer',
                  }}
                >
                  ×
                </button>
              )}
              <div style={{ fontSize: 11, color: GRIJS, marginTop: 4, lineHeight: 1.3, wordBreak: 'break-word' }}>
                {p.opmerking ? <strong style={{ color: TEKST, fontWeight: 600 }}>{p.opmerking}<br /></strong> : null}
                {fmtMoment(p.geuploadOp)}
              </div>
            </div>
          ))}
        </div>
      )}

      {magBewerken && (
        <>
          <div>
            <label htmlFor="sd-pakbon-opmerking" style={label}>Leverancier of opmerking (optioneel)</label>
            <input
              id="sd-pakbon-opmerking"
              value={opmerking}
              onChange={e => setOpmerking(e.target.value)}
              placeholder="Bijv. Technische Unie"
              autoComplete="off"
              style={veld}
            />
          </div>
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
            onChange={e => { upload(e.target.files); e.target.value = '' }} />
          <input ref={galerijRef} type="file" accept="image/*" multiple style={{ display: 'none' }}
            onChange={e => { upload(e.target.files); e.target.value = '' }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button" disabled={bezig} onClick={() => cameraRef.current?.click()}
              style={{ ...primaireKnop, flex: 1, fontSize: 15, opacity: bezig ? 0.6 : 1 }}
            >
              {bezig ? 'Uploaden…' : '📷 Pakbon fotograferen'}
            </button>
            <button
              type="button" disabled={bezig} onClick={() => galerijRef.current?.click()}
              style={{ ...secundaireKnop, fontSize: 14 }}
            >
              Galerij
            </button>
          </div>
        </>
      )}

      {!magBewerken && pakbonnen.length === 0 && (
        <div style={{ fontSize: 14, color: GRIJS }}>Geen pakbonnen toegevoegd.</div>
      )}
    </div>
  )
}
