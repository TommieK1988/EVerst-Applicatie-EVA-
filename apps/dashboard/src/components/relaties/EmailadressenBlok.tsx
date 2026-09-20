'use client'

/**
 * De e-mailadressen van één contactpersoon beheren.
 *
 * Eén adres per persoon bleek te krap: iemand heeft naast zijn eigen adres vaak ook een
 * facturenpostbus, of tijdelijk een oud en een nieuw adres. Alle adressen die hier staan
 * verschijnen in de ontvangerkiezer van elk mailvenster in EVA.
 *
 * Het **primaire** adres is bijzonder: dat is het adres dat naar Bouw7 gaat en dat overal in
 * EVA als "het" adres van deze persoon geldt. Een ander adres primair maken kan hier, en loopt
 * dan via dezelfde weg als het bewerken van de contactpersoon zelf.
 */

import React, { useEffect, useState, useTransition } from 'react'
import toast from 'react-hot-toast'
import { Mail, Star, Trash2, Plus } from 'lucide-react'
import { Badge, Button, useDialogen } from '@/components/ui'
import {
  getContactpersoonEmails, voegContactpersoonEmailToe,
  verwijderContactpersoonEmail, zetPrimairEmail,
} from '@/lib/relaties/contactpersoon-emails'
import type { ContactpersoonEmail } from '@everts/database'

const invoer: React.CSSProperties = {
  padding: '7px 10px',
  background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 7,
  color: 'var(--fg)', fontFamily: 'var(--font-ui)', fontSize: 13,
  outline: 'none', boxSizing: 'border-box', minWidth: 0,
}

export default function EmailadressenBlok({ contactpersoonId }: { contactpersoonId: string }) {
  const [adressen, setAdressen] = useState<ContactpersoonEmail[] | null>(null)
  const [nieuwAdres, setNieuwAdres] = useState('')
  const [nieuwLabel, setNieuwLabel] = useState('')
  const [bezig, start] = useTransition()
  const { bevestig } = useDialogen()

  async function herlaad() {
    setAdressen(await getContactpersoonEmails(contactpersoonId))
  }

  useEffect(() => {
    let actief = true
    getContactpersoonEmails(contactpersoonId).then(r => { if (actief) setAdressen(r) })
    return () => { actief = false }
  }, [contactpersoonId])

  function toevoegen(e: React.FormEvent) {
    e.preventDefault()
    const adres = nieuwAdres.trim()
    if (!adres) return
    start(async () => {
      const res = await voegContactpersoonEmailToe(contactpersoonId, adres, nieuwLabel || null)
      if (!res.ok) { toast.error(res.error); return }
      setNieuwAdres('')
      setNieuwLabel('')
      await herlaad()
      toast.success('Adres toegevoegd')
    })
  }

  function primairMaken(rij: ContactpersoonEmail) {
    start(async () => {
      const res = await zetPrimairEmail(contactpersoonId, rij.email)
      if (!res.ok) { toast.error(res.error); return }
      await herlaad()
      toast.success(res.waarschuwing ?? 'Primair adres gewijzigd')
    })
  }

  async function verwijderen(rij: ContactpersoonEmail) {
    const ok = await bevestig({
      titel: 'Adres verwijderen',
      omschrijving: `${rij.email} verwijderen bij deze contactpersoon?`,
      bevestigLabel: 'Verwijderen',
      destructief: true,
    })
    if (!ok) return
    start(async () => {
      const res = await verwijderContactpersoonEmail(rij.id)
      if (!res.ok) { toast.error(res.error); return }
      await herlaad()
      toast.success('Adres verwijderd')
    })
  }

  if (adressen === null) {
    return <div style={{ fontSize: 13, color: 'var(--fg-muted)' }}>Laden…</div>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {adressen.length === 0 && (
        <div style={{ fontSize: 13, color: 'var(--fg-muted)' }}>
          Nog geen e-mailadres. Voeg er hieronder een toe.
        </div>
      )}

      {adressen.map(rij => (
        <div
          key={rij.id}
          style={{
            display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
            padding: '8px 10px', borderRadius: 8,
            border: '1px solid var(--border)',
            background: rij.is_primair ? 'var(--bg-soft)' : 'transparent',
          }}
        >
          <Mail size={14} style={{ color: 'var(--fg-muted)', flexShrink: 0 }} aria-hidden />
          <a
            href={`mailto:${rij.email}`}
            style={{ fontSize: 13, color: 'var(--fg)', textDecoration: 'none', wordBreak: 'break-all' }}
          >
            {rij.email}
          </a>
          {rij.label && <Badge variant="outline" tone="neutral">{rij.label}</Badge>}
          {rij.is_primair && <Badge variant="outline" tone="success" dot>Primair</Badge>}

          <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
            {!rij.is_primair && (
              <>
                <Button
                  variant="ghost" size="sm" disabled={bezig}
                  onClick={() => primairMaken(rij)}
                  title="Dit adres primair maken — het gaat dan ook naar Bouw7"
                >
                  <Star size={13} aria-hidden /> Primair
                </Button>
                <Button
                  variant="ghost" size="sm" disabled={bezig}
                  onClick={() => verwijderen(rij)}
                  title="Adres verwijderen"
                >
                  <Trash2 size={13} aria-hidden />
                </Button>
              </>
            )}
          </div>
        </div>
      ))}

      <form onSubmit={toevoegen} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          id="nieuw-emailadres"
          type="email"
          value={nieuwAdres}
          onChange={e => setNieuwAdres(e.target.value)}
          placeholder="nieuw@adres.nl"
          style={{ ...invoer, flex: '2 1 200px' }}
        />
        <input
          id="nieuw-emaillabel"
          type="text"
          value={nieuwLabel}
          onChange={e => setNieuwLabel(e.target.value)}
          placeholder="Aanduiding, bijv. Facturen"
          style={{ ...invoer, flex: '1 1 140px' }}
        />
        <Button type="submit" variant="secondary" size="sm" disabled={bezig || !nieuwAdres.trim()}>
          <Plus size={13} aria-hidden /> Toevoegen
        </Button>
      </form>

      <p style={{ fontSize: 12, color: 'var(--fg-muted)', margin: 0 }}>
        Alle adressen hier kun je kiezen bij het mailen. Het primaire adres is wat Bouw7 kent en
        wat EVA standaard gebruikt.
      </p>
    </div>
  )
}
