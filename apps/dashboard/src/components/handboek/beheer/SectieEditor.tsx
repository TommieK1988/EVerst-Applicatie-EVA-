'use client'

import React, { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { ChevronUp, ChevronDown, Plus, Trash2, Eye } from 'lucide-react'
import { Badge, Button, Input, Textarea, useDialogen } from '@/components/ui'
import { leegBlok, soortenVoor } from '@/lib/handboek/blokken'
import { sectiePad } from '@/lib/handboek/paden'
import type { BeheerSectie } from '@/lib/handboek/beheer'
import type { BlokType } from '@/lib/handboek/types'
import type { Zichtbaarheid } from '@/lib/handboek/kenmerken'
import { bewaarBlokken, bewaarSectie } from '@/app/(platform)/instellingen/handboek/actions'
import ZichtbaarheidKiezer from './ZichtbaarheidKiezer'

type Kenmerk = { key: string; label: string }

type BlokConcept = Zichtbaarheid & {
  id: string
  type: BlokType
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  inhoud: any
  status: 'concept' | 'gepubliceerd'
}

/**
 * Eén hoofdstuk of situatiekaart bewerken.
 *
 * Alles op dit scherm wordt met één knop bewaard, en niet per alinea. Je kunt
 * hier namelijk invoegen, herordenen en weggooien vóór je opslaat — dan is
 * "dit is de nieuwe inhoud van dit hoofdstuk" de enige formulering die niet
 * halverwege kan stranden. Bestaande blokken houden hun id, want daar hangen
 * de deeplinks uit de zoekresultaten aan.
 */
export default function SectieEditor({
  sectie, werkmaatschappijen, populatie, totaal,
}: {
  sectie: BeheerSectie
  werkmaatschappijen: Kenmerk[]
  populatie: { kenmerken: string[]; aantal: number }[]
  totaal: number
}) {
  const router = useRouter()
  const { bevestig } = useDialogen()
  const [bezig, start] = useTransition()

  const [titel, setTitel] = useState(sectie.titel)
  const [samenvatting, setSamenvatting] = useState(sectie.samenvatting ?? '')
  const [status, setStatus] = useState<'concept' | 'gepubliceerd'>(
    sectie.status === 'gepubliceerd' ? 'gepubliceerd' : 'concept',
  )
  const [zichtbaarheid, setZichtbaarheid] = useState<Zichtbaarheid>({
    zichtbaar_voor: sectie.zichtbaar_voor,
    verborgen_voor: sectie.verborgen_voor,
  })
  const [blokken, setBlokken] = useState<BlokConcept[]>(
    sectie.blokken.map((b) => ({
      id: b.id,
      type: b.type,
      inhoud: b.inhoud ?? {},
      status: (b.status === 'gepubliceerd' ? 'gepubliceerd' : 'concept') as 'concept' | 'gepubliceerd',
      zichtbaar_voor: b.zichtbaar_voor,
      verborgen_voor: b.verborgen_voor,
    })),
  )

  function wijzigBlok(id: string, patch: Partial<BlokConcept>) {
    setBlokken((huidig) => huidig.map((b) => (b.id === id ? { ...b, ...patch } : b)))
  }

  function voegToe(type: BlokType) {
    setBlokken((huidig) => [
      ...huidig,
      {
        // Het id wordt hier gemaakt en niet door de database: zo kan de editor
        // herordenen en bewaren zonder eerst een rondje langs de server.
        id: crypto.randomUUID(),
        type,
        inhoud: leegBlok(type),
        status: 'gepubliceerd',
        zichtbaar_voor: [],
        verborgen_voor: [],
      },
    ])
  }

  function verplaats(index: number, richting: -1 | 1) {
    setBlokken((huidig) => {
      const doel = index + richting
      if (doel < 0 || doel >= huidig.length) return huidig
      const kopie = [...huidig]
      ;[kopie[index], kopie[doel]] = [kopie[doel], kopie[index]]
      return kopie
    })
  }

  async function verwijder(id: string) {
    const ja = await bevestig({
      titel: 'Dit onderdeel verwijderen?',
      omschrijving: 'Het verdwijnt zodra je het hoofdstuk bewaart.',
      bevestigLabel: 'Verwijderen',
      destructief: true,
    })
    if (ja) setBlokken((huidig) => huidig.filter((b) => b.id !== id))
  }

  function bewaarAlles() {
    start(async () => {
      try {
        await bewaarSectie(sectie.id, {
          titel,
          samenvatting: samenvatting || null,
          icoon: sectie.icoon,
          status,
          ...zichtbaarheid,
        })
        await bewaarBlokken(sectie.id, blokken)
        toast.success('Bewaard')
        router.refresh()
      } catch (e) {
        toast.error(String((e as Error).message))
      }
    })
  }

  const soorten = soortenVoor(sectie.soort)

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <Link href="/instellingen/handboek" className="eva-back-link">
          Terug naar het handboek
        </Link>
        {status === 'gepubliceerd' && (
          <Link
            href={sectiePad(sectie)}
            target="_blank"
            className="inline-flex items-center gap-1.5 text-[13px] text-neutral-500 no-underline hover:text-brand-700"
          >
            <Eye size={14} />
            Bekijk op de telefoon
          </Link>
        )}
      </div>

      {/* ── Kop van het hoofdstuk ───────────────────────────────────── */}
      <div className="mb-5 rounded-lg border border-neutral-200 p-3">
        <label className="mb-1 block text-[12px] font-semibold text-neutral-600">Titel</label>
        <Input value={titel} onChange={(e) => setTitel(e.target.value)} className="mb-3 w-full" />

        <label className="mb-1 block text-[12px] font-semibold text-neutral-600">
          Korte toelichting <span className="font-normal text-neutral-400">(optioneel)</span>
        </label>
        <Textarea
          value={samenvatting}
          onChange={(e) => setSamenvatting(e.target.value)}
          rows={2}
          className="mb-3 w-full"
          placeholder="Eén regel die onder de titel komt te staan."
        />

        <ZichtbaarheidKiezer
          waarde={zichtbaarheid}
          werkmaatschappijen={werkmaatschappijen}
          populatie={populatie}
          totaal={totaal}
          onWijzig={setZichtbaarheid}
        />

        <div className="mt-3 flex items-center gap-2">
          <label className="text-[12px] font-semibold text-neutral-600">Status</label>
          <select
            className="eva-input h-7 w-[190px] text-[12px]"
            value={status}
            onChange={(e) => setStatus(e.target.value as 'concept' | 'gepubliceerd')}
          >
            <option value="concept">Concept — niet op de telefoon</option>
            <option value="gepubliceerd">Gepubliceerd</option>
          </select>
        </div>
      </div>

      {/* ── Blokken ─────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-2">
        {blokken.map((blok, i) => (
          <div key={blok.id} className="rounded-lg border border-neutral-200 p-3">
            <div className="mb-2 flex items-center gap-2">
              <Badge tone="neutral" size="sm">
                {soorten.find((s) => s.type === blok.type)?.label ?? blok.type}
              </Badge>
              {blok.status === 'concept' && (
                <Badge tone="warning" size="sm">Concept</Badge>
              )}
              <div className="ml-auto flex items-center gap-0.5">
                <Button
                  variant="ghost" size="icon-sm" aria-label="Omhoog"
                  disabled={i === 0} onClick={() => verplaats(i, -1)}
                >
                  <ChevronUp size={15} />
                </Button>
                <Button
                  variant="ghost" size="icon-sm" aria-label="Omlaag"
                  disabled={i === blokken.length - 1} onClick={() => verplaats(i, 1)}
                >
                  <ChevronDown size={15} />
                </Button>
                <Button
                  variant="ghost" size="icon-sm" aria-label="Verwijderen"
                  onClick={() => verwijder(blok.id)}
                >
                  <Trash2 size={15} />
                </Button>
              </div>
            </div>

            <BlokVeld blok={blok} onWijzig={(inhoud) => wijzigBlok(blok.id, { inhoud })} />

            <details className="mt-2">
              <summary className="cursor-pointer text-[12px] text-neutral-500">
                Wie ziet deze alinea?
              </summary>
              <div className="mt-1.5">
                <ZichtbaarheidKiezer
                  compact
                  waarde={blok}
                  werkmaatschappijen={werkmaatschappijen}
                  populatie={populatie}
                  totaal={totaal}
                  onWijzig={(nieuw) => wijzigBlok(blok.id, nieuw)}
                />
              </div>
            </details>
          </div>
        ))}
      </div>

      {blokken.length === 0 && (
        <p className="py-6 text-center text-[13px] text-neutral-500">
          Nog geen inhoud. Voeg hieronder het eerste onderdeel toe.
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-1.5">
        {soorten.map((s) => (
          <Button key={s.type} variant="outline" size="sm" title={s.uitleg} onClick={() => voegToe(s.type)}>
            <Plus size={14} />
            {s.label}
          </Button>
        ))}
      </div>

      {/* Onderaan en meelopend: bij een hoofdstuk van dertig alinea's wil je
          niet terugscrollen om te bewaren. */}
      <div className="sticky bottom-0 mt-6 flex items-center gap-3 border-t border-neutral-200 bg-white py-3">
        <Button loading={bezig} onClick={bewaarAlles}>Bewaren</Button>
        <span className="text-[12px] text-neutral-500">
          Lege onderdelen worden niet bewaard.
        </span>
      </div>
    </div>
  )
}

