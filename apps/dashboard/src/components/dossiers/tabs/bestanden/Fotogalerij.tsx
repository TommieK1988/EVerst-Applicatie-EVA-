'use client'

/**
 * Fotogalerij van het dossier: alle afbeeldingen uit Bouw7 én SharePoint bij elkaar.
 *
 * Deze bestanden staan bewust niet óók in de bestandenlijst — een regel
 * `IMG_20260714_113052.jpg` zegt niets, de foto zelf wel.
 *
 * Opzet: één grote preview met pijlen erop, en daaronder de bestandsnamen als
 * navigatie. Een raster met postzegels is bij bouwfoto's weinig waard — details als
 * scheurvorming of houtrot zie je pas op formaat. Vanuit de preview ga je door naar
 * volledig scherm.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Card, CardHeader, CardBody } from '@/components/ui'
import { ChevronLeft, ChevronRight, X, Download, ExternalLink, Maximize2, Minimize2 } from 'lucide-react'
import { bestandUrl, formatteerGrootte, type BestandRij } from '@/lib/dossiers/bestand-rijen'

/** De preview vult een halve kolom; op een scherm met hoge resolutie is 1200 scherp genoeg. */
const PREVIEW_BREEDTE = 1200
const GROOT_BREEDTE = 1800

/** Pijl over de foto. Halfdoorzichtig zwart werkt op zowel lichte als donkere foto's. */
function Pijl({ kant, onClick, titel, groot }: {
  kant: 'links' | 'rechts'
  onClick: () => void
  titel: string
  groot?: boolean
}) {
  const Icoon = kant === 'links' ? ChevronLeft : ChevronRight
  const maat = groot ? 'h-11 w-11' : 'h-9 w-9'
  const icoonMaat = groot ? 'h-6 w-6' : 'h-5 w-5'
  return (
    <button
      onClick={onClick}
      title={titel}
      aria-label={titel}
      className={`absolute top-1/2 ${kant === 'links' ? 'left-2' : 'right-2'} ${maat} -translate-y-1/2 grid place-items-center rounded-full bg-black/45 text-white shadow-sm transition-colors hover:bg-black/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70`}
    >
      <Icoon className={icoonMaat} />
    </button>
  )
}

/* ─── Preview ─────────────────────────────────────────────────────────────── */

function Preview({ foto, index, totaal, onVorige, onVolgende, onVergroot }: {
  foto: BestandRij
  index: number
  totaal: number
  onVorige: () => void
  onVolgende: () => void
  onVergroot: () => void
}) {
  const [mislukt, setMislukt] = useState(false)
  const src = bestandUrl(foto, { breedte: PREVIEW_BREEDTE })

  useEffect(() => { setMislukt(false) }, [src])

  return (
    <div className="relative aspect-[4/3] overflow-hidden rounded-lg border border-neutral-200 bg-neutral-100">
      {mislukt ? (
        <div className="grid h-full w-full place-items-center px-4 text-center text-[12px] text-neutral-400">
          Deze afbeelding kon niet geladen worden.
        </div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={foto.naam}
          onError={() => setMislukt(true)}
          onClick={onVergroot}
          className="h-full w-full cursor-zoom-in object-contain"
        />
      )}

      {totaal > 1 && (
        <>
          <Pijl kant="links" onClick={onVorige} titel="Vorige foto" />
          <Pijl kant="rechts" onClick={onVolgende} titel="Volgende foto" />
        </>
      )}

      <button
        onClick={onVergroot}
        title="Volledig scherm"
        aria-label="Volledig scherm"
        className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-md bg-black/45 text-white transition-colors hover:bg-black/70"
      >
        <Maximize2 className="h-4 w-4" />
      </button>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-3 pb-2 pt-8">
        <p className="truncate text-[12px] font-medium text-white">{foto.naam}</p>
        <p className="text-[10.5px] text-white/70">
          {index + 1} van {totaal} · {foto.bron}
          {foto.datum ? ` · ${foto.datum}` : ''}
        </p>
      </div>
    </div>
  )
}

/* ─── Volledig scherm ─────────────────────────────────────────────────────── */

