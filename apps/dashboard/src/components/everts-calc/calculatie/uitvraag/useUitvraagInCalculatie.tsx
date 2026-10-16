'use client'

import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import UitvraagMailVenster from '@/components/dossiers/tabs/UitvraagMailVenster'
import { regelUitvraagStatussen } from '@/lib/dossiers/uitvraag-regelstatus'
import { openPakketten } from '@/lib/everts-calc/uitvraag-weergave'
import type { UitvraagInGrid } from './UitvraagContext'
import { UitvragenDialoogContainer } from './UitvragenDialoogContainer'
import { UitvraagPaneelContainer } from './UitvraagPaneelContainer'
import { useUitvraagPakketten } from './useUitvraagPakketten'

/**
 * Alles van "uitvragen" in de calculatie op één plek, zodat het hoofdscherm alleen drie
 * dingen hoeft in te hangen: de knop in de werkbalk, de provider om het rekenblad (labels en
 * de knop in de selectiebalk) en het paneel met de vensters. Zonder dossier is alles leeg.
 */
export function useUitvraagInCalculatie({ dossierId, scenarioId, readOnly, paneelOpen, zetPaneelOpen }: {
  dossierId: string | null | undefined
  scenarioId: string | null | undefined
  readOnly: boolean
  /** Paneel open of dicht: het hoofdscherm beslist, want rechts staat maar één paneel tegelijk. */
  paneelOpen: boolean
  zetPaneelOpen: (open: boolean) => void
}): { context: UitvraagInGrid; knop: ReactNode; paneel: ReactNode } {
  const actief = !!dossierId && !!scenarioId
  const { pakketten, laden, fout, herlaad } = useUitvraagPakketten(actief ? dossierId : null)
  const [focusPakketId, setFocusPakketId] = useState<string | null>(null)
  /** Open venster: de regels die meegaan; een lege lijst is een losse uitvraag. */
  const [dialoogRegels, setDialoogRegels] = useState<string[] | null>(null)
  /** Mailvensters die nog achter elkaar open moeten, één per partij. */
  const [mailRij, setMailRij] = useState<string[]>([])

  const statussen = useMemo(() => regelUitvraagStatussen(pakketten), [pakketten])
  const openPaneel = useCallback((pakketId?: string) => { setFocusPakketId(pakketId ?? null); zetPaneelOpen(true) }, [zetPaneelOpen])
  const context = useMemo<UitvraagInGrid>(() => ({
    actief, kanUitvragen: actief && !readOnly, statussen,
    onUitvragen: ids => setDialoogRegels(ids), onOpenPaneel: openPaneel,
  }), [actief, readOnly, statussen, openPaneel])

  if (!actief || !dossierId || !scenarioId) return { context, knop: null, paneel: null }

  const teller = openPakketten(pakketten)
  const knop = (
    <Button
      variant="outline" size="sm" aria-pressed={paneelOpen} aria-label="Uitvraag"
      onClick={() => { setFocusPakketId(null); zetPaneelOpen(!paneelOpen) }}
      className={paneelOpen ? 'border-calc-oa bg-calc-oa/5 text-calc-oa hover:bg-calc-oa/5' : undefined}
      title={teller > 0 ? `Uitvragen: ${teller} met een partij die nog open staat` : 'Uitvragen bij onderaannemers en leveranciers'}
    >
      <Send className="h-3.5 w-3.5" />
      {/* Tekst pas vanaf 2xl: anders loopt de werkbalk op een 1440-scherm over twee regels. */}
      <span className="hidden 2xl:inline">Uitvraag</span>
      {teller > 0 && (
        <span className="h-[18px] min-w-[18px] rounded-full bg-calc-oa/10 px-1 text-center text-[10.5px] font-bold leading-[18px] text-calc-oa">
          {teller}
        </span>
      )}
    </Button>
  )

  const paneel = (
    <>
      <UitvraagPaneelContainer
        open={paneelOpen} pakketten={pakketten} laden={laden} fout={fout} herlaad={herlaad}
        focusPakketId={focusPakketId}
        onSluit={() => zetPaneelOpen(false)}
        onLosseUitvraag={() => setDialoogRegels([])}
        onMail={id => setMailRij([id])}
      />
      {dialoogRegels && (
        <UitvragenDialoogContainer
          dossierId={dossierId} scenarioId={scenarioId} regelIds={dialoogRegels}
          onSluit={() => setDialoogRegels(null)}
          onAangemaakt={(ids, mailen) => {
            setDialoogRegels(null)
            zetPaneelOpen(true)
            void herlaad()
            if (mailen) setMailRij(ids)
          }}
        />
      )}
      <UitvraagMailVenster
        uitvraagId={mailRij[0] ?? null}
        dossierId={dossierId}
        onSluit={() => setMailRij(r => r.slice(1))}
        onVerstuurd={() => void herlaad()}
      />
    </>
  )
  return { context, knop, paneel }
}
