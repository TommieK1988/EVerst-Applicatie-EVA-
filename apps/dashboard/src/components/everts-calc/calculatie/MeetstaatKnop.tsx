'use client'

/**
 * De meetstaat vanuit de calculatie openen.
 *
 * Standaard als overlay ín dit tabblad. Calculatie en meetstaat delen dan één
 * werkgeheugen (`local-store`), dus wat de meetstaat synchroniseert staat bij het
 * sluiten direct in het rekenblad. Twee losse tabbladen hebben elk een eigen kopie,
 * en de laatste die opslaat wint: een oud calculatietabblad kon zo de
 * gesynchroniseerde regels en de meetstaat zelf terugzetten.
 *
 * Voor werken met twee schermen blijft "In nieuw venster" bestaan. Dit tabblad
 * herlaadt dan zodra je terugkomt, en vraagt het eerst als er hier nog niet
 * opgeslagen wijzigingen staan.
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { Ruler, ChevronDown, ExternalLink } from 'lucide-react'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/button'
import { menuInhoud, menuItem } from './werkbalk-menu'
import MeetstaaatHoofdscherm from '@/components/everts-calc/meetstaat/MeetstaaatHoofdscherm'
import { hydrateCalculatie } from '@/lib/everts-calc/local-store'
import { laadCalculatieSnapshot } from '@/app/(platform)/everts-calc/actions/sync'

interface Props {
  projectId: string
  /** Scenario dat de calculatie open heeft (revisie, meerwerk); daarin synchroniseert de meetstaat. */
  scenarioId: string
  projectNaam: string
  projectNummer: string
  /** Waar de meetstaat in een los venster naar terugwijst. */
  terugUrl: string
  /** Staan er in de calculatie wijzigingen die nog niet zijn opgeslagen? */
  isVuil: () => boolean
  /** Openstaande calculatiewijzigingen wegschrijven vóór een los venster laadt. */
  bewaarEerst: () => Promise<void>
  /** Het werkgeheugen is bijgewerkt door de meetstaat: rekenblad opnieuw inlezen. */
  onNaMeetstaat: () => void
}

export default function MeetstaatKnop({
  projectId, scenarioId, projectNaam, projectNummer, terugUrl, isVuil, bewaarEerst, onNaMeetstaat,
}: Props) {
  const [overlayOpen, setOverlayOpen] = useState(false)
  const vensterOpen = useRef(false)

  const sluitOverlay = useCallback(() => {
    setOverlayOpen(false)
    onNaMeetstaat()
  }, [onNaMeetstaat])

  const openVenster = useCallback(async () => {
    // Synchroon openen (anders blokkeert de pop-upblokker), pas na het opslaan laden:
    // het venster leest de calculatie van de server, en die moet dan actueel zijn.
    const venster = window.open('', '_blank')
    await bewaarEerst()
    const q = new URLSearchParams({ naam: projectNaam, nummer: projectNummer, terug: terugUrl, scenario: scenarioId })
    const url = `/everts-calc/meetstaat/${projectId}?${q}`
    if (venster) venster.location.href = url
    else window.open(url, '_blank')
    vensterOpen.current = true
  }, [bewaarEerst, projectId, scenarioId, projectNaam, projectNummer, terugUrl])

  // Terug in dit tabblad na een los meetstaatvenster: de serverversie inlezen.
  const naHerlaadRef = useRef(onNaMeetstaat)
  useEffect(() => { naHerlaadRef.current = onNaMeetstaat }, [onNaMeetstaat])
  const isVuilRef = useRef(isVuil)
  useEffect(() => { isVuilRef.current = isVuil }, [isVuil])
  useEffect(() => {
    const herlaad = async () => {
      const snap = await laadCalculatieSnapshot(projectId).catch(() => null)
      if (!snap) { toast.error('Calculatie herladen mislukt'); return }
      hydrateCalculatie(projectId, snap)
      naHerlaadRef.current()
    }
    const onVisibility = () => {
      if (document.visibilityState !== 'visible' || !vensterOpen.current) return
      vensterOpen.current = false
      if (!isVuilRef.current()) { void herlaad(); return }
      // Niet stil overschrijven: hier staat werk dat de server nog niet heeft.
      toast(t => (
        <span className="text-sm">
          De meetstaat is in een ander venster gewijzigd. Herladen gooit je niet-opgeslagen
          wijzigingen in de calculatie weg.
          <button
            className="ml-2 font-medium text-everts underline"
            onClick={() => { toast.dismiss(t.id); void herlaad() }}
          >
            Herladen
          </button>
        </span>
      ), { duration: 15000 })
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [projectId])

  return (
    <>
      <div className="flex items-center">
        <Button variant="outline" size="sm" title="Schildermeetstaat openen"
          className="rounded-r-none" onClick={() => setOverlayOpen(true)}>
          <Ruler className="w-3.5 h-3.5" />
          <span className="hidden lg:inline">Meetstaat</span>
        </Button>
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <Button variant="outline" size="sm" title="Meer opties voor de meetstaat"
              className="rounded-l-none border-l-0 px-1">
              <ChevronDown className="w-3 h-3 text-neutral-400" />
            </Button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              className={menuInhoud}
              align="start" sideOffset={4}
            >
              <DropdownMenu.Item
                className={menuItem}
                onSelect={() => { void openVenster() }}
              >
                <ExternalLink className="w-3.5 h-3.5 text-neutral-400" /> In nieuw venster openen
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>

      {overlayOpen && createPortal(
        <div className="fixed inset-0 z-50 bg-slate-50">
          <MeetstaaatHoofdscherm
            projectId={projectId}
            scenarioId={scenarioId}
            ingebed
            onSluit={sluitOverlay}
            printKop={{ naam: projectNaam, nummer: projectNummer }}
          />
        </div>,
        document.body,
      )}
    </>
  )
}
