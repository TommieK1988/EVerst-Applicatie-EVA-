'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import QrScanner from './QrScanner'
import { koppelSticker, zoekScan } from '@/app/m/materieel/actions'
import { codeLabel } from '@/lib/materieel/qr'
import { GRIJS, kaart, primaireKnop, RAND, ROOD, secundaireKnop, veld } from './stijl'

/**
 * Scanscherm. Eén camera, drie mogelijke uitkomsten:
 *
 *  • **bekende code** → het paspoort van dat object;
 *  • **onbekende code** → een keuze: hoort de sticker bij materieel dat al in EVA
 *    staat (koppelen), of is dit iets nieuws (aanmaken)? Die keuze is er bewust:
 *    blind doorsturen naar "nieuw" leverde dubbele objecten op zodra kantoor de
 *    inventaris al had ingevoerd;
 *  • **koppelen** (`koppelAanId` gezet) → de gescande sticker gaat aan het object
 *    waar je vandaan kwam. Voor materieel dat al in EVA staat maar nog geen
 *    sticker had.
 *
 * Wie geen 'schrijven' heeft, kan wel scannen en kijken maar krijgt bij een
 * onbekende sticker een nette melding in plaats van de keuze — anders zou hij op
 * een doodlopend scherm belanden dat de server toch weigert.
 */
export default function ScanScherm({
  magToevoegen,
  koppelAanId = null,
  koppelAanNaam = null,
}: {
  magToevoegen: boolean
  koppelAanId?: string | null
  koppelAanNaam?: string | null
}) {
  const router = useRouter()
  const [bezig, setBezig] = React.useState(false)
  const [fout, setFout] = React.useState<string | null>(null)
  const [handmatig, setHandmatig] = React.useState('')
  /** Gescande sticker die EVA niet kent — wacht op de keuze koppelen/nieuw. */
  const [onbekend, setOnbekend] = React.useState<string | null>(null)

  const verwerk = React.useCallback(async (payload: string) => {
    setBezig(true)
    setFout(null)

    if (koppelAanId) {
      const res = await koppelSticker(koppelAanId, payload)
      if (res.ok) { router.replace(`/m/materieel/${koppelAanId}`); return }
      setFout(res.error)
      setBezig(false)
      return
    }

    const res = await zoekScan(payload)
    if (!res.ok) { setFout(res.error); setBezig(false); return }

    if (res.data.soort === 'bekend') {
      // `scan=1` laat het paspoort de scan vastleggen: wie zag dit wanneer.
      router.push(`/m/materieel/${res.data.id}?scan=1`)
      return
    }
    if (!magToevoegen) {
      setFout('Deze sticker hoort nog nergens bij. Je hebt geen recht om materieel toe te voegen — vraag een collega met dat recht.')
      setBezig(false)
      return
    }
    // Onbekende sticker: eerst vragen of het bij bestaand materieel hoort.
    setOnbekend(res.data.code)
    setBezig(false)
  }, [koppelAanId, magToevoegen, router])

  // Gescand, niet gevonden: eerst kiezen. Camera weg, anders scant hij door de
  // keuze heen.
  if (onbekend) {
    return (
      <div style={{ padding: 14 }}>
        <div style={kaart}>
          <div style={{ fontSize: 12, color: GRIJS, fontWeight: 600 }}>Onbekende sticker</div>
          <div style={{ fontSize: 17, fontWeight: 800 }}>{codeLabel(onbekend)}</div>
          <div style={{ fontSize: 13, color: GRIJS, marginTop: 6, lineHeight: 1.45 }}>
            Deze code staat nog nergens in EVA. Hoort hij bij materieel dat er al in
            staat, of is dit iets nieuws?
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button
            type="button"
            onClick={() => router.push(`/m/materieel/koppel?code=${encodeURIComponent(onbekend)}`)}
            style={primaireKnop}
          >
            Koppelen aan bestaand materieel
          </button>
          <button
            type="button"
            onClick={() => router.push(`/m/materieel/nieuw?code=${encodeURIComponent(onbekend)}`)}
            style={secundaireKnop}
          >
            Nieuw materieel aanmaken
          </button>
          <button type="button" onClick={() => setOnbekend(null)} style={secundaireKnop}>
            Opnieuw scannen
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: 14 }}>
      {koppelAanNaam && (
        <div style={{ ...kaart, marginBottom: 12 }}>
          <div style={{ fontSize: 12, color: GRIJS, fontWeight: 600 }}>Sticker koppelen aan</div>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{koppelAanNaam}</div>
        </div>
      )}

      <QrScanner
        onCode={verwerk}
        bezig={bezig}
        hint={koppelAanId ? 'Scan de sticker die je op dit materieel plakt' : 'Richt op de QR-code van de sticker'}
      />

      {fout && (
        <div style={{
          marginTop: 12, padding: 12, borderRadius: 10,
          border: `1px solid ${RAND}`, background: 'rgba(180,35,24,.06)',
          color: ROOD, fontSize: 14, lineHeight: 1.45,
        }}>
          {fout}
        </div>
      )}

      {/* Terugval voor een gekraste sticker of een camera die dienst weigert:
          het nummer staat er meestal ook in leesbare tekst onder. */}
      <div style={{ marginTop: 18 }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: GRIJS, display: 'block', marginBottom: 6 }}>
          Lukt scannen niet? Typ de code van de sticker over
        </label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={handmatig}
            onChange={(e) => setHandmatig(e.target.value)}
            placeholder="Bijv. EV-00123"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            style={{ ...veld, flex: 1 }}
          />
          <button
            type="button"
            disabled={bezig || handmatig.trim().length === 0}
            onClick={() => verwerk(handmatig)}
            style={{
              ...primaireKnop, padding: '11px 18px',
              opacity: bezig || handmatig.trim().length === 0 ? 0.5 : 1,
            }}
          >
            Zoek
          </button>
        </div>
      </div>

      {magToevoegen && !koppelAanId && (
        <button
          type="button"
          onClick={() => router.push('/m/materieel/nieuw')}
          style={{ ...secundaireKnop, width: '100%', marginTop: 18 }}
        >
          Toevoegen zonder sticker
        </button>
      )}
    </div>
  )
}
