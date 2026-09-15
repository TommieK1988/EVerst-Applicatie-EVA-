'use client'

import React, { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronUp, ChevronDown, Plus, FileText, Trash2, Download } from 'lucide-react'
import { Badge, Button, Input, useDialogen } from '@/components/ui'
import { omschrijfZichtbaarheid, telZichtbaarVoor } from '@/lib/handboek/kenmerken'
import { leesbareGrootte, bijlageUrl } from '@/lib/handboek/bijlagen'
import type { BeheerContact, BeheerSectie } from '@/lib/handboek/beheer'
import type { Bijlage } from '@/lib/handboek/types'
import {
  archiveerSectie, bewaarBijlage, maakSectie, uploadBijlage, verplaatsSectie, verwijderBijlage,
} from '@/app/(platform)/instellingen/handboek/actions'
import ZichtbaarheidKiezer from './ZichtbaarheidKiezer'
import ContactenBeheer from './ContactenBeheer'
import PdfDownload from './PdfDownload'

type Kenmerk = { key: string; label: string }

export default function HandboekBeheer({
  hoofdstukken, situaties, bijlagen, contacten, medewerkers,
  werkmaatschappijen, populatie, totaal,
}: {
  hoofdstukken: BeheerSectie[]
  situaties: BeheerSectie[]
  bijlagen: (Bijlage & { status: string })[]
  contacten: BeheerContact[]
  medewerkers: { id: string; naam: string; nummer: string | null }[]
  werkmaatschappijen: Kenmerk[]
  populatie: { kenmerken: string[]; aantal: number }[]
  totaal: number
}) {
  const [tab, setTab] =
    useState<'hoofdstukken' | 'situaties' | 'bijlagen' | 'contacten'>('hoofdstukken')

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1">
          <Tab actief={tab === 'hoofdstukken'} onKies={() => setTab('hoofdstukken')}>
            Hoofdstukken ({hoofdstukken.length})
          </Tab>
          <Tab actief={tab === 'situaties'} onKies={() => setTab('situaties')}>
            Wat te doen bij… ({situaties.length})
          </Tab>
          <Tab actief={tab === 'bijlagen'} onKies={() => setTab('bijlagen')}>
            Bijlagen ({bijlagen.length})
          </Tab>
          <Tab actief={tab === 'contacten'} onKies={() => setTab('contacten')}>
            Contacten ({contacten.length})
          </Tab>
        </div>
        <PdfDownload werkmaatschappijen={werkmaatschappijen} />
      </div>

      {tab === 'contacten' ? (
        <ContactenBeheer
          contacten={contacten}
          medewerkers={medewerkers}
          werkmaatschappijen={werkmaatschappijen}
          populatie={populatie}
          totaal={totaal}
        />
      ) : tab === 'bijlagen' ? (
        <Bijlagen
          bijlagen={bijlagen}
          werkmaatschappijen={werkmaatschappijen}
          populatie={populatie}
          totaal={totaal}
        />
      ) : (
        <Secties
          secties={tab === 'hoofdstukken' ? hoofdstukken : situaties}
          soort={tab === 'hoofdstukken' ? 'hoofdstuk' : 'situatie'}
          populatie={populatie}
          totaal={totaal}
        />
      )}
    </div>
  )
}

function Tab({
  actief, onKies, children,
}: {
  actief: boolean
  onKies: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onKies}
      className={`cursor-pointer rounded-md border px-3 py-1.5 text-[13px] font-semibold ${
        actief
          ? 'border-brand-500 bg-brand-50 text-brand-700'
          : 'border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50'
      }`}
    >
      {children}
    </button>
  )
}

