'use client'

/**
 * De offertekaart in "Te doen". Puur weergave; het laden doet OfferteZijpaneel, zodat de
 * voorbeeldpagina dezelfde kaart met verzonnen gegevens kan tonen.
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
import { cn } from '@everts/ui'
import { berekenKaartBedrag } from '@/components/dossiers/kaart-bedrag'
import { dossierTabPad } from '@/components/dossiers/open-dossier'
import type { DossierRij } from '@/components/dossiers/types'
import { STATUS_PRESENTATIE } from '@/lib/commercie/types'
import type { OffertePaneelData } from '@/lib/commercie/paneel'
import { bellenBanner } from './bellen-banner'
import { eur, kortDatum, kortStap, type TeDoenRij } from './te-doen'
import { legMeebesprokenVast } from '@/lib/commercie/paneel'
import { bedragklasse, type Bedragklassegrenzen } from '@/lib/commercie/bedragklassen'
import { UitkomstFormulier } from './UitkomstFormulier'
import { OverigeOffertes } from './OverigeOffertes'
import { OpvolgingBlok } from './OpvolgingBlok'

type Props = {
  dossier: DossierRij
  data: OffertePaneelData
  mijnMedewerkerId: string | null
  medewerkers: { id: string; naam: string }[]
  vandaag: string
  onVastgelegd: () => void
  /** Kop met titel en sluitknop; weg te laten als de drawer zijn eigen kop heeft. */
  kop?: React.ReactNode
  /** Andere open offertes bij wie je aan de lijn hebt (zie getOverigeOffertes). */
  overige?: { partij: string | null; rijen: TeDoenRij[] }
  /** Een andere offerte in het paneel openen. */
  onOpen?: (id: string) => void
  /** De ingestelde bedragklassegrenzen; zonder: de standaard. */
  grenzen?: Bedragklassegrenzen
}

