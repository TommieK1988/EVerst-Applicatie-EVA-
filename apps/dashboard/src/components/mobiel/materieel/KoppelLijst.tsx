'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import { koppelSticker, zoekTeStickeren } from '@/app/m/materieel/actions'
import { codeLabel } from '@/lib/materieel/qr'
import type { MaterieelTreffer } from '@/lib/materieel/zoeken'
import MaterieelRegel from './MaterieelRegel'
import { GRIJS, kaart, ROOD, secundaireKnop, veld } from './stijl'

/**
 * "Deze sticker hoort bij…" — kies uit het materieel dat nog geen sticker heeft.
 *
 * Dit is de snelle route bij het stickeren van een bestaande inventaris: kantoor
 * heeft de lijst ingevoerd, jij loopt met een rol stickers door het magazijn.
 * Sticker scannen, object aanwijzen, volgende. Andersom (eerst het object
 * opzoeken, dan scannen) kan ook, via de knop op het paspoort.
 *
 * De lijst komt van de server, ook bij zoeken: bij een verse inventaris staan er
 * honderden objecten open en die stuur je niet allemaal naar een telefoon. Er
 * wordt gezocht over alle velden die op de regel staan — merk, type, soort,
 * status, serienummer, keurings- of inventarisnummer en op wiens naam het staat.
 * Dat laatste is in de praktijk de snelste ingang: je hebt een bus of een kist
 * van één collega voor je, en dan filter je op zijn naam in plaats van door
 * vierhonderd regels te scrollen.
 */
export default function KoppelLijst({
  code, start, totaal,
}: {
  /** De ruwe payload van de gescande sticker. */
  code: string
  /** Eerste pagina van de lijst, al op de server geladen. */
  start: MaterieelTreffer[]
  /** Hoeveel objecten er in totaal nog op een sticker wachten. */
  totaal: number
}) {
  const router = useRouter()
  const [term, setTerm] = React.useState('')
  const [lijst, setLijst] = React.useState(start)
  const [zoekt, setZoekt] = React.useState(false)
  const [bezig, setBezig] = React.useState<string | null>(null)
  const [fout, setFout] = React.useState<string | null>(null)

  // Zoeken loopt met een korte vertraging: één query per typepauze in plaats van
  // één per toetsaanslag.
  React.useEffect(() => {
    let afgebroken = false
    const timer = setTimeout(async () => {
      setZoekt(true)
      const res = await zoekTeStickeren(term)
      if (afgebroken) return
      if (res.ok) setLijst(res.data)
      else setFout(res.error)
      setZoekt(false)
    }, 250)
    return () => { afgebroken = true; clearTimeout(timer) }
  }, [term])

  async function koppel(object: MaterieelTreffer) {
    setBezig(object.id)
    setFout(null)
    const res = await koppelSticker(object.id, code)
    if (res.ok) { router.replace(`/m/materieel/${object.id}`); return }
    setFout(res.error)
    setBezig(null)
  }

  return (
    <div style={{ padding: 14 }}>
      <div style={kaart}>
        <div style={{ fontSize: 12, color: GRIJS, fontWeight: 600 }}>Gescande sticker</div>
        <div style={{ fontSize: 17, fontWeight: 800 }}>{codeLabel(code)}</div>
        <div style={{ fontSize: 13, color: GRIJS, marginTop: 6, lineHeight: 1.4 }}>
          Kies waar deze sticker op zit. {totaal > 0
            ? `Nog ${totaal} ${totaal === 1 ? 'stuk' : 'stuks'} zonder sticker.`
            : 'Er staat niets meer zonder sticker.'}
        </div>
      </div>

      <input
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        placeholder="Zoek op naam, merk, nummer of wie het heeft"
        type="search"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        style={{ ...veld, marginBottom: 12 }}
      />

      {fout && (
        <div style={{ ...kaart, color: ROOD, fontSize: 14, lineHeight: 1.45 }}>{fout}</div>
      )}

      {lijst.length === 0 ? (
        <div style={{ fontSize: 14, color: GRIJS, padding: '8px 2px', lineHeight: 1.5 }}>
          {zoekt ? 'Zoeken…' : term
            ? 'Niets gevonden dat nog zonder sticker staat.'
            : 'Al het materieel heeft een sticker.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {lijst.map((o) => (
            <MaterieelRegel
              key={o.id}
              object={o}
              fotoUrl={o.foto_url}
              onClick={() => koppel(o)}
              gedimd={bezig !== null && bezig !== o.id}
              aanvulling={bezig === o.id ? 'Koppelen…' : undefined}
            />
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={() => router.push(`/m/materieel/nieuw?code=${encodeURIComponent(code)}`)}
        style={{ ...secundaireKnop, width: '100%', marginTop: 18 }}
      >
        Staat er niet bij — nieuw materieel aanmaken
      </button>
    </div>
  )
}