/** Het invoerveld dat bij dit bloktype hoort. */
function BlokVeld({
  blok, onWijzig,
}: {
  blok: BlokConcept
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onWijzig: (inhoud: any) => void
}) {
  const i = blok.inhoud ?? {}

  if (blok.type === 'kop') {
    return (
      <Input
        value={i.tekst ?? ''}
        onChange={(e) => onWijzig({ ...i, tekst: e.target.value })}
        placeholder="Tussenkop"
        className="w-full font-semibold"
      />
    )
  }

  if (blok.type === 'lijst') {
    const items: string[] = i.items ?? ['']
    return (
      <div>
        <div className="mb-1.5 flex items-center gap-2">
          <select
            className="eva-input h-7 w-[130px] text-[12px]"
            value={i.stijl ?? 'bullet'}
            onChange={(e) => onWijzig({ ...i, stijl: e.target.value })}
          >
            <option value="bullet">Opsomming</option>
            <option value="nummer">Genummerd</option>
          </select>
        </div>
        {items.map((item, n) => (
          <div key={n} className="mb-1 flex items-center gap-1.5">
            <span className="w-4 shrink-0 text-center text-[12px] text-neutral-400">
              {i.stijl === 'nummer' ? `${n + 1}.` : '•'}
            </span>
            <Input
              value={item}
              onChange={(e) => {
                const kopie = [...items]
                kopie[n] = e.target.value
                onWijzig({ ...i, items: kopie })
              }}
              className="flex-1"
            />
            <Button
              variant="ghost" size="icon-sm" aria-label="Regel weg"
              onClick={() => onWijzig({ ...i, items: items.filter((_, k) => k !== n) })}
            >
              <Trash2 size={14} />
            </Button>
          </div>
        ))}
        <Button variant="ghost" size="sm" onClick={() => onWijzig({ ...i, items: [...items, ''] })}>
          <Plus size={14} /> Regel
        </Button>
      </div>
    )
  }

  if (blok.type === 'tabel') {
    const kolommen: string[] = i.kolommen ?? []
    const rijen: string[][] = i.rijen ?? [['', '']]
    const breedte = Math.max(kolommen.length, ...rijen.map((r) => r.length), 2)

    const zetRij = (n: number, k: number, waarde: string) => {
      const kopie = rijen.map((r) => [...r])
      while (kopie[n].length < breedte) kopie[n].push('')
      kopie[n][k] = waarde
      onWijzig({ ...i, rijen: kopie })
    }

    return (
      <div>
        <p className="mb-1.5 text-[12px] text-neutral-500">
          Op de telefoon wordt dit een kaartje per rij; de eerste kolom is het kopje.
        </p>
        <div className="mb-1 flex gap-1">
          {Array.from({ length: breedte }).map((_, k) => (
            <Input
              key={k}
              value={kolommen[k] ?? ''}
              onChange={(e) => {
                const kopie = [...kolommen]
                while (kopie.length < breedte) kopie.push('')
                kopie[k] = e.target.value
                onWijzig({ ...i, kolommen: kopie })
              }}
              placeholder={`Kolomkop ${k + 1}`}
              className="flex-1 text-[12px]"
            />
          ))}
          <span className="w-7 shrink-0" />
        </div>
        {rijen.map((rij, n) => (
          <div key={n} className="mb-1 flex gap-1">
            {Array.from({ length: breedte }).map((_, k) => (
              <Input
                key={k}
                value={rij[k] ?? ''}
                onChange={(e) => zetRij(n, k, e.target.value)}
                className="flex-1"
              />
            ))}
            <Button
              variant="ghost" size="icon-sm" aria-label="Rij weg"
              onClick={() => onWijzig({ ...i, rijen: rijen.filter((_, m) => m !== n) })}
            >
              <Trash2 size={14} />
            </Button>
          </div>
        ))}
        <div className="flex gap-1.5">
          <Button
            variant="ghost" size="sm"
            onClick={() => onWijzig({ ...i, rijen: [...rijen, Array(breedte).fill('')] })}
          >
            <Plus size={14} /> Rij
          </Button>
          <Button
            variant="ghost" size="sm"
            onClick={() =>
              onWijzig({
                ...i,
                kolommen: [...kolommen, ''],
                rijen: rijen.map((r) => [...r, '']),
              })
            }
          >
            <Plus size={14} /> Kolom
          </Button>
        </div>
      </div>
    )
  }

  // tekst, stap en let-op delen hetzelfde veld.
  return (
    <Textarea
      value={i.tekst ?? ''}
      onChange={(e) => onWijzig({ ...i, tekst: e.target.value })}
      rows={blok.type === 'stap' ? 2 : 4}
      className="w-full"
      placeholder={
        blok.type === 'stap'
          ? 'Wat moet iemand doen?'
          : blok.type === 'let-op'
            ? 'Waar moet iemand op letten?'
            : 'Tekst van deze alinea'
      }
    />
  )
}
