'use client'
import React from 'react'
import { Button, Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '@/components/ui'
import type { DossierRij } from './types'
import { maakDossier, zoekRelaties } from '@/lib/dossiers/actions'
import { maakProjectVanAanvraag } from '@/app/(platform)/everts-calc/actions/projecten'
import { slaAanvraagProjectIdOp } from '@/components/everts-calc/calculatie/AanvraagCalculatieTab'

const DEFAULT_CATEGORIEEN = ['Schilderwerk', 'Houtrotherstel', 'Stukadoorwerk', 'Gevelrenovatie', 'Binnenwerk', 'Overig']

type Bestand = { naam: string; grootte: number }

type Props = {
  open: boolean
  onClose: () => void
  onAanmaken: (dossier: DossierRij) => void
  categorieen?: string[]
}

export function NieuweAanvraagModal({ open, onClose, onAanmaken, categorieen }: Props) {
  const [klantId,        setKlantId]        = React.useState<string | null>(null)
  const [klantNaam,      setKlantNaam]      = React.useState('')
  const [zoekQuery,      setZoekQuery]      = React.useState('')
  const [zoekResultaten, setZoekResultaten] = React.useState<{ id: string; naam: string; types: string[] }[]>([])
  const [zoekOpen,       setZoekOpen]       = React.useState(false)
  const [zoekBezig,      setZoekBezig]      = React.useState(false)
  const [titel,          setTitel]          = React.useState('')
  const [contactpersoon, setContactpersoon] = React.useState('')
  const [telefoon,       setTelefoon]       = React.useState('')
  const [email,          setEmail]          = React.useState('')
  const [straat,         setStraat]         = React.useState('')
  const [postcode,       setPostcode]       = React.useState('')
  const [stad,           setStad]           = React.useState('')
  const [categorie,      setCategorie]      = React.useState('')
  const [referentie,     setReferentie]     = React.useState('')
  const [opmerkingen,    setOpmerkingen]    = React.useState('')
  const [bestanden,      setBestanden]      = React.useState<Bestand[]>([])
  const [isLaden,        setIsLaden]        = React.useState(false)
  const zoekTimerRef                        = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const zoekContainerRef                    = React.useRef<HTMLDivElement>(null)
  const fileInputRef                        = React.useRef<HTMLInputElement>(null)

  function reset() {
    setKlantId(null); setKlantNaam(''); setZoekQuery(''); setZoekResultaten([]); setZoekOpen(false)
    setTitel(''); setContactpersoon(''); setTelefoon(''); setEmail('')
    setStraat(''); setPostcode(''); setStad('')
    setCategorie(''); setReferentie(''); setOpmerkingen(''); setBestanden([])
  }

  function handleClose() { reset(); onClose() }

  // Sluit dropdown bij klik buiten
  React.useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (zoekContainerRef.current && !zoekContainerRef.current.contains(e.target as Node)) {
        setZoekOpen(false)
      }
    }
    document.addEventListener('mousedown', onOutside)
    return () => document.removeEventListener('mousedown', onOutside)
  }, [])

  function handleZoekInput(value: string) {
    setZoekQuery(value)
    setKlantId(null)   // selectie vervalt bij typen
    setKlantNaam(value)
    if (zoekTimerRef.current) clearTimeout(zoekTimerRef.current)
    if (!value.trim()) { setZoekResultaten([]); setZoekOpen(false); return }
    setZoekBezig(true)
    zoekTimerRef.current = setTimeout(async () => {
      try {
        const resultaten = await zoekRelaties(value)
        setZoekResultaten(resultaten)
        setZoekOpen(true)
      } finally {
        setZoekBezig(false)
      }
    }, 280)
  }

  function selecteerRelatie(rel: { id: string; naam: string; types: string[] }) {
    setKlantId(rel.id)
    setKlantNaam(rel.naam)
    setZoekQuery(rel.naam)
    setZoekOpen(false)
    setZoekResultaten([])
  }

  function handleFiles(files: FileList | null) {
    if (!files) return
    setBestanden(p => [...p, ...Array.from(files).map(f => ({ naam: f.name, grootte: f.size }))])
  }

  async function handleAanmaken() {
    if (!klantId || !titel.trim()) return
    setIsLaden(true)
    try {
      const result = await maakDossier({ titel: titel.trim(), klant_id: klantId })
      if (!result.ok) throw new Error(result.error)

      const dossier = result.data
      try {
        const { id: projectId } = await maakProjectVanAanvraag(titel.trim(), klantNaam)
        slaAanvraagProjectIdOp(dossier.id, projectId)
      } catch {
        // Koppeling kan later via de calculatie-tab worden aangemaakt
      }

      onAanmaken({ ...dossier, klant_naam: klantNaam, projectleider_naam: null })
      reset()
      onClose()
    } finally {
      setIsLaden(false)
    }
  }

  const geldig = Boolean(klantId && titel.trim())
  const catOpties = categorieen && categorieen.length > 0 ? categorieen : DEFAULT_CATEGORIEEN

  return (
    <Dialog open={open} onOpenChange={isOpen => { if (!isOpen) handleClose() }}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Nieuwe aanvraag</DialogTitle>
        </DialogHeader>

        <DialogBody>
          <Groep titel="Basisgegevens">
            <Rij>
              {/* Relatie combobox */}
              <div ref={zoekContainerRef} style={{ position: 'relative' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  Klant *
                </div>
                <input
                  type="text"
                  value={zoekQuery}
                  onChange={e => handleZoekInput(e.target.value)}
                  onFocus={() => zoekResultaten.length > 0 && setZoekOpen(true)}
                  placeholder="Zoek op naam..."
                  style={{
                    width: '100%', padding: '8px 10px', marginTop: 4, borderRadius: 8, boxSizing: 'border-box',
                    background: 'var(--bg)', border: klantId ? '1.5px solid var(--accent)' : '1px solid var(--border)',
                    color: 'var(--fg)', fontFamily: 'var(--font-ui)', fontSize: 13, outline: 'none',
                  }}
                />
                {zoekBezig && (
                  <div style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-25%)', fontSize: 11, color: 'var(--fg-muted)' }}>
                    …
                  </div>
                )}
                {zoekOpen && zoekResultaten.length > 0 && (
                  <div style={{
                    position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
                    background: 'var(--bg-elev)', border: '1px solid var(--border)',
                    borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.16)',
                    overflow: 'hidden', marginTop: 2,
                  }}>
                    {zoekResultaten.map(rel => (
                      <button
                        key={rel.id}
                        onMouseDown={e => { e.preventDefault(); selecteerRelatie(rel) }}
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          width: '100%', padding: '9px 12px', border: 'none',
                          background: 'transparent', cursor: 'pointer', textAlign: 'left',
                          color: 'var(--fg)', fontSize: 13,
                        }}
                      >
                        <span style={{ fontWeight: 500 }}>{rel.naam}</span>
                        <span style={{
                          fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em',
                          color: 'var(--fg-muted)', padding: '2px 6px',
                          background: 'var(--bg-active)', borderRadius: 4,
                        }}>{rel.types?.[0] ?? ''}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <Input label="Omschrijving *" waarde={titel} onChange={setTitel} placeholder="Korte omschrijving" />
            </Rij>
            <Rij>
              <Input
                label="Categorie" waarde={categorie} onChange={setCategorie} type="select"
                opties={['', ...catOpties]}
              />
              <Input label="Referentie" waarde={referentie} onChange={setReferentie} placeholder="Klantreferentie" />
            </Rij>
          </Groep>

          <Groep titel="Contactgegevens">
            <Rij>
              <Input label="Contactpersoon" waarde={contactpersoon} onChange={setContactpersoon} placeholder="Volledige naam" />
              <Input label="Telefoon" waarde={telefoon} onChange={setTelefoon} placeholder="+31 6 12345678" type="tel" />
            </Rij>
            <Rij>
              <Input label="E-mailadres" waarde={email} onChange={setEmail} placeholder="naam@bedrijf.nl" type="email" vol />
            </Rij>
          </Groep>

          <Groep titel="Uitvoeringsadres">
            <Rij>
              <Input label="Straat + huisnummer" waarde={straat} onChange={setStraat} placeholder="Straatnaam 1" />
              <Input label="Postcode" waarde={postcode} onChange={setPostcode} placeholder="1234 AB" />
            </Rij>
            <Rij>
              <Input label="Stad" waarde={stad} onChange={setStad} placeholder="Plaatsnaam" vol />
            </Rij>
          </Groep>

          <Groep titel="Opmerkingen">
            <textarea
              value={opmerkingen}
              onChange={e => setOpmerkingen(e.target.value)}
              placeholder="Aanvullende informatie, wensen, bijzonderheden..."
              rows={3}
              style={{
                width: '100%', padding: '8px 11px', borderRadius: 8, resize: 'vertical',
                background: 'var(--bg)', border: '1px solid var(--border)',
                color: 'var(--fg)', fontFamily: 'var(--font-ui)', fontSize: 13, outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </Groep>

          <Groep titel="Meegestuurde bestanden" laatste>
            <div
              onDragOver={e => { e.preventDefault(); (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--accent)' }}
              onDragLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border)' }}
              onDrop={e => {
                e.preventDefault()
                ;(e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border)'
                handleFiles(e.dataTransfer.files)
              }}
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: '2px dashed var(--border)', borderRadius: 10, padding: '18px 16px',
                textAlign: 'center', cursor: 'pointer', transition: 'border-color 0.15s',
                background: 'var(--bg)',
              }}
            >
              <div style={{ fontSize: 20, opacity: 0.4, marginBottom: 5 }}>📎</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)', marginBottom: 2 }}>
                Klik of sleep bestanden hierheen
              </div>
              <div style={{ fontSize: 11, color: 'var(--fg-muted)' }}>
                PDF, Word, afbeeldingen — meerdere bestanden tegelijk
              </div>
              <input ref={fileInputRef} type="file" multiple hidden onChange={e => handleFiles(e.target.files)} />
            </div>

            {bestanden.length > 0 && (
              <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {bestanden.map((b, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '7px 12px', background: 'var(--bg)',
                    border: '1px solid var(--border)', borderRadius: 8,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="var(--fg-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M13 2H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7l-3-5z"/>
                        <path d="M13 2v5h5"/>
                      </svg>
                      <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--fg)' }}>{b.naam}</span>
                      <span style={{ fontSize: 11, color: 'var(--fg-muted)' }}>{fmtSize(b.grootte)}</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setBestanden(p => p.filter((_, j) => j !== i))}
                    >×</Button>
                  </div>
                ))}
              </div>
            )}
          </Groep>
        </DialogBody>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Annuleer
          </Button>
          <Button
            variant="primary"
            onClick={handleAanmaken}
            disabled={!geldig}
            loading={isLaden}
          >
            {isLaden ? 'Bezig…' : 'Aanvraag aanmaken'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ─── helpers ────────────────────────────────────────────────────── */
function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function Groep({ titel, laatste, children }: { titel: string; laatste?: boolean; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: laatste ? 0 : 22 }}>
      <div style={{
        fontSize: 10, fontWeight: 700, color: 'var(--fg-muted)',
        textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10,
      }}>
        {titel}
      </div>
      {children}
    </div>
  )
}

function Rij({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 16px', marginBottom: 10 }}>
      {children}
    </div>
  )
}

function Input({
  label, waarde, onChange, placeholder, type = 'text', opties, vol,
}: {
  label: string
  waarde: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
  opties?: string[]
  vol?: boolean
}) {
  const stijl: React.CSSProperties = {
    width: '100%', padding: '8px 10px', marginTop: 4, borderRadius: 8, boxSizing: 'border-box',
    background: 'var(--bg)', border: '1px solid var(--border)',
    color: 'var(--fg)', fontFamily: 'var(--font-ui)', fontSize: 13, outline: 'none',
  }
  return (
    <div style={{ gridColumn: vol ? '1 / -1' : undefined }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        {label}
      </div>
      {type === 'select' && opties ? (
        <select value={waarde} onChange={e => onChange(e.target.value)} style={stijl}>
          {opties.map(o => <option key={o} value={o}>{o || '— Selecteer —'}</option>)}
        </select>
      ) : (
        <input type={type} value={waarde} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={stijl} />
      )}
    </div>
  )
}
