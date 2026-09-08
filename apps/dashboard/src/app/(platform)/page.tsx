import { createClient } from '@everts/database/server'
import { getMijnTaken } from '@/lib/taken/services/taken'
import { getMijnDossiers, getMijnServicedesk } from '@/lib/dossiers/actions'
import { getMedewerkerByAuthId } from '@/lib/dashboard/queries'
import { haalAlleRegels } from '@/app/(platform)/planning/bedrijfsagenda/actions'
import { bedrijfsagendaTypeKleur } from '@everts/database/platform-types'
import type { BedrijfsagendaType } from '@everts/database/platform-types'
import HomeView from '@/components/eva/views/HomeView'
import { getGoedkeurenWidget } from '@/lib/goedkeuren/widget'
import type { AgendaWidgetItem } from '@/components/eva/widgets'

export const metadata = { title: 'Overzicht' }

function localDateStr(offset = 0): string {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default async function HomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const medewerker = user ? await getMedewerkerByAuthId(user.id) : null

  const displayName = medewerker
    ? [medewerker.voornaam, medewerker.tussenvoegsel, medewerker.achternaam].filter(Boolean).join(' ')
    : (user?.user_metadata?.full_name as string | undefined)
      ?? user?.email?.split('@')[0]
      ?? 'Gebruiker'

  const jaar = new Date().getFullYear()
  const vandaag = localDateStr(0)

  const [taken, aanvragenResult, offertesResult, opdrachtenResult, servicedeskResult, agendaRegels, goedkeuren] = await Promise.all([
    user ? getMijnTaken(user.id).catch(() => []) : Promise.resolve([]),
    // Aanvragen gesorteerd op deadline (verwacht_einddatum), opdrachten op startdatum — nulls laatst
    medewerker ? getMijnDossiers(medewerker.id, 'aanvraag', 10, { kolom: 'verwacht_einddatum', ascending: true }) : Promise.resolve({ ok: true as const, data: [], totaal: 0 }),
    medewerker ? getMijnDossiers(medewerker.id, 'offerte')  : Promise.resolve({ ok: true as const, data: [], totaal: 0 }),
    // Mijn opdrachten: alleen dossiers waar ik projectleider ben
    medewerker ? getMijnDossiers(medewerker.id, 'opdracht', 10, { kolom: 'verwacht_startdatum', ascending: true }, ['project_manager_id']) : Promise.resolve({ ok: true as const, data: [], totaal: 0 }),
    // Mijn servicedesk: dossiers waar ik projectleider of uitvoerder ben
    medewerker ? getMijnServicedesk(medewerker.id, 10, { kolom: 'verwacht_startdatum', ascending: true }) : Promise.resolve({ ok: true as const, data: [], totaal: 0 }),
    haalAlleRegels(jaar).catch(() => [] as Awaited<ReturnType<typeof haalAlleRegels>>),
    // Fail-soft: een lege goedkeurwidget is beter dan een startpagina die niet laadt.
    getGoedkeurenWidget().catch(() => ({
      ligtBijJou: [], afgehandeld: [],
      aantallen: { inkoopfactuur: 0, offerte: 0, werkbegroting: 0 },
    })),
  ])

  const agendaRelevant = agendaRegels
    .filter(r => {
      if (r.eind_datum < vandaag) return false
      if (r.bron === 'berekend') return true
      if (r.doelgroep_afdelingen.length === 0 && r.doelgroep_medewerkers.length === 0) return true
      if (medewerker && r.doelgroep_medewerkers.includes(medewerker.id)) return true
      if (medewerker?.afdeling && r.doelgroep_afdelingen.includes(medewerker.afdeling)) return true
      return false
    })
    .sort((a, b) => a.start_datum.localeCompare(b.start_datum))

  // De widget toont er vijf; de teller in de kop moet het volledige aantal noemen.
  const agendaItems: AgendaWidgetItem[] = agendaRelevant
    .slice(0, 5)
    .map(r => ({
      id:          r.id,
      titel:       r.titel,
      start_datum: r.start_datum,
      type:        r.type,
      kleur:       r.bron === 'berekend'
        ? r.kleur
        : (r.kleur ?? bedrijfsagendaTypeKleur[r.type as BedrijfsagendaType] ?? '#64748b'),
    }))

  return (
    <HomeView
      displayName={displayName}
      taken={taken}
      aanvragen={aanvragenResult.ok   ? aanvragenResult.data   : []}
      offertes={offertesResult.ok    ? offertesResult.data    : []}
      opdrachten={opdrachtenResult.ok ? opdrachtenResult.data  : []}
      servicedesk={servicedeskResult.ok ? servicedeskResult.data : []}
      agendaItems={agendaItems}
      goedkeuren={goedkeuren}
      // Totalen: de lijsten hierboven zijn afgekapt op 10 rijen, de tellers niet.
      aanvragenTotaal={aanvragenResult.ok   ? aanvragenResult.totaal   : undefined}
      offertesTotaal={offertesResult.ok     ? offertesResult.totaal    : undefined}
      opdrachtenTotaal={opdrachtenResult.ok ? opdrachtenResult.totaal  : undefined}
      servicedeskTotaal={servicedeskResult.ok ? servicedeskResult.totaal : undefined}
      agendaTotaal={agendaRelevant.length}
    />
  )
}
