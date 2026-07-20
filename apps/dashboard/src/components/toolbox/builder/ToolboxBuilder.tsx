'use client'

import React, { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { createClient } from '@everts/database/client'
import { Button } from '@/components/ui'
import SlideRenderer from '@/components/toolbox/SlideRenderer'
import { parseVideoUrl } from '@/lib/toolbox/schema'
import {
  updateConceptSchema,
  publiceerToolbox,
} from '@/app/(platform)/toolbox/actions'
import type {
  ToolboxSchema,
  ToolboxSlide,
  ContentSlide,
  VraagSlide,
  ContentBlok,
  ContentBlokType,
  ToolboxStatus,
} from '@/components/toolbox/types'

function nieuwId(prefix: string): string {
  const rnd = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10)
  return `${prefix}_${rnd}`
}

type ToolboxData = {
  id: string
  titel: string
  omschrijving: string | null
  status: ToolboxStatus
  huidige_versie: number
  concept_schema: ToolboxSchema
}

export default function ToolboxBuilder({ toolbox }: { toolbox: ToolboxData }) {
  const router = useRouter()
  const [titel, setTitel] = useState(toolbox.titel)
  const [omschrijving, setOmschrijving] = useState(toolbox.omschrijving ?? '')
  const [slides, setSlides] = useState<ToolboxSlide[]>(toolbox.concept_schema.slides ?? [])
  const [actiefIdx, setActiefIdx] = useState(0)
  const [preview, setPreview] = useState(false)
  const [vuil, setVuil] = useState(false)
  const [opslaan, setOpslaan] = useState(false)
  const [publiceren, startPubliceren] = useTransition()

  const slide = slides[actiefIdx] as ToolboxSlide | undefined

  // ── Autosave (debounced) ──────────────────────────────────────────────
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const bewaarNu = useCallback(async () => {
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null }
    setOpslaan(true)
    const schema: ToolboxSchema = { version: 1, slides }
    const res = await updateConceptSchema(toolbox.id, schema, { titel, omschrijving })
    setOpslaan(false)
    if (res.ok) setVuil(false)
    else toast.error(res.error)
  }, [slides, titel, omschrijving, toolbox.id])

  useEffect(() => {
    if (!vuil) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => { void bewaarNu() }, 1200)
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current) }
  }, [vuil, bewaarNu])

  function muteer(next: ToolboxSlide[]) {
    setSlides(next)
    setVuil(true)
  }

  function updateSlide(idx: number, patch: Partial<ToolboxSlide>) {
    muteer(slides.map((s, i) => (i === idx ? ({ ...s, ...patch } as ToolboxSlide) : s)))
  }

  // ── Slide-beheer ──────────────────────────────────────────────────────
  function voegContentToe() {
    const s: ContentSlide = { id: nieuwId('s'), type: 'content', titel: '', blokken: [] }
    muteer([...slides, s]); setActiefIdx(slides.length)
  }
  function voegVraagToe() {
    const s: VraagSlide = {
      id: nieuwId('v'), type: 'vraag', vraag: '',
      opties: [
        { id: nieuwId('o'), tekst: '', correct: true },
        { id: nieuwId('o'), tekst: '' },
      ],
      uitleg: '',
    }
    muteer([...slides, s]); setActiefIdx(slides.length)
  }
  function verwijderSlide(idx: number) {
    const next = slides.filter((_, i) => i !== idx)
    muteer(next)
    setActiefIdx(Math.max(0, Math.min(idx, next.length - 1)))
  }
  function verplaatsSlide(idx: number, richting: -1 | 1) {
    const j = idx + richting
    if (j < 0 || j >= slides.length) return
    const next = slides.slice()
    ;[next[idx], next[j]] = [next[j], next[idx]]
    muteer(next); setActiefIdx(j)
  }

  async function publiceer() {
    await bewaarNu()
    startPubliceren(async () => {
      const res = await publiceerToolbox(toolbox.id)
      if (!res.ok) { toast.error(res.error); return }
      toast.success(`Gepubliceerd als versie ${res.data.versienummer}`)
      router.push(`/toolbox/${toolbox.id}`)
    })
  }

  const aantalVragen = slides.filter((s) => s.type === 'vraag').length
  const aantalContent = slides.filter((s) => s.type === 'content').length

  return (
    <div className="eva-page-full" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100dvh - 120px)' }}>
      {/* Kop */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <Link href="/toolbox" style={{ fontSize: 13, color: 'var(--fg-muted)', textDecoration: 'none' }}>← Toolbox</Link>
        <input
          value={titel}
          onChange={(e) => { setTitel(e.target.value); setVuil(true) }}
          placeholder="Titel van de toolbox"
          style={{ flex: 1, minWidth: 220, padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 16, fontWeight: 600 }}
        />
        <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>
          {opslaan ? 'Opslaan…' : vuil ? 'Niet opgeslagen' : 'Opgeslagen'}
        </span>
        <Button variant="ghost" onClick={() => setPreview((p) => !p)}>{preview ? 'Bewerken' : 'Voorbeeld'}</Button>
        <Button variant="primary" onClick={publiceer} disabled={publiceren}>
          {publiceren ? 'Bezig…' : toolbox.huidige_versie > 0 ? 'Opnieuw publiceren' : 'Publiceren'}
        </Button>
      </div>

      {preview ? (
        <PreviewPaneel slides={slides} />
      ) : (
        <div style={{ display: 'flex', gap: 16, flex: 1, minHeight: 0 }}>
          {/* Slide-lijst */}
          <div style={{ width: 240, flexShrink: 0, display: 'flex', flexDirection: 'column', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ padding: 10, borderBottom: '1px solid var(--border)', display: 'flex', gap: 6 }}>
              <button onClick={voegContentToe} style={miniBtn}>+ Slide</button>
              <button onClick={voegVraagToe} style={miniBtn}>+ Vraag</button>
            </div>
            <div style={{ overflowY: 'auto', flex: 1, padding: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {slides.length === 0 && (
                <div style={{ fontSize: 12, color: 'var(--fg-muted)', padding: 12, textAlign: 'center' }}>
                  Voeg een slide of vraag toe.
                </div>
              )}
              {slides.map((s, i) => (
                <div
                  key={s.id}
                  onClick={() => setActiefIdx(i)}
                  style={{
                    padding: '8px 10px', borderRadius: 8, cursor: 'pointer',
                    background: i === actiefIdx ? 'var(--brand-50, #ecfdf3)' : 'var(--bg-subtle)',
                    border: i === actiefIdx ? '1px solid var(--brand-300, #6ce9a6)' : '1px solid transparent',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: s.type === 'vraag' ? '#b85a00' : '#067647' }}>
                      {s.type === 'vraag' ? `Vraag` : `Slide`} {i + 1}
                    </span>
                    <div style={{ display: 'flex', gap: 2 }}>
                      <button onClick={(e) => { e.stopPropagation(); verplaatsSlide(i, -1) }} style={pijlBtn} aria-label="Omhoog">↑</button>
                      <button onClick={(e) => { e.stopPropagation(); verplaatsSlide(i, 1) }} style={pijlBtn} aria-label="Omlaag">↓</button>
                      <button onClick={(e) => { e.stopPropagation(); verwijderSlide(i) }} style={{ ...pijlBtn, color: '#b42318' }} aria-label="Verwijderen">×</button>
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--fg)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {s.type === 'vraag' ? (s.vraag || 'Nieuwe vraag') : (s.titel || 'Nieuwe slide')}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ padding: 10, borderTop: '1px solid var(--border)', fontSize: 11, color: 'var(--fg-muted)' }}>
              {aantalContent} slides · {aantalVragen} vragen
            </div>
          </div>

          {/* Slide-editor */}
          <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
            {!slide ? (
              <div style={{ color: 'var(--fg-muted)', fontSize: 14, textAlign: 'center', padding: 40 }}>
                Selecteer of maak links een slide.
              </div>
            ) : slide.type === 'content' ? (
              <ContentSlideEditor
                slide={slide}
                toolboxId={toolbox.id}
                onChange={(patch) => updateSlide(actiefIdx, patch)}
              />
            ) : (
              <VraagSlideEditor slide={slide} onChange={(patch) => updateSlide(actiefIdx, patch)} />
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Content-slide editor ─────────────────────────────────────────────────
function ContentSlideEditor({
  slide, toolboxId, onChange,
}: {
  slide: ContentSlide
  toolboxId: string
  onChange: (patch: Partial<ContentSlide>) => void
}) {
  function updateBlok(id: string, patch: Partial<ContentBlok>) {
    onChange({ blokken: slide.blokken.map((b) => (b.id === id ? ({ ...b, ...patch } as ContentBlok) : b)) })
  }
  function verwijderBlok(id: string) {
    onChange({ blokken: slide.blokken.filter((b) => b.id !== id) })
  }
  function voegBlokToe(type: ContentBlokType) {
    let blok: ContentBlok
    if (type === 'kop') blok = { id: nieuwId('b'), type: 'kop', tekst: '' }
    else if (type === 'tekst') blok = { id: nieuwId('b'), type: 'tekst', tekst: '' }
    else if (type === 'afbeelding') blok = { id: nieuwId('b'), type: 'afbeelding', url: '' }
    else blok = { id: nieuwId('b'), type: 'video', provider: 'youtube', videoId: '' }
    onChange({ blokken: [...slide.blokken, blok] })
  }
  function verplaatsBlok(idx: number, richting: -1 | 1) {
    const j = idx + richting
    if (j < 0 || j >= slide.blokken.length) return
    const next = slide.blokken.slice()
    ;[next[idx], next[j]] = [next[j], next[idx]]
    onChange({ blokken: next })
  }

  return (
    <div>
      <label style={labelStijl}>Sliderubriek (optioneel)</label>
      <input
        value={slide.titel ?? ''}
        onChange={(e) => onChange({ titel: e.target.value })}
        placeholder="Bijv. Werken op hoogte"
        style={inputStijl}
      />

      <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {slide.blokken.map((blok, i) => (
          <div key={blok.id} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12, background: 'var(--bg-subtle)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--fg-muted)' }}>
                {BLOK_LABEL[blok.type]}
              </span>
              <div style={{ display: 'flex', gap: 2 }}>
                <button onClick={() => verplaatsBlok(i, -1)} style={pijlBtn} aria-label="Omhoog">↑</button>
                <button onClick={() => verplaatsBlok(i, 1)} style={pijlBtn} aria-label="Omlaag">↓</button>
                <button onClick={() => verwijderBlok(blok.id)} style={{ ...pijlBtn, color: '#b42318' }} aria-label="Verwijderen">×</button>
              </div>
            </div>
            <BlokEditor blok={blok} toolboxId={toolboxId} onChange={(patch) => updateBlok(blok.id, patch)} />
          </div>
        ))}
      </div>

      <div style={{ marginTop: 14, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button onClick={() => voegBlokToe('kop')} style={miniBtn}>+ Kop</button>
        <button onClick={() => voegBlokToe('tekst')} style={miniBtn}>+ Tekst</button>
        <button onClick={() => voegBlokToe('afbeelding')} style={miniBtn}>+ Afbeelding</button>
        <button onClick={() => voegBlokToe('video')} style={miniBtn}>+ Video</button>
      </div>
    </div>
  )
}

const BLOK_LABEL: Record<ContentBlokType, string> = {
  kop: 'Kop', tekst: 'Tekst', afbeelding: 'Afbeelding', video: 'Video',
}

function BlokEditor({
  blok, toolboxId, onChange,
}: {
  blok: ContentBlok
  toolboxId: string
  onChange: (patch: Partial<ContentBlok>) => void
}) {
  const [uploaden, setUploaden] = useState(false)

  async function uploadAfbeelding(file: File) {
    if (file.size > 10 * 1024 * 1024) { toast.error('Afbeelding is te groot (max 10 MB).'); return }
    setUploaden(true)
    try {
      const supabase = createClient()
      const ext = file.name.split('.').pop() || 'jpg'
      const pad = `${toolboxId}/${nieuwId('img')}.${ext}`
      const { error } = await supabase.storage.from('toolbox-afbeeldingen').upload(pad, file, { upsert: true })
      if (error) { toast.error(error.message); return }
      const { data } = supabase.storage.from('toolbox-afbeeldingen').getPublicUrl(pad)
      onChange({ url: data.publicUrl } as Partial<ContentBlok>)
    } finally {
      setUploaden(false)
    }
  }

  if (blok.type === 'kop') {
    return (
      <div style={{ display: 'flex', gap: 8 }}>
        <input value={blok.tekst} onChange={(e) => onChange({ tekst: e.target.value })} placeholder="Koptekst" style={inputStijl} />
        <select
          value={blok.niveau ?? 'groot'}
          onChange={(e) => onChange({ niveau: e.target.value as 'groot' | 'klein' } as Partial<ContentBlok>)}
          style={{ ...inputStijl, width: 110 }}
        >
          <option value="groot">Groot</option>
          <option value="klein">Klein</option>
        </select>
      </div>
    )
  }
  if (blok.type === 'tekst') {
    return (
      <textarea value={blok.tekst} onChange={(e) => onChange({ tekst: e.target.value })} rows={4} placeholder="Tekst…" style={{ ...inputStijl, resize: 'vertical' }} />
    )
  }
  if (blok.type === 'afbeelding') {
    return (
      <div>
        {blok.url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={blok.url} alt="" style={{ maxWidth: '100%', maxHeight: 220, borderRadius: 8, display: 'block', marginBottom: 8 }} />
        ) : (
          <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginBottom: 8 }}>Nog geen afbeelding.</div>
        )}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ ...miniBtn, cursor: uploaden ? 'default' : 'pointer' }}>
            {uploaden ? 'Uploaden…' : blok.url ? 'Vervangen' : 'Uploaden'}
            <input type="file" accept="image/*" hidden disabled={uploaden}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadAfbeelding(f) }} />
          </label>
        </div>
        <input
          value={blok.bijschrift ?? ''}
          onChange={(e) => onChange({ bijschrift: e.target.value } as Partial<ContentBlok>)}
          placeholder="Bijschrift (optioneel)"
          style={{ ...inputStijl, marginTop: 8 }}
        />
      </div>
    )
  }
  // video
  return (
    <div>
      <input
        defaultValue={blok.videoId ? (blok.provider === 'youtube' ? `https://youtu.be/${blok.videoId}` : `https://vimeo.com/${blok.videoId}`) : ''}
        onBlur={(e) => {
          const parsed = parseVideoUrl(e.target.value)
          if (!parsed) { if (e.target.value.trim()) toast.error('Geen geldige YouTube- of Vimeo-link.'); return }
          onChange({ provider: parsed.provider, videoId: parsed.videoId } as Partial<ContentBlok>)
        }}
        placeholder="Plak een YouTube- of Vimeo-link"
        style={inputStijl}
      />
      {blok.videoId && (
        <div style={{ fontSize: 12, color: '#067647', marginTop: 6 }}>
          ✓ {blok.provider === 'youtube' ? 'YouTube' : 'Vimeo'}-video gekoppeld
        </div>
      )}
    </div>
  )
}

