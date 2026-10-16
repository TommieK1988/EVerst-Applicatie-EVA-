'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import MobielMedewerkerZoeker, { type ToewijsOptie } from '@/components/mobiel/MobielMedewerkerZoeker'

/**
 * Het zoekscherm "Toegewezen aan" uit Nieuwe actie, met verzonnen collega's: `?zoeker=medewerker`.
 * Schermvullend, dus alleen op verzoek. Kiezen of Annuleren opent het meteen weer.
 */

const NAMEN = ['Jan de Vries', 'Piotr Kowalski', 'Ravi Perera', 'Marieke Bakker', 'Tomasz Nowak',
  'Sanne de Jong', 'Nirmala Sivakumar', 'Kees van der Berg', 'Wim Hendriks', 'Agnieszka Wiśniewska']

export default function MedewerkerZoekerVoorbeeld() {
  const t = useTranslations('taken')
  const [gekozen, setGekozen] = useState('u2')
  const opties: ToewijsOptie[] = [
    { value: 'zelf', naam: 'Kasun Perera', label: t('nieuw.naamJij', { naam: 'Kasun Perera' }) },
    ...NAMEN.map((naam, i) => ({ value: `u${i}`, naam, label: naam })),
  ]
  return (
    <MobielMedewerkerZoeker
      opties={opties}
      zonderAccount={[{ id: 'mx', auth_user_id: null, naam: 'Jan Pietersen' }]}
      gekozen={gekozen}
      onKies={setGekozen}
      onSluit={() => {}}
    />
  )
}
