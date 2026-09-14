import { PageHeader } from '@/components/ui'
import { getEffectieveRechten, magOnderdeelZien } from '@/lib/auth/rechten'
import { heeftModuleToegang, isBeheerder } from '@/lib/auth/rechten-shared'
import { FEATURES } from '@/lib/features'
import { INSTELLINGEN_SECTIES, type InstellingTegel } from '@/lib/instellingen/catalogus'
import InstellingenHub from '@/components/instellingen/InstellingenHub'

export const metadata = { title: 'Instellingen' }

export default async function Page() {
  const rechten = await getEffectieveRechten()
  const beheerder = isBeheerder(rechten)

  const zichtbaar = (tegel: InstellingTegel) => {
    if (tegel.feature && !FEATURES[tegel.feature]) return false
    if (tegel.alleenBeheerder && !beheerder) return false
    // Zachte filter: bestaat dit onderdeel voor deze gebruiker?
    if (!magOnderdeelZien(rechten, tegel.module, 'beheren')) return false
    // Harde filter: de pagina erachter heeft een vereisModuleToegang() met deze eis. Zonder
    // deze check zou de tegel zichtbaar zijn en bij klikken naar de startpagina redirecten.
    if (tegel.guard && !heeftModuleToegang(rechten, tegel.guard.module, tegel.guard.niveau)) return false
    return true
  }

  const secties = INSTELLINGEN_SECTIES
    .map(sectie => ({ ...sectie, tegels: sectie.tegels.filter(zichtbaar) }))
    .filter(sectie => sectie.tegels.length > 0)

  return (
    <div className="eva-page">
      <PageHeader eyebrow="Platform" title="Bedrijfsinstellingen" />
      <p className="eva-page-desc">
        Alles wat je in EVA instelt, gegroepeerd zoals het menu links. Weet je niet waar iets staat? Zoek hieronder.
      </p>

      <InstellingenHub secties={secties} />
    </div>
  )
}
