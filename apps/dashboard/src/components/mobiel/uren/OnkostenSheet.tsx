'use client'

import { useMemo, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { voegOnkostenToe } from '@/lib/uren/onkosten-acties'
import { verkleinFoto } from '@/lib/foto/verkleinFoto'
import {
  ONKOSTEN_SOORTEN, VERVOERMIDDELEN, bedragZelfInvullen, berekenKmBedrag, bonVerplicht,
  controleerOnkosten, rekentPerKm, type KmTarieven, type OnkostenSoort, type Vervoermiddel,
} from '@/lib/uren/onkosten'

/**
 * Parkeer- en reiskosten van één dag vastleggen.
 *
 * Welke velden je krijgt hangt af van de keuze: bij parkeren, OV en overig vul je een bedrag in
 * en hoort er een foto van het bonnetje bij; bij auto en bromfiets vul je kilometers in en rekent
 * EVA het bedrag. Die regels staan in `lib/uren/onkosten.ts` en worden hier alleen gebruikt om de
 * knop te blokkeren — de server-action controleert ze opnieuw.
 *
 * Deze bedragen gaan bewust NIET naar Bouw7: de urenregistratie daar kent geen geldbedragen, en
 * het als projectkosten boeken zou de inkoopstroom raken. Ze worden hier vastgelegd en getoond;
 * hoe de administratie ze verder verwerkt is een aparte afspraak.
 */

const veld: React.CSSProperties = {
  width: '100%', padding: '12px 14px', borderRadius: 10,
  border: '1px solid var(--border)', background: 'var(--bg)',
  fontFamily: 'inherit', fontSize: 15, color: 'var(--fg)',
}

const labelStijl: React.CSSProperties = {
  display: 'block', fontSize: 12, fontWeight: 700, color: '#6b757c',
  marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em',
}

const euro = (n: number) => n.toLocaleString('nl-NL', { style: 'currency', currency: 'EUR' })

function keuzeKnop(actief: boolean): React.CSSProperties {
  return {
    flex: 1, padding: '11px 0', borderRadius: 10, cursor: 'pointer',
    fontFamily: 'inherit', fontSize: 13, fontWeight: 700,
    border: `1.5px solid ${actief ? '#009439' : 'var(--border)'}`,
    background: actief ? 'rgba(0,148,57,0.08)' : 'transparent',
    color: actief ? '#009439' : '#6b757c',
  }
}

export default function OnkostenSheet({
  weekId, datum, kmTarieven, onSluit, onKlaar,
}: {
  weekId: string
  datum: string
  kmTarieven: KmTarieven
  onSluit: () => void
  onKlaar: () => void
}) {
  const [soort, setSoort] = useState<OnkostenSoort>('parkeren')
  const [vervoermiddel, setVervoermiddel] = useState<Vervoermiddel | null>(null)
  const [bedrag, setBedrag] = useState('')
  const [km, setKm] = useState('')
  const [omschrijving, setOmschrijving] = useState('')
  const [bon, setBon] = useState<{ bestand: File; voorbeeld: string } | null>(null)
  const [bezig, setBezig] = useState(false)

  // capture="environment" dwingt de achtercamera af; zónder de tweede input kun je dan geen
  // bestaande foto meer kiezen. Hetzelfde paar als in mobiel/kwaliteit/FotoStrook.tsx.
  const cameraRef = useRef<HTMLInputElement>(null)
  const bibliotheekRef = useRef<HTMLInputElement>(null)

  const perKm = rekentPerKm(vervoermiddel)
  const vraagtBedrag = bedragZelfInvullen(soort, vervoermiddel)
  const vraagtBon = bonVerplicht(soort, vervoermiddel)

  const kmGetal = Number(km.replace(',', '.'))
  const bedragGetal = Number(bedrag.replace(',', '.'))

  const bezwaar = useMemo(() => controleerOnkosten({
    soort,
    vervoermiddel,
    km: km.trim() && Number.isFinite(kmGetal) ? kmGetal : null,
    bedrag: bedrag.trim() && Number.isFinite(bedragGetal) ? bedragGetal : null,
    heeftBon: Boolean(bon),
  }), [soort, vervoermiddel, km, kmGetal, bedrag, bedragGetal, bon])

  const kmBedrag = perKm && Number.isFinite(kmGetal) && kmGetal > 0
    ? berekenKmBedrag(kmGetal, vervoermiddel, kmTarieven)
    : null
  const tarief = vervoermiddel === 'bromfiets' ? kmTarieven.bromfiets : kmTarieven.auto

  function wisBon() {
    setBon(oud => { if (oud) URL.revokeObjectURL(oud.voorbeeld); return null })
  }

  function kiesSoort(s: OnkostenSoort) {
    setSoort(s)
    // Het vervoermiddel hoort alleen bij reiskosten; laten staan zou een verborgen keuze meesturen.
    setVervoermiddel(s === 'reiskosten' ? 'auto' : null)
    if (s === 'reiskosten') { setBedrag(''); wisBon() } else { setKm('') }
  }

  function kiesVervoermiddel(v: Vervoermiddel) {
    setVervoermiddel(v)
    if (rekentPerKm(v)) { setBedrag(''); wisBon() } else { setKm('') }
  }

  async function kiesBon(bestanden: FileList | null) {
    const eerste = bestanden?.[0]
    if (!eerste) return
    setBezig(true)
    try {
      // Een onbewerkte telefoonfoto haalt de body-limiet van een server-action niet.
      const klein = await verkleinFoto(eerste)
      wisBon()
      setBon({ bestand: klein, voorbeeld: URL.createObjectURL(klein) })
    } catch {
      toast.error('Deze foto kon niet verwerkt worden.')
    }
    setBezig(false)
  }

  async function bewaar() {
    if (bezwaar) { toast.error(bezwaar); return }
    setBezig(true)

    const fd = new FormData()
    fd.append('datum', datum)
    fd.append('soort', soort)
    if (vervoermiddel) fd.append('vervoermiddel', vervoermiddel)
    if (perKm) fd.append('km', km)
    else fd.append('bedrag', bedrag)
    if (omschrijving) fd.append('omschrijving', omschrijving)
    if (bon) fd.append('bon', bon.bestand, bon.bestand.name)

    const r = await voegOnkostenToe(weekId, fd)
    setBezig(false)
    if (!r.ok) { toast.error(r.error); return }
    wisBon()
    onKlaar()
    onSluit()
  }

  return (
    <div onClick={onSluit}
      style={{
        position: 'fixed', inset: 0, zIndex: 70,
        background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'flex-end',
      }}>
      <div onClick={e => e.stopPropagation()}
        style={{
          width: '100%', background: 'var(--bg-elev)',
          borderTopLeftRadius: 18, borderTopRightRadius: 18,
          padding: '8px 20px calc(20px + env(safe-area-inset-bottom, 0px))',
          maxHeight: '92dvh', display: 'flex', flexDirection: 'column',
          boxShadow: '0 -4px 24px rgba(0,0,0,0.15)',
        }}>
        <div style={{ width: 36, height: 4, borderRadius: 2, background: '#d7dde0', margin: '0 auto 16px', flexShrink: 0 }} />
        <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--fg)', marginBottom: 16, flexShrink: 0 }}>
          Kosten toevoegen
        </div>

        <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div>
            <label style={labelStijl}>Soort</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {ONKOSTEN_SOORTEN.map(s => (
                <button key={s.waarde} type="button" onClick={() => kiesSoort(s.waarde)}
                  style={keuzeKnop(soort === s.waarde)}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {soort === 'reiskosten' && (
            <div>
              <label style={labelStijl}>Waarmee gereisd</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {VERVOERMIDDELEN.map(v => (
                  <button key={v.waarde} type="button" onClick={() => kiesVervoermiddel(v.waarde)}
                    style={keuzeKnop(vervoermiddel === v.waarde)}>
                    {v.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {perKm && (
            <div>
              <label style={labelStijl}>Kilometers</label>
              <input type="text" inputMode="decimal" value={km}
                onChange={e => setKm(e.target.value)} placeholder="0" style={veld} />
              <p style={{ margin: '6px 0 0', fontSize: 12.5, color: kmBedrag ? '#009439' : '#6b757c' }}>
                {kmBedrag !== null
                  ? `${kmGetal.toLocaleString('nl-NL')} km × ${euro(tarief)} = ${euro(kmBedrag)}`
                  : `De vergoeding is ${euro(tarief)} per kilometer.`}
              </p>
            </div>
          )}

          {vraagtBedrag && (
            <div>
              <label style={labelStijl}>Bedrag</label>
              <input type="text" inputMode="decimal" value={bedrag}
                onChange={e => setBedrag(e.target.value)} placeholder="0,00" style={veld} />
            </div>
          )}

          {vraagtBon && (
            <div>
              <label style={labelStijl}>
                {vervoermiddel === 'ov' ? 'Foto van je kaartje' : 'Foto van het bonnetje'}
              </label>
              {bon ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={bon.voorbeeld} alt="" style={{
                    width: 72, height: 72, objectFit: 'cover',
                    borderRadius: 10, border: '1px solid var(--border)', flexShrink: 0,
                  }} />
                  <button type="button" onClick={wisBon}
                    style={{
                      padding: '10px 14px', borderRadius: 10, cursor: 'pointer',
                      border: '1px solid var(--border)', background: 'transparent',
                      fontFamily: 'inherit', fontSize: 13, fontWeight: 700, color: '#c0392b',
                    }}>
                    Vervangen
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" onClick={() => cameraRef.current?.click()} disabled={bezig}
                    style={{
                      flex: 1, padding: '11px 12px', borderRadius: 10, cursor: 'pointer',
                      border: '1px solid var(--border)', background: 'transparent',
                      fontFamily: 'inherit', fontSize: 14, fontWeight: 700, color: '#6b757c',
                    }}>
                    {bezig ? 'Bezig…' : 'Foto maken'}
                  </button>
                  <button type="button" onClick={() => bibliotheekRef.current?.click()} disabled={bezig}
                    style={{
                      padding: '11px 14px', borderRadius: 10, cursor: 'pointer',
                      border: '1px solid var(--border)', background: 'transparent',
                      fontFamily: 'inherit', fontSize: 14, fontWeight: 700, color: '#6b757c',
                    }}>
                    Kiezen
                  </button>
                </div>
              )}
              <input ref={cameraRef} type="file" accept="image/*" capture="environment"
                style={{ display: 'none' }}
                onChange={e => { void kiesBon(e.target.files); e.target.value = '' }} />
              <input ref={bibliotheekRef} type="file" accept="image/*"
                style={{ display: 'none' }}
                onChange={e => { void kiesBon(e.target.files); e.target.value = '' }} />
            </div>
          )}

          <div>
            <label style={labelStijl}>Omschrijving (optioneel)</label>
            <input type="text" value={omschrijving} onChange={e => setOmschrijving(e.target.value)}
              placeholder="Bijvoorbeeld: parkeergarage centrum" style={veld} />
          </div>
        </div>

        {bezwaar && (
          <p style={{ margin: '14px 0 0', fontSize: 12.5, color: '#a15c00', flexShrink: 0 }}>
            {bezwaar}
          </p>
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: bezwaar ? 10 : 18, flexShrink: 0 }}>
          <button type="button" onClick={onSluit}
            style={{ ...actieKnop, background: 'transparent', color: '#6b757c', border: '1px solid var(--border)' }}>
            Annuleren
          </button>
          <button type="button" onClick={bewaar} disabled={bezig || Boolean(bezwaar)}
            style={{
              ...actieKnop, border: 'none',
              background: bezwaar ? '#e8ebed' : '#009439',
              color: bezwaar ? '#9aa4ab' : '#fff',
              cursor: bezwaar ? 'default' : 'pointer',
              opacity: bezig ? 0.6 : 1,
            }}>
            {bezig ? 'Bezig…' : 'Opslaan'}
          </button>
        </div>
      </div>
    </div>
  )
}

const actieKnop: React.CSSProperties = {
  flex: 1, padding: '14px 0', borderRadius: 11, cursor: 'pointer',
  fontFamily: 'inherit', fontSize: 15, fontWeight: 700,
}
