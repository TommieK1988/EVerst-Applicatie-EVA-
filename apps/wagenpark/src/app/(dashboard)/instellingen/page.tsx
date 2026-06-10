import PageHeader from '@/components/shared/PageHeader'
import EmptyState from '@/components/shared/EmptyState'
import { Settings } from 'lucide-react'
import RegelEditor from '@/components/instellingen/RegelEditor'
import { pgQuery } from '@/lib/db'

export const dynamic = 'force-dynamic'

type RegelRij = {
  id: string
  code: string
  titel: string
  beschrijving: string | null
  actief: boolean
  drempel_config: unknown
}

export default async function InstellingenPage() {
  const regels = await pgQuery<RegelRij>(
    `select id, code, titel, beschrijving, actief, drempel_config
       from public.handboek_regels
      order by code`,
  )

  return (
    <>
      <PageHeader
        titel="Instellingen"
        omschrijving="Compliance-regels en drempelwaarden. Wijzigingen worden toegepast bij de volgende compliance-check."
      />

      <section className="bg-white rounded-lg border">
        <div className="px-5 py-3 border-b">
          <h2 className="text-sm font-semibold text-slate-700">Handboek-regels</h2>
        </div>
        {regels.length === 0 ? (
          <EmptyState
            titel="Geen regels geconfigureerd"
            omschrijving="Voer de migratie uit — regels worden automatisch geseed."
            icon={Settings}
          />
        ) : (
          <div className="divide-y px-5">
            {regels.map((r) => (
              <RegelEditor
                key={r.id}
                code={r.code}
                titel={r.titel}
                beschrijving={r.beschrijving}
                actief={r.actief}
                drempelConfig={r.drempel_config}
              />
            ))}
          </div>
        )}
      </section>

      <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-md text-xs text-blue-900">
        <strong>Let op:</strong> alleen drempelwaardes binnen bestaande regels zijn via deze UI aan te
        passen. Als je een volledig nieuwe regel wilt of bestaande logica wilt veranderen (bv. R1
        moet weekend toch als werktijd meetellen voor sommige mensen), geef dat door — dan pas ik
        de compliance-engine in <code className="px-1 rounded bg-blue-100">packages/wagenpark-core</code> aan.
      </div>
    </>
  )
}
