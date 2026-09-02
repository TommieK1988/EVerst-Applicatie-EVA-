import { createAdminClient } from '@everts/database/server'
import { vereisModuleToegang } from '@/lib/auth/rechten'
import { PageHeader, Card, CardHeader, CardBody, Badge } from '@/components/ui'
import { datumKort } from '@/lib/portaal/format'

export const metadata = { title: 'Klantportaal' }
export const dynamic = 'force-dynamic'

/**
 * Overzicht van alle portaalaccounts.
 *
 * Bedoeld om twee vragen te beantwoorden die je per dossier niet ziet: wie heeft
 * er eigenlijk allemaal toegang, en bij wie is de uitnodiging blijven liggen.
 * Dat laatste is het meest voorkomende probleem — een adres uit de Bouw7-sync
 * dat al jaren niet meer klopt, waardoor de klant nooit iets ontvangt.
 */
export default async function KlantportaalInstellingen() {
  await vereisModuleToegang('klantportaal', 'beheren')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any

  const { data: gebruikers } = await db
    .from('portaal_gebruikers')
    .select('id, email, scope, actief, uitgenodigd_op, laatst_ingelogd_op, contactpersoon_id, particulier_id, relatie_id')
    .order('laatst_ingelogd_op', { ascending: false, nullsFirst: false })
    .limit(500)

  const rijen = (gebruikers ?? []) as Record<string, unknown>[]

  const relatieIds = [...new Set(rijen.map(r => r.relatie_id).filter(Boolean))] as string[]
  const cpIds = [...new Set(rijen.map(r => r.contactpersoon_id).filter(Boolean))] as string[]

  const [{ data: relaties }, { data: contactpersonen }] = await Promise.all([
    relatieIds.length ? db.from('relaties').select('id, naam').in('id', relatieIds) : { data: [] },
    cpIds.length
      ? db.from('contactpersonen').select('id, voornaam, tussenvoegsel, achternaam').in('id', cpIds)
      : { data: [] },
  ])

  const relatieNaam = new Map<string, string>(
    ((relaties ?? []) as { id: string; naam: string }[]).map(r => [r.id, r.naam]),
  )
  const cpNaam = new Map<string, string>(
    ((contactpersonen ?? []) as Record<string, unknown>[]).map(c => [
      String(c.id),
      [c.voornaam, c.tussenvoegsel, c.achternaam].filter(Boolean).join(' '),
    ]),
  )

  const nooitIngelogd = rijen.filter(r => r.actief && !r.laatst_ingelogd_op).length

  return (
    <div className="mx-auto max-w-5xl p-6 sm:p-8">
      <PageHeader eyebrow="Instellingen" title="Klantportaal" />
      <p className="-mt-3 mb-5 text-[13px] text-neutral-500">
        Alle opdrachtgevers met toegang tot hun eigen projectomgeving. Uitnodigen doe je per
        dossier, op de tab Klantportaal.
      </p>

      {nooitIngelogd > 0 && (
        <div className="mb-4 rounded-lg border border-warning-200 bg-warning-50 px-4 py-2.5 text-[13px] text-warning-800">
          {nooitIngelogd} uitgenodigde {nooitIngelogd === 1 ? 'persoon heeft' : 'personen hebben'} nog nooit ingelogd.
          Vaak klopt het e-mailadres niet meer — controleer het bij de contactpersoon.
        </div>
      )}

      <Card>
        <CardHeader>
          <span>Portaalaccounts</span>
          <span className="text-[11px] font-normal opacity-80">{rijen.length} in totaal</span>
        </CardHeader>
        <CardBody style={{ padding: 0 }}>
          {rijen.length === 0 ? (
            <p className="px-4 py-5 text-[13px] text-neutral-500">
              Er zijn nog geen portaalaccounts. Je nodigt een contactpersoon uit vanaf de
              tab Klantportaal in een dossier.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-[13px]">
                <thead>
                  <tr className="border-b border-neutral-200 text-left text-[10px] uppercase tracking-[0.03em] text-neutral-400">
                    <th className="px-3 py-1.5 font-bold">Naam</th>
                    <th className="px-3 py-1.5 font-bold">E-mailadres</th>
                    <th className="px-3 py-1.5 font-bold">Organisatie</th>
                    <th className="px-3 py-1.5 font-bold">Ziet</th>
                    <th className="px-3 py-1.5 font-bold">Uitgenodigd</th>
                    <th className="px-3 py-1.5 font-bold">Laatst ingelogd</th>
                  </tr>
                </thead>
                <tbody>
                  {rijen.map(r => (
                    <tr key={String(r.id)} className="border-b border-neutral-100">
                      <td className="px-3 py-1.5">
                        {r.contactpersoon_id ? cpNaam.get(String(r.contactpersoon_id)) ?? '—' : '—'}
                        {!r.actief && <Badge className="ml-2" tone="neutral">ingetrokken</Badge>}
                      </td>
                      <td className="px-3 py-1.5 text-neutral-600">{String(r.email)}</td>
                      <td className="px-3 py-1.5 text-neutral-600">
                        {r.relatie_id ? relatieNaam.get(String(r.relatie_id)) ?? '—' : '—'}
                      </td>
                      <td className="px-3 py-1.5 text-neutral-600">
                        {r.scope === 'organisatie' ? 'Alle projecten van de organisatie' : 'Alleen eigen projecten'}
                      </td>
                      <td className="px-3 py-1.5 tabular-nums text-neutral-500">
                        {datumKort(r.uitgenodigd_op as string | null)}
                      </td>
                      <td className="px-3 py-1.5 tabular-nums text-neutral-500">
                        {r.laatst_ingelogd_op
                          ? datumKort(r.laatst_ingelogd_op as string)
                          : <span className="text-warning-700">nooit</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  )
}