// ── Vraag-slide editor ───────────────────────────────────────────────────
function VraagSlideEditor({
  slide, onChange,
}: {
  slide: VraagSlide
  onChange: (patch: Partial<VraagSlide>) => void
}) {
  function updateOptie(id: string, tekst: string) {
    onChange({ opties: slide.opties.map((o) => (o.id === id ? { ...o, tekst } : o)) })
  }
  function zetJuist(id: string) {
    onChange({ opties: slide.opties.map((o) => ({ ...o, correct: o.id === id })) })
  }
  function verwijderOptie(id: string) {
    if (slide.opties.length <= 2) { toast.error('Een vraag heeft minstens 2 antwoorden.'); return }
    const weg = slide.opties.find((o) => o.id === id)
    let opties = slide.opties.filter((o) => o.id !== id)
    // Als het juiste antwoord verdween, maak het eerste juist.
    if (weg?.correct && !opties.some((o) => o.correct)) {
      opties = opties.map((o, i) => ({ ...o, correct: i === 0 }))
    }
    onChange({ opties })
  }
  function voegOptieToe() {
    if (slide.opties.length >= 6) { toast.error('Maximaal 6 antwoorden.'); return }
    onChange({ opties: [...slide.opties, { id: nieuwId('o'), tekst: '' }] })
  }

  return (
    <div>
      <label style={labelStijl}>Vraag</label>
      <textarea value={slide.vraag} onChange={(e) => onChange({ vraag: e.target.value })} rows={2} placeholder="Bijv. Wat doe je bij een beschadigde ladder?" style={{ ...inputStijl, resize: 'vertical' }} />

      <label style={{ ...labelStijl, marginTop: 16 }}>Antwoorden — kies het juiste</label>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {slide.opties.map((o, i) => (
          <div key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="radio"
              name={`juist-${slide.id}`}
              checked={!!o.correct}
              onChange={() => zetJuist(o.id)}
              aria-label="Juiste antwoord"
              style={{ width: 18, height: 18, flexShrink: 0 }}
            />
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--fg-muted)', width: 18 }}>{String.fromCharCode(65 + i)}</span>
            <input value={o.tekst} onChange={(e) => updateOptie(o.id, e.target.value)} placeholder={`Antwoord ${String.fromCharCode(65 + i)}`} style={inputStijl} />
            <button onClick={() => verwijderOptie(o.id)} style={{ ...pijlBtn, color: '#b42318' }} aria-label="Verwijderen">×</button>
          </div>
        ))}
      </div>
      <button onClick={voegOptieToe} style={{ ...miniBtn, marginTop: 8 }}>+ Antwoord</button>

      <label style={{ ...labelStijl, marginTop: 18 }}>Uitleg (getoond bij een fout antwoord)</label>
      <textarea value={slide.uitleg ?? ''} onChange={(e) => onChange({ uitleg: e.target.value })} rows={2} placeholder="Waarom is dit het juiste antwoord?" style={{ ...inputStijl, resize: 'vertical' }} />
    </div>
  )
}

