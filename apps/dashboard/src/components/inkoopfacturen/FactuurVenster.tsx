'use client'

import React from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter, Button } from '@/components/ui'
import type { InkoopfactuurRij } from '@/lib/inkoopfacturen/types'

/**
 * Het factuurdocument in een venster, zonder het overzicht te verlaten.
 *
 * De PDF komt uit onze eigen proxy (`/api/inkoopfacturen/{id}/document`), die de scope hertoetst
 * en de Bouw7-opslagsleutel binnenboord houdt. Een `<iframe>` en niet een `<embed>`: die eerste
 * geeft de browser zijn eigen pdf-viewer mét zoom en bladeren, en werkt ook als het bestand
 * geen pdf blijkt (Bouw7 accepteert ook afbeeldingen als factuurdocument).
 *
 * Kan de browser het niet tonen — of blokkeert een extensie de viewer — dan is er nog steeds de
 * knop "Openen in nieuw tabblad". Zonder die uitweg zou een lege grijze rechthoek het eindstation
 * zijn.
 */

function euro(n: number | null): string {
  if (n == null) return '—'
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(n)
}

type Props = {
  rij: InkoopfactuurRij | null
  onClose: () => void
}

export default function FactuurVenster({ rij, onClose }: Props) {
  const src = rij ? `/api/inkoopfacturen/${rij.id}/document` : ''

  return (
    <Dialog open={!!rij} onOpenChange={open => { if (!open) onClose() }}>
      {/* size xl (920px) is voor een A4-factuur nog krap; de inline maxWidth wint van de klasse. */}
      <DialogContent size="xl" style={{ maxWidth: 'min(1100px, 94vw)', width: '94vw' }}>
        {rij && (
          <>
            <DialogHeader>
              <DialogTitle>
                {rij.factuurnummer ?? 'Inkoopfactuur'} · {rij.leverancier_naam ?? '—'} · {euro(rij.bedrag_incl)}
              </DialogTitle>
            </DialogHeader>

            <DialogBody style={{ padding: 0 }}>
              {/* De modal is op 85vh gemaximeerd; 68vh laat ruimte voor kop en knoppenbalk. */}
              <div style={{
                height: '68vh', overflow: 'hidden',
                background: 'var(--bg-soft, #f4f4f5)',
              }}>
                <iframe
                  key={rij.id}
                  src={src}
                  title={`Factuur ${rij.factuurnummer ?? rij.id}`}
                  style={{ width: '100%', height: '100%', border: 0 }}
                />
              </div>
            </DialogBody>

            <DialogFooter>
              <a href={src} target="_blank" rel="noreferrer">
                <Button variant="secondary" size="sm">Openen in nieuw tabblad</Button>
              </a>
              <Button size="sm" onClick={onClose}>Sluiten</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
