import { getCurrentMedewerker } from '@/lib/auth/rechten'
import { getMijnDossiers, getMijnServicedesk } from '@/lib/dossiers/actions'
import AppHeader from '@/components/mobiel/AppHeader'
import MobielDossierLijst, { type MobielDossier } from '@/components/mobiel/MobielDossierLijst'
import MobielPullToRefresh from '@/components/mobiel/MobielPullToRefresh'
import { dossierStatusBadge } from '@/components/mobiel/dossier-status'
import { isActiefDossier, type DossierActiefVelden } from '@/lib/dossiers/actief'
import type { DossierRij } from '@/components/dossiers/types'

export const metadata = { title: 'Dossiers · EVA Mobiel' }

type Res = { ok: true; data: DossierRij[] } | { ok: false; error: string; missingTable?: boolean }

export default async function MobielDossiersPage() {
  const medewerker = await getCurrentMedewerker()

  if (!medewerker) {
    return (
      <>
        <AppHeader title="Dossiers" />
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

  const seen = new Set<string>()
  const rows: MobielDossier[] = []
  const add = (res: Res, groep: MobielDossier['groep']) => {
    if (!res.ok) return
    for (const d of res.data) {
      if (seen.has(d.id)) continue
      // Alleen actieve dossiers (niet in eindstatus / niet gearchiveerd).
      if (!isActiefDossier(d as unknown as DossierActiefVelden)) continue
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

  return (
    <>
      <AppHeader title="Dossiers" sub={`${rows.length} dossiers`} />
      <MobielPullToRefresh />
      <MobielDossierLijst dossiers={rows} />
    </>
  )
}
