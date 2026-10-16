'use client'

/**
 * De offertekaart in "Te doen": een paneel naast de werklijst, zodat nabellen niet meer betekent
 * dat je voor elke offerte een pagina opent, een tab kiest en weer terug navigeert.
 *
 * De volgorde volgt de vragen van wie gaat bellen:
 *  1. Mag ik bellen? Wie is aan zet, wat is er het laatst besproken, tot wanneer wachten we.
 *  2. Wie bel ik? Contactpersoon met telefoonnummer.
 *  3. Waar gaat het over? Bedrag, verzonden, geldigheid, de afgesproken stap.
 *  4. Wat is er gebeurd? De uitkomst; daarna opent de volgende offerte vanzelf.
 *  5. De tijdlijn.
 */

import * as React from 'react'
import Link from 'next/link'
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription, DrawerBody,
} from '@/components/ui/drawer'
import { cn } from '@everts/ui'
import { berekenKaartBedrag } from '@/components/dossiers/kaart-bedrag'
import { dossierTabPad } from '@/components/dossiers/open-dossier'
import type { DossierRij } from '@/components/dossiers/types'
import { formatDatumNL } from '@/lib/dossiers/datum-regels'
import { STATUS_PRESENTATIE, stapOmschrijving } from '@/lib/commercie/types'
import { getOffertePaneel, type OffertePaneelData } from '@/lib/commercie/paneel'
import { bellenBanner } from './bellen-banner'
import { UitkomstFormulier } from './UitkomstFormulier'

type Props = {
  /** De rij uit de werklijst; null = paneel dicht. */
  dossier: DossierRij | null
  mijnMedewerkerId: string | null
  medewerkers: { id: string; naam: string }[]
  /** Paneel sluiten. */
  onSluit: () => void
  /** Na een vastgelegde uitkomst: de lijst verversen en de volgende offerte kiezen. */
  onVastgelegd: () => void
  /** Vandaag als YYYY-MM-DD in Nederlandse tijd; dezelfde peildatum als de werklijst. */
  vandaag: string
}

const eur = (n: number | null) =>
  n == null ? '—' : new Intl.NumberFormat('nl-NL', {
    style: 'currency', currency: 'EUR', maximumFractionDigits: 0,
  }).format(n)

