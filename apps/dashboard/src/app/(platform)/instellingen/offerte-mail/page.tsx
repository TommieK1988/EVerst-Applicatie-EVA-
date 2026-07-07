import { getOfferteMailSjabloon } from '@/lib/everts-calc/offerte-mail'
import OfferteMailBeheer from './OfferteMailBeheer'

export const dynamic = 'force-dynamic'

export default async function OfferteMailInstellingenPagina() {
  const sjabloon = await getOfferteMailSjabloon()
  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-lg font-bold text-slate-900 mb-1">Offerte-e-mail</h1>
      <p className="text-sm text-slate-500 mb-5">
        Het standaard onderwerp en de tekst waarmee een goedgekeurde offerte naar de opdrachtgever
        wordt gemaild. Bij verzenden kun je de tekst nog aanpassen.
      </p>
      <OfferteMailBeheer initieel={sjabloon} />
    </div>
  )
}
