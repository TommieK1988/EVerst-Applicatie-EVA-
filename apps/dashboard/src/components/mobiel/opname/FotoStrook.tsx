'use client'

import React from 'react'
import { verkleinFoto } from '@/lib/foto/verkleinFoto'
import { verwijderOpnameFoto, zetHoofdfoto } from '@/lib/opname/opnames'
import { verwijderUitWachtrij, zetInWachtrij } from '@/lib/opname/wachtrij'
import { GRIJS, GROEN, RAND, ROOD, secundaireKnop, ZACHT } from './stijl'

export type StrookFoto = {
  id: string
  url: string
  is_hoofdfoto: boolean
  /** Nog niet verstuurd: de url is een lokale object-URL. Zie `OpnameScherm`. */
  wacht?: boolean
}

/**
 * Foto's maken en tonen bij een opnameregel.
 *
 * Twee losse inputs, precies zoals `components/mobiel/kwaliteit/FotoStrook.tsx`: `capture` dwingt
 * de camera af, en zónder een tweede input kun je geen foto uit de bibliotheek meer kiezen. In een
 * lege woning wil je de camera; achteraf op kantoor wil je de bibliotheek.
 *
 * Elke foto gaat eerst door `verkleinFoto` — een onbewerkte telefoonfoto haalt de body-limiet van
 * een server-action niet.
 *
 * De hoofdfoto (groene rand) is degene die meegaat naar de calculatie en zo naar de offerte.
 * Tikken op een andere foto maakt díe de hoofdfoto.
 */
