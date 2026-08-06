'use client'

import React, { useRef, useState } from 'react'
import {
  opleverPuntStatusLabels,
  type OpleverPuntStatus, type OpleverFotoSoort, type OpleverFoto, type OpleverToewijzingType,
} from '@everts/database'
import {
  setPuntStatus, updateOpleverpunt, uploadOpleverFoto, verwijderOpleverFoto, voegPuntReactieToe,
  type OpleverPuntView, type OpleverToewijsbaar,
} from '@/lib/dossiers/oplevering'
import { PUNT_TRANSITIES, TRIAGE_STATUSSEN } from '@/lib/dossiers/oplever-status'
import { splitsFotos, bewijsOntbreekt } from '@/lib/dossiers/oplever-fotos'
import { verkleinFoto } from '@/lib/foto/verkleinFoto'
import { GROEN, GRIJS, RAND, TEKST, AMBER, ZACHT, VLAK, OPPERVLAK, PUNT_KLEUR, veld, secundaireKnop } from './stijl'
import { useDialogen } from '@/components/ui/dialogen'

/**
 * Eén opleverpunt op de telefoon: dichtgeklapt de stand, opengeklapt alles wat je op locatie doet
 * — status wijzigen, voor/na-foto maken, opmerking plaatsen.
 *
 * Gedeeld tussen het overzicht (losse aandachtspunten, AP) en het uitvoerscherm (punten binnen een
 * moment, OP): het gedrag is identiek, alleen de nummerreeks verschilt.
 */
