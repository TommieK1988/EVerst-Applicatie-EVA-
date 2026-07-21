import { redirect } from 'next/navigation'

// De losse houtrot-app is vervallen: registraties horen bij een dossier (tab
// Houtrot, zichtbaar met de toggle `houtrot_registreren`). Wat hier overblijft
// is de reparatiebibliotheek met de prijzen.
export default function HoutrotherstelPage() {
  redirect('/houtrotherstel/standaard-reparaties')
}
