'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import { maakMaterieelObject } from '@/app/(platform)/materieelbeheer/actions'
import { uploadDocument } from '@/app/(platform)/materieelbeheer/bestand-actions'
import { verkleinFoto } from '@/lib/foto/verkleinFoto'
import { CATEGORIE_LABELS, MATERIEEL_CATEGORIEEN, type MaterieelCategorie } from '@/lib/materieel/types'
import { codeLabel } from '@/lib/materieel/qr'
import MobielStickyFooter from '@/components/mobiel/MobielStickyFooter'
import { GRIJS, kaart, primaireKnop, RAND, ROOD, secundaireKnop, veld, label as labelStijl } from './stijl'

/**
 * Materieel toevoegen op de telefoon.
 *
 * Bewust een kort formulier: dit wordt staand in een bus of magazijn ingevuld,
 * met een sticker in de ene hand. Alleen wat je op dat moment ziet — wat is het,
 * welk merk, welk serienummer — plus een foto. Aanschafwaarde, leverancier en
 * garantie vult kantoor later aan op de desktop; die staan hier niet, want een
 * lang formulier krijg je op locatie niet ingevuld.
 *
 * De foto gaat pas ná het aanmaken omhoog: de upload heeft een object-id nodig.
 * Mislukt alleen de foto, dan is het materieel er wél — dat melden we, in plaats
 * van de hele registratie weg te gooien.
 */
