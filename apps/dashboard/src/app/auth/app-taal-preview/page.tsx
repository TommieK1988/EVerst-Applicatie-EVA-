import React from 'react'
import { Noto_Sans_Tamil } from 'next/font/google'
import { NextIntlClientProvider } from 'next-intl'
import { getTranslations } from 'next-intl/server'
import { ListChecks, FolderOpen, Clock, CalendarDays, User, Palmtree, BookOpen, Timer } from 'lucide-react'
import AppHeader from '@/components/mobiel/AppHeader'
import MobielTegel from '@/components/mobiel/MobielTegel'
import MobielTakenLijst, { type MobielTaak } from '@/components/mobiel/MobielTakenLijst'
import VerlofClient from '@/components/mobiel/uren/VerlofClient'
import TaalKeuze from '@/components/mobiel/TaalKeuze'
import { laadBerichten } from '@/i18n/berichten'
import { naarTaal, TALEN, TAAL_NAAM, TIJDZONE } from '@/i18n/talen'
import type { VerlofAanvraag } from '@/lib/uren/verlof'

/**
 * Voorbeeld van EVA Mobiel in elke taal, met verzonnen gegevens: `/auth/app-taal-preview?taal=ta`.
 *
 * WAAROM DIT BESTAAT
 * Pools is 20–30% en Tamil 30–50% langer dan Nederlands. Of een knop, tegel of label dan nog
 * past, vangt geen type-check of test — dat moet je zien. De echte app zit achter een login en
 * een medewerker met de juiste taal; dit scherm toont de échte componenten (geen namaak) zonder
 * dat allemaal. Bereikbaar zonder in te loggen omdat `middleware.ts` alles onder `/auth/`
 * overslaat. Knoppen doen niets zinnigs: de server-acties erachter hebben een sessie nodig.
 *
 * Teksten van kantoor (taakomschrijvingen e.d.) worden hier niet vertaald: daarvoor is een
 * ingelogde medewerker nodig. Ze staan er in het Nederlands, zoals in de app tijdens het laden.
 */

const notoTamil = Noto_Sans_Tamil({ subsets: ['tamil'], variable: '--font-noto-tamil', display: 'swap', preload: false })

export const metadata = { title: 'App-taal voorbeeld' }

const vandaag = new Date()
const dag = (n: number) => new Date(vandaag.getTime() + n * 86_400_000).toISOString().slice(0, 10)

const TAKEN: MobielTaak[] = [
  { id: 't1', titel: 'Steiger opbouwen voorgevel', deadline: dag(0), prioriteit: 'hoog', dossier_naam: 'Kerkstraat 12, Zwolle', dossier_id: 'd1', formulier_template_id: null, omschrijving: 'Let op: stoep vrijhouden voor voetgangers.' },
  { id: 't2', titel: 'Kozijnen schuren en gronden', deadline: dag(2), prioriteit: 'normaal', dossier_naam: 'VvE De Linde', dossier_id: 'd2', formulier_template_id: 'f1', omschrijving: null },
  { id: 't3', titel: 'Toolbox: werken op hoogte', deadline: dag(-1), prioriteit: 'laag', dossier_naam: null, dossier_id: null, formulier_template_id: null, toolbox_toewijzing_id: 'tb1', omschrijving: null },
]

const VERLOF: VerlofAanvraag[] = [
  {
    id: 'v1', medewerkerNaam: 'Kasun Perera', uursoortId: 'u1', uursoortNaam: 'Vakantie',
    startDatum: dag(14), eindDatum: dag(18), heleDagen: true, startTijd: null, eindTijd: null,
    urenTotaal: 40, toelichting: null, status: 'aangevraagd', beoordelaarNaam: null,
    afwijzingReden: null, bouw7Status: 'nieuw', aangevraagdOp: dag(-2),
  },
  {
    id: 'v2', medewerkerNaam: 'Kasun Perera', uursoortId: 'u2', uursoortNaam: 'Bijzonder verlof',
    startDatum: dag(-20), eindDatum: dag(-20), heleDagen: false, startTijd: '13:00', eindTijd: '17:00',
    urenTotaal: 4, toelichting: 'Tandarts', status: 'afgewezen', beoordelaarNaam: 'Jan de Vries',
    afwijzingReden: 'Die middag is de oplevering.', bouw7Status: 'nieuw', aangevraagdOp: dag(-25),
  },
]

export default async function AppTaalPreview({ searchParams }: { searchParams: Promise<{ taal?: string }> }) {
  const taal = naarTaal((await searchParams).taal)
  const berichten = await laadBerichten(taal)
  const t = await getTranslations({ locale: taal, namespace: 'home' })

  return (
    <NextIntlClientProvider locale={taal} messages={berichten} timeZone={TIJDZONE}>
      <div
        className={`eva ${notoTamil.variable}`}
        data-theme="light"
        lang={taal}
        style={{
          maxWidth: 390, margin: '0 auto', minHeight: '100dvh', background: 'var(--bg)',
          fontFamily: "'Montserrat', var(--font-noto-tamil), ui-sans-serif, system-ui, sans-serif",
        }}
      >
        <div style={{ display: 'flex', gap: 8, padding: 8, background: '#111', flexWrap: 'wrap' }}>
          {TALEN.map((l) => (
            <a key={l} href={`?taal=${l}`} style={{ color: l === taal ? '#7ee2a8' : '#fff', fontSize: 13, fontWeight: 700 }}>
              {TAAL_NAAM[l]}
            </a>
          ))}
        </div>
        <AppHeader title="EVA" sub={t('welkom', { naam: 'Kasun' })} ongelezenMeldingen={3} />
        <div style={{ padding: 16, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          <MobielTegel href="#" label={t('tegel.acties')} Icon={ListChecks} badge={3} />
          <MobielTegel href="#" label={t('tegel.dossiers')} Icon={FolderOpen} />
          <MobielTegel href="#" label={t('tegel.prikklok')} Icon={Timer} />
          <MobielTegel href="#" label={t('tegel.uren')} Icon={Clock} />
          <MobielTegel href="#" label={t('tegel.planning')} Icon={CalendarDays} />
          <MobielTegel href="#" label={t('tegel.verlof')} Icon={Palmtree} />
          <MobielTegel href="#" label={t('tegel.handboek')} Icon={BookOpen} />
          <MobielTegel href="#" label={t('tegel.mijnGegevens')} Icon={User} />
        </div>
        <MobielTakenLijst taken={TAKEN} />
        <VerlofClient aanvragen={VERLOF} soorten={[{ id: 'u1', naam: 'Vakantie' }, { id: 'u2', naam: 'Bijzonder verlof' }]} saldo={86.5} />
        <div style={{ padding: 16 }}><TaalKeuze /></div>
      </div>
    </NextIntlClientProvider>
  )
}
