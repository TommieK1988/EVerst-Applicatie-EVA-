import PageHeader from '@/components/shared/PageHeader'
import SyncForm from '@/components/ritten/SyncForm'

export const dynamic = 'force-dynamic'

export default function SyncPage() {
  const heeftCredentials = !!process.env.ULU_EMAIL && !!process.env.ULU_PASSWORD
  const heeftDbUrl = !!process.env.DATABASE_URL

  return (
    <>
      <PageHeader
        titel="ULU Cartracker sync"
        omschrijving="Haal direct ritten op uit de ULU API. Veel betrouwbaarder dan Excel-uploads — gebruikt bulk-inserts via directe Postgres-connectie (omzeilt eventueel schema-cache-gedoe)."
      />

      <div className="bg-white rounded-lg border p-6 max-w-3xl">
        {!heeftCredentials && (
          <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded text-sm text-amber-900">
            ⚠️ <strong>ULU_EMAIL</strong> en/of <strong>ULU_PASSWORD</strong> ontbreken in
            <code className="px-1 mx-1 rounded bg-amber-100">apps/wagenpark/.env.local</code>.
            Voeg deze toe met de credentials die je van ULU hebt gekregen.
          </div>
        )}
        {!heeftDbUrl && (
          <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded text-sm text-amber-900">
            ⚠️ <strong>DATABASE_URL</strong> ontbreekt. Vind hem in Supabase →
            Project Settings → Database → Connection string (gebruik de <em>Transaction pooler</em>,
            port 6543) en zet hem in <code className="px-1 rounded bg-amber-100">apps/wagenpark/.env.local</code>.
          </div>
        )}

        <SyncForm disabled={!heeftCredentials || !heeftDbUrl} />

        <div className="mt-6 pt-6 border-t text-xs text-slate-500 space-y-2">
          <p>
            <strong>Wat gebeurt er bij een sync?</strong>
          </p>
          <ol className="list-decimal ml-5 space-y-1">
            <li>Login bij ULU met de credentials uit <code>.env.local</code></li>
            <li>Alle voertuigen ophalen en upserten (nieuwe kentekens worden aangemaakt)</li>
            <li>Per voertuig alle trips in de gekozen periode ophalen (paginering automatisch)</li>
            <li>Bulk-insert in <code>ulu_trips</code> via directe Postgres-connectie — duplicaten worden overgeslagen</li>
            <li>Compliance-check draait automatisch over het hele lopende jaar</li>
          </ol>
          <p className="mt-3">
            Standaardperiode: <strong>1 januari tot vandaag</strong>. Wijzig als je een andere
            range wilt syncen.
          </p>
          <p className="mt-3 text-amber-700">
            <strong>API-limiet:</strong> ULU retourneert maximaal ~75 ritten per voertuig per sync
            (≈ 2-3 weken werkdata). Voor historische analyse van langere periodes gebruik je de{' '}
            <a href="/ritten/import" className="underline">Excel-import</a>. Dagelijks syncen is
            aan te raden om geen data te missen.
          </p>
        </div>
      </div>
    </>
  )
}
