'use client'

/**
 * Handmatig samenvoegen vanaf de contactpersoonpagina: zoek de andere rij van dezelfde mens.
 * Bedoeld voor wat de suggestielijst niet ziet — een roepnaam tegenover voorletters, of een
 * achternaam die na een huwelijk is gewijzigd.
 */

import React, { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter,
  Button, Input,
} from '@/components/ui'
import {
  zoekContactpersonenVoorSamenvoegen, voegContactpersonenSamen, type ZoekResultaat,
} from '@/lib/relaties/ontdubbelen'

export default function SamenvoegenModal({ blijverId, blijverNaam, onSluit }: {
  blijverId: string
  blijverNaam: string
  onSluit: () => void
}) {
  const [zoekterm, setZoekterm] = useState('')
  const [resultaten, setResultaten] = useState<ZoekResultaat[]>([])
  const [gekozen, setGekozen] = useState<ZoekResultaat | null>(null)
  const [bezig, startTransition] = useTransition()
  const router = useRouter()

  useEffect(() => {
    if (zoekterm.trim().length < 2) { setResultaten([]); return }
    let afgebroken = false
    const t = setTimeout(async () => {
      const res = await zoekContactpersonenVoorSamenvoegen(zoekterm, blijverId)
      if (!afgebroken) setResultaten(res)
    }, 250)
    return () => { afgebroken = true; clearTimeout(t) }
  }, [zoekterm, blijverId])

  function samenvoegen() {
    if (!gekozen) return
    startTransition(async () => {
      const res = await voegContactpersonenSamen(blijverId, [gekozen.id])
      if (!res.ok) { toast.error(res.error); return }
      toast.success(`${gekozen.naam} is opgegaan in ${blijverNaam}`)
      router.refresh()
      onSluit()
    })
  }

  return (
    <Dialog open onOpenChange={open => !open && onSluit()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Samenvoegen in {blijverNaam}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <p style={{ fontSize: 12, color: 'var(--fg-muted)', margin: '0 0 12px', lineHeight: 1.6 }}>
            Zoek de rij die dezelfde mens is. Die verdwijnt uit de lijsten; zijn organisaties,
            dossiers, notities en Bouw7-koppelingen komen bij <strong>{blijverNaam}</strong> te
            staan. Lege velden worden aangevuld, ingevulde velden blijven. Terug te draaien via
            Relaties → Dubbelen.
          </p>
          <Input
            autoFocus
            value={zoekterm}
            onChange={e => setZoekterm(e.target.value)}
            placeholder="Naam of e-mailadres…"
          />
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 280, overflowY: 'auto' }}>
            {resultaten.map(r => (
              <button
                key={r.id}
                onClick={() => setGekozen(r)}
                style={{
                  textAlign: 'left', padding: '8px 10px', borderRadius: 7, cursor: 'pointer',
                  border: `1px solid ${gekozen?.id === r.id ? 'var(--accent)' : 'var(--border)'}`,
                  background: gekozen?.id === r.id ? 'var(--bg-active)' : 'var(--bg)',
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)' }}>{r.naam}</div>
                <div style={{ fontSize: 11, color: 'var(--fg-muted)' }}>
                  {r.email ?? 'geen e-mail'}
                  {r.organisaties.length > 0 && <> · {r.organisaties.join(', ')}</>}
                </div>
              </button>
            ))}
            {zoekterm.trim().length >= 2 && resultaten.length === 0 && (
              <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>Niets gevonden.</span>
            )}
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={onSluit} disabled={bezig}>Annuleer</Button>
          <Button variant="primary" onClick={samenvoegen} disabled={!gekozen || bezig}>
            {bezig ? 'Samenvoegen…' : 'Samenvoegen'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
