'use client'
import React from 'react'
import toast from 'react-hot-toast'
import { Trash2 } from 'lucide-react'
import { cn } from '@everts/ui'
import { Card, CardHeader, CardBody, Textarea } from '@/components/ui'
import {
  plaatsDossierNotitie, verwijderDossierNotitie, type DossierNotitie,
} from '@/lib/dossiers/notities-actions'
import { useDossierReadOnly } from '../DossierReadOnlyContext'

function fmtTijd(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('nl-NL', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

export default function DossierNotitiesBlok({
  dossierId, notities, currentMedewerkerId, className,
}: {
  dossierId: string
  notities: DossierNotitie[]
  currentMedewerkerId: string | null
  className?: string
}) {
  const readOnly = useDossierReadOnly()
  const [items, setItems]   = React.useState<DossierNotitie[]>(notities)
  const [tekst, setTekst]   = React.useState('')
  const [pending, setPending] = React.useState(false)

  // Server-data is leidend zodra de route revalidatet (router.refresh / navigatie).
  React.useEffect(() => { setItems(notities) }, [notities])

  async function plaats(e: React.FormEvent) {
    e.preventDefault()
    const inhoud = tekst.trim()
    if (!inhoud || pending) return
    setPending(true)
    const res = await plaatsDossierNotitie(dossierId, inhoud)
    setPending(false)
    if (!res.ok) { toast.error(res.error); return }
    setItems(prev => [res.notitie, ...prev])
    setTekst('')
  }

  async function verwijder(id: string) {
    const vorige = items
    setItems(prev => prev.filter(n => n.id !== id)) // optimistisch
    const res = await verwijderDossierNotitie(id)
    if (!res.ok) { setItems(vorige); toast.error(res.error) }
  }

  return (
    <Card className={cn('flex flex-col', className)}>
      <CardHeader>Notities · {items.length}</CardHeader>

      <CardBody className="flex min-h-0 flex-1 flex-col gap-0 p-0">
        {/* Lijst — nieuwste bovenaan, scrollt binnen de kaart */}
        <div className="min-h-0 flex-1 overflow-y-auto px-[18px] py-3">
          {items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-2 py-6 text-center">
              <span className="text-[22px] opacity-35">🗒</span>
              <span className="text-xs font-medium text-neutral-500">Nog geen notities</span>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {items.map(n => (
                <div key={n.id} className="group">
                  <div className="mb-0.5 flex items-center gap-2">
                    <span className="text-[11px] font-semibold text-neutral-700">{n.auteur_naam}</span>
                    <span className="text-[10.5px] text-neutral-400">{fmtTijd(n.created_at)}</span>
                    {!readOnly && currentMedewerkerId && n.medewerker_id === currentMedewerkerId && (
                      <button
                        type="button"
                        onClick={() => verwijder(n.id)}
                        title="Notitie verwijderen"
                        className="ml-auto shrink-0 text-neutral-300 opacity-0 transition-colors hover:text-error-700 group-hover:opacity-100"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  <div className="whitespace-pre-wrap break-words text-[13px] leading-snug text-neutral-800">
                    {n.inhoud}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Invoer — onderaan vastgezet; verborgen bij alleen-lezen dossier */}
        {!readOnly && (
        <form onSubmit={plaats} className="flex items-end gap-2 border-t border-neutral-200 px-[18px] py-3">
          <Textarea
            value={tekst}
            onChange={e => setTekst(e.target.value)}
            onKeyDown={e => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') plaats(e as any)
            }}
            rows={2}
            placeholder="Notitie of opmerking toevoegen…"
            className="flex-1 resize-none text-[13px]"
          />
          <button
            type="submit"
            disabled={!tekst.trim() || pending}
            className="shrink-0 rounded-md bg-brand-600 px-3 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
          >
            Plaatsen
          </button>
        </form>
        )}
      </CardBody>
    </Card>
  )
}