export default function FotoStrook({
  opnameId,
  regelId,
  fotos,
  onVeranderd,
  verplicht = false,
  bewerkbaar = true,
  voorbereiden,
}: {
  opnameId: string
  regelId: string
  fotos: StrookFoto[]
  onVeranderd: (fotos: StrookFoto[]) => void
  /** Toont een rode melding zolang er geen foto is. */
  verplicht?: boolean
  bewerkbaar?: boolean
  /**
   * Draait vóór de eerste upload en moet true opleveren. Bedoeld voor een punt dat nog niet
   * bewaard is: `opname_fotos.regel_id` heeft een foreign key, dus de regel moet er eerst zijn.
   * Levert dit false op, dan gaat de foto niet door.
   */
  voorbereiden?: () => Promise<boolean>
}) {
  const cameraRef = React.useRef<HTMLInputElement>(null)
  const bibliotheekRef = React.useRef<HTMLInputElement>(null)
  const [bezig, setBezig] = React.useState(false)
  const [fout, setFout] = React.useState<string | null>(null)

  /**
   * Verkleint elke foto en zet hem in de wachtrij.
   *
   * De foto verschijnt meteen via een lokale object-URL; die wordt vervangen door de echte zodra
   * de upload is geland. Zo blijft de opnemer doorlopen als het bereik even wegvalt — precies het
   * moment waarop een foto (verreweg de grootste payload) het eerst sneuvelt.
   */
  async function verwerk(bestanden: FileList | null) {
    if (!bestanden || bestanden.length === 0) return
    setBezig(true)
    setFout(null)

    if (voorbereiden && !(await voorbereiden())) {
      // De aanroeper toont zelf waaróm het niet lukte (meestal een ontbrekende omschrijving).
      setBezig(false)
      return
    }
    const nieuwe: StrookFoto[] = []
    let volgendeIsHoofd = fotos.length === 0

    for (const bestand of Array.from(bestanden)) {
      const verkleind = await verkleinFoto(bestand)
      // Client-gegenereerd id: bepaalt zowel de rij als het opslagpad, en maakt opnieuw versturen
      // daarmee ongevaarlijk.
      const id = crypto.randomUUID()
      try {
        await zetInWachtrij({
          id: `foto:${id}`,
          opname_id: opnameId,
          soort: 'foto_upload',
          payload: { fotoId: id, regelId, bestandsnaam: verkleind.name || 'foto.jpg' },
          blob: verkleind,
        })
      } catch (err) {
        setFout(err instanceof Error ? err.message : 'Foto opslaan mislukt')
        continue
      }
      nieuwe.push({
        id,
        url: URL.createObjectURL(verkleind),
        is_hoofdfoto: volgendeIsHoofd,
        wacht: true,
      })
      volgendeIsHoofd = false
    }

    if (nieuwe.length > 0) onVeranderd([...fotos, ...nieuwe])
    setBezig(false)
  }

  async function verwijder(id: string) {
    const foto = fotos.find(f => f.id === id)

    if (foto?.wacht) {
      // Nog niet verstuurd: uit de wachtrij halen is genoeg. Zo kan een mislukte foto ook zónder
      // verbinding weg.
      await verwijderUitWachtrij(`foto:${id}`)
      URL.revokeObjectURL(foto.url)
    } else {
      const res = await verwijderOpnameFoto(id)
      if (!res.ok) {
        setFout(res.error)
        return
      }
    }

    const rest = fotos.filter(f => f.id !== id)
    // De server promoveert de eerstvolgende foto tot hoofdfoto; hier hetzelfde doen zodat de
    // groene rand niet verdwijnt tot de volgende keer laden.
    const wasHoofd = fotos.find(f => f.id === id)?.is_hoofdfoto
    onVeranderd(
      wasHoofd && rest.length > 0
        ? rest.map((f, i) => ({ ...f, is_hoofdfoto: i === 0 }))
        : rest,
    )
  }

  async function maakHoofdfoto(id: string) {
    const res = await zetHoofdfoto(id)
    if (!res.ok) {
      setFout(res.error)
      return
    }
    onVeranderd(fotos.map(f => ({ ...f, is_hoofdfoto: f.id === id })))
  }

  const mist = verplicht && fotos.length === 0

  return (
    <div>
      {fotos.length > 0 && (
        // flexShrink: 0 op de tegels is verplicht binnen een overflow-x-strook in de /m-kolom:
        // zonder dat drukt de browser ze plat.
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 6, marginBottom: 8 }}>
          {fotos.map(f => (
            <div key={f.id} style={{ position: 'relative', flexShrink: 0 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={f.url}
                alt=""
                onClick={() => bewerkbaar && !f.is_hoofdfoto && !f.wacht && void maakHoofdfoto(f.id)}
                style={{
                  width: 72, height: 72, objectFit: 'cover', borderRadius: 10,
                  border: `2px solid ${f.is_hoofdfoto ? GROEN : RAND}`,
                }}
              />
              {f.is_hoofdfoto && (
                <span
                  style={{
                    position: 'absolute', bottom: 4, left: 4, padding: '1px 5px',
                    borderRadius: 4, background: GROEN, color: '#fff',
                    fontSize: 9, fontWeight: 700, letterSpacing: 0.3,
                  }}
                >
                  OFFERTE
                </span>
              )}
              {f.wacht && (
                <span
                  title="Wacht op verbinding"
                  style={{
                    position: 'absolute', top: 4, left: 4, width: 16, height: 16,
                    borderRadius: 8, background: 'rgba(0,0,0,0.55)', color: '#fff',
                    fontSize: 10, lineHeight: '16px', textAlign: 'center',
                  }}
                >
                  ↑
                </span>
              )}
              {bewerkbaar && (
                <button
                  type="button"
                  onClick={() => void verwijder(f.id)}
                  aria-label="Foto verwijderen"
                  style={{
                    position: 'absolute', top: -6, right: -6, width: 22, height: 22,
                    borderRadius: 11, border: 'none', background: 'rgba(0,0,0,0.65)',
                    color: '#fff', fontSize: 13, lineHeight: '22px', padding: 0, cursor: 'pointer',
                  }}
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {bewerkbaar && (
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            onClick={() => cameraRef.current?.click()}
            disabled={bezig}
            style={{ ...secundaireKnop, flex: 1, padding: '11px 12px', fontSize: 14 }}
          >
            {bezig ? 'Bezig…' : '📷 Foto maken'}
          </button>
          <button
            type="button"
            onClick={() => bibliotheekRef.current?.click()}
            disabled={bezig}
            style={{ ...secundaireKnop, padding: '11px 12px', fontSize: 14 }}
          >
            Kiezen
          </button>
        </div>
      )}

      {/* capture="environment" dwingt de achtercamera af; zónder de tweede input kun je dan
          geen bestaande foto meer kiezen. */}
      <input
        ref={cameraRef} type="file" accept="image/*" capture="environment" multiple
        style={{ display: 'none' }}
        onChange={e => { void verwerk(e.target.files); e.target.value = '' }}
      />
      <input
        ref={bibliotheekRef} type="file" accept="image/*" multiple
        style={{ display: 'none' }}
        onChange={e => { void verwerk(e.target.files); e.target.value = '' }}
      />

      {mist && (
        <p style={{ margin: '6px 0 0', fontSize: 12, color: ROOD, fontWeight: 600 }}>
          Bij dit onderdeel is een foto verplicht.
        </p>
      )}
      {fout && <p style={{ margin: '6px 0 0', fontSize: 12, color: ROOD }}>{fout}</p>}
      {!mist && !fout && fotos.length === 0 && (
        <p style={{ margin: '6px 0 0', fontSize: 11, color: ZACHT }}>Optioneel</p>
      )}
      {fotos.length > 1 && (
        <p style={{ margin: '6px 0 0', fontSize: 11, color: GRIJS }}>
          Tik een foto aan om hem in de offerte te gebruiken.
        </p>
      )}
    </div>
  )
}
