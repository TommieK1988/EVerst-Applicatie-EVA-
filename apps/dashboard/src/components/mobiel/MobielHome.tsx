import React from 'react'
import { ListChecks, FolderOpen, Clock, CalendarDays, User } from 'lucide-react'
import AppHeader from './AppHeader'
import MobielTegel from './MobielTegel'

/**
 * Mobiel grid-startscherm (OS-launcher). Zes grote tegels naar de buitendienst-
 * onderdelen; géén onderbalk (bewuste keuze — zes items passen niet netjes in een
 * bottom-nav). Elk sub-scherm heeft een terug-link naar `/m` via `AppHeader`.
 */
export default function MobielHome({
  naam, openTaken,
}: {
  naam?: string | null
  openTaken?: number
}) {
  return (
    <>
      <AppHeader title="EVA" sub={naam ? `Welkom, ${naam}` : 'Buitendienst'} />
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
        {/* Houtrot heeft bewust géén eigen tegel: registraties horen bij een dossier
            en verschijnen als tab zodra de toggle `houtrot_registreren` aanstaat. */}
        <MobielTegel href="/m/profiel" label="Mijn gegevens" Icon={User} />
      </div>
    </>
  )
}
