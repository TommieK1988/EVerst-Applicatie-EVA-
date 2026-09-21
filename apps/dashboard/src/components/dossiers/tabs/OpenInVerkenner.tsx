'use client'

import { useEffect, useRef, useState } from 'react'
import { Copy, Check } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogBody, DialogFooter,
} from '@/components/ui'
import { getDossierMapLokaalPad } from '@/lib/o365/onedrive-pad'

/**
 * Opent de SharePoint-dossiermap in Windows Verkenner in plaats van in de browser.
 *
 * Een webpagina mag zelf geen Verkenner starten, dus dit loopt via het
 * `eva://`-protocol: een kleine handler op de pc vangt de klik op en bepaalt zelf of
 * hij de met OneDrive gesynchroniseerde map of het WebDAV-netwerkpad opent. Uitrol en
 * werking staan in `scripts/eva-verkenner/LEESMIJ.md`.
 *
 * **Waarom hier zoveel omheen staat.** Die handler moet per pc geïnstalleerd zijn, en
 * hij start PowerShell — iets wat beveiligingssoftware een browser vaak verbiedt. In
 * beide gevallen doet de browser er precies niets mee: geen foutmelding, geen venster,
 * niets. De knop leek daardoor kapot terwijl er buiten EVA iets in de weg stond.
 * Daarom meet deze component of er na de klik íéts gebeurde (de pagina raakt zijn focus
 * kwijt zodra Verkenner opent of de browser om toestemming vraagt), en wijst hij anders
 * zelf de weg naar dezelfde map op de eigen schijf.
 *
 * Alleen zichtbaar op Windows — elders bestaat Verkenner niet. De gewone
 * SharePoint-link staat er altijd naast.
 */
export default function OpenInVerkenner({ dossierId, mapUrl }: { dossierId: string; mapUrl: string }) {
  const [opWindows, setOpWindows] = useState(false)
  const [hulpOpen, setHulpOpen] = useState(false)
  const [gekopieerd, setGekopieerd] = useState(false)
  // undefined = nog niet opgehaald, null = niet te bepalen.
  const [lokaalPad, setLokaalPad] = useState<string | null | undefined>(undefined)
  const timer = useRef<number | null>(null)

  useEffect(() => {
    setOpWindows(/Windows|Win32|Win64/i.test(navigator.userAgent))
    return () => { if (timer.current) window.clearTimeout(timer.current) }
  }, [])

  // Pas ophalen als het venster nodig is: het kost de eerste keer drie Graph-aanroepen,
  // en op een pc waar de snelkoppeling gewoon werkt komt het venster nooit in beeld.
  useEffect(() => {
    if (!hulpOpen || lokaalPad !== undefined) return
    getDossierMapLokaalPad(dossierId).then(setLokaalPad).catch(() => setLokaalPad(null))
  }, [hulpOpen, lokaalPad, dossierId])

  if (!opWindows) return null

  function openen() {
    // Navigeren binnen de klik-afhandeling: browsers starten een eigen protocol
    // alleen na een echte gebruikersactie.
    window.location.href = `eva://map?url=${encodeURIComponent(mapUrl)}`

    // Verkenner openen (of de toestemmingsvraag van de browser) haalt de focus weg
    // bij de pagina. Blijft die focus staan, dan is er niets gestart.
    let ietsGebeurd = false
    const merkOp = () => { ietsGebeurd = true }
    window.addEventListener('blur', merkOp)
    document.addEventListener('visibilitychange', merkOp)

    if (timer.current) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      window.removeEventListener('blur', merkOp)
      document.removeEventListener('visibilitychange', merkOp)
      if (!ietsGebeurd && document.hasFocus()) setHulpOpen(true)
    }, 1500)
  }

  async function kopieer() {
    if (!lokaalPad) return
    try {
      await navigator.clipboard.writeText(lokaalPad)
      setGekopieerd(true)
      window.setTimeout(() => setGekopieerd(false), 2000)
    } catch {
      // Clipboard geweigerd (oudere browser, geen https): het pad staat in beeld,
      // dus met de hand selecteren kan altijd nog.
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={openen}
        className="text-[11px] font-medium text-brand-600 hover:underline"
        title="Opent de dossiermap in Windows Verkenner."
      >
        Open in Verkenner
      </button>

      <Dialog open={hulpOpen} onOpenChange={setHulpOpen}>
        <DialogContent>
          <DialogHeader>
            <div className="pr-8">
              <DialogTitle>Verkenner ging niet open</DialogTitle>
              <DialogDescription>
                Deze pc kan de EVA-snelkoppeling niet starten; meld dat bij wie de
                werkplekken beheert. Synchroniseer je de dossiermappen met OneDrive, dan
                kom je er intussen zo:
              </DialogDescription>
            </div>
          </DialogHeader>
          <DialogBody className="space-y-3">
            {lokaalPad === undefined ? (
              <p className="text-[13px] text-neutral-500">Pad opzoeken…</p>
            ) : lokaalPad ? (
              <>
                <ol className="list-decimal space-y-1 pl-5 text-[13px] text-neutral-700">
                  <li>Kopieer het pad hieronder.</li>
                  <li>Open Verkenner en druk op <kbd className="rounded border border-neutral-300 px-1 text-[11px]">Ctrl</kbd> + <kbd className="rounded border border-neutral-300 px-1 text-[11px]">L</kbd>.</li>
                  <li>Plak het pad en druk op Enter.</li>
                </ol>
                <div className="flex items-start gap-2">
                  <code className="min-w-0 flex-1 break-all rounded border border-neutral-200 bg-neutral-50 px-2 py-1.5 text-[11.5px] text-neutral-700">
                    {lokaalPad}
                  </code>
                  <button
                    type="button"
                    onClick={kopieer}
                    className="flex shrink-0 items-center gap-1 rounded border border-neutral-300 px-2 py-1.5 text-[12px] font-medium text-neutral-700 hover:bg-neutral-50"
                  >
                    {gekopieerd
                      ? <><Check className="h-3.5 w-3.5 text-green-600" />Gekopieerd</>
                      : <><Copy className="h-3.5 w-3.5" />Kopieer pad</>}
                  </button>
                </div>
                <p className="text-[11.5px] text-neutral-500">
                  Verkenner vult <code>%OneDriveCommercial%</code> zelf in. Krijg je
                  &ldquo;kan niet vinden&rdquo;, dan synchroniseer je deze map niet of op een
                  ander niveau — gebruik dan de link &ldquo;Open map in SharePoint&rdquo;.
                </p>
              </>
            ) : (
              <p className="text-[13px] text-neutral-700">
                Van deze map is geen lokaal pad te bepalen. Gebruik de link
                &ldquo;Open map in SharePoint&rdquo; ernaast.
              </p>
            )}
          </DialogBody>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setHulpOpen(false)}
              className="rounded bg-neutral-800 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-neutral-700"
            >
              Sluiten
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
