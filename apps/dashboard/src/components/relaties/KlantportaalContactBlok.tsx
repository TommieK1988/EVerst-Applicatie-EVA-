'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Badge, Button, Card, CardBody, CardHeader, Input, RadioGroup, RadioGroupItem, useDialogen } from '@/components/ui'
import type { PortaalContactpersoonBeheer, PortaalAccountVanContactpersoon } from '@/lib/portaal/contactpersoon'
import { nodigPortaalGebruikerUit, setPortaalGebruikerActief } from '@/lib/portaal/beheer-actions'
import { setPortaalBereik } from '@/lib/portaal/contactpersoon-actions'
import { datumKort } from '@/lib/portaal/format'

type Bereik = 'eigen_dossiers' | 'organisatie'
type Organisatie = PortaalContactpersoonBeheer['organisaties'][number]
type Resultaat = { ok: true; geopend?: number } | { ok: false; error: string }

/**
 * Klantportaal op de contactpersoonpagina.
 *
 * Toegang is per persoon: zet je hem hier aan, dan ziet deze persoon al zijn lopende
 * dossiers — of, als manager, alle dossiers van zijn organisatie — en komt elk nieuw
 * dossier er vanzelf bij. Welke onderdelen dan aanstaan volgt uit de standaard onder
 * Instellingen → Klantportaal; per dossier blijft alles daarna bij te stellen.
 */
