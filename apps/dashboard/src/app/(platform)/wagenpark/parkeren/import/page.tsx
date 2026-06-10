import PageHeader from '@/components/wagenpark/shared/PageHeader'
import ParkingImportForm from '@/components/wagenpark/parkeren/ParkingImportForm'

export default function ParkingImportPage() {
  return (
    <>
      <PageHeader
        titel="Parkeren importeren"
        omschrijving="De ULU API biedt géén parkeergegevens aan — die moeten via de Excel-export uit het ULU-dashboard."
      />
      <div className="bg-white rounded-lg border p-6 max-w-3xl">
        <ParkingImportForm />

        <div className="mt-6 pt-6 border-t text-xs text-slate-500 space-y-2">
          <p>
            <strong>Hoe kom je aan de Excel-export?</strong>
          </p>
          <ol className="list-decimal ml-5 space-y-1">
            <li>Log in op het ULU dashboard</li>
            <li>Ga naar Rapportages &rarr; Parkeren</li>
            <li>Selecteer de gewenste periode en download als Excel (.xlsx)</li>
            <li>Upload het hier — de importer is idempotent (duplicaten worden overgeslagen)</li>
          </ol>
          <p>
            Verwachte kolommen: <em>Parkeerlocatie, Naam voertuig, Kenteken, Parkeer starttijd,
            Parkeerkosten, Parkeer duur</em>.
          </p>
        </div>
      </div>
    </>
  )
}