export default function NieuwMaterieelForm({
  code,
  mijnId,
  mijnNaam,
}: {
  /** Stickercode uit de scan; leeg als er zonder sticker wordt toegevoegd. */
  code: string | null
  /** Id van de ingelogde medewerker — voor "op mijn naam". */
  mijnId: string
  mijnNaam: string
}) {
  const router = useRouter()
  const cameraRef = React.useRef<HTMLInputElement>(null)
  const bibliotheekRef = React.useRef<HTMLInputElement>(null)

  const [omschrijving, setOmschrijving] = React.useState('')
  const [categorie, setCategorie] = React.useState<MaterieelCategorie>('gereedschap')
  const [merk, setMerk] = React.useState('')
  const [type, setType] = React.useState('')
  const [serienummer, setSerienummer] = React.useState('')
  const [opmerkingen, setOpmerkingen] = React.useState('')
  const [opMijnNaam, setOpMijnNaam] = React.useState(false)
  const [foto, setFoto] = React.useState<File | null>(null)
  const [fotoUrl, setFotoUrl] = React.useState<string | null>(null)

  const [bezig, setBezig] = React.useState(false)
  const [fout, setFout] = React.useState<string | null>(null)

  // Voorbeeld-URL netjes opruimen, anders lekt elke gekozen foto geheugen.
  React.useEffect(() => {
    if (!foto) { setFotoUrl(null); return }
    const url = URL.createObjectURL(foto)
    setFotoUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [foto])

  async function opslaan() {
    if (omschrijving.trim().length < 2) { setFout('Vul in wat het is'); return }
    setBezig(true)
    setFout(null)

    const res = await maakMaterieelObject({
      omschrijving,
      categorie,
      status: 'beschikbaar',
      qr_code: code ?? '',
      merk,
      type,
      serienummer,
      opmerkingen,
      toegewezen_medewerker_id: opMijnNaam ? mijnId : '',
    })

    if (!res.ok) { setFout(res.error); setBezig(false); return }
    const id = res.data.id

    if (foto) {
      const fd = new FormData()
      fd.append('bestand', await verkleinFoto(foto))
      fd.append('type', 'foto')
      const fotoRes = await uploadDocument(id, fd)
      if (!fotoRes.ok) {
        setFout(`Materieel is opgeslagen, maar de foto niet: ${fotoRes.error}`)
        setBezig(false)
        // Wel doorsturen: het paspoort bestaat en daar kan de foto opnieuw.
        setTimeout(() => router.replace(`/m/materieel/${id}`), 1800)
        return
      }
    }

    router.replace(`/m/materieel/${id}`)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      <div style={{ padding: 14, flex: 1 }}>
        <div style={kaart}>
          <div style={{ fontSize: 12, color: GRIJS, fontWeight: 600 }}>Sticker</div>
          {code ? (
            <div style={{ fontSize: 16, fontWeight: 700, fontFamily: 'var(--font-mono, monospace)', wordBreak: 'break-all' }}>
              {codeLabel(code)}
            </div>
          ) : (
            <div style={{ fontSize: 14, color: GRIJS, marginTop: 2 }}>
              Nog geen sticker. Je kunt er later een koppelen vanaf het paspoort.
            </div>
          )}
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={labelStijl} htmlFor="omschrijving">Wat is het? *</label>
          <input
            id="omschrijving"
            value={omschrijving}
            onChange={(e) => setOmschrijving(e.target.value)}
            placeholder="Bijv. Accuboormachine"
            style={veld}
          />
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={labelStijl} htmlFor="categorie">Soort</label>
          <select
            id="categorie"
            value={categorie}
            onChange={(e) => setCategorie(e.target.value as MaterieelCategorie)}
            style={veld}
          >
            {MATERIEEL_CATEGORIEEN.map((c) => (
              <option key={c} value={c}>{CATEGORIE_LABELS[c]}</option>
            ))}
          </select>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
          <div>
            <label style={labelStijl} htmlFor="merk">Merk</label>
            <input id="merk" value={merk} onChange={(e) => setMerk(e.target.value)} style={veld} />
          </div>
          <div>
            <label style={labelStijl} htmlFor="type">Type</label>
            <input id="type" value={type} onChange={(e) => setType(e.target.value)} style={veld} />
          </div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={labelStijl} htmlFor="serienummer">Serienummer</label>
          <input
            id="serienummer"
            value={serienummer}
            onChange={(e) => setSerienummer(e.target.value)}
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            style={veld}
          />
        </div>

        {/* Twee losse inputs, net als bij de kwaliteitsronde: `capture` dwingt de
            camera af, en zonder een tweede input kun je geen bestaande foto meer
            kiezen. */}
        <div style={{ marginBottom: 12 }}>
          <span style={labelStijl}>Foto</span>
          {fotoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={fotoUrl}
              alt=""
              style={{ width: '100%', maxHeight: 220, objectFit: 'cover', borderRadius: 12, border: `1px solid ${RAND}`, marginBottom: 8 }}
            />
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={() => cameraRef.current?.click()} style={{ ...secundaireKnop, flex: 1 }}>
              {foto ? 'Opnieuw' : 'Foto maken'}
            </button>
            <button type="button" onClick={() => bibliotheekRef.current?.click()} style={{ ...secundaireKnop, flex: 1 }}>
              Kiezen
            </button>
          </div>
          <input
            ref={cameraRef} type="file" accept="image/*" capture="environment" hidden
            onChange={(e) => setFoto(e.target.files?.[0] ?? null)}
          />
          <input
            ref={bibliotheekRef} type="file" accept="image/*" hidden
            onChange={(e) => setFoto(e.target.files?.[0] ?? null)}
          />
        </div>

        <label style={{ ...kaart, display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={opMijnNaam}
            onChange={(e) => setOpMijnNaam(e.target.checked)}
            style={{ width: 20, height: 20 }}
          />
          <span style={{ fontSize: 15, fontWeight: 600 }}>Op mijn naam ({mijnNaam})</span>
        </label>

        <div style={{ marginBottom: 12 }}>
          <label style={labelStijl} htmlFor="opmerkingen">Opmerking</label>
          <textarea
            id="opmerkingen"
            value={opmerkingen}
            onChange={(e) => setOpmerkingen(e.target.value)}
            rows={3}
            style={{ ...veld, resize: 'vertical' }}
          />
        </div>

        {fout && (
          <div style={{
            padding: 12, borderRadius: 10, border: `1px solid ${RAND}`,
            background: 'rgba(180,35,24,.06)', color: ROOD, fontSize: 14, lineHeight: 1.45,
          }}>
            {fout}
          </div>
        )}
      </div>

      <MobielStickyFooter>
        <button
          type="button"
          onClick={() => router.back()}
          disabled={bezig}
          style={{ ...secundaireKnop, flex: 1 }}
        >
          Annuleren
        </button>
        <button
          type="button"
          onClick={opslaan}
          disabled={bezig}
          style={{ ...primaireKnop, flex: 2, opacity: bezig ? 0.6 : 1 }}
        >
          {bezig ? 'Opslaan…' : 'Opslaan'}
        </button>
      </MobielStickyFooter>
    </div>
  )
}
