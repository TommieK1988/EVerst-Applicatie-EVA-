import PageHeader from '@/components/shared/PageHeader'
import VoertuigForm from '@/components/voertuigen/VoertuigForm'

export default function NieuwVoertuigPage() {
  return (
    <>
      <PageHeader
        titel="Nieuw voertuig"
        omschrijving="Voer het kenteken in — het systeem haalt automatisch de RDW-gegevens op."
      />
      <div className="bg-white rounded-lg border p-6 max-w-2xl">
        <VoertuigForm />
      </div>
    </>
  )
}
