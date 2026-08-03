'use client'
import React from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { EyeOff, Undo2 } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody } from '@/components/ui'
import { zetDossierIntern } from '@/lib/dossiers/actions'
import { dossierPad, openDossierInNieuwTabblad } from './open-dossier'
import type { DossierRij, DossierSectie } from './types'

/**
 * Klein toolbar-knopje met telling van interne dossiers. Opent een popup met de
 * verborgen ("Intern") dossiers: doorklikken naar het dossier of terugzetten op het bord.
 */
export function InternDossiersKnop({
  dossiers, sectie,
}: {
  dossiers: DossierRij[]
  sectie: DossierSectie
}) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [bezig, setBezig] = React.useState<string | null>(null)

  const aantal = dossiers.length

  function open_dossier(id: string) {
    setOpen(false)
    openDossierInNieuwTabblad(dossierPad(sectie, id))
  }

  async function terugzetten(id: string) {
    setBezig(id)
    const r = await zetDossierIntern(id, false)
    setBezig(null)
    if (!r.ok) {
      toast.error(r.error)
      return
    }
    toast.success('Dossier teruggezet op het bord')
    router.refresh()
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Interne dossiers"
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          height: 28, padding: '0 9px',
          borderRadius: 6, border: '1px solid var(--border)',
          background: 'var(--neutral-0)', cursor: 'pointer',
          color: aantal > 0 ? 'var(--neutral-700)' : 'var(--neutral-400)',
          fontSize: 12, fontWeight: 500, transition: 'all 120ms',
        }}
      >
        <EyeOff size={14} />
        <span>Intern</span>
        {aantal > 0 && (
          <span style={{
            minWidth: 16, height: 16, borderRadius: 999, padding: '0 5px',
            background: 'var(--neutral-200)', color: 'var(--neutral-700)',
            fontSize: 10, fontWeight: 700, display: 'grid', placeItems: 'center',
          }}>
            {aantal}
          </span>
        )}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>Interne dossiers</DialogTitle>
          </DialogHeader>
          <DialogBody>
            {aantal === 0 ? (
              <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--neutral-400)', fontSize: 13 }}>
                Geen interne dossiers.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {dossiers.map(d => (
                  <div
                    key={d.id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '8px 10px', borderRadius: 8,
                      border: '1px solid var(--border)', background: 'var(--neutral-0)',
                    }}
                  >
                    <button
                      onClick={() => open_dossier(d.id)}
                      style={{
                        flex: 1, minWidth: 0, textAlign: 'left',
                        border: 'none', background: 'transparent', cursor: 'pointer', padding: 0,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 10.5, color: 'var(--neutral-400)' }}>
                          {d.dossiernummer ?? 'Nieuw'}
                        </span>
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--neutral-900)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {d.titel}
                      </div>
                      {d.klant_naam && (
                        <div style={{ fontSize: 12, color: 'var(--neutral-500)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {d.klant_naam}
                        </div>
                      )}
                    </button>
                    <button
                      onClick={() => terugzetten(d.id)}
                      disabled={bezig === d.id}
                      title="Terugzetten op het bord"
                      style={{
                        display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0,
                        height: 28, padding: '0 9px',
                        borderRadius: 6, border: '1px solid var(--border)',
                        background: 'var(--neutral-0)',
                        cursor: bezig === d.id ? 'default' : 'pointer',
                        opacity: bezig === d.id ? 0.5 : 1,
                        color: 'var(--neutral-600)', fontSize: 12, fontWeight: 500,
                      }}
                    >
                      <Undo2 size={13} />
                      Terugzetten
                    </button>
                  </div>
                ))}
              </div>
            )}
          </DialogBody>
        </DialogContent>
      </Dialog>
    </>
  )
}
