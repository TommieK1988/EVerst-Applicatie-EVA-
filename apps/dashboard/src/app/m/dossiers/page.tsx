import { getCurrentMedewerker, getRechtenBundel, heeftFunctie, kiesKanaal } from '@/lib/auth/rechten'
import { getMobieleDossiers } from '@/lib/dossiers/mobiel-lijst'
import AppHeader from '@/components/mobiel/AppHeader'
import MobielDossierLijst, { type MobielDossier } from '@/components/mobiel/MobielDossierLijst'
import MobielPullToRefresh from '@/components/mobiel/MobielPullToRefresh'
import { dossierStatusBadge, dossierSectie } from '@/components/mobiel/dossier-status'
import { getIngeplandeDossiers } from '@/lib/dossiers/ingepland'
import { isActiefDossier, type DossierActiefVelden } from '@/lib/dossiers/actief'
import { isDossierAfgesloten, type DossierRij } from '@/components/dossiers/types'

export const metadata = { title: 'Dossiers · EVA Mobiel' }

type Res = { ok: true; data: DossierRij[] } | { ok: false; error: string; missingTable?: boolean }

/**
 * Substatussen waarbij het werk voorbij is. Zie `components/dossiers/types.ts`: opdracht kent
 * beide, servicedesk alleen `financieel_gereed`.
 */
const AFGEROND = new Set(['financieel_gereed', 'financieel_afgesloten'])

/**
 * Een servicedeskbon verdwijnt al eerder van de telefoon: zodra hij Uitgevoerd (mutatie:
 * "Uitvoering gereed") of Kosten compleet is, is het werk op locatie klaar en rest alleen nog
 * kantoorwerk.
 */
const SERVICEDESK_AFGEROND = new Set(['uitgevoerd', 'kosten_compleet', 'financieel_gereed', 'vervallen'])

export default async function MobielDossiersPage() {
  const medewerker = await getCurrentMedewerker()

  if (!medewerker) {
    return (
      <>
        <AppHeader title="Dossiers" backHref="/m" />
        <div style={{ textAlign: 'center', color: '#6b757c', padding: '48px 16px', fontSize: 14 }}>
          Geen medewerker-koppeling gevonden voor dit account.
        </div>
      </>
    )
  }

  /**
   * Directie ziet alle lopende dossiers; ieder ander de dossiers waar hij een projectrol op
   * heeft (in elke fase, ook offertes en servicedeskbonnen), plus waar hij op is ingepland —
   * een monteur heeft zelden een projectrol, maar moet het dossier van zijn werk wel kunnen
   * openen. Afgesloten en financieel gereed filtert de query al weg.
   */
  const alle = heeftFunctie(kiesKanaal(await getRechtenBundel(), 'mobiel'), 'dossiers.alle_zien')
  const [eigen, ingepland] = await Promise.all([
    getMobieleDossiers(medewerker.id, { alle })
      .then(data => ({ ok: true as const, data }))
      .catch(() => ({ ok: false as const, error: '' })),
    getIngeplandeDossiers(medewerker.id)
      .then(data => ({ ok: true as const, data }))
      .catch(() => ({ ok: false as const, error: '' })),
  ])

  const seen = new Set<string>()
  const rows: MobielDossier[] = []
  // De groep (chip boven de lijst) volgt uit de fase van het dossier.
  const add = (res: Res) => {
    if (!res.ok) return
    for (const d of res.data) {
      const groep = dossierSectie(d)
      if (seen.has(d.id)) continue
      // Alleen actieve dossiers (niet in eindstatus / niet gearchiveerd). Voor de eigen lijst
      // dubbelop met de query, maar de ingeplande dossiers komen ongefilterd binnen.
      if (!isActiefDossier(d as unknown as DossierActiefVelden)) continue
      if (isDossierAfgesloten(d as never)) continue
      // En op de telefoon alleen wat écht nog loopt. `isActiefDossier` laat een opdracht op
      // `financieel_gereed` nog door — terecht, want de Overzicht-schermen van Acties en
      // Formulieren hebben die nodig. Maar het werk is dan klaar en er loopt alleen nog
      // administratie; dat is kantoorwerk en het vult hier de lijst.
      if (AFGEROND.has(d.opdracht_substatus ?? '')) continue
      if (SERVICEDESK_AFGEROND.has(d.servicedesk_substatus ?? '')) continue
      seen.add(d.id)
      const { label, color } = dossierStatusBadge(d)
      rows.push({
        id: d.id,
        titel: d.titel,
        dossiernummer: d.dossiernummer ?? null,
        klant_naam: d.klant_naam ?? null,
        projectleider_naam: d.projectleider_naam ?? null,
        groep,
        statusLabel: label,
        statusColor: color,
      })
    }
  }
  add(eigen)
  add(ingepland)

  return (
    <>
      <AppHeader title="Dossiers" sub={`${rows.length} dossiers`} backHref="/m" />
      <MobielPullToRefresh />
      <MobielDossierLijst dossiers={rows} />
    </>
  )
}
