import PageHeader from '@/components/wagenpark/shared/PageHeader'
import TripsImportForm from '@/components/wagenpark/ritten/TripsImportForm'

export default function TripsImportPage() {
  return (
    <>
      <PageHeader
        titel="Ritten importeren (Excel)"
        omschrijving="Voor oudere data dan de ULU API teruggeeft (API-cap: ~75 trips per voertuig). Gebruik deze upload om historie vanaf 1 januari (of vroeger) in te laden."
      />
      <div className="bg-white rounded-lg border p-6 max-w-3xl">
        <TripsImportForm />

        <div className="mt-6 pt-6 border-t text-xs text-slate-500 space-y-2">
          <p><strong>Hoe kom je aan de Excel-export?</strong></p>
          <ol className="list-decimal ml-5 space-y-1">
            <li>Log in op het ULU dashboard</li>
            <li>Ga naar <em>Rapportages</em> → <em>Ritten</em></li>
            <li>Selecteer periode (bv. 1 jan – vandaag) en download als <code>.xlsx</code></li>
            <li>Upload hier</li>
          </ol>
          <p>
            <strong>Verwachte kolommen:</strong>{' '}
            <em>Naam (bestuurder), Kenteken, Start rit (datum/tijd), Adres (start/stop),
            Afstand, Tijd (totaal rit), Kilometerstand, Rit type, Score.</em>
          </p>
          <p>
            <strong>Idempotent:</strong> bestaande ritten (zelfde kenteken + datum + tijd) worden
            niet dubbel geïmporteerd — ontbrekende velden worden aangevuld.
          </p>
          <p>
            <strong>Bestuurder-matching:</strong> de naam uit Excel wordt exact-match vergeleken
            met bestuurders in de database. Als er geen match is, wordt de naam wel bewaard maar
            kan de rit niet met bijtelling-regels gematcht worden. Namen zonder match zie je in
            het resultaat.
          </p>
        </div>
      </div>
    </>
  )
}
