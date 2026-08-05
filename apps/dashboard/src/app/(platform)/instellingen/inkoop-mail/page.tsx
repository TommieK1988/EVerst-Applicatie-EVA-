import {
  getBestellingMailSjablonen, BESTELLING_MAIL_VARIABELEN,
} from '@/lib/bouw7/bestelling-mail-sjabloon'
import InkoopMailBeheer from './InkoopMailBeheer'

export const dynamic = 'force-dynamic'

export default async function InkoopMailInstellingenPagina() {
  const sjablonen = await getBestellingMailSjablonen()
  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-lg font-bold text-slate-900 mb-1">Inkoop-e-mail</h1>
      <p className="text-sm text-slate-500 mb-5">
        Het standaard onderwerp en de tekst waarmee een inkooporder of onderaannemersopdracht naar
        de leverancier wordt gemaild. Bij het versturen kun je de tekst nog aanpassen.
      </p>
      <InkoopMailBeheer initieel={sjablonen} variabelen={BESTELLING_MAIL_VARIABELEN} />
    </div>
  )
}
