'use client'

/**
 * Uploaden naar de SharePoint-dossiermap vanaf de Bestanden-tab: slepen en neerzetten
 * én kiezen via een knop. Bouw7-bestanden zijn in EVA read-only, en de dossiermap is
 * de plek waar collega's stukken bewaren; bestaat die map nog niet, dan maakt de
 * server-action hem aan.
 *
 * Sinds de lijst submappen toont kun je ook ín een map uploaden. Waar je loslaat lezen
 * we af aan het dichtstbijzijnde `data-map-pad` onder de muis: zo hoeven de regels zelf
 * niets van slepen te weten. Geen attribuut = de dossiermap zelf.
 */

import React, { useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { mapLabel } from '@/lib/dossiers/bestand-boom'
import {
  getDossierSharePointBestanden,
  uploadDossierBestandenNaarSharePoint,
  type DossierSharePointData,
} from '@/lib/dossiers/sharepoint-bestanden'

/**
 * Uploaden loopt via een server-action, en die heeft een maximale payload
 * (`serverActions.bodySizeLimit` in next.config.js, nu 8 MB). Eén sleepactie met tien
 * foto's gaat daar zo overheen, dus we versturen in groepen die eronder blijven.
 * De marge is voor de multipart-overhead.
 */
const MAX_BESTAND_BYTES = 7 * 1024 * 1024
const MAX_GROEP_BYTES = 6 * 1024 * 1024

function maakGroepen(bestanden: File[]): File[][] {
  const groepen: File[][] = []
  let huidige: File[] = []
  let omvang = 0

  for (const b of bestanden) {
    if (huidige.length && omvang + b.size > MAX_GROEP_BYTES) {
      groepen.push(huidige)
      huidige = []
      omvang = 0
    }
    huidige.push(b)
    omvang += b.size
  }
  if (huidige.length) groepen.push(huidige)
  return groepen
}

/** Pad van de map onder de muis; '' = de dossiermap zelf. */
function doelVan(e: React.DragEvent): string {
  const el = e.target instanceof Element ? e.target.closest('[data-map-pad]') : null
  return el?.getAttribute('data-map-pad') ?? ''
}

const waarheen = (pad: string) => (pad ? `de map "${mapLabel(pad)}"` : 'SharePoint')

export function useDossierUpload({ dossierId, kanUploaden, onVernieuwd }: {
  dossierId: string
  kanUploaden: boolean
  /** Na een upload: de verse inhoud van de dossiermap, en de map waarin is geüpload. */
  onVernieuwd: (data: DossierSharePointData, pad: string) => void
}) {
  const [sleept, setSleept] = useState(false)
  const [sleepDoel, setSleepDoel] = useState('')
  const [uploadt, setUploadt] = useState(false)
  const [voortgang, setVoortgang] = useState({ klaar: 0, totaal: 0 })
  // Elk kind-element vuurt zijn eigen dragenter/dragleave; tellen voorkomt geflikker.
  const sleepDiepte = useRef(0)
  const kiezer = useRef<HTMLInputElement>(null)
  // De knop die de bestandskiezer opende bepaalt de map.
  const kiesDoel = useRef('')

  // Slepen binnen de pagina zelf (een foto uit de galerij, geselecteerde tekst) is geen
  // upload. `dragstart` vuurt alleen voor sleepacties die in dit document beginnen.
  const sleeptVanuitPagina = useRef(false)
  useEffect(() => {
    const start = () => { sleeptVanuitPagina.current = true }
    const eind = () => { sleeptVanuitPagina.current = false }
    window.addEventListener('dragstart', start)
    window.addEventListener('dragend', eind)
    window.addEventListener('drop', eind)
    return () => {
      window.removeEventListener('dragstart', start)
      window.removeEventListener('dragend', eind)
      window.removeEventListener('drop', eind)
    }
  }, [])

  // Bewust níét alleen sleepacties met `Files` toelaten. Een bijlage uit de nieuwe
  // Outlook of Outlook in de browser komt binnen als link, niet als bestand; weigerden
  // we die, dan kon je hem niet eens loslaten (verbodsteken) en wist niemand waarom.
  // Nu mag hij neer en legt opDrop uit wat er aan de hand is.
  const isUploadSleep = () => kanUploaden && !sleeptVanuitPagina.current

  function opDragEnter(e: React.DragEvent) {
    if (!isUploadSleep()) return
    e.preventDefault()
    sleepDiepte.current++
    setSleept(true)
  }

  function opDragOver(e: React.DragEvent) {
    if (!isUploadSleep()) return
    // Zonder preventDefault weigert de browser de drop en opent hij het bestand.
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    setSleepDoel(doelVan(e))
  }

  function opDragLeave() {
    // Bewust géén controle op de inhoud van de drag: niet elke browser vult
    // `dataTransfer.types` bij dragleave, en dan zou de teller blijven hangen en de
    // overlay in beeld blijven staan.
    if (sleepDiepte.current === 0) return
    sleepDiepte.current--
    if (sleepDiepte.current === 0) setSleept(false)
  }

  async function opDrop(e: React.DragEvent) {
    if (!isUploadSleep()) return
    e.preventDefault()
    sleepDiepte.current = 0
    setSleept(false)
    const pad = doelVan(e)

    const gesleept = Array.from(e.dataTransfer.files)
    if (gesleept.length === 0) {
      // Uitgezocht (sept–okt 2026, foutenlog): het nieuwe Outlook geeft bij een gesleepte mail
      // of bijlage alleen `attachment` / `maillistrow` / `multimaillistconversationrows` plus
      // `chromium/x-drag-id` mee — een interne verwijzing, nooit de inhoud. Er valt dus niets
      // op te halen; de uitleg hieronder is het enige wat we kunnen doen.
      toast.error(
        'Dit komt niet als bestand binnen — Outlook geeft hier alleen een verwijzing mee. ' +
        'Sleep de bijlage eerst naar je bureaublad en van daar hierheen, of gebruik "Bestanden toevoegen".',
        { duration: 9000 },
      )
      return
    }
    await uploadBestanden(gesleept, pad)
  }

  /** Opent de bestandskiezer; wat je kiest gaat naar `pad` ('' = de dossiermap). */
  function kies(pad = '') {
    if (uploadt) return
    kiesDoel.current = pad
    kiezer.current?.click()
  }

  function opGekozen(e: React.ChangeEvent<HTMLInputElement>) {
    const gekozen = Array.from(e.target.files ?? [])
    // Leegmaken, anders vuurt onChange niet als je hetzelfde bestand nog eens kiest.
    e.target.value = ''
    if (gekozen.length) void uploadBestanden(gekozen, kiesDoel.current)
  }

  async function uploadBestanden(gesleept: File[], pad: string) {
    // Te groot voor één server-action eruit filteren mét naam. Zonder deze check
    // krijgt de gebruiker een nietszeggende netwerkfout terug.
    const teGroot = gesleept.filter(b => b.size > MAX_BESTAND_BYTES)
    const bestanden = gesleept.filter(b => b.size <= MAX_BESTAND_BYTES)
    if (teGroot.length) {
      toast.error(
        `Te groot om via EVA te uploaden (max ${Math.floor(MAX_BESTAND_BYTES / 1024 / 1024)} MB): ` +
        `${teGroot.map(b => b.name).join(', ')}. Zet die rechtstreeks in SharePoint.`,
      )
    }
    if (bestanden.length === 0) return

    setUploadt(true)
    setVoortgang({ klaar: 0, totaal: bestanden.length })

    let geuploaded = 0
    const fouten: string[] = []
    try {
      for (const groep of maakGroepen(bestanden)) {
        const formData = new FormData()
        for (const b of groep) formData.append('bestanden', b)
        if (pad) formData.append('submap', pad)

        const res = await uploadDossierBestandenNaarSharePoint(dossierId, formData)
        geuploaded += res.geuploaded
        if (res.fout) fouten.push(res.fout)
        setVoortgang(v => ({ klaar: v.klaar + groep.length, totaal: v.totaal }))
      }

      if (geuploaded > 0) {
        toast.success(`${geuploaded} bestand${geuploaded === 1 ? '' : 'en'} in ${waarheen(pad)} gezet.`)
      }
      if (fouten.length) toast.error(fouten.join(' · '))
      else if (geuploaded === 0) toast.error('Er is niets geüpload.')

      // Opnieuw ophalen: de map kan zojuist zijn aangemaakt én de lijst moet de
      // nieuwe bestanden tonen.
      onVernieuwd(await getDossierSharePointBestanden(dossierId), pad)
    } catch (err) {
      toast.error(`Uploaden mislukt: ${err instanceof Error ? err.message : 'onbekende fout'}`)
    } finally {
      setUploadt(false)
    }
  }

  return {
    /** Er wordt iets van buiten de pagina boven de dropzone gesleept. */
    sleept,
    /** De map onder de muis tijdens het slepen; '' = de dossiermap. */
    sleepDoel,
    uploadt,
    voortgang,
    kiezer,
    kies,
    opGekozen,
    zone: { onDragEnter: opDragEnter, onDragOver: opDragOver, onDragLeave: opDragLeave, onDrop: opDrop },
  }
}
