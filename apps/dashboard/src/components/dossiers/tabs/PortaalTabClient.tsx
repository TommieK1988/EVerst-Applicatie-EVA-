'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardHeader, CardBody, Button, Badge, useDialogen } from '@/components/ui'
import { PORTAAL_ONDERDELEN_ACTIEF } from '@/lib/portaal/onderdelen'
import type { PortaalDossierBeheer } from '@/lib/portaal/beheer'
import type { PortaalOnderdeel, PortaalScope } from '@everts/database/platform-types'
import {
  setPortaalDossierActief, setPortaalOnderdeel, setPortaalPlanningDetail,
  nodigPortaalGebruikerUit, setPortaalGebruikerScope, setPortaalGebruikerActief,
} from '@/lib/portaal/beheer-actions'

/**
 * Het beheerscherm van het klantportaal binnen één dossier.
 *
 * De opzet volgt de volgorde waarin je erover nadenkt: eerst of het portaal
 * überhaupt open is, dan wát er te zien is, dan wíé er mag kijken. De teksten
 * zeggen steeds wat de klant ziet, niet wat de kolom heet — dat is precies het
 * verschil tussen een instelling die je durft aan te zetten en eentje niet.
 */
export function PortaalTabClient({ dossierId, data }: { dossierId: string; data: PortaalDossierBeheer }) {
  const router = useRouter()
  const { bevestig, meld } = useDialogen()
  const [bezig, start] = useTransition()
  const [fout, setFout] = useState<string | null>(null)

  const inst = data.instellingen
  const vlag = (k: string) => !!(inst as unknown as Record<string, boolean>)[k]

  function verwerk(actie: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    setFout(null)
    start(async () => {
      const r = await actie()
      if (!r.ok) { setFout(r.error); return }
      router.refresh()
    })
  }

  async function uitnodigen(contactpersoonId: string, naam: string, email: string) {
    // Het adres voluit tonen vóór de bevestiging: één verkeerd adres betekent dat
    // alle projectgegevens bij een vreemde belanden. Dat is geen theoretisch risico —
    // deze adressen komen uit de Bouw7-sync en worden zelden gecontroleerd.
    const akkoord = await bevestig({
      titel: `${naam} toegang geven?`,
      omschrijving:
        `Er gaat een uitnodiging met inloglink naar ${email}. Daarmee ziet deze persoon ` +
        `de projecten die je hier hebt opengezet — controleer of dit adres klopt.`,
      bevestigLabel: 'Uitnodiging versturen',
    })
    if (!akkoord) return

    verwerk(async () => {
      const r = await nodigPortaalGebruikerUit({
        contactpersoonId, relatieId: data.klantId, email,
      })
      if (r.ok) await meld({ titel: 'Uitnodiging verstuurd', omschrijving: `${naam} heeft een inloglink ontvangen op ${email}.` })
      return r
    })
  }

  async function toegangWijzigen(id: string, naam: string, actief: boolean) {
    if (!actief) {
      const akkoord = await bevestig({
        titel: `Toegang van ${naam} intrekken?`,
        omschrijving: 'Deze persoon kan daarna niet meer inloggen. De berichtgeschiedenis blijft bewaard.',
        bevestigLabel: 'Intrekken',
      })
      if (!akkoord) return
    }
    verwerk(() => setPortaalGebruikerActief(id, actief))
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-6 sm:p-8">
      {fout && (
        <div className="rounded-lg border border-error-200 bg-error-50 px-4 py-2.5 text-sm text-error-700">
          {fout}
        </div>
      )}

      {/* ── 1. Staat het portaal open ── */}
      <Card>
        <CardBody>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 className="text-sm font-bold">Klantportaal voor dit dossier</h2>
              <p className="mt-1 max-w-md text-[13px] leading-relaxed text-neutral-500">
                Staat dit uit, dan bestaat dit dossier niet voor de klant — ook niet als hij de
                link heeft. Alles wat je hieronder aanzet werkt pas als deze schakelaar aan staat.
              </p>
            </div>
            <Button
              variant={inst.actief ? 'primary' : 'outline'}
              disabled={bezig}
              onClick={() => verwerk(() => setPortaalDossierActief(dossierId, !inst.actief))}
            >
              {inst.actief ? 'Portaal staat aan' : 'Portaal openzetten'}
            </Button>
          </div>

          {inst.actief && (
            <p className="mt-3 border-t border-neutral-100 pt-3 text-xs text-neutral-500">
              De klant vindt dit project op{' '}
              <span className="font-mono text-[11px] text-neutral-700">{data.portaalUrl}</span>
            </p>
          )}
        </CardBody>
      </Card>

      {/* ── 2. Wat ziet de klant ── */}
      <Card>
        <CardHeader>
          <span>Wat ziet de klant</span>
          <span className="text-[11px] font-normal opacity-80">
            Alles staat standaard uit — zet alleen aan wat je bewust wilt delen
          </span>
        </CardHeader>
        <CardBody>
          <ul className="divide-y divide-neutral-100">
            {PORTAAL_ONDERDELEN_ACTIEF.map(o => (
              <li key={o.key} className="flex items-start justify-between gap-4 py-3 first:pt-0">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{o.label}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-neutral-500">{o.uitleg}</p>

                  {o.key === 'bestanden' && vlag('toon_bestanden') && (
                    <p className="mt-1 text-xs font-medium text-neutral-600">
                      {data.aantalBestanden.documenten} document(en) vrijgegeven — aanvinken doe je op de tab Bestanden.
                    </p>
                  )}
                  {o.key === 'fotos' && vlag('toon_fotos') && (
                    <p className="mt-1 text-xs font-medium text-neutral-600">
                      {data.aantalBestanden.fotos} foto&apos;s vrijgegeven — aanvinken doe je op de tab Bestanden.
                    </p>
                  )}
                  {o.key === 'planning' && vlag('toon_planning') && (
                    <label className="mt-1.5 flex items-center gap-2 text-xs text-neutral-600">
                      <input
                        type="checkbox"
                        checked={inst.planning_detail}
                        disabled={bezig}
                        onChange={e => verwerk(() => setPortaalPlanningDetail(dossierId, e.target.checked))}
                      />
                      Ook de losse activiteiten tonen (anders alleen de fases)
                    </label>
                  )}
                </div>

                <Schakelaar
                  aan={vlag(o.kolom)}
                  disabled={bezig || !inst.actief}
                  onChange={aan => verwerk(() => setPortaalOnderdeel(dossierId, o.key as PortaalOnderdeel, aan))}
                />
              </li>
            ))}
          </ul>

          <p className="mt-3 border-t border-neutral-100 pt-3 text-xs text-neutral-500">
            In de planning zijn <strong>nooit</strong> namen van medewerkers zichtbaar, in geen van beide standen.
          </p>
        </CardBody>
      </Card>

      {/* ── 3. Wie mag kijken ── */}
      <Card>
        <CardHeader>
          <span>Wie heeft toegang</span>
          <span className="text-[11px] font-normal opacity-80">
            {data.klantNaam ? `Contactpersonen van ${data.klantNaam}` : 'Nog geen opdrachtgever gekoppeld'}
          </span>
        </CardHeader>
        <CardBody>
          {data.toegang.length === 0 ? (
            <p className="text-[13px] text-neutral-500">Nog niemand heeft toegang tot het portaal.</p>
          ) : (
            <ul className="divide-y divide-neutral-100">
              {data.toegang.map(t => (
                <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5 first:pt-0">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">
                      {t.naam}
                      {!t.actief && <Badge className="ml-2" tone="neutral">ingetrokken</Badge>}
                      {t.actief && !t.heeftIngelogd && <Badge className="ml-2" variant="outline" tone="warning">nog niet ingelogd</Badge>}
                    </p>
                    <p className="text-xs text-neutral-500">{t.email}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      value={t.scope}
                      disabled={bezig}
                      onChange={e => verwerk(() => setPortaalGebruikerScope(t.id, e.target.value as PortaalScope))}
                      className="rounded-md border border-neutral-300 px-2 py-1 text-xs"
                      title="Welke dossiers deze persoon ziet"
                    >
                      <option value="eigen_dossiers">Alleen eigen projecten</option>
                      <option value="organisatie">Alle projecten van de organisatie</option>
                    </select>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={bezig}
                      onClick={() => toegangWijzigen(t.id, t.naam, !t.actief)}
                    >
                      {t.actief ? 'Intrekken' : 'Heractiveren'}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {data.uitnodigbaar.length > 0 && (
            <div className="mt-4 border-t border-neutral-100 pt-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">
                Nog uit te nodigen
              </p>
              <ul className="space-y-1.5">
                {data.uitnodigbaar.map(u => (
                  <li key={u.contactpersoonId} className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <span className="text-sm">{u.naam}</span>
                      {u.functie && <span className="ml-1.5 text-xs text-neutral-400">{u.functie}</span>}
                      <span className="block text-xs text-neutral-500">{u.email}</span>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={bezig}
                      onClick={() => uitnodigen(u.contactpersoonId, u.naam, u.email)}
                    >
                      Uitnodigen
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  )
}

/** Kleine aan/uit-schakelaar. Uitgeschakeld zolang het portaal zelf dicht staat. */
function Schakelaar({
  aan, disabled, onChange,
}: {
  aan: boolean; disabled?: boolean; onChange: (aan: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={aan}
      disabled={disabled}
      onClick={() => onChange(!aan)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition disabled:opacity-40 ${
        aan ? 'bg-brand-600' : 'bg-neutral-300'
      }`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${
          aan ? 'left-[22px]' : 'left-0.5'
        }`}
      />
    </button>
  )
}