export function OfferteZijpaneel(props: Props) {
  const d = props.dossier
  const [data, setData] = React.useState<OffertePaneelData | null>(null)
  const [fout, setFout] = React.useState<string | null>(null)
  const [versie, setVersie] = React.useState(0)

  React.useEffect(() => {
    if (!d) return
    let actief = true
    setData(null); setFout(null)
    getOffertePaneel(d.id)
      .then(r => { if (actief) setData(r) })
      .catch((e: unknown) => { if (actief) setFout(e instanceof Error ? e.message : 'Laden mislukt') })
    return () => { actief = false }
  }, [d, versie])

  const kaart = data?.bewaking.kaart ?? null
  const status = data?.bewaking.status ?? null
  const pres = status ? STATUS_PRESENTATIE[status] : null
  const stap = kaart ? stapOmschrijving(kaart) : null
  const banner = data && d
    ? bellenBanner({ bewaking: data.bewaking, tijdlijn: data.tijdlijn, mijnId: props.mijnMedewerkerId, vandaag: props.vandaag })
    : null
  const geldigVerlopen = data?.geldigTot != null && data.geldigTot < props.vandaag

  return (
    <Drawer open={d != null} onOpenChange={open => { if (!open) props.onSluit() }}>
      <DrawerContent width={460}>
        <DrawerHeader>
          <DrawerTitle className="truncate">{d?.titel ?? 'Offerte'}</DrawerTitle>
          <DrawerDescription>
            {[d?.dossiernummer, d?.klant_naam].filter(Boolean).join(' · ')}
          </DrawerDescription>
        </DrawerHeader>

        <DrawerBody className="flex flex-col gap-4">
          {fout && <p className="text-sm text-error-700">{fout}</p>}
          {!data && !fout && <p className="text-sm text-neutral-500">Laden…</p>}

          {data && d && (
            <>
              {/* 1. Mag ik bellen? */}
              {banner && (
                <div className={cn('rounded-lg p-3 text-[13px]', {
                  'bg-warning-50 text-warning-700': banner.toon === 'stop',
                  'bg-brand-50 text-brand-700': banner.toon === 'go',
                  'bg-info-50 text-info-700': banner.toon === 'info',
                })}>
                  <div className="font-semibold">{banner.kop}</div>
                  {banner.regels.map((r, i) => <p key={i} className="mt-1">{r}</p>)}
                </div>
              )}

              {/* 2. Wie bel ik? */}
              <Sectie titel="Contactpersoon">
                {d.contactpersoon_naam ? (
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <span className="font-medium text-neutral-900">{d.contactpersoon_naam}</span>
                    {d.contactpersoon_telefoon && (
                      <span className="select-all font-mono text-[13px] text-neutral-900">{d.contactpersoon_telefoon}</span>
                    )}
                    {d.contactpersoon_email && (
                      <span className="w-full select-all text-xs text-neutral-500">{d.contactpersoon_email}</span>
                    )}
                  </div>
                ) : (
                  <span className="text-sm text-neutral-500">Geen contactpersoon op het dossier.</span>
                )}
              </Sectie>

              {/* 3. Waar gaat het over? */}
              <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                <Veld label="Bedrag" waarde={eur(berekenKaartBedrag(d, 'offerte').totaalExclBtw)} />
                <Veld
                  label="Verzonden · geldig tot"
                  waarde={`${d.verzonden_op ? formatDatumNL(d.verzonden_op.slice(0, 10)) : '—'} · ${data.geldigTot ? formatDatumNL(data.geldigTot) : '—'}`}
                />
                <Veld label="Eigenaar" waarde={data.bewaking.eigenaarNaam ?? 'Nog niet bepaald'} />
                <Veld label="Nu aan zet" waarde={data.bewaking.actiehouderNaam ?? '—'} />
                <div className="col-span-2">
                  <div className="text-[10.5px] font-semibold uppercase tracking-wide text-neutral-500">Afgesproken</div>
                  <div className="mt-0.5 flex items-start gap-2 text-sm text-neutral-900">
                    {pres && <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', pres.stip)} title={pres.uitleg} />}
                    <span>
                      {stap ?? <span className="text-neutral-500">Nog niets afgesproken</span>}
                      {stap && kaart?.stap_bron === 'actie' && (
                        <span className="text-neutral-400"> · uit de actielijst</span>
                      )}
                    </span>
                  </div>
                </div>
              </div>
              {geldigVerlopen && (
                <p className="rounded-md bg-warning-50 px-3 py-2 text-xs text-warning-700">
                  De geldigheid is verstreken. Dat is geen afwijzing: zegt de klant ja, indexeer de
                  offerte dan eerst naar het huidige prijspeil.
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                {data.heeftPdf && (
                  <a
                    href={`/api/dossiers/${d.id}/offerte/pdf`}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-800 hover:bg-neutral-50"
                  >
                    Offerte openen{data.versie ? ` (versie ${data.versie})` : ''}
                  </a>
                )}
                <Link
                  href={dossierTabPad('offerte', d.id, 'bewaking')}
                  className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-800 hover:bg-neutral-50"
                >
                  Volledig dossier
                </Link>
              </div>

              {/* 4. Wat is er gebeurd? */}
              {!data.bewaking.afgerond && (
                <Sectie titel="Contact gehad? Wat is de uitkomst">
                  <UitkomstFormulier
                    dossierId={d.id}
                    medewerkers={props.medewerkers}
                    compact
                    sneltoetsen
                    onVastgelegd={() => { setVersie(v => v + 1); props.onVastgelegd() }}
                  />
                </Sectie>
              )}

              {/* 5. Tijdlijn */}
              <Sectie titel="Wat is er gebeurd">
                {data.tijdlijn.length === 0 ? (
                  <span className="text-sm text-neutral-500">Nog niets vastgelegd.</span>
                ) : (
                  <ol className="space-y-2">
                    {data.tijdlijn.slice(0, 8).map(r => (
                      <li key={r.id} className="text-[13px]">
                        <div className="text-xs text-neutral-500">
                          {formatDatumNL(r.op.slice(0, 10))}{r.door ? ` · ${r.door}` : ''} · <span className="font-medium text-neutral-900">{r.kop}</span>
                        </div>
                        {r.tekst && <p className="text-neutral-700">{r.tekst}</p>}
                      </li>
                    ))}
                  </ol>
                )}
              </Sectie>
            </>
          )}
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  )
}

function Sectie({ titel, children }: { titel: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <div className="text-[10.5px] font-semibold uppercase tracking-wide text-neutral-500">{titel}</div>
      {children}
    </section>
  )
}

function Veld({ label, waarde }: { label: string; waarde: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[10.5px] font-semibold uppercase tracking-wide text-neutral-500">{label}</div>
      <div className="mt-0.5 truncate text-sm text-neutral-900" title={waarde}>{waarde}</div>
    </div>
  )
}