export default function KlantportaalContactBlok({
  contactpersoonId,
  naam,
  data,
}: {
  contactpersoonId: string
  naam: string
  data: PortaalContactpersoonBeheer
}) {
  const router = useRouter()
  const { bevestig, meld } = useDialogen()
  const [bezig, start] = useTransition()
  const [fout, setFout] = useState<string | null>(null)

  function verwerk(actie: () => Promise<Resultaat>, gelukt?: (r: { geopend?: number }) => Promise<void>) {
    setFout(null)
    start(async () => {
      const r = await actie()
      if (!r.ok) { setFout(r.error); return }
      if (gelukt) await gelukt(r)
      router.refresh()
    })
  }

  async function uitnodigen(email: string, bereik: Bereik, relatieId: string | null, opnieuw: boolean) {
    // Het adres voluit vóór de bevestiging: één verkeerd adres en alle projectgegevens
    // belanden bij een vreemde. Deze adressen komen uit de Bouw7-sync.
    const akkoord = await bevestig({
      titel: opnieuw ? `Nieuwe inloglink naar ${naam}?` : `${naam} toegang geven tot het klantportaal?`,
      omschrijving: `Er gaat een uitnodiging met inloglink naar ${email}. Controleer of dit adres klopt.`,
      bevestigLabel: 'Uitnodiging versturen',
    })
    if (!akkoord) return
    verwerk(
      () => nodigPortaalGebruikerUit({ contactpersoonId, relatieId, email, scope: bereik }),
      r => meld({
        titel: 'Uitnodiging verstuurd',
        omschrijving: opnieuw ? `${naam} heeft een nieuwe inloglink ontvangen.` : geopendTekst(r.geopend),
      }),
    )
  }

  async function toegangWijzigen(account: PortaalAccountVanContactpersoon) {
    if (account.actief) {
      const akkoord = await bevestig({
        titel: `Toegang van ${naam} intrekken?`,
        omschrijving: 'Deze persoon kan daarna niet meer inloggen. De berichtgeschiedenis blijft bewaard.',
        bevestigLabel: 'Intrekken',
        destructief: true,
      })
      if (!akkoord) return
    }
    verwerk(() => setPortaalGebruikerActief(account.id, !account.actief))
  }

  return (
    <Card>
      <CardHeader>
        <span>Klantportaal</span>
        {data.accounts.some(a => a.actief) && <Badge tone="success">Toegang</Badge>}
      </CardHeader>
      <CardBody>
        {fout && (
          <div className="mb-3 rounded-lg border border-error-200 bg-error-50 px-3 py-2 text-xs text-error-700">{fout}</div>
        )}

        {data.accounts.length === 0 ? (
          data.magBeheren ? (
            <NieuweToegang
              standaardEmail={data.standaardEmail}
              organisaties={data.organisaties}
              bezig={bezig}
              onUitnodigen={(email, bereik, relatieId) => uitnodigen(email, bereik, relatieId, false)}
            />
          ) : (
            <p className="text-xs text-neutral-500">Deze persoon heeft nog geen toegang tot het klantportaal.</p>
          )
        ) : (
          <ul className="space-y-4">
            {data.accounts.map(account => (
              <li key={account.id} className="space-y-3">
                <div>
                  <p className="break-all text-sm font-semibold">{account.email}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-neutral-500">
                    {!account.actief && <Badge tone="neutral">Ingetrokken</Badge>}
                    {account.actief && !account.laatstIngelogdOp && (
                      <Badge variant="outline" tone="warning">Nog niet ingelogd</Badge>
                    )}
                    {account.laatstIngelogdOp && <span>Laatst ingelogd {datumKort(account.laatstIngelogdOp)}</span>}
                  </div>
                  {account.actief && (
                    <p className="mt-1 text-xs text-neutral-500">
                      Ziet nu {account.aantalDossiers} {account.aantalDossiers === 1 ? 'dossier' : 'dossiers'}.
                    </p>
                  )}
                </div>

                {account.scope === 'alleen_gekoppeld' ? (
                  <p className="text-xs leading-relaxed text-neutral-500">
                    Meekijker: ziet alleen de dossiers waar hij los aan gekoppeld is. Nieuwe dossiers
                    komen er niet vanzelf bij.
                  </p>
                ) : data.magBeheren && account.actief ? (
                  <BereikKiezer
                    bereik={account.scope as Bereik}
                    relatieId={account.relatieId}
                    organisaties={metHuidige(data.organisaties, account)}
                    bezig={bezig}
                    onWijzig={(bereik, relatieId) => verwerk(
                      () => setPortaalBereik({ portaalGebruikerId: account.id, scope: bereik, relatieId }),
                      async r => { if (r.geopend) await meld({ titel: 'Bereik aangepast', omschrijving: geopendTekst(r.geopend) }) },
                    )}
                  />
                ) : (
                  <p className="text-xs text-neutral-500">
                    {account.scope === 'organisatie'
                      ? `Ziet alle dossiers van ${account.relatieNaam ?? 'de organisatie'}.`
                      : 'Ziet de dossiers waar hij contactpersoon is.'}
                  </p>
                )}

                {data.magBeheren && (
                  <div className="flex flex-wrap gap-2">
                    {account.actief && (
                      <Button
                        size="sm" variant="outline" disabled={bezig}
                        onClick={() => uitnodigen(account.email, account.scope as Bereik, account.relatieId, true)}
                      >
                        Nieuwe inloglink
                      </Button>
                    )}
                    <Button size="sm" variant="outline" disabled={bezig} onClick={() => toegangWijzigen(account)}>
                      {account.actief ? 'Intrekken' : 'Heractiveren'}
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  )
}

function geopendTekst(geopend: number | undefined): string {
  const basis = 'Nieuwe dossiers komen er vanaf nu vanzelf bij.'
  if (!geopend) return basis
  return `${geopend} lopende ${geopend === 1 ? 'dossier is' : 'dossiers zijn'} voor het portaal opengezet. ${basis}`
}

/** De organisatie van het account hoort in de keuzelijst, ook als de koppeling intussen weg is. */
function metHuidige(organisaties: Organisatie[], account: PortaalAccountVanContactpersoon): Organisatie[] {
  if (!account.relatieId || organisaties.some(o => o.id === account.relatieId)) return organisaties
  return [...organisaties, { id: account.relatieId, naam: account.relatieNaam ?? 'Onbekende organisatie', isPrimair: false }]
}

function NieuweToegang({
  standaardEmail, organisaties, bezig, onUitnodigen,
}: {
  standaardEmail: string | null
  organisaties: Organisatie[]
  bezig: boolean
  onUitnodigen: (email: string, bereik: Bereik, relatieId: string | null) => void
}) {
  const [email, setEmail] = useState(standaardEmail ?? '')
  const [bereik, setBereik] = useState<Bereik>('eigen_dossiers')
  const [relatieId, setRelatieId] = useState<string | null>(organisaties[0]?.id ?? null)

  return (
    <div className="space-y-3">
      <p className="text-xs leading-relaxed text-neutral-500">
        Geef deze persoon een eigen inlog. Lopende dossiers gaan meteen open, nieuwe dossiers komen
        er vanzelf bij.
      </p>
      <label className="block">
        <span className="mb-1 block text-[10.5px] font-bold uppercase tracking-[0.08em] text-neutral-500">E-mailadres</span>
        <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="naam@bedrijf.nl" />
      </label>
      <BereikKiezer
        bereik={bereik}
        relatieId={relatieId}
        organisaties={organisaties}
        bezig={bezig}
        onWijzig={(b, r) => { setBereik(b); setRelatieId(r) }}
      />
      <Button
        variant="primary" size="sm" disabled={bezig || !email.trim()}
        onClick={() => onUitnodigen(email.trim(), bereik, relatieId)}
      >
        Toegang geven en uitnodigen
      </Button>
    </div>
  )
}

function BereikKiezer({
  bereik, relatieId, organisaties, bezig, onWijzig,
}: {
  bereik: Bereik
  relatieId: string | null
  organisaties: Organisatie[]
  bezig: boolean
  onWijzig: (bereik: Bereik, relatieId: string | null) => void
}) {
  const geenOrganisatie = organisaties.length === 0
  const gekozen = relatieId ?? organisaties[0]?.id ?? null

  return (
    <div>
      <span className="mb-2 block text-[10.5px] font-bold uppercase tracking-[0.08em] text-neutral-500">Ziet</span>
      <RadioGroup
        value={bereik}
        disabled={bezig}
        onValueChange={v => onWijzig(v as Bereik, v === 'organisatie' ? gekozen : relatieId)}
      >
        <label className="flex items-start gap-2 text-[13px]">
          <RadioGroupItem value="eigen_dossiers" className="mt-0.5" />
          <span>Alleen de eigen dossiers</span>
        </label>
        <label className="flex items-start gap-2 text-[13px]">
          <RadioGroupItem value="organisatie" disabled={geenOrganisatie} className="mt-0.5" />
          <span>
            Alle dossiers van de organisatie, ook die van collega&apos;s
            {geenOrganisatie && <span className="block text-xs text-neutral-500">Koppel eerst een organisatie.</span>}
          </span>
        </label>
      </RadioGroup>
      {bereik === 'organisatie' && organisaties.length > 1 && (
        <select
          value={gekozen ?? ''}
          disabled={bezig}
          onChange={e => onWijzig('organisatie', e.target.value)}
          className="mt-2 w-full rounded-md border border-neutral-300 px-2 py-1 text-xs"
          aria-label="Organisatie"
        >
          {organisaties.map(o => <option key={o.id} value={o.id}>{o.naam}</option>)}
        </select>
      )}
      {bereik === 'organisatie' && organisaties.length === 1 && (
        <p className="mt-1 text-xs text-neutral-500">{organisaties[0].naam}</p>
      )}
    </div>
  )
}
