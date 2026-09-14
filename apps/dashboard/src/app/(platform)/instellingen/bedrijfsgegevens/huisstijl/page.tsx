import { loadHuisstijl } from './actions'
import { HuisstijlForm } from './HuisstijlForm'
import { PageHeader, Alert } from '@/components/ui'
import TerugNaarInstellingen from '@/components/instellingen/TerugNaarInstellingen'

export const metadata = { title: 'Huisstijl' }
export const dynamic = 'force-dynamic'

export default async function Page(props: { searchParams: Promise<{ bedrijf?: string }> }) {
  const searchParams = await props.searchParams;
  const bedrijfId = searchParams.bedrijf
  const result = await loadHuisstijl(bedrijfId)

  return (
    <div className="eva-page-wide">
      <TerugNaarInstellingen />

      <PageHeader
        eyebrow={`Huisstijlboek${result.ok && result.data?.type === 'werkmaatschappij' ? ' · Werkmaatschappij' : ''}`}
        title={result.ok && result.data ? result.data.naam : 'Huisstijl'}
      />
      <p className="eva-page-desc -mt-[14px] mb-[22px]">
        Logo&apos;s, kleurenpalet, typografie en huisstijlregels.
      </p>

      {!result.ok && result.missingTable ? (
        <WarnBanner text="Draai eerst de huisstijl-migratie (20260416_huisstijl_uitbreiding.sql)." />
      ) : !result.ok && result.missingColumns ? (
        <WarnBanner text="De huisstijl-kolommen ontbreken. Draai de migratie 20260416_huisstijl_uitbreiding.sql." />
      ) : !result.ok ? (
        <ErrorBanner message={result.error} />
      ) : !result.data ? (
        <WarnBanner text="Geen bedrijfsgegevens gevonden. Maak eerst een organisatie aan via Instellingen → Bedrijfsgegevens." />
      ) : (
        <HuisstijlForm data={result.data} />
      )}
    </div>
  )
}

function WarnBanner({ text }: { text: string }) {
  return <Alert tone="warning">{text}</Alert>
}

function ErrorBanner({ message }: { message: string }) {
  return <Alert tone="error">Fout bij laden: {message}</Alert>
}
