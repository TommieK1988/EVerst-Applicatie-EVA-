import AppHeader from '@/components/mobiel/AppHeader'
import MobielNotificatieLijst from '@/components/mobiel/MobielNotificatieLijst'
import AppBadge from '@/components/eva/AppBadge'
import { getNotificaties } from '@/app/(platform)/notificaties/actions'

export const metadata = { title: 'Meldingen · EVA Mobiel' }

/** Meldingenscherm achter het belletje in de mobiele bovenbalk. */
export default async function MobielNotificatiesPage() {
  const { notificaties, ongelezen } = await getNotificaties(30)

  return (
    <>
      <AppHeader title="Meldingen" backHref="/m" />
      {/* Hier ook het tellertje bijwerken: wie meldingen leest verwacht dat het
          getal op het icoon meteen meezakt, niet pas na terugkeren naar /m.
          De lijst roept router.refresh() aan, dus dit getal loopt mee. */}
      <AppBadge aantal={ongelezen} />
      <MobielNotificatieLijst initieel={notificaties} />
    </>
  )
}
