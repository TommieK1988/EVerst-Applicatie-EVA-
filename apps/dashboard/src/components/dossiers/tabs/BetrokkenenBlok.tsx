'use client'

/**
 * Het blok "Betrokkenen" op het Informatie-tabblad.
 *
 * Alle mensen die bij deze opdracht horen op één plek: de contactpersoon van de opdrachtgever,
 * het VvE-bestuur of de assetmanager achter het factuuradres, en wie er verder handmatig bij
 * gezet is — een architect, een opzichter, de beheerder met de sleutels.
 *
 * De eerste twee groepen zijn afgeleid en dus niet te verwijderen: die volgen hun bron. Wissel je
 * de contactpersoon op het dossier, dan verdwijnt de oude hier vanzelf. Alleen wat hier is
 * toegevoegd heeft een prullenbak.
 *
 * Het blok haalt zijn eigen gegevens op, zodat de dossierpagina er niets voor hoeft door te geven.
 */

import React, { useCallback, useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { Mail, Phone, Plus, Trash2, Pencil } from 'lucide-react'
import { Badge, Button, EmptyState, InklapbareCard, Input, Spinner, useDialogen } from '@/components/ui'
import { getBetrokkenen, verwijderBetrokkene, wijzigBetrokkene } from '@/lib/dossiers/betrokkenen'
import { HERKOMST_LABEL, type Betrokkene } from '@/lib/dossiers/betrokkenen-types'
import BetrokkeneToevoegenModal from '../BetrokkeneToevoegenModal'

export default function BetrokkenenBlok({ dossierId, readOnly }: { dossierId: string; readOnly: boolean }) {
  const [betrokkenen, setBetrokkenen] = useState<Betrokkene[] | null>(null)
  const [toevoegen, setToevoegen] = useState(false)
  const [rolBewerken, setRolBewerken] = useState<string | null>(null)
  const [rolWaarde, setRolWaarde] = useState('')
  const [bezig, start] = useTransition()
  const { bevestig } = useDialogen()

  const herlaad = useCallback(async () => {
    try {
      setBetrokkenen(await getBetrokkenen(dossierId))
    } catch {
      // Geen leesrecht op dossiers: dan staat de gebruiker sowieso niet op deze pagina.
      setBetrokkenen([])
    }
  }, [dossierId])

  useEffect(() => { void herlaad() }, [herlaad])

  async function verwijder(b: Betrokkene) {
    if (!b.id) return
    const ok = await bevestig({
      titel: `${b.naam} verwijderen?`,
      omschrijving: 'De persoon of organisatie zelf blijft gewoon bestaan; alleen de koppeling met dit dossier vervalt.',
      bevestigLabel: 'Verwijderen',
      destructief: true,
    })
    if (!ok) return
    start(async () => {
      const res = await verwijderBetrokkene(b.id!, dossierId)
      if (!res.ok) { toast.error(res.error); return }
      await herlaad()
    })
  }

  function bewaarRol(b: Betrokkene) {
    if (!b.id) return
    start(async () => {
      const res = await wijzigBetrokkene(b.id!, dossierId, { rol: rolWaarde })
      if (!res.ok) { toast.error(res.error); return }
      setRolBewerken(null)
      await herlaad()
    })
  }

  const aantal = betrokkenen?.length ?? 0

  return (
    <InklapbareCard
      titel={`Betrokkenen${aantal > 0 ? ` · ${aantal}` : ''}`}
      headerActies={!readOnly && (
        <Button variant="ghost" size="sm" onClick={() => setToevoegen(true)}>
          <Plus size={11} strokeWidth={2.5} />
          Toevoegen
        </Button>
      )}
    >
      {betrokkenen === null ? (
        <div className="flex items-center gap-2 text-[13px] text-[var(--fg-muted)]">
          <Spinner size="sm" /> Betrokkenen laden…
        </div>
      ) : betrokkenen.length === 0 ? (
        <EmptyState
          size="sm"
          tone="neutral"
          title="Nog geen betrokkenen"
          description={readOnly
            ? 'Bij dit dossier is niemand vastgelegd.'
            : 'Voeg de mensen toe met wie je over deze opdracht schakelt.'}
        />
      ) : (
        <div className="flex flex-col gap-2">
          {betrokkenen.map(b => (
            <div
              key={b.sleutel}
              className="flex items-start justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  {b.contactpersoon_id ? (
                    <Link
                      href={`/relaties/contactpersonen/${b.contactpersoon_id}`}
                      className="text-[13px] font-semibold text-[var(--fg)] no-underline hover:underline"
                    >
                      {b.naam}
                    </Link>
                  ) : b.organisatie ? (
                    <Link
                      href={`/relaties/${b.organisatie.id}`}
                      className="text-[13px] font-semibold text-[var(--fg)] no-underline hover:underline"
                    >
                      {b.naam}
                    </Link>
                  ) : (
                    <span className="text-[13px] font-semibold text-[var(--fg)]">{b.naam}</span>
                  )}
                  {b.rol && <Badge tone="brand" size="sm">{b.rol}</Badge>}
                  {b.herkomst !== 'handmatig' && (
                    <Badge tone="neutral" size="sm">{HERKOMST_LABEL[b.herkomst]}</Badge>
                  )}
                </div>

                {/* De organisatie alleen apart tonen als de naam hierboven de persoon is;
                    anders staat dezelfde naam twee keer onder elkaar. */}
                {b.contactpersoon_id && b.organisatie && (
                  <Link
                    href={`/relaties/${b.organisatie.id}`}
                    className="text-[12px] text-[var(--fg-muted)] no-underline hover:underline"
                  >
                    {b.organisatie.naam}
                  </Link>
                )}

                <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] text-[var(--fg-muted)]">
                  {b.email && (
                    <a href={`mailto:${b.email}`} className="flex items-center gap-1 text-[var(--fg-muted)] no-underline hover:underline">
                      <Mail size={11} /> {b.email}
                    </a>
                  )}
                  {b.telefoon && (
                    <a href={`tel:${b.telefoon}`} className="flex items-center gap-1 text-[var(--fg-muted)] no-underline hover:underline">
                      <Phone size={11} /> {b.telefoon}
                    </a>
                  )}
                </div>

                {rolBewerken === b.sleutel && (
                  <div className="mt-2 flex items-center gap-2">
                    <Input
                      value={rolWaarde}
                      onChange={e => setRolWaarde(e.target.value)}
                      placeholder="Rol bij deze opdracht"
                      autoFocus
                      onKeyDown={e => { if (e.key === 'Enter') bewaarRol(b) }}
                    />
                    <Button variant="primary" size="sm" disabled={bezig} onClick={() => bewaarRol(b)}>Bewaar</Button>
                    <Button variant="ghost" size="sm" onClick={() => setRolBewerken(null)}>Annuleer</Button>
                  </div>
                )}
              </div>

              {/* Alleen handmatige regels zijn hier te wijzigen; de rest volgt zijn bron. */}
              {!readOnly && b.id && rolBewerken !== b.sleutel && (
                <div className="flex shrink-0 gap-1">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    title="Rol wijzigen"
                    disabled={bezig}
                    onClick={() => { setRolBewerken(b.sleutel); setRolWaarde(b.rol ?? '') }}
                  >
                    <Pencil size={12} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    title="Verwijderen"
                    disabled={bezig}
                    onClick={() => verwijder(b)}
                  >
                    <Trash2 size={12} />
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {toevoegen && (
        <BetrokkeneToevoegenModal
          dossierId={dossierId}
          alGekoppeldePersonen={(betrokkenen ?? []).map(b => b.contactpersoon_id).filter((v): v is string => v != null)}
          onSluit={() => setToevoegen(false)}
          onKlaar={() => { void herlaad() }}
        />
      )}
    </InklapbareCard>
  )
}
