import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/houtrotherstel/supabase/server'
import { getCurrentMedewerker, getEffectieveRechten, heeftModuleToegang } from '@/lib/auth/rechten'
import Link from 'next/link'
import { ArrowLeft, Edit, MapPin, Calendar, User, Wrench, Euro } from 'lucide-react'
import StatusBadge from '@/components/houtrotherstel/shared/StatusBadge'
import FotoUpload from '@/components/houtrotherstel/registraties/FotoUpload'
import StatusWijziging from '@/components/houtrotherstel/registraties/StatusWijziging'
import { formatDate, formatCurrency, formatNumber } from '@/lib/houtrotherstel/utils'

export const metadata: Metadata = { title: 'Registratie detail' }

export default async function RegistratieDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  // Rechten lopen sinds de cutover via EVA (medewerkers + rechten), niet meer
  // via het oude houtrot-eigen profiles.role.
  const medewerker = await getCurrentMedewerker()
  const rechten = await getEffectieveRechten(medewerker)

  const { data: registratie } = await supabase
    .from('repair_registrations')
    .select(`
      *,
      projects(id, name, project_number, client_name, city),
      standard_repairs(id, code, name, category),
      repair_photos(id, photo_type, storage_path, file_name, created_at)
    `)
    .eq('id', id)
    .single()

  if (!registratie) notFound()

  // De registrant staat in public.medewerkers; dat schema is niet embedbaar vanuit
  // de houtrot-client, dus halen we de naam uit de view die er wél overheen joint.
  const { data: detail } = await supabase
    .from('registraties_met_details')
    .select('medewerker_naam')
    .eq('id', id)
    .maybeSingle()
  const medewerkerNaam = (detail as { medewerker_naam?: string | null } | null)?.medewerker_naam ?? '—'

  const isAdmin = heeftModuleToegang(rechten, 'houtrotherstel', 'beheren')
  const isProjectleider = heeftModuleToegang(rechten, 'houtrotherstel', 'schrijven')
  // user_id op een registratie is sinds de cutover een medewerker-id.
  const isOwner = !!medewerker && registratie.user_id === medewerker.id
  const canEdit = isAdmin || isProjectleider || isOwner

  const effectieveVerkoopprijs = registratie.actual_sale_price ?? registratie.sale_price_snapshot
  const effectieveKostprijs = registratie.actual_cost_price ?? registratie.cost_price_snapshot
  const effectieveMarge = effectieveVerkoopprijs && effectieveKostprijs
    ? effectieveVerkoopprijs - effectieveKostprijs : null

  return (
    <div className="space-y-6 pb-20 lg:pb-0 max-w-4xl">
      {/* Navigatie */}
      <div>
        <Link
          href={registratie.project_id ? `/projecten/${registratie.project_id}` : '/registraties'}
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-4 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          {(registratie.projects as any)?.name || 'Terug naar registraties'}
        </Link>

        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <StatusBadge status={registratie.status} />
              <StatusBadge status={registratie.control_status} type="control" size="sm" />
            </div>
            <h1 className="text-xl font-bold text-slate-900">
              {registratie.repair_name_snapshot || registratie.component_type || 'Registratie'}
            </h1>
            <p className="text-slate-500 text-sm">
              {(registratie.projects as any)?.name} · {(registratie.projects as any)?.project_number}
            </p>
          </div>
          <div className="flex gap-2">
            {canEdit && (
              <Link
                href={`/houtrotherstel/registraties/${id}/bewerken`}
                className="inline-flex items-center gap-2 bg-white border border-slate-300
                  hover:border-slate-400 text-slate-700 font-medium px-4 py-2.5 rounded-lg text-sm transition-colors"
              >
                <Edit className="w-4 h-4" />
                Bewerken
              </Link>
            )}
            {(isAdmin || isProjectleider) && (
              <StatusWijziging
                registratieId={id}
                huidigeStatus={registratie.status}
              />
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Linker kolom: details */}
        <div className="space-y-4 lg:col-span-2">
          {/* Locatie */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h2 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
              <MapPin className="w-4 h-4 text-slate-400" />
              Locatie
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
              {[
                { label: 'Blok / Bouwdeel', value: registratie.location_block },
                { label: 'Verdieping', value: registratie.floor },
                { label: 'Woning / Ruimte', value: registratie.room_or_unit },
                { label: 'Gevelzijde', value: registratie.facade_side },
                { label: 'Onderdeeltype', value: registratie.component_type },
                { label: 'Elementnummer', value: registratie.element_number },
              ].map(({ label, value }) => value ? (
                <div key={label}>
                  <div className="text-xs text-slate-400 mb-0.5">{label}</div>
                  <div className="font-medium text-slate-700">{value}</div>
                </div>
              ) : null)}
            </div>
          </div>

          {/* Schade */}
          {(registratie.damage_description || registratie.damage_severity || registratie.damage_cause) && (
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h2 className="font-semibold text-slate-800 mb-4">Schade-informatie</h2>
              <div className="space-y-3 text-sm">
                {registratie.damage_severity && (
                  <div>
                    <span className="text-slate-400 text-xs">Ernst</span>
                    <div className="mt-0.5">
                      <StatusBadge status={registratie.damage_severity} type="schade" size="sm" />
                    </div>
                  </div>
                )}
                {registratie.damage_description && (
                  <div>
                    <span className="text-slate-400 text-xs">Omschrijving schade</span>
                    <p className="text-slate-700 mt-0.5">{registratie.damage_description}</p>
                  </div>
                )}
                {registratie.damage_cause && (
                  <div>
                    <span className="text-slate-400 text-xs">Oorzaak</span>
                    <p className="text-slate-700 mt-0.5">{registratie.damage_cause}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Werkzaamheden */}
          {(registratie.repair_name_snapshot || registratie.custom_work_description) && (
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h2 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
                <Wrench className="w-4 h-4 text-slate-400" />
                Werkzaamheden
              </h2>
              {registratie.repair_name_snapshot && (
                <div className="mb-3 p-3 bg-blue-50 rounded-lg">
                  <div className="text-xs text-blue-500 mb-0.5">Standaard reparatie</div>
                  <div className="font-medium text-blue-800">{registratie.repair_name_snapshot}</div>
                  {registratie.repair_code_snapshot && (
                    <div className="text-xs text-blue-600">{registratie.repair_code_snapshot}</div>
                  )}
                </div>
              )}
              {registratie.custom_work_description && (
                <p className="text-sm text-slate-700">{registratie.custom_work_description}</p>
              )}
            </div>
          )}

          {/* Foto's */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h2 className="font-semibold text-slate-800 mb-4">Foto&apos;s</h2>
            <FotoUpload
              registratieId={id}
              initialPhotos={(registratie.repair_photos as any[]) || []}
              readonly={!canEdit}
            />
          </div>

          {/* Notities */}
          {registratie.notes && (
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h2 className="font-semibold text-slate-800 mb-2">Opmerkingen</h2>
              <p className="text-sm text-slate-600">{registratie.notes}</p>
            </div>
          )}
        </div>

        {/* Rechter kolom: meta + financieel */}
        <div className="space-y-4">
          {/* Meta */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h2 className="font-semibold text-slate-800 mb-4">Informatie</h2>
            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-slate-400" />
                <div>
                  <div className="text-xs text-slate-400">Registratiedatum</div>
                  <div className="text-slate-700">{formatDate(registratie.registration_date)}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-slate-400" />
                <div>
                  <div className="text-xs text-slate-400">Medewerker</div>
                  <div className="text-slate-700">{medewerkerNaam}</div>
                </div>
              </div>
              {registratie.completed_at && (
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-green-400" />
                  <div>
                    <div className="text-xs text-slate-400">Datum gereed</div>
                    <div className="text-slate-700">{formatDate(registratie.completed_at)}</div>
                  </div>
                </div>
              )}
              {registratie.checked_at && (
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-blue-400" />
                  <div>
                    <div className="text-xs text-slate-400">Datum gecontroleerd</div>
                    <div className="text-slate-700">{formatDate(registratie.checked_at)}</div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Financieel */}
          {(isAdmin || isProjectleider) && effectieveVerkoopprijs !== null && (
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h2 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
                <Euro className="w-4 h-4 text-slate-400" />
                Financieel
              </h2>

              <div className="space-y-3">
                {/* Normatief */}
                <div>
                  <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                    Normatief
                  </div>
                  <div className="space-y-1.5 text-sm">
                    {registratie.labor_hours_snapshot && (
                      <div className="flex justify-between">
                        <span className="text-slate-500">Uren ({formatNumber(registratie.labor_hours_snapshot, 1)}h)</span>
                        <span>{formatCurrency(registratie.labor_cost_snapshot)}</span>
                      </div>
                    )}
                    {registratie.material_cost_snapshot && (
                      <div className="flex justify-between">
                        <span className="text-slate-500">Materiaal</span>
                        <span>{formatCurrency(registratie.material_cost_snapshot)}</span>
                      </div>
                    )}
                    {registratie.cost_price_snapshot && (
                      <div className="flex justify-between border-t border-slate-100 pt-1">
                        <span className="text-slate-600 font-medium">Kostprijs</span>
                        <span className="font-medium">{formatCurrency(registratie.cost_price_snapshot)}</span>
                      </div>
                    )}
                    {registratie.sale_price_snapshot && (
                      <div className="flex justify-between">
                        <span className="font-semibold text-slate-800">Verkoopprijs</span>
                        <span className="font-semibold text-blue-700">{formatCurrency(registratie.sale_price_snapshot)}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Werkelijk (indien afwijkend) */}
                {(registratie.actual_sale_price || registratie.actual_labor_hours || registratie.actual_material_cost) && (
                  <div className="border-t border-slate-100 pt-3">
                    <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                      Werkelijk
                    </div>
                    <div className="space-y-1.5 text-sm">
                      {registratie.actual_labor_hours && (
                        <div className="flex justify-between">
                          <span className="text-slate-500">Uren ({formatNumber(registratie.actual_labor_hours, 1)}h)</span>
                          <span>{formatCurrency((registratie.actual_labor_hours || 0) * (registratie.labor_rate_snapshot || 0))}</span>
                        </div>
                      )}
                      {registratie.actual_material_cost && (
                        <div className="flex justify-between">
                          <span className="text-slate-500">Materiaal</span>
                          <span>{formatCurrency(registratie.actual_material_cost)}</span>
                        </div>
                      )}
                      {registratie.actual_sale_price && (
                        <div className="flex justify-between">
                          <span className="font-semibold text-slate-800">Verkoopprijs</span>
                          <span className="font-semibold text-blue-700">{formatCurrency(registratie.actual_sale_price)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Effectieve marge */}
                {effectieveMarge !== null && (
                  <div className="bg-slate-50 rounded-lg p-3 mt-2">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium text-slate-700">Marge</span>
                      <div className="text-right">
                        <div className={`font-bold ${effectieveMarge >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {formatCurrency(effectieveMarge)}
                        </div>
                        {effectieveVerkoopprijs && (
                          <div className="text-xs text-slate-400">
                            {Math.round((effectieveMarge / effectieveVerkoopprijs) * 100)}%
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