export default function PuntKaart({ punt, prefix, toewijsbaar, onWijzig }: {
  punt: OpleverPuntView
  prefix: 'OP' | 'AP'
  toewijsbaar: OpleverToewijsbaar | null
  onWijzig: () => void
}) {
  const [open, setOpen] = useState(false)
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState<string | null>(null)
  const [opmerking, setOpmerking] = useState('')
  const { vraagTekst } = useDialogen()

  // De keuzelijst codeert type en id in één waarde, zodat er op een telefoon maar één select nodig
  // is: "medewerker:<id>" of "relatie:<id>". Leeg = niet toegewezen.
  const huidigeToewijzing =
    punt.toegewezen_type === 'medewerker' && punt.toegewezen_medewerker_id
      ? `medewerker:${punt.toegewezen_medewerker_id}`
      : punt.toegewezen_type === 'relatie' && punt.toegewezen_relatie_id
        ? `relatie:${punt.toegewezen_relatie_id}`
        : ''

  async function wijzigToewijzing(waarde: string) {
    const [type, id] = waarde ? waarde.split(':') : []
    setBezig(true); setFout(null)
    const r = await updateOpleverpunt(punt.id, {
      toegewezen_type: (type as OpleverToewijzingType) || null,
      toegewezen_medewerker_id: type === 'medewerker' ? id : null,
      toegewezen_relatie_id: type === 'relatie' ? id : null,
    })
    setBezig(false)
    if (!r.ok) { setFout(r.error); return }
    onWijzig()
  }

  const { voor, na } = splitsFotos(punt.fotos)
  const mist = bewijsOntbreekt(punt.status, punt.fotos)

  // Alleen overgangen die de server ook accepteert; triage-statussen horen hier niet tussen.
  const mogelijk = (PUNT_TRANSITIES[punt.status] ?? []).filter(s => !TRIAGE_STATUSSEN.includes(s))

  async function wijzigStatus(status: OpleverPuntStatus) {
    let reden: string | null = null
    if (status === 'geweigerd') {
      const antwoord = await vraagTekst({
        titel: 'Opleverpunt afwijzen',
        label: 'Reden van afwijzing (optioneel)',
        meerregelig: true,
        bevestigLabel: 'Afwijzen',
      })
      if (antwoord === null) return
      reden = antwoord.trim() || null
    }
    setBezig(true); setFout(null)
    const r = await setPuntStatus(punt.id, status, { reden })
    setBezig(false)
    if (!r.ok) { setFout(r.error); return }
    onWijzig()
  }

  async function uploadFotos(files: FileList | null, soort: OpleverFotoSoort) {
    if (!files || files.length === 0) return
    setBezig(true); setFout(null)
    for (const file of Array.from(files)) {
      const fd = new FormData()
      // Verkleinen vóór verzenden: een camerafoto van 4 MB komt anders niet door de
      // body-limiet van server-actions heen.
      fd.append('foto', await verkleinFoto(file))
      fd.append('soort', soort)
      const r = await uploadOpleverFoto(punt.id, fd)
      if (!r.ok) { setFout(r.error); break }
    }
    setBezig(false)
    onWijzig()
  }

  async function verwijderFoto(id: string) {
    setBezig(true)
    const r = await verwijderOpleverFoto(id)
    setBezig(false)
    if (!r.ok) { setFout(r.error); return }
    onWijzig()
  }

  async function plaatsOpmerking() {
    if (!opmerking.trim()) return
    setBezig(true); setFout(null)
    const r = await voegPuntReactieToe(punt.id, { opmerking: opmerking.trim(), soort: 'opmerking' })
    setBezig(false)
    if (!r.ok) { setFout(r.error); return }
    setOpmerking(''); onWijzig()
  }

  return (
    <div style={{ background: 'var(--bg-elev)', border: `1px solid ${RAND}`, borderRadius: 12, overflow: 'hidden' }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', textAlign: 'left', background: 'none', border: 'none',
          font: 'inherit', padding: '12px 14px', cursor: 'pointer',
          borderLeft: `4px solid ${PUNT_KLEUR[punt.status]}`,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: ZACHT, flexShrink: 0 }}>
            {prefix}{String(punt.volgnummer).padStart(2, '0')}
          </span>
          <span style={{
            fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em',
            color: PUNT_KLEUR[punt.status], flexShrink: 0, marginLeft: 'auto',
          }}>
            {opleverPuntStatusLabels[punt.status]}
          </span>
        </div>
        <div style={{ fontSize: 14.5, color: TEKST, lineHeight: 1.4, marginTop: 3 }}>{punt.omschrijving}</div>
        <div style={{ fontSize: 12, color: GRIJS, marginTop: 3 }}>
          {[punt.ruimte, punt.toegewezenNaam ? `→ ${punt.toegewezenNaam}` : null, punt.deadline ? `deadline ${punt.deadline}` : null]
            .filter(Boolean).join(' · ')}
        </div>

        {mist && (
          <div style={{ fontSize: 12, fontWeight: 600, color: AMBER, marginTop: 5 }}>
            Nog geen foto na herstel
          </div>
        )}

        {/* Voor/na naast elkaar — zelfde beeld als in het opleverrapport. */}
        {(punt.fotos.length > 0 || mist) && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
            <FotoKolom kop="Voor" fotos={voor} />
            <FotoKolom kop="Na" fotos={na} />
          </div>
        )}
      </button>

      {open && (
        <div style={{ borderTop: `1px solid ${RAND}`, padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {fout && (
            <div style={{ background: '#fdf1f0', border: '1px solid #f0c8c2', color: '#b42318', borderRadius: 10, padding: '9px 11px', fontSize: 13 }}>
              {fout}
            </div>
          )}

          {mogelijk.length > 0 && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: GRIJS, marginBottom: 6 }}>Status wijzigen</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {mogelijk.map(s => (
                  <button key={s} type="button" disabled={bezig} onClick={() => wijzigStatus(s)}
                    style={{
                      ...secundaireKnop,
                      flex: '1 1 40%', padding: '12px 10px', fontSize: 14,
                      color: s === 'geaccepteerd' ? '#fff' : GRIJS,
                      background: s === 'geaccepteerd' ? GROEN : OPPERVLAK,
                      border: s === 'geaccepteerd' ? 'none' : `1px solid ${RAND}`,
                    }}>
                    {opleverPuntStatusLabels[s]}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: GRIJS, marginBottom: 6 }}>Toewijzen aan</div>
            <select
              style={veld}
              value={huidigeToewijzing}
              disabled={bezig}
              onChange={e => wijzigToewijzing(e.target.value)}
            >
              <option value="">Niet toegewezen</option>
              <optgroup label="Eigen personeel">
                {(toewijsbaar?.medewerkers ?? []).map(m => (
                  <option key={m.id} value={`medewerker:${m.id}`}>{m.naam}</option>
                ))}
              </optgroup>
              <optgroup label="Onderaannemers (besteld in dit dossier)">
                {(toewijsbaar?.relaties ?? []).map(r => (
                  <option key={r.id} value={`relatie:${r.id}`}>{r.naam}{r.onderaannemer ? ' (OA)' : ''}</option>
                ))}
              </optgroup>
            </select>
            {(toewijsbaar?.relaties.length ?? 0) === 0 && (
              <div style={{ fontSize: 11.5, color: ZACHT, marginTop: 5 }}>
                Nog geen bestelde partijen op dit dossier. Zodra er een bestelling naar een
                onderaannemer is gegaan, kun je die hier kiezen.
              </div>
            )}
          </div>

          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: GRIJS, marginBottom: 6 }}>Foto&apos;s</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <FotoRij label="Foto vooraf" disabled={bezig} onKies={f => uploadFotos(f, 'voor')} />
              <FotoRij label="Foto na herstel" disabled={bezig} accent={mist ? AMBER : null}
                onKies={f => uploadFotos(f, 'na')} />
            </div>
          </div>

          {punt.fotos.length > 0 && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: GRIJS, marginBottom: 6 }}>Foto verwijderen</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {punt.fotos.map(f => (
                  <button key={f.id} type="button" disabled={bezig} onClick={() => verwijderFoto(f.id)}
                    style={{
                      position: 'relative', padding: 0, border: `1px solid ${RAND}`, borderRadius: 8,
                      overflow: 'hidden', background: 'none', cursor: 'pointer', lineHeight: 0,
                    }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={f.url} alt={f.soort} style={{ width: 56, height: 56, objectFit: 'cover' }} />
                    <span style={{
                      position: 'absolute', top: 0, right: 0, background: 'rgba(0,0,0,.55)', color: '#fff',
                      fontSize: 11, lineHeight: '16px', width: 16, height: 16, borderBottomLeftRadius: 6,
                    }}>×</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {punt.reacties.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {punt.reacties.map(r => (
                <div key={r.id} style={{ background: VLAK, borderRadius: 9, padding: '8px 10px' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: TEKST }}>
                    {r.auteur_naam ?? (r.auteur_type === 'onderaannemer' ? 'Onderaannemer' : 'Everts')}
                    {r.soort === 'afmelding' && <span style={{ color: AMBER }}> · afmelding</span>}
                  </div>
                  {r.opmerking && <div style={{ fontSize: 13, color: GRIJS, marginTop: 2 }}>{r.opmerking}</div>}
                </div>
              ))}
            </div>
          )}

          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: GRIJS, marginBottom: 6 }}>Opmerking</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input style={{ ...veld, flex: 1 }} value={opmerking} onChange={e => setOpmerking(e.target.value)}
                placeholder="Korte notitie…" />
              <button type="button" disabled={bezig || !opmerking.trim()} onClick={plaatsOpmerking}
                style={{ ...secundaireKnop, fontSize: 14 }}>
                Plaats
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Eén soort bewijs toevoegen: met de camera, of uit de fotobibliotheek van de telefoon.
 *
 * Twee aparte invoervelden en niet één: `capture="environment"` dwingt de camera af, en zónder dat
 * kenmerk opent de bibliotheek (op iOS met de camera als keuze in het menu). Meestal fotografeer je
 * ter plekke — die knop blijft dus groot en voorop — maar soms staat het beeld er al, gemaakt vóór
 * de ronde of door een collega gestuurd. Dat is de tweede knop.
 */
function FotoRij({ label, disabled, accent, onKies }: {
  label: string
  disabled: boolean
  accent?: string | null
  onKies: (files: FileList | null) => void
}) {
  const cameraRef = useRef<HTMLInputElement>(null)
  const bibliotheekRef = useRef<HTMLInputElement>(null)

  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" multiple style={{ display: 'none' }}
        onChange={e => { onKies(e.target.files); e.target.value = '' }} />
      <input ref={bibliotheekRef} type="file" accept="image/*" multiple style={{ display: 'none' }}
        onChange={e => { onKies(e.target.files); e.target.value = '' }} />
      <button type="button" disabled={disabled} onClick={() => cameraRef.current?.click()}
        style={{
          ...secundaireKnop, flex: 1, fontSize: 14,
          borderColor: accent ?? RAND, color: accent ?? GRIJS,
        }}>
        📷 {label}
      </button>
      <button type="button" disabled={disabled} onClick={() => bibliotheekRef.current?.click()}
        aria-label={`${label} uit bibliotheek kiezen`}
        style={{ ...secundaireKnop, width: 56, fontSize: 16, padding: '13px 0', flexShrink: 0 }}>
        🖼
      </button>
    </div>
  )
}

/** Eén kolom van het voor/na-bewijs; een lege kant blijft zichtbaar als gestippeld vlak. */
function FotoKolom({ kop, fotos }: { kop: string; fotos: OpleverFoto[] }) {
  return (
    <div>
      <div style={{ fontSize: 9.5, fontWeight: 700, color: ZACHT, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 3 }}>
        {kop}
      </div>
      {fotos.length === 0 ? (
        <div style={{
          height: 56, borderRadius: 8, border: `1px dashed ${RAND}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, color: ZACHT,
        }}>
          geen foto
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {fotos.map(f => (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img key={f.id} src={f.url} alt={kop}
              style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 8, border: `1px solid ${RAND}` }} />
          ))}
        </div>
      )}
    </div>
  )
}
