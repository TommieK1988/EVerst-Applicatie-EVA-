'use client'

import { useState, useTransition, useCallback } from 'react'
import { saveHuisstijl } from './actions'
import type { Bedrijfsgegevens } from '@everts/database'
import { logoSlotLabels } from '@everts/database'
import { LogoUpload } from '@/components/LogoUpload'
import { Card, CardBody, Input, Textarea, Button, Spinner } from '@/components/ui'

type Status = { kind: 'idle' } | { kind: 'saving' } | { kind: 'success' } | { kind: 'error'; message: string }

type ColorField = { name: string; label: string; defaultValue: string }

const kleuren: ColorField[] = [
  { name: 'kleur_primair',       label: 'Primair',       defaultValue: '#009439' },
  { name: 'kleur_accent',        label: 'Accent',        defaultValue: '' },
  { name: 'kleur_secundair',     label: 'Secundair',     defaultValue: '' },
  { name: 'kleur_succes',        label: 'Succes',        defaultValue: '#16a34a' },
  { name: 'kleur_waarschuwing',  label: 'Waarschuwing',  defaultValue: '#eab308' },
  { name: 'kleur_fout',          label: 'Fout',          defaultValue: '#dc2626' },
  { name: 'kleur_tekst',         label: 'Tekst',         defaultValue: '#0f172a' },
  { name: 'kleur_achtergrond',   label: 'Achtergrond',   defaultValue: '#f8fafc' },
]

export function HuisstijlForm({ data }: { data: Bedrijfsgegevens }) {
  const [pending, startTransition] = useTransition()
  const [status, setStatus] = useState<Status>({ kind: 'idle' })

  const [logos, setLogos] = useState({
    logo_primair_url:    data.logo_primair_url ?? '',
    logo_wit_url:        data.logo_wit_url ?? '',
    logo_icon_url:       data.logo_icon_url ?? '',
    logo_monochroom_url: data.logo_monochroom_url ?? '',
  })

  const setLogoUrl = useCallback((key: string, url: string | null) => {
    setLogos((prev) => ({ ...prev, [key]: url ?? '' }))
  }, [])

  const [colors, setColors] = useState<Record<string, string>>(
    Object.fromEntries(
      kleuren.map((k) => [k.name, (data as Record<string, unknown>)[k.name] as string ?? k.defaultValue])
    )
  )

  return (
    <form
      action={(formData) => {
        setStatus({ kind: 'saving' })
        startTransition(async () => {
          const result = await saveHuisstijl(formData)
          setStatus(result.ok ? { kind: 'success' } : { kind: 'error', message: result.error })
        })
      }}
      style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
    >
      <input type="hidden" name="id" value={data.id} />
      {Object.entries(logos).map(([key, val]) => (
        <input key={key} type="hidden" name={key} value={val} />
      ))}

      {/* ── Logo's ── */}
      <section>
        <p className="eva-section-label">Logo&apos;s</p>
        <p style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--fg-muted)', marginBottom: 14, lineHeight: 1.5 }}>
          Upload logo&apos;s in PNG, SVG, JPG of WEBP (max 5 MB). Elke werkmaatschappij kan eigen logo&apos;s hebben.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
          {(Object.keys(logoSlotLabels) as Array<keyof typeof logoSlotLabels>).map((slot) => {
            const urlKey = `logo_${slot === 'icon' ? 'icon' : slot}_url` as keyof typeof logos
            return (
              <LogoUpload
                key={slot}
                slot={slot}
                label={logoSlotLabels[slot].label}
                description={logoSlotLabels[slot].description}
                currentUrl={logos[urlKey] || null}
                bedrijfsId={data.id}
                onUploaded={(url) => setLogoUrl(urlKey, url)}
              />
            )
          })}
        </div>
      </section>

      {/* ── Kleurenpalet ── */}
      <section>
        <p className="eva-section-label">Kleurenpalet</p>
        <p style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--fg-muted)', marginBottom: 14 }}>
          Definieer de kleuren voor de huisstijl. Klik op het kleurvlak om een kleur te kiezen.
        </p>
        <Card>
          <CardBody>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12, marginBottom: 14 }}>
              {kleuren.map((k) => (
                <label key={k.name} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <span style={{ fontFamily: 'var(--font-ui)', fontSize: 11, fontWeight: 600, color: 'var(--fg-muted)' }}>{k.label}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input
                      type="color"
                      name={k.name}
                      value={colors[k.name] || k.defaultValue || '#000000'}
                      onChange={(e) => setColors((prev) => ({ ...prev, [k.name]: e.target.value }))}
                      style={{ width: 36, height: 36, cursor: 'pointer', borderRadius: 6, border: '1px solid var(--border)', padding: 2, background: 'transparent', flexShrink: 0 }}
                    />
                    <Input
                      type="text"
                      value={colors[k.name] || ''}
                      onChange={(e) => setColors((prev) => ({ ...prev, [k.name]: e.target.value }))}
                      placeholder={k.defaultValue || '#hex'}
                      style={{ fontSize: 12 }}
                    />
                  </div>
                </label>
              ))}
            </div>
            {/* Live swatch preview */}
            <div style={{ display: 'flex', gap: 2, borderRadius: 8, overflow: 'hidden' }}>
              {kleuren.map((k) => (
                <div key={k.name} style={{ height: 28, flex: 1, backgroundColor: colors[k.name] || k.defaultValue || 'transparent', transition: 'background-color 0.2s' }} title={k.label} />
              ))}
            </div>
          </CardBody>
        </Card>
      </section>

      {/* ── Typografie ── */}
      <section>
        <p className="eva-section-label">Typografie</p>
        <Card>
          <CardBody>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <span style={{ fontFamily: 'var(--font-ui)', fontSize: 11, fontWeight: 600, color: 'var(--fg-muted)' }}>Primair font (headings)</span>
                <Input name="font_primair" type="text" defaultValue={data.font_primair ?? 'Montserrat'} />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <span style={{ fontFamily: 'var(--font-ui)', fontSize: 11, fontWeight: 600, color: 'var(--fg-muted)' }}>Secundair font (body)</span>
                <Input name="font_secundair" type="text" defaultValue={data.font_secundair ?? ''} placeholder="Leeg = zelfde als primair" />
              </label>
            </div>
          </CardBody>
        </Card>
      </section>

      {/* ── Notities ── */}
      <section>
        <p className="eva-section-label">Huisstijlregels</p>
        <Card>
          <CardBody>
            <Textarea
              name="huisstijl_notities"
              rows={4}
              defaultValue={data.huisstijl_notities ?? ''}
              placeholder='Bijv. "Logo altijd met minimaal 16px witruimte", "Nooit op rode achtergrond"...'
              style={{ resize: 'vertical', lineHeight: 1.6 }}
            />
          </CardBody>
        </Card>
      </section>

      {/* ── Submit ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 4 }}>
        <Button type="submit" variant="primary" disabled={pending} loading={pending}>
          {pending ? 'Opslaan…' : 'Opslaan'}
        </Button>
        {status.kind === 'success' && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 500, color: 'var(--accent)' }}>
            <CheckIcon /> Opgeslagen
          </span>
        )}
        {status.kind === 'error' && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-ui)', fontSize: 13, color: '#dc2626' }}>
            <WarnIcon /> {status.message}
          </span>
        )}
      </div>
    </form>
  )
}

function CheckIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 10l4 4 8-9"/>
    </svg>
  )
}
function WarnIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="M10 3 2 17h16L10 3ZM10 8v4M10 15v.5"/>
    </svg>
  )
}
