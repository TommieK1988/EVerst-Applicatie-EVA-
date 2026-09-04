import React from 'react'
import { ListChecks, FolderOpen, Clock, CalendarDays, User, Palmtree, Wrench } from 'lucide-react'
import AppHeader from './AppHeader'
import MobielTegel from './MobielTegel'
import LocatieAutoOpen from './LocatieAutoOpen'
import AppBadge from '@/components/eva/AppBadge'

/**
 * Mobiel grid-startscherm (OS-launcher). Grote tegels naar de buitendienst-
 * onderdelen; géén onderbalk (bewuste keuze — ze passen niet netjes in een
 * bottom-nav). Elk sub-scherm heeft een terug-link naar `/m` via `AppHeader`.
 *
 * Tegels die op een recht staan (Materieel) krijgen dat als vlag mee vanaf de
 * pagina: dit is een servercomponent-boom, dus de rechten zijn daar al bekend en
 * hoeven niet nog eens per tegel opgehaald te worden.
 */
export default function MobielHome({
  naam, openTaken, ongelezenMeldingen = 0, magMaterieel = false,
}: {
  naam?: string | null
  openTaken?: number
  ongelezenMeldingen?: number
  /** Materieelbeheer aan in deze omgeving én minimaal 'lezen' op het recht. */
  magMaterieel?: boolean
}) {
  return (
    <>
      <AppHeader
        title="EVA"
        sub={naam ? `Welkom, ${naam}` : 'Buitendienst'}
        ongelezenMeldingen={ongelezenMeldingen}
      />
      {/* Tellertje op het app-icoon. Staat hier en niet in de mobiele layout:
          de teller is op dit scherm toch al opgehaald, en je komt er bij elke
          navigatie langs. Tussendoor houdt de service worker hem bij. */}
      <AppBadge aantal={ongelezenMeldingen} />
      <div
        style={{
          padding: 16,
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 12,
        }}
      >
        <MobielTegel href="/m/taken" label="Acties" Icon={ListChecks} badge={openTaken} />
        <MobielTegel href="/m/dossiers" label="Dossiers" Icon={FolderOpen} />
        <MobielTegel href="/m/uren" label="Uren" Icon={Clock} />
        <MobielTegel href="/m/planning" label="Planning" Icon={CalendarDays} />
        <MobielTegel href="/m/verlof" label="Verlof" Icon={Palmtree} />
        {magMaterieel && <MobielTegel href="/m/materieel" label="Materieel" Icon={Wrench} />}
        {/* Houtrot heeft bewust géén eigen tegel: registraties horen bij een dossier
            en verschijnen als tab zodra de toggle `houtrot_registreren` aanstaat. */}
        <MobielTegel href="/m/profiel" label="Mijn gegevens" Icon={User} />
      </div>
      {/* Automatisch dossier openen op locatie — draait één keer per sessie. */}
      <LocatieAutoOpen />
    </>
  )
}
