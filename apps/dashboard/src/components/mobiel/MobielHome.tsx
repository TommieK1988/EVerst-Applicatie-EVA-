import React from 'react'
import { ListChecks, FolderOpen, Clock, CalendarDays, User, Palmtree, Wrench, BookOpen, Handshake } from 'lucide-react'
import AppHeader from './AppHeader'
import MobielTegel from './MobielTegel'
import LocatieAutoOpen from './LocatieAutoOpen'
import VandaagWidget from './VandaagWidget'
import HomeSignalen from './HomeSignalen'
import AppBadge from '@/components/eva/AppBadge'
import type { AgendaItem } from '@/lib/agenda/agenda-model'
import type { HomeSignalen as Signalen } from '@/lib/mobiel/home'

/**
 * Mobiel startscherm. Van boven naar beneden: wat er vandaag gepland staat, wat
 * er van je verwacht wordt, en daaronder de tegels naar de onderdelen. Géén
 * onderbalk (bewuste keuze — de onderdelen passen er niet netjes in); elk
 * sub-scherm heeft een terug-link naar `/m` via `AppHeader`.
 *
 * De tegels staan op drie kolommen. Op twee kolommen paste de rij onderdelen niet
 * meer op één scherm en moest je scrollen om bij "Mijn gegevens" te komen; met
 * drie past alles, inclusief de twee blokken erboven. Zie `MobielTegel` voor de
 * maatvoering die daarbij hoort.
 *
 * Tegels die op een recht staan (Materieel) krijgen dat als vlag mee vanaf de
 * pagina: dit is een servercomponent-boom, dus de rechten zijn daar al bekend en
 * hoeven niet nog eens per tegel opgehaald te worden.
 */
export default function MobielHome({
  naam, openTaken, ongelezenMeldingen = 0, magMaterieel = false, magHandboek = false,
  magCommercieel = false, vandaag, signalen,
}: {
  naam?: string | null
  openTaken?: number
  ongelezenMeldingen?: number
  /** Materieelbeheer aan in deze omgeving én minimaal 'lezen' op het recht. */
  magMaterieel?: boolean
  /**
   * Minimaal 'lezen' op het recht `relaties`. Vandaag Directie en Projectbureau — de mensen
   * die opdrachtgevers spreken. Uitvoering krijgt de tegel niet: het klantbeeld toont omzet
   * en openstaande facturen.
   */
  magCommercieel?: boolean
  /**
   * Handboek aan in deze omgeving. Anders dan bij Materieel hoort hier géén
   * rechtencontrole bij: iedereen met een account mag zijn eigen handboek
   * lezen. Alleen de feature-flag bepaalt of de tegel er is.
   */
  magHandboek?: boolean
  /** Agenda-items van vandaag; `null` als er geen medewerker-koppeling is. */
  vandaag?: { dag: string; items: AgendaItem[] } | null
  signalen?: Signalen | null
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

      {signalen && (
        <HomeSignalen uren={signalen.uren} magFiatteren={signalen.magFiatteren} />
      )}

      {vandaag && <VandaagWidget dag={vandaag.dag} items={vandaag.items} />}

      <div
        style={{
          padding: 16,
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 10,
        }}
      >
        <MobielTegel href="/m/taken" label="Acties" Icon={ListChecks} badge={openTaken} />
        <MobielTegel href="/m/dossiers" label="Dossiers" Icon={FolderOpen} />
        <MobielTegel href="/m/uren" label="Uren" Icon={Clock} />
        <MobielTegel href="/m/planning" label="Planning" Icon={CalendarDays} />
        <MobielTegel href="/m/verlof" label="Verlof" Icon={Palmtree} />
        {magCommercieel && <MobielTegel href="/m/commercieel" label="Commercieel" Icon={Handshake} />}
        {magMaterieel && <MobielTegel href="/m/materieel" label="Materieel" Icon={Wrench} />}
        {magHandboek && <MobielTegel href="/m/handboek" label="Handboek" Icon={BookOpen} />}
        {/* Houtrot heeft bewust géén eigen tegel: registraties horen bij een dossier
            en verschijnen als tab zodra de toggle `houtrot_registreren` aanstaat. */}
        <MobielTegel href="/m/profiel" label="Mijn gegevens" Icon={User} />
      </div>
      {/* Automatisch dossier openen op locatie — draait één keer per sessie. */}
      <LocatieAutoOpen />
    </>
  )
}
