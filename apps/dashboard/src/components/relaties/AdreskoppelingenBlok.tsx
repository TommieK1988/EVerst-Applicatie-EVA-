'use client'

/**
 * De factuuradressen waar één contactpersoon bij hoort.
 *
 * De tegenhanger van het blok op de relatiekaart: daar koppel je iemand aan een adres, hier zie
 * je vanuit de persoon waar hij overal voor staat. Nuttig bij mensen die níét onder de relatie
 * hangen die de facturen krijgt — een VvE-voorzitter, of een assetmanager die meerdere
 * portefeuilles beheert.
 */

import React, { useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { Trash2 } from 'lucide-react'
import { Badge, Button, EmptyState, Spinner, useDialogen } from '@/components/ui'
import {
  getFactuuradressenVanContactpersoon,
  ontkoppelContactpersoonVanFactuuradres,
} from '@/lib/relaties/factuuradres-contactpersonen'
import type { ContactpersoonAdreskoppeling } from '@/lib/relaties/factuuradres-contactpersonen-types'

export default function AdreskoppelingenBlok({ contactpersoonId }: { contactpersoonId: string }) {
  const [koppelingen, setKoppelingen] = useState<ContactpersoonAdreskoppeling[] | null>(null)
  const [bezig, start] = useTransition()
  const { bevestig } = useDialogen()

  useEffect(() => {
    let actief = true
    getFactuuradressenVanContactpersoon(contactpersoonId)
      .then(r => { if (actief) setKoppelingen(r) })
      .catch(() => { if (actief) setKoppelingen([]) })
    return () => { actief = false }
  }, [contactpersoonId])

  async function ontkoppel(k: ContactpersoonAdreskoppeling) {
    const ok = await bevestig({
      titel: 'Loskoppelen van dit factuuradres?',
      omschrijving: `${k.factuuradres.label} — de contactpersoon zelf blijft bestaan.`,
      bevestigLabel: 'Loskoppelen',
    })
    if (!ok) return
    start(async () => {
      const res = await ontkoppelContactpersoonVanFactuuradres(k.id, k.factuuradres.relatie_id)
      if (!res.ok) { toast.error(res.error); return }
      setKoppelingen(prev => (prev ?? []).filter(r => r.id !== k.id))
    })
  }

  if (koppelingen === null) {
    return <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--fg-muted)' }}><Spinner size="sm" /> Laden…</div>
  }

  if (koppelingen.length === 0) {
    return (
      <EmptyState
        size="sm"
        tone="neutral"
        title="Geen factuuradressen"
        description="Koppel via het factuuradres op de relatiekaart."
      />
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {koppelingen.map(k => (
        <div key={k.id} style={{
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10,
          padding: '9px 11px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8,
        }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <Link
                href={`/relaties/${k.factuuradres.relatie_id}`}
                style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--fg)', textDecoration: 'none' }}
              >
                {k.factuuradres.label}
              </Link>
              {k.is_primair && <Badge tone="brand" size="sm">Eerste aanspreekpunt</Badge>}
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--fg-muted)', lineHeight: 1.6 }}>
              {[k.rol, k.factuuradres.relatie_naam].filter(Boolean).join(' · ')}
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--fg-muted)', lineHeight: 1.6 }}>
              {[k.factuuradres.straat, [k.factuuradres.postcode, k.factuuradres.plaats].filter(Boolean).join('  ')]
                .filter(Boolean).join(', ')}
            </div>
          </div>
          <Button
            onClick={() => !bezig && ontkoppel(k)}
            variant="ghost"
            size="icon-sm"
            title="Loskoppelen"
            disabled={bezig}
          >
            <Trash2 size={12} />
          </Button>
        </div>
      ))}
    </div>
  )
}