// ── Preview ──────────────────────────────────────────────────────────────
function PreviewPaneel({ slides }: { slides: ToolboxSlide[] }) {
  const content = slides.filter((s): s is ContentSlide => s.type === 'content')
  const vragen = slides.filter((s): s is VraagSlide => s.type === 'vraag')
  return (
    <div style={{ flex: 1, overflowY: 'auto', display: 'grid', placeItems: 'start center', padding: 20 }}>
      <div style={{ width: 380, maxWidth: '100%', border: '10px solid #161b20', borderRadius: 32, padding: 20, background: '#fff', display: 'flex', flexDirection: 'column', gap: 28 }}>
        {content.map((s) => (
          <div key={s.id} style={{ borderBottom: '1px dashed var(--border)', paddingBottom: 20 }}>
            <SlideRenderer slide={s} compact />
          </div>
        ))}
        {vragen.length > 0 && (
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#b85a00', marginBottom: 10 }}>Kennischeck ({vragen.length} vragen)</div>
            {vragen.map((v) => (
              <div key={v.id} style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#161b20', marginBottom: 6 }}>{v.vraag || '—'}</div>
                {v.opties.map((o, i) => (
                  <div key={o.id} style={{ fontSize: 13, color: o.correct ? '#067647' : '#3a444b', padding: '2px 0' }}>
                    {String.fromCharCode(65 + i)}. {o.tekst || '—'} {o.correct && '✓'}
                  </div>
                ))}
              </div>
            ))}
            <div style={{ fontSize: 11, color: 'var(--fg-muted)', marginTop: 6 }}>
              Op de telefoon worden de vragen en antwoorden per medewerker geschud.
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Stijlen ──────────────────────────────────────────────────────────────
const inputStijl: React.CSSProperties = {
  width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 14, fontFamily: 'inherit',
}
const labelStijl: React.CSSProperties = {
  display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--fg-soft)', marginBottom: 6,
}
const miniBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 4, padding: '6px 10px', borderRadius: 8,
  border: '1px solid var(--border)', background: '#fff', fontSize: 12, fontWeight: 600, color: 'var(--fg)', cursor: 'pointer',
}
const pijlBtn: React.CSSProperties = {
  width: 22, height: 22, display: 'grid', placeItems: 'center', borderRadius: 6,
  border: '1px solid var(--border)', background: '#fff', fontSize: 13, cursor: 'pointer', color: 'var(--fg-soft)',
}
