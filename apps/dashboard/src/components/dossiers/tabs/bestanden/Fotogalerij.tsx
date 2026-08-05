'use client'

/**
 * Fotogalerij van het dossier: alle afbeeldingen uit Bouw7 én SharePoint bij elkaar.
 *
 * Deze bestanden staan bewust niet óók in de bestandenlijst — een lijst met dertig
 * regels `IMG_20260714_113052.jpg` zegt niets, een raster met de foto's zelf wel.
 *
 * Thumbnails: SharePoint levert er zelf een; voor Bouw7 verkleint de EVA-proxy de
 * foto. Zonder dat zou een galerij van telefoonfoto's tientallen megabytes kosten.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Card, CardHeader, CardBody } from '@/components/ui'
import { ChevronLeft, ChevronRight, X, Download, ExternalLink, Maximize2, Minimize2 } from 'lucide-react'
import { bestandUrl, formatteerGrootte, type BestandRij } from '@/lib/dossiers/bestand-rijen'

/** Vakjes in de halve kolom zijn ~116px, in volledig scherm ~210px; ×2 voor scherpte. */
const THUMB_BREEDTE = 320
const THUMB_BREEDTE_GROOT = 480
const GROOT_BREEDTE = 1800

/**
 * Thumbnail met terugval: de SharePoint-thumbnail-URL van Graph verloopt na ongeveer
 * een uur. Blijft het scherm langer openstaan, dan pakt de EVA-proxy het over.
 *
 * In volledig scherm gebruiken we die Graph-thumbnail niet: die is ~176px breed en
 * wordt zichtbaar zacht in een groot vakje. Dan verkleint de eigen proxy zelf.
 */
function Thumb({ rij, groot }: { rij: BestandRij; groot: boolean }) {
  const eigenUrl = bestandUrl(rij, { breedte: groot ? THUMB_BREEDTE_GROOT : THUMB_BREEDTE })
  const voorkeur = groot ? eigenUrl : (rij.thumbUrl ?? eigenUrl)
  const [src, setSrc] = useState(voorkeur)
  const [mislukt, setMislukt] = useState(false)

  useEffect(() => {
    setSrc(voorkeur)
    setMislukt(false)
  }, [voorkeur])

  if (mislukt) {
    return (
      <div className="grid h-full w-full place-items-center bg-neutral-100 px-2 text-center text-[10px] text-neutral-400">
        Geen voorbeeld
      </div>
    )
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={rij.naam}
      loading="lazy"
      onError={() => (src === eigenUrl ? setMislukt(true) : setSrc(eigenUrl))}
      className="h-full w-full bg-neutral-100 object-cover transition-transform duration-200 group-hover:scale-[1.04]"
    />
  )
}

function Lightbox({ fotos, index, onIndex, onClose, container }: {
  fotos: BestandRij[]
  index: number
  onIndex: (i: number) => void
  onClose: () => void
  /** Waar de overlay in hangt — in volledig scherm is dat de galerij zelf, anders de pagina. */
  container: HTMLElement | null
}) {
  const foto = fotos[index]

  const vorige = useCallback(() => onIndex((index - 1 + fotos.length) % fotos.length), [index, fotos.length, onIndex])
  const volgende = useCallback(() => onIndex((index + 1) % fotos.length), [index, fotos.length, onIndex])

  useEffect(() => {
    const opToets = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowLeft') vorige()
      else if (e.key === 'ArrowRight') volgende()
    }
    window.addEventListener('keydown', opToets)
    // Achtergrond niet laten meescrollen zolang de foto vol in beeld staat.
    const vorigeOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', opToets)
      document.body.style.overflow = vorigeOverflow
    }
  }, [onClose, vorige, volgende])

  // In een portal: de kaart eromheen klipt zijn inhoud, en de foto moet vol in beeld.
  // Staat de galerij in volledig scherm, dan is alles buiten dat element onzichtbaar —
  // de overlay moet er dan binnenin hangen in plaats van in de body.
  if (!foto || !container) return null

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={foto.naam}
      onClick={onClose}
      className="fixed inset-0 z-[60] flex flex-col bg-neutral-950/92 backdrop-blur-sm"
    >
      <div
        onClick={e => e.stopPropagation()}
        className="flex shrink-0 items-center justify-between gap-4 px-4 py-3 text-white"
      >
        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium">{foto.naam}</p>
          <p className="text-[11px] text-white/55">
            {index + 1} van {fotos.length} · {foto.bron}
            {foto.datum ? ` · ${foto.datum}` : ''}
            {foto.grootte ? ` · ${formatteerGrootte(foto.grootte)}` : ''}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
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

      <div onClick={e => e.stopPropagation()} className="relative flex min-h-0 flex-1 items-center justify-center px-14 pb-6">
        {fotos.length > 1 && (
          <button
            onClick={vorige}
            title="Vorige (←)"
            className="absolute left-3 grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
        )}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          key={foto.sleutel}
          src={bestandUrl(foto, { breedte: GROOT_BREEDTE })}
          alt={foto.naam}
          className="max-h-full max-w-full rounded-md object-contain"
        />
        {fotos.length > 1 && (
          <button
            onClick={volgende}
            title="Volgende (→)"
            className="absolute right-3 grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        )}
      </div>
    </div>,
    container,
  )
}

