'use client'

import { useState, useRef, useTransition, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import HandtekeningPad from './HandtekeningPad'
import { startWerkbon, uploadWerkbonFoto, sluitWerkbon } from '@/app/(platform)/planning/werkbon/actions'
import { Button } from '@/components/ui/button'
import { Card, CardBody } from '@/components/ui/card'

type Stap = 'start' | 'bezig' | 'afronden'

type Props = {
  planning_item_id:  string
  activiteitTitel:   string
  dossierTitel:      string
  klantNaam:         string
  locatieAdres:      string | null
  omschrijving:      string | null
  medewerkersOokGepland: string[]
  bestaandeWerkbonId:    string | null
  readsAlBezig:          boolean
}

export default function WerkbonFlow({
  planning_item_id, activiteitTitel, dossierTitel, klantNaam, locatieAdres,
  omschrijving, medewerkersOokGepland, bestaandeWerkbonId, readsAlBezig,
}: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()

  const [stap,       setStap]       = useState<Stap>(readsAlBezig ? 'bezig' : 'start')
  const [werkbonId,  setWerkbonId]  = useState<string | null>(bestaandeWerkbonId)
  const [startTijd,  setStartTijd]  = useState<Date | null>(readsAlBezig ? new Date() : null)
  const [verstrekenSec, setVerstrekenSec] = useState(0)
  const [opmerking,  setOpmerking]  = useState('')
  const [fotos,      setFotos]      = useState<string[]>([])
  const [handtek,    setHandtek]    = useState<string | null>(null)
  const [uploading,  setUploading]  = useState(false)
  const [pending,    setPending]    = useState(false)
  const fotoInputRef = useRef<HTMLInputElement>(null)

  // Timer
  useEffect(() => {
    if (stap !== 'bezig' || !startTijd) return
    const id = setInterval(() => setVerstrekenSec(Math.floor((Date.now() - startTijd.getTime()) / 1000)), 1000)
    return () => clearInterval(id)
  }, [stap, startTijd])

  async function handleStart() {
    setPending(true)
    const result = await startWerkbon(planning_item_id)
    setPending(false)
    if (!result.ok) { toast.error(result.error); return }
    setWerkbonId(result.werkbon_id)
    setStartTijd(new Date())
    setStap('bezig')
  }

  async function handleFotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!werkbonId || !e.target.files?.length) return
    setUploading(true)
    for (const file of Array.from(e.target.files)) {
      const fd = new FormData()
      fd.append('foto', file)
      const result = await uploadWerkbonFoto(werkbonId, fd)
      if (result.ok) setFotos(prev => [...prev, result.url])
      else toast.error(result.error)
    }
    setUploading(false)
  }

  async function handleAfronden() {
    if (!werkbonId) return
    setPending(true)
    const gewerkte_uren = verstrekenSec > 0 ? Math.round(verstrekenSec / 360) / 10 : 0
    const result = await sluitWerkbon(werkbonId, { opmerking, handtekening_b64: handtek, gewerkte_uren })
    setPending(false)
    if (!result.ok) { toast.error(result.error); return }
    toast.success('Werkbon afgesloten')
    startTransition(() => router.push('/planning/mijn-werkbonnen'))
  }

  function formatTijd(sec: number) {
    const h = Math.floor(sec / 3600)
    const m = Math.floor((sec % 3600) / 60)
    const s = sec % 60
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }

  // ── Start scherm ──────────────────────────────────────────────────────────
  if (stap === 'start') {
    return (
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '24px 16px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        <Card>
          <CardBody>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--fg-muted)', textTransform: 'uppercase', marginBottom: 4 }}>
              Klant
            </div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, color: 'var(--fg)' }}>
              {klantNaam}
            </div>
            {locatieAdres && (
              <div style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--fg-muted)', marginTop: 4 }}>
                📍 {locatieAdres}
              </div>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--fg-muted)', textTransform: 'uppercase', marginBottom: 4 }}>
              Activiteit
            </div>
            <div style={{ fontFamily: 'var(--font-ui)', fontSize: 15, fontWeight: 600, color: 'var(--fg)' }}>
              {activiteitTitel}
            </div>
            <div style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--fg-muted)', marginTop: 2 }}>
              {dossierTitel}
            </div>
            {omschrijving && (
              <div style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--fg)', marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                {omschrijving}
              </div>
            )}
          </CardBody>
        </Card>

        {medewerkersOokGepland.length > 0 && (
          <Card>
            <CardBody>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--fg-muted)', textTransform: 'uppercase', marginBottom: 6 }}>
                Ook aanwezig
              </div>
              {medewerkersOokGepland.map(n => (
                <div key={n} style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--fg)' }}>{n}</div>
              ))}
            </CardBody>
          </Card>
        )}

        <Button
          variant="primary"
          size="lg"
          className="w-full"
          style={{ minHeight: 52, fontSize: 16, fontWeight: 700 }}
          onClick={handleStart}
          loading={pending}
        >
          {pending ? 'Even geduld…' : 'Start werkbon'}
        </Button>
      </div>
    )
  }

  // ── Bezig scherm ──────────────────────────────────────────────────────────
  if (stap === 'bezig') {
    return (
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '24px 16px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        <Card>
          <CardBody style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: 'var(--fg-muted)', marginBottom: 4 }}>
              Looptijd
            </div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 36, fontWeight: 700, color: 'var(--accent)', letterSpacing: '-0.02em' }}>
              {formatTijd(verstrekenSec)}
            </div>
            <div style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--fg-muted)', marginTop: 4 }}>
              {activiteitTitel}
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--fg-muted)', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>
              Opmerking
            </label>
            <textarea
              className="eva-input"
              rows={3}
              placeholder="Bevindingen, bijzonderheden…"
              value={opmerking}
              onChange={e => setOpmerking(e.target.value)}
              style={{ resize: 'vertical', fontFamily: 'var(--font-ui)', fontSize: 13 }}
            />
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--fg-muted)', textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>
              Foto&apos;s
            </label>
            <input
              ref={fotoInputRef}
              type="file"
              accept="image/*"
              multiple
              style={{ display: 'none' }}
              onChange={handleFotoUpload}
            />
            <Button
              type="button"
              variant="ghost"
              size="lg"
              className="w-full"
              style={{ minHeight: 44, fontSize: 14 }}
              onClick={() => fotoInputRef.current?.click()}
              loading={uploading}
            >
              {uploading ? 'Uploaden…' : '📷 Foto toevoegen'}
            </Button>
            {fotos.length > 0 && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                {fotos.map((url, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={i} src={url} alt="" style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--border)' }} />
                ))}
              </div>
            )}
          </CardBody>
        </Card>

        <Button
          variant="primary"
          size="lg"
          className="w-full"
          style={{ minHeight: 52, fontSize: 16, fontWeight: 700 }}
          onClick={() => setStap('afronden')}
        >
          Afronden →
        </Button>
      </div>
    )
  }

  // ── Afronden scherm ───────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: '24px 16px', display: 'flex', flexDirection: 'column', gap: 20 }}>
      <Card>
        <CardBody>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontFamily: 'var(--font-ui)', fontSize: 14, fontWeight: 600, color: 'var(--fg)' }}>Gewerkte uren</span>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, color: 'var(--accent)' }}>
              {(Math.round(verstrekenSec / 360) / 10).toFixed(1)}u
            </span>
          </div>
          <div style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--fg-muted)' }}>
            Looptijd timer: {formatTijd(verstrekenSec)}
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--fg-muted)', textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>
            Handtekening opdrachtgever
          </label>
          <HandtekeningPad onChange={setHandtek} />
        </CardBody>
      </Card>

      <div style={{ display: 'flex', gap: 10 }}>
        <Button
          variant="ghost"
          size="lg"
          style={{ minHeight: 48, flex: 1, fontSize: 14 }}
          onClick={() => setStap('bezig')}
        >
          ← Terug
        </Button>
        <Button
          variant="primary"
          size="lg"
          style={{ minHeight: 48, flex: 2, fontSize: 15, fontWeight: 700 }}
          onClick={handleAfronden}
          loading={pending}
        >
          {pending ? 'Afronden…' : 'Werkbon afsluiten ✓'}
        </Button>
      </div>
    </div>
  )
}