function Secties({
  secties, soort, populatie, totaal,
}: {
  secties: BeheerSectie[]
  soort: 'hoofdstuk' | 'situatie'
  populatie: { kenmerken: string[]; aantal: number }[]
  totaal: number
}) {
  const router = useRouter()
  const { bevestig, vraagTekst, meld } = useDialogen()
  const [bezig, start] = useTransition()

  async function nieuw() {
    const titel = await vraagTekst({
      titel: soort === 'situatie' ? 'Nieuwe situatiekaart' : 'Nieuw hoofdstuk',
      label: 'Titel',
      placeholder: soort === 'situatie' ? 'Bijvoorbeeld: Brand' : 'Bijvoorbeeld: Thuiswerken',
      verplicht: true,
    })
    if (!titel) return
    start(async () => {
      try {
        const id = await maakSectie(soort, titel)
        router.push(`/instellingen/handboek/${id}`)
      } catch (e) {
        await meld({ titel: 'Aanmaken mislukt', omschrijving: String((e as Error).message) })
      }
    })
  }

  async function archiveer(s: BeheerSectie) {
    const ja = await bevestig({
      titel: `“${s.titel}” archiveren?`,
      omschrijving:
        'Het verdwijnt uit het handboek en van de telefoon. De tekst blijft bewaard, dus je kunt het later terughalen.',
      bevestigLabel: 'Archiveren',
      destructief: true,
    })
    if (!ja) return
    start(async () => {
      try {
        await archiveerSectie(s.id)
        router.refresh()
      } catch (e) {
        await meld({ titel: 'Archiveren mislukt', omschrijving: String((e as Error).message) })
      }
    })
  }

  function verplaats(id: string, richting: 'omhoog' | 'omlaag') {
    start(async () => {
      await verplaatsSectie(id, richting)
      router.refresh()
    })
  }

  return (
    <div>
      <div className="flex flex-col gap-1.5">
        {secties.map((s, i) => {
          const zichtbaar = telZichtbaarVoor(s, populatie)
          return (
            <div
              key={s.id}
              className="flex items-start gap-3 rounded-lg border border-neutral-200 bg-white p-3"
            >
              <div className="flex flex-col gap-0.5 pt-0.5">
                <Button
                  variant="ghost" size="icon-sm" aria-label="Omhoog"
                  disabled={i === 0 || bezig}
                  onClick={() => verplaats(s.id, 'omhoog')}
                >
                  <ChevronUp size={15} />
                </Button>
                <Button
                  variant="ghost" size="icon-sm" aria-label="Omlaag"
                  disabled={i === secties.length - 1 || bezig}
                  onClick={() => verplaats(s.id, 'omlaag')}
                >
                  <ChevronDown size={15} />
                </Button>
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/instellingen/handboek/${s.id}`}
                    className="text-[15px] font-bold text-neutral-900 no-underline hover:text-brand-700"
                  >
                    {s.titel}
                  </Link>
                  {s.status === 'concept' && (
                    <Badge tone="warning" size="sm">Concept — nog niet op de telefoon</Badge>
                  )}
                  {zichtbaar === 0 && s.status === 'gepubliceerd' && (
                    <Badge tone="error" size="sm">Niemand ziet dit</Badge>
                  )}
                </div>
                <div className="mt-0.5 text-[12px] text-neutral-500">
                  {s.blokken.length} {s.blokken.length === 1 ? 'onderdeel' : 'onderdelen'}
                  {' · '}
                  {omschrijfZichtbaarheid(s)}
                  {' · '}
                  {zichtbaar} van de {totaal} medewerkers
                </div>
              </div>

              <Button
                variant="ghost" size="icon-sm" aria-label="Archiveren"
                disabled={bezig} onClick={() => archiveer(s)}
              >
                <Trash2 size={15} />
              </Button>
            </div>
          )
        })}
      </div>

      {secties.length === 0 && (
        <p className="py-6 text-center text-[13px] text-neutral-500">
          Nog niets. Voeg het eerste onderdeel toe.
        </p>
      )}

      <Button variant="outline" className="mt-3" disabled={bezig} onClick={nieuw}>
        <Plus size={15} />
        {soort === 'situatie' ? 'Situatiekaart toevoegen' : 'Hoofdstuk toevoegen'}
      </Button>

      <p className="mt-3 text-[12px] text-neutral-500">
        Ongebruikt? Een hoofdstuk op <strong>concept</strong> bestaat niet voor de telefoon. Zo kun
        je rustig schrijven en pas publiceren als het af is.
      </p>
    </div>
  )
}

function Bijlagen({
  bijlagen, werkmaatschappijen, populatie, totaal,
}: {
  bijlagen: (Bijlage & { status: string })[]
  werkmaatschappijen: Kenmerk[]
  populatie: { kenmerken: string[]; aantal: number }[]
  totaal: number
}) {
  const router = useRouter()
  const { bevestig, meld } = useDialogen()
  const [bezig, start] = useTransition()
  const [titel, setTitel] = useState('')
  const [bestand, setBestand] = useState<File | null>(null)

  function upload() {
    if (!bestand) return
    const fd = new FormData()
    fd.set('bestand', bestand)
    fd.set('titel', titel)
    start(async () => {
      try {
        await uploadBijlage(fd)
        setTitel('')
        setBestand(null)
        router.refresh()
      } catch (e) {
        await meld({ titel: 'Uploaden mislukt', omschrijving: String((e as Error).message) })
      }
    })
  }

  async function verwijder(b: Bijlage) {
    const ja = await bevestig({
      titel: `“${b.titel}” verwijderen?`,
      omschrijving: 'Het pdf-bestand wordt echt weggegooid. Dit kun je niet terugdraaien.',
      bevestigLabel: 'Verwijderen',
      destructief: true,
    })
    if (!ja) return
    start(async () => {
      try {
        await verwijderBijlage(b.id)
        router.refresh()
      } catch (e) {
        await meld({ titel: 'Verwijderen mislukt', omschrijving: String((e as Error).message) })
      }
    })
  }

  return (
    <div>
      <div className="flex flex-col gap-2">
        {bijlagen.map((b) => (
          <div key={b.id} className="rounded-lg border border-neutral-200 bg-white p-3">
            <div className="flex items-start gap-3">
              <FileText size={20} className="mt-0.5 shrink-0 text-brand-600" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <a
                    href={bijlageUrl(b.id)} target="_blank" rel="noreferrer"
                    className="text-[15px] font-bold text-neutral-900 no-underline hover:text-brand-700"
                  >
                    {b.titel}
                  </a>
                  {b.status !== 'gepubliceerd' && (
                    <Badge tone="warning" size="sm">
                      {b.status === 'concept' ? 'Concept' : 'Gearchiveerd'}
                    </Badge>
                  )}
                </div>
                <div className="mt-0.5 text-[12px] text-neutral-500">
                  {[b.bestandsnaam, leesbareGrootte(b.grootte)].filter(Boolean).join(' · ')}
                </div>
                <div className="mt-2">
                  <BijlageZichtbaarheid
                    bijlage={b}
                    werkmaatschappijen={werkmaatschappijen}
                    populatie={populatie}
                    totaal={totaal}
                  />
                </div>
              </div>
              <Button
                variant="ghost" size="icon-sm" aria-label="Verwijderen"
                disabled={bezig} onClick={() => verwijder(b)}
              >
                <Trash2 size={15} />
              </Button>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-lg border border-dashed border-neutral-300 p-3">
        <div className="mb-2 text-[13px] font-semibold text-neutral-700">Bijlage toevoegen</div>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            placeholder="Titel (leeg = bestandsnaam)"
            value={titel}
            onChange={(e) => setTitel(e.target.value)}
            className="w-[260px]"
          />
          <input
            type="file"
            accept="application/pdf"
            onChange={(e) => setBestand(e.target.files?.[0] ?? null)}
            className="text-[13px]"
          />
          <Button disabled={!bestand || bezig} onClick={upload}>
            <Download size={15} />
            Uploaden
          </Button>
        </div>
        <p className="mt-2 text-[12px] text-neutral-500">
          Alleen pdf, maximaal 20 MB. Een nieuwe bijlage begint als concept; publiceer hem zodra hij
          klopt. De tekst in een pdf doet niet mee in het zoeken op de telefoon.
        </p>
      </div>
    </div>
  )
}

/** Losse regel zodat elke bijlage zijn eigen niet-bewaarde staat kan hebben. */
function BijlageZichtbaarheid({
  bijlage, werkmaatschappijen, populatie, totaal,
}: {
  bijlage: Bijlage & { status: string }
  werkmaatschappijen: Kenmerk[]
  populatie: { kenmerken: string[]; aantal: number }[]
  totaal: number
}) {
  const router = useRouter()
  const { meld } = useDialogen()
  const [bezig, start] = useTransition()
  const [waarde, setWaarde] = useState({
    zichtbaar_voor: bijlage.zichtbaar_voor,
    verborgen_voor: bijlage.verborgen_voor,
  })
  const [status, setStatus] = useState(bijlage.status)

  const gewijzigd =
    JSON.stringify(waarde.zichtbaar_voor) !== JSON.stringify(bijlage.zichtbaar_voor) ||
    JSON.stringify(waarde.verborgen_voor) !== JSON.stringify(bijlage.verborgen_voor) ||
    status !== bijlage.status

  function bewaar() {
    start(async () => {
      try {
        await bewaarBijlage(bijlage.id, {
          titel: bijlage.titel,
          omschrijving: bijlage.omschrijving,
          status: status as 'concept' | 'gepubliceerd' | 'gearchiveerd',
          ...waarde,
        })
        router.refresh()
      } catch (e) {
        await meld({ titel: 'Opslaan mislukt', omschrijving: String((e as Error).message) })
      }
    })
  }

  return (
    <div>
      {/* Ingeklapt, net als bij de blokken: zeven kenmerken maal twee rijen maakt
          een lijst van drie bijlagen anders schermvullend. */}
      <details>
        <summary className="cursor-pointer text-[12px] text-neutral-500">
          Wie ziet deze bijlage? — {omschrijfZichtbaarheid(bijlage)}
        </summary>
        <div className="mt-1.5">
          <ZichtbaarheidKiezer
            compact
            waarde={waarde}
            werkmaatschappijen={werkmaatschappijen}
            populatie={populatie}
            totaal={totaal}
            onWijzig={setWaarde}
          />
        </div>
      </details>
      <div className="mt-1.5 flex items-center gap-2">
        <select
          className="eva-input"
          style={{ width: 190, padding: '5px 10px', fontSize: 12 }}
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="concept">Concept</option>
          <option value="gepubliceerd">Gepubliceerd</option>
          <option value="gearchiveerd">Gearchiveerd</option>
        </select>
        {gewijzigd && (
          <Button size="sm" disabled={bezig} onClick={bewaar}>
            Bewaren
          </Button>
        )}
      </div>
    </div>
  )
}