const EERSTE_TONEN = 18

export default function Fotogalerij({ fotos }: { fotos: BestandRij[] }) {
  const [open, setOpen] = useState<number | null>(null)
  const [allesTonen, setAllesTonen] = useState(false)
  const [volledigScherm, setVolledigScherm] = useState(false)
  const kaart = useRef<HTMLDivElement>(null)

  // De browser kan volledig scherm ook zelf beëindigen (Esc, tab wisselen), dus de
  // knopstand volgt de browser in plaats van andersom.
  useEffect(() => {
    const opWissel = () => setVolledigScherm(document.fullscreenElement === kaart.current)
    document.addEventListener('fullscreenchange', opWissel)
    return () => document.removeEventListener('fullscreenchange', opWissel)
  }, [])

  function wisselVolledigScherm() {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
    else kaart.current?.requestFullscreen().catch(() => {})
  }

  if (fotos.length === 0) return null

  // In volledig scherm is er ruimte zat: alle foto's tonen, en groter.
  const zichtbaar = allesTonen || volledigScherm ? fotos : fotos.slice(0, EERSTE_TONEN)
  const verborgen = fotos.length - zichtbaar.length

  return (
    <Card ref={kaart} className={volledigScherm ? 'overflow-y-auto rounded-none' : undefined}>
      {/* In volledig scherm scrolt de kaart zelf; de kop blijft staan zodat de
          knop om eruit te gaan altijd bereikbaar is. */}
      <CardHeader className={volledigScherm ? 'sticky top-0 z-10 bg-white pb-3' : undefined}>
        <div className="flex items-center justify-between">
          <span>Foto&apos;s</span>
          <span className="flex items-center gap-2.5">
            <span className="text-[11px] font-normal text-neutral-400">
              {fotos.length} afbeelding{fotos.length === 1 ? '' : 'en'}
            </span>
            <button
              onClick={wisselVolledigScherm}
              title={volledigScherm ? 'Volledig scherm verlaten' : 'Volledig scherm'}
              className="grid h-6 w-6 place-items-center rounded text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
            >
              {volledigScherm ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            </button>
          </span>
        </div>
      </CardHeader>
      <CardBody>
        <div className={`grid gap-2 ${
          volledigScherm
            ? 'grid-cols-[repeat(auto-fill,minmax(210px,1fr))]'
            : 'grid-cols-[repeat(auto-fill,minmax(116px,1fr))]'
        }`}>
          {zichtbaar.map((foto, i) => (
            <button
              key={foto.sleutel}
              onClick={() => setOpen(i)}
              title={foto.naam}
              className="group relative aspect-square overflow-hidden rounded-md border border-neutral-200 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand-100"
            >
              <Thumb rij={foto} groot={volledigScherm} />
              <span className="pointer-events-none absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/70 to-transparent px-1.5 pb-1 pt-4 text-left text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100">
                {foto.naam}
              </span>
            </button>
          ))}
        </div>

        {verborgen > 0 && (
          <button
            onClick={() => setAllesTonen(true)}
            className="mt-3 text-[11.5px] font-medium text-brand-600 hover:underline"
          >
            Nog {verborgen} foto{verborgen === 1 ? '' : "'s"} tonen
          </button>
        )}

        {/* Bestandsnamen onder het raster. Op een thumbnail zie je wát het is, hier
            wélk bestand het is — en je klikt van hieruit dezelfde foto open. De lijst
            toont altijd alle foto's, ook als het raster er nog een deel achterhoudt. */}
        <div className="mt-3 border-t border-neutral-100 pt-2">
          <div className={`overflow-y-auto ${volledigScherm ? 'max-h-[38vh]' : 'max-h-[196px]'}`}>
            {fotos.map((foto, i) => (
              <button
                key={foto.sleutel}
                onClick={() => setOpen(i)}
                title={foto.naam}
                className={`flex w-full items-center gap-2 rounded px-1.5 py-[3px] text-left text-[11.5px] ${
                  open === i ? 'bg-brand-50 text-brand-700' : 'text-neutral-700 hover:bg-neutral-50'
                }`}
              >
                <span className="min-w-0 flex-1 truncate">{foto.naam}</span>
                <span className="shrink-0 text-[10px] text-neutral-400">{foto.bron}</span>
                <span className="shrink-0 tabular-nums text-[10px] text-neutral-400">{foto.datum ?? ''}</span>
                <span className="shrink-0 tabular-nums text-[10px] text-neutral-400">{formatteerGrootte(foto.grootte)}</span>
              </button>
            ))}
          </div>
        </div>
      </CardBody>

      {open != null && (
        <Lightbox
          fotos={fotos}
          index={open}
          onIndex={setOpen}
          onClose={() => setOpen(null)}
          container={volledigScherm ? kaart.current : (typeof document === 'undefined' ? null : document.body)}
        />
      )}
    </Card>
  )
}
