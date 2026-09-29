import { getCurrentMedewerker } from '@/lib/auth/rechten'
import { getMijnDossiers, getMijnServicedesk } from '@/lib/dossiers/actions'
import AppHeader from '@/components/mobiel/AppHeader'
import MobielDossierLijst, { type MobielDossier } from '@/components/mobiel/MobielDossierLijst'
import MobielPullToRefresh from '@/components/mobiel/MobielPullToRefresh'
import { dossierStatusBadge, dossierSectie } from '@/components/mobiel/dossier-status'
import { getIngeplandeDossiers } from '@/lib/dossiers/ingepland'
import { isActiefDossier, type DossierActiefVelden } from '@/lib/dossiers/actief'
import type { DossierRij } from '@/components/dossiers/types'

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
const SERVICEDESK_AFGEROND = new Set(['uitgevoerd', 'kosten_compleet', 'financieel_gereed'])

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

  // Offertes worden bewust weggelaten — daar ben je in het veld niet dagelijks mee bezig.
  const SORT = { kolom: 'updated_at', ascending: false }
  // lean=true: slanke select (alleen lijst-/badge-velden) voor snellere tab-wissels.
  const [aanv, opd, svc] = await Promise.all([
    getMijnDossiers(medewerker.id, 'aanvraag', 100, SORT, undefined, true).catch(() => ({ ok: false as const, error: '' })),
    getMijnDossiers(medewerker.id, 'opdracht', 100, SORT, undefined, true).catch(() => ({ ok: false as const, error: '' })),
    getMijnServicedesk(medewerker.id, 100, SORT, true).catch(() => ({ ok: false as const, error: '' })),
  ])
  // Plus de dossiers waarop je bent ingepland: een monteur heeft zelden een projectrol, maar
  // moet het dossier van zijn werk wel kunnen openen.
  const ingepland: Res = await getIngeplandeDossiers(medewerker.id)
    .then(data => ({ ok: true as const, data }))
    .catch(() => ({ ok: false as const, error: '' }))

  const seen = new Set<string>()
  const rows: MobielDossier[] = []
  // Zonder vaste groep (ingeplande dossiers) volgt de groep uit de fase van het dossier.
  const add = (res: Res, vasteGroep?: MobielDossier['groep']) => {
    if (!res.ok) return
    for (const d of res.data) {
      const sectie = dossierSectie(d)
      const groep = vasteGroep ?? (sectie === 'offerte' ? 'aanvraag' : sectie)
      if (seen.has(d.id)) continue
      // Alleen actieve dossiers (niet in eindstatus / niet gearchiveerd).
      if (!isActiefDossier(d as unknown as DossierActiefVelden)) continue
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
  add(aanv, 'aanvraag')
  add(opd, 'opdracht')
  add(svc, 'servicedesk')
  add(ingepland)

  return (
    <>
      <AppHeader title="Dossiers" sub={`${rows.length} dossiers`} backHref="/m" />
      <MobielPullToRefresh />
      <MobielDossierLijst dossiers={rows} />
    </>
  )
}
