import AppHeader from '@/components/mobiel/AppHeader'
import MobielNotificatieLijst from '@/components/mobiel/MobielNotificatieLijst'
import { getNotificaties } from '@/app/(platform)/notificaties/actions'

export const metadata = { title: 'Meldingen · EVA Mobiel' }

/** Meldingenscherm achter het belletje in de mobiele bovenbalk. */
export default async function MobielNotificatiesPage() {
  const { notificaties } = await getNotificaties(30)

  return (
    <>
      <AppHeader title="Meldingen" backHref="/m" />
      <MobielNotificatieLijst initieel={notificaties} />
    </>
  )
}