function Lightbox({ fotos, index, onIndex, onClose }: {
  fotos: BestandRij[]
  index: number
  onIndex: (i: number) => void
  onClose: () => void
}) {
  const foto = fotos[index]
  const wortel = useRef<HTMLDivElement>(null)
  const [echtVolledig, setEchtVolledig] = useState(false)

  const vorige = useCallback(() => onIndex((index - 1 + fotos.length) % fotos.length), [index, fotos.length, onIndex])
  const volgende = useCallback(() => onIndex((index + 1) % fotos.length), [index, fotos.length, onIndex])

  useEffect(() => {
    const opToets = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.fullscreenElement) onClose()
      else if (e.key === 'ArrowLeft') vorige()
      else if (e.key === 'ArrowRight') volgende()
    }
    const opWissel = () => setEchtVolledig(!!document.fullscreenElement)

    window.addEventListener('keydown', opToets)
    document.addEventListener('fullscreenchange', opWissel)
    // Achtergrond niet laten meescrollen zolang de foto vol in beeld staat.
    const vorigeOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      window.removeEventListener('keydown', opToets)
      document.removeEventListener('fullscreenchange', opWissel)
      document.body.style.overflow = vorigeOverflow
      // Sluiten terwijl de browser nog in volledig scherm staat laat een leeg
      // zwart scherm achter; eerst netjes terug.
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
    }
  }, [onClose, vorige, volgende])

  function wisselEchtVolledig() {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
    else wortel.current?.requestFullscreen().catch(() => {})
  }

  if (!foto || typeof document === 'undefined') return null

  return createPortal(
    <div
      ref={wortel}
      role="dialog"
      aria-modal="true"
      aria-label={foto.naam}
      className="fixed inset-0 z-[60] flex flex-col bg-neutral-950/95 backdrop-blur-sm"
    >
      <div className="flex shrink-0 items-center justify-between gap-4 px-4 py-3 text-white">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium">{foto.naam}</p>
          <p className="text-[11px] text-white/55">
            {index + 1} van {fotos.length} · {foto.bron}
            {foto.datum ? ` · ${foto.datum}` : ''}
            {foto.grootte ? ` · ${formatteerGrootte(foto.grootte)}` : ''}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={wisselEchtVolledig}
            title={echtVolledig ? 'Terug uit volledig scherm' : 'Beeldvullend (zonder browserbalken)'}
            className="grid h-8 w-8 place-items-center rounded-md text-white/70 hover:bg-white/10 hover:text-white"
          >
            {echtVolledig ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
          {foto.openUrl && (
            <a
              href={foto.openUrl}
              target="_blank"
              rel="noopener noreferrer"
              title="Openen in de bron"
              className="grid h-8 w-8 place-items-center rounded-md text-white/70 hover:bg-white/10 hover:text-white"
            >
              <ExternalLink className="h-4 w-4" />
            </a>
          )}
          <a
            href={bestandUrl(foto, { download: true })}
            title="Downloaden"
            className="grid h-8 w-8 place-items-center rounded-md text-white/70 hover:bg-white/10 hover:text-white"
          >
            <Download className="h-4 w-4" />
          </a>
          <button
            onClick={onClose}
            title="Sluiten (Esc)"
            className="grid h-8 w-8 place-items-center rounded-md text-white/70 hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center px-16 pb-6">
        {fotos.length > 1 && <Pijl kant="links" onClick={vorige} titel="Vorige (←)" groot />}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          key={foto.sleutel}
          src={bestandUrl(foto, { breedte: GROOT_BREEDTE })}
          alt={foto.naam}
          className="max-h-full max-w-full rounded-md object-contain"
        />
        {fotos.length > 1 && <Pijl kant="rechts" onClick={volgende} titel="Volgende (→)" groot />}
      </div>
    </div>,
    document.body,
  )
}

/* ─── Galerij ─────────────────────────────────────────────────────────────── */

export default function Fotogalerij({ fotos }: { fotos: BestandRij[] }) {
  const [huidige, setHuidige] = useState(0)
  const [vergroot, setVergroot] = useState(false)

  // Verandert de fotolijst (upload, andere map gekoppeld), dan kan de index
  // buiten bereik vallen.
  const index = Math.min(huidige, Math.max(0, fotos.length - 1))
  const foto = fotos[index]

  const vorige = () => setHuidige((index - 1 + fotos.length) % fotos.length)
  const volgende = () => setHuidige((index + 1) % fotos.length)

  // Het blok blijft staan als er niets is: de vaste plek naast de bestandenlijst
  // maakt duidelijk dát er foto's kunnen zijn, in plaats van dat het onderdeel
  // ontbreekt en je je afvraagt of je iets mist.
  if (fotos.length === 0 || !foto) {
    return (
      <Card>
        <CardHeader>Foto&apos;s</CardHeader>
        <CardBody>
          <div className="grid aspect-[4/3] place-items-center rounded-lg border border-dashed border-neutral-200 bg-neutral-50 px-4 text-center text-[12.5px] text-neutral-500">
            Geen foto&apos;s beschikbaar.
          </div>
        </CardBody>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <span>Foto&apos;s</span>
          <span className="text-[11px] font-normal text-neutral-400">
            {fotos.length} afbeelding{fotos.length === 1 ? '' : 'en'}
          </span>
        </div>
      </CardHeader>
      <CardBody>
        <Preview
          foto={foto}
          index={index}
          totaal={fotos.length}
          onVorige={vorige}
          onVolgende={volgende}
          onVergroot={() => setVergroot(true)}
        />

        {/* Bestandsnamen als navigatie: klikken zet de preview op die foto. */}
        <div className="mt-3 border-t border-neutral-100 pt-2">
          <div className="max-h-[196px] overflow-y-auto">
            {fotos.map((f, i) => (
              <button
                key={f.sleutel}
                onClick={() => setHuidige(i)}
                onDoubleClick={() => { setHuidige(i); setVergroot(true) }}
                title={f.naam}
                className={`flex w-full items-center gap-2 rounded px-1.5 py-[3px] text-left text-[11.5px] ${
                  i === index ? 'bg-brand-50 font-medium text-brand-700' : 'text-neutral-700 hover:bg-neutral-50'
                }`}
              >
                <span className="min-w-0 flex-1 truncate">{f.naam}</span>
                <span className="shrink-0 text-[10px] text-neutral-400">{f.bron}</span>
                <span className="shrink-0 tabular-nums text-[10px] text-neutral-400">{f.datum ?? ''}</span>
                <span className="shrink-0 tabular-nums text-[10px] text-neutral-400">{formatteerGrootte(f.grootte)}</span>
              </button>
            ))}
          </div>
        </div>
      </CardBody>

      {vergroot && (
        <Lightbox fotos={fotos} index={index} onIndex={setHuidige} onClose={() => setVergroot(false)} />
      )}
    </Card>
  )
}