export function OfferteKaart({ dossier: d, data, ...props }: Props) {
  const kaart = data.bewaking.kaart
  const pres = STATUS_PRESENTATIE[data.bewaking.status]
  const stap = kaart ? kortStap(kaart, props.vandaag) : null
  const banner = bellenBanner({
    bewaking: data.bewaking, tijdlijn: data.tijdlijn, mijnId: props.mijnMedewerkerId, vandaag: props.vandaag,
  })
  const geldigVerlopen = data.geldigTot != null && data.geldigTot < props.vandaag
  const klasse = bedragklasse(berekenKaartBedrag(d, 'offerte').totaalExclBtw, props.grenzen)
  const overige = props.overige?.rijen ?? []
  /** Offertes die in dit gesprek zijn meebesproken: hun tijdlijn krijgt dezelfde notitie. */
  const [mee, setMee] = React.useState<Set<string>>(new Set())
  React.useEffect(() => setMee(new Set()), [d.id])
  const naVastleggen = React.useCallback(async (notitie: string) => {
    if (mee.size === 0) return
    const res = await legMeebesprokenVast([...mee], notitie, d.dossiernummer ?? null)
    if (!res.ok) throw new Error(res.error)
  }, [mee, d.dossiernummer])

  return (
    <div className="flex flex-col">
      {props.kop}

      {/* 1. Mag ik bellen? */}
      {banner && (
        <Blok>
          <div className={cn('rounded-lg p-3 text-[13px]', {
            'bg-warning-50 text-warning-700': banner.toon === 'stop',
            'bg-brand-50 text-brand-700': banner.toon === 'go',
            'bg-info-50 text-info-700': banner.toon === 'info',
          })}>
            <div className="font-semibold">{banner.kop}</div>
            {banner.regels.map((r, i) => <p key={i} className="mt-1">{r}</p>)}
          </div>
        </Blok>
      )}

      {/* 2. Wie bel ik? */}
      <Blok titel="Contactpersoon">
        {d.contactpersoon_naam ? (
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3">
            <span className="truncate text-[13px] font-semibold text-neutral-900">{d.contactpersoon_naam}</span>
            <span className="select-all font-mono text-[13px] text-neutral-900">{d.contactpersoon_telefoon ?? ''}</span>
            {d.contactpersoon_email && (
              <span className="col-span-2 select-all truncate text-xs text-neutral-500">{d.contactpersoon_email}</span>
            )}
          </div>
        ) : (
          <span className="text-[13px] text-neutral-500">Geen contactpersoon op het dossier.</span>
        )}

        {overige.length > 0 && (
          <OverigeOffertes
            partij={props.overige?.partij ?? null}
            rijen={overige}
            eigenKlant={d.klant_naam ?? null}
            mee={mee}
            onMee={(id, aan) => setMee(s => {
              const n = new Set(s)
              if (aan) n.add(id); else n.delete(id)
              return n
            })}
            onOpen={props.onOpen}
            kleinTot={props.grenzen?.kleinTot}
          />
        )}
      </Blok>

      {/* 3. Waar gaat het over? */}
      <Blok>
        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          <Veld label="Bedrag" waarde={eur(berekenKaartBedrag(d, 'offerte').totaalExclBtw)} cijfer />
          <Veld
            label="Verzonden · geldig tot"
            waarde={`${d.verzonden_op ? kortDatum(d.verzonden_op, props.vandaag) : '—'} · ${data.geldigTot ? kortDatum(data.geldigTot, props.vandaag) : '—'}`}
            waarschuwing={geldigVerlopen}
          />
          <Veld label="Eigenaar" waarde={data.bewaking.eigenaarNaam ?? 'Nog niet bepaald'} />
          <Veld label="Nu aan zet" waarde={data.bewaking.actiehouderNaam ?? '—'} />
          <div className="col-span-2">
            <Label>Afgesproken</Label>
            <div className="mt-0.5 flex items-start gap-2 text-[13px] text-neutral-900">
              <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: pres.cssKleur }} title={pres.uitleg} />
              <span>
                {stap ?? <span className="text-neutral-500">Nog niets afgesproken</span>}
                {stap && kaart?.stap_bron === 'actie' && <span className="text-neutral-400"> · uit de actielijst</span>}
              </span>
            </div>
          </div>
        </div>
        {klasse === 'mega' && (
          <p className={cn('mt-3 rounded-md px-3 py-2 text-xs',
            data.eigenaarMagMega === false ? 'bg-warning-50 text-warning-700' : 'bg-neutral-50 text-neutral-700')}>
            <strong className="font-semibold">Mega-offerte.</strong> Eigenaar is een projectleider of de
            directie, en wachten we op de klant, dan toch elke twee weken een hercontrole.
            {data.eigenaarMagMega === false && ' De huidige eigenaar is dat niet: wijs een projectleider aan via Volledig dossier.'}
            {data.eigenaarMagMega === null && ' Er is nog geen eigenaar.'}
          </p>
        )}
        {geldigVerlopen && (
          <p className="mt-3 rounded-md bg-warning-50 px-3 py-2 text-xs text-warning-700">
            De geldigheid is verstreken. Dat is geen afwijzing: zegt de klant ja, indexeer de offerte
            dan eerst naar het huidige prijspeil.
          </p>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          {data.heeftPdf && (
            <a
              href={`/api/dossiers/${d.id}/offerte/pdf`}
              target="_blank"
              rel="noreferrer"
              className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-semibold text-neutral-800 hover:bg-neutral-50"
            >
              Offerte openen{data.versie ? ` (versie ${data.versie})` : ''}
            </a>
          )}
          <Link
            href={dossierTabPad('offerte', d.id, 'bewaking')}
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-semibold text-neutral-800 hover:bg-neutral-50"
          >
            Volledig dossier
          </Link>
        </div>
      </Blok>

      {/* Nabellen en stilstand: geen gesprek nodig om dat bij te stellen. */}
      {!data.bewaking.afgerond && (
        <Blok>
          <OpvolgingBlok
            dossierId={d.id}
            klasse={klasse}
            kleinTot={props.grenzen?.kleinTot}
            opvolging={d.bewaking_opvolging ?? null}
            stilReden={d.bewaking_stil_reden ?? null}
            besluitDatum={d.bewaking_besluit_datum ?? null}
          />
        </Blok>
      )}

      {/* 4. Wat is er gebeurd? */}
      {!data.bewaking.afgerond && (
        <Blok titel="Contact gehad? Wat is de uitkomst">
          <UitkomstFormulier
            dossierId={d.id}
            medewerkers={props.medewerkers}
            compact
            sneltoetsen
            mega={klasse === 'mega'}
            naVastleggen={naVastleggen}
            onVastgelegd={props.onVastgelegd}
          />
        </Blok>
      )}

      {/* 5. Tijdlijn */}
      <Blok titel="Wat is er gebeurd">
        {data.tijdlijn.length === 0 ? (
          <span className="text-[13px] text-neutral-500">Nog niets vastgelegd.</span>
        ) : (
          <ol className="flex flex-col gap-3">
            {data.tijdlijn.slice(0, 8).map(r => (
              <li key={r.id} className="grid grid-cols-[8px_minmax(0,1fr)] gap-2">
                <span className={cn('mt-1.5 h-2 w-2 rounded-full', r.soort === 'contact' ? 'bg-brand-500' : 'bg-neutral-300')} aria-hidden />
                <span className="min-w-0">
                  <span className="block text-xs text-neutral-500">
                    {kortDatum(r.op, props.vandaag)}{r.door ? ` · ${r.door}` : ''} · <span className="font-semibold text-neutral-900">{r.kop}</span>
                  </span>
                  {r.tekst && <span className="block text-[13px] text-neutral-700">{r.tekst}</span>}
                </span>
              </li>
            ))}
          </ol>
        )}
      </Blok>
    </div>
  )
}

function Blok({ titel, children }: { titel?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2 border-b border-neutral-200 px-4 py-3 last:border-b-0">
      {titel && <Label>{titel}</Label>}
      {children}
    </section>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-neutral-500">{children}</div>
}

function Veld({ label, waarde, cijfer, waarschuwing }: { label: string; waarde: string; cijfer?: boolean; waarschuwing?: boolean }) {
  return (
    <div className="min-w-0">
      <Label>{label}</Label>
      <div
        className={cn('mt-0.5 truncate text-[13px] font-medium', cijfer && 'tabular-nums', waarschuwing ? 'text-warning-700' : 'text-neutral-900')}
        title={waarde}
      >
        {waarde}
      </div>
    </div>
  )
}
