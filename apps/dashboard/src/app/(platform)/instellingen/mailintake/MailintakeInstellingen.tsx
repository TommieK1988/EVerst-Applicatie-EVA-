'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'

import { PageHeader, Button, Badge, Card, useDialogen } from '@/components/ui'
import {
  updatePostbus, zetNabehandelStand, controleerVerbinding,
  verwijderAlias, voegNegeerAdresToe,
} from '@/lib/mailintake/actions'
import { NABEHANDEL_LABELS } from '@/lib/mailintake/types'

const klein = { fontSize: 12, color: 'var(--fg-muted)' } as const
const zacht = { fontSize: 13, color: 'var(--fg-soft)' } as const
const kop = { fontSize: 14, fontWeight: 600, marginBottom: 8 } as const

const veldStijl: React.CSSProperties = {
  width: '100%', padding: '7px 9px', borderRadius: 6, fontSize: 13,
  border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--fg)',
}

type Postbus = {
  id: string; sleutel: string; naam: string; adres: string; soort: string
  actief: boolean; automatisch_aanmaken: boolean
  standaard_werkmaatschappij_id: string | null
  notificatie_medewerkers: string[]
  dagbudget_cent: number
  map_verwerkt_naam: string
  laatste_ophaal_op: string | null
  laatste_ophaal_gelukt_op: string | null
  laatste_fout: string | null
}

type Alias = {
  id: string; patroon: string; soort: 'koppel' | 'negeer'
  relatieNaam: string | null; laatstGebruiktOp: string | null; createdAt: string
}

export default function MailintakeInstellingen({
  postbussen, aliassen, nabehandelStand, medewerkers, werkmaatschappijen, magBeheren,
}: {
  postbussen: Postbus[]
  aliassen: Alias[]
  nabehandelStand: string
  medewerkers: { id: string; naam: string }[]
  werkmaatschappijen: { id: string; naam: string }[]
  magBeheren: boolean
}) {
  const router = useRouter()
  const { bevestig } = useDialogen()
  const [bezig, setBezig] = useState<string | null>(null)
  const [nieuwNegeer, setNieuwNegeer] = useState('')

  async function wijzig(id: string, veld: string, waarde: unknown) {
    setBezig(id)
    try {
      const res = await updatePostbus(id, { [veld]: waarde })
      if (!res.ok) toast.error(res.error ?? 'Opslaan mislukt')
      else { toast.success('Opgeslagen'); router.refresh() }
    } finally {
      setBezig(null)
    }
  }

  async function zetAutomatisch(p: Postbus, aan: boolean) {
    if (aan) {
      const ok = await bevestig({
        titel: 'Automatisch aanmaken aanzetten?',
        omschrijving:
          `Vanaf nu maakt EVA zelf een dossier aan voor berichten in "${p.naam}" waarvan de afzender ` +
          'een bekende klant is en alle gegevens compleet zijn. Bij elke twijfel — over de klant, de ' +
          'gegevens, of een mogelijk duplicaat — blijft EVA het gewoon voorleggen.\n\n' +
          'Elk automatisch dossier krijgt een controletaak van één dag en een melding.',
        bevestigLabel: 'Aanzetten',
      })
      if (!ok) return
    }
    await wijzig(p.id, 'automatisch_aanmaken', aan)
  }

  async function wijzigNabehandeling(stand: string) {
    if (stand === 'aan' && nabehandelStand !== 'aan') {
      const ok = await bevestig({
        titel: 'Behandelde mail gaat verplaatst worden',
        omschrijving:
          'EVA verplaatst afgehandelde en genegeerde mail naar de submap "Verwerkt door EVA" en ' +
          'markeert hem als gelezen. Mail die EVA als "geen aanvraag" beoordeelt blijft ongelezen ' +
          'in Postvak IN staan.\n\n' +
          'Dit is zichtbaar voor iedereen die in deze mailboxen kijkt — stem het even af.',
        bevestigLabel: 'Aanzetten',
      })
      if (!ok) return
    }
    setBezig('nabehandeling')
    try {
      const res = await zetNabehandelStand(stand)
      if (!res.ok) toast.error(res.error ?? 'Opslaan mislukt')
      else { toast.success('Opgeslagen'); router.refresh() }
    } finally {
      setBezig(null)
    }
  }

  async function toets(p: Postbus) {
    setBezig(p.id)
    try {
      const res = await controleerVerbinding(p.id)
      // Een geslaagde toets via de hoofdregistratie is geen groen licht: dan zijn
      // O365_INTAKE_CLIENT_ID/SECRET niet gezet en leest EVA met de machtigingen
      // van de gewone app-registratie.
      if (res.registratie === 'hoofd') {
        toast.error(
          'Gelezen met de gewone EVA-registratie, niet met "EVA Mailintake". ' +
          'Zet O365_INTAKE_CLIENT_ID en O365_INTAKE_CLIENT_SECRET in Vercel.',
          { duration: 8000 },
        )
      } else if (res.ok) {
        toast.success(
          res.onderwerp
            ? `Verbinding werkt. Laatste bericht: "${res.onderwerp}"`
            : 'Verbinding werkt. Postvak IN is leeg.',
        )
      } else {
        toast.error(res.error ?? 'Verbinding mislukt')
      }
    } finally {
      setBezig(null)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PageHeader title={['Instellingen', 'Mailintake']} />
      <p style={{ ...zacht, marginTop: -8 }}>
        De drie gedeelde postbussen waaruit EVA aanvragen, opdrachten en servicedeskbonnen leest.
      </p>

      {/* ── Postbussen ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {postbussen.map(p => (
          <Card key={p.id} style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
              <div>
                <div style={kop}>{p.naam}</div>
                <div style={zacht}>{p.adres}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Badge tone={p.actief ? 'success' : 'neutral'}>{p.actief ? 'Actief' : 'Uit'}</Badge>
                {p.automatisch_aanmaken && <Badge tone="warning">Automatisch aanmaken</Badge>}
                {magBeheren && (
                  <Button variant="outline" onClick={() => toets(p)} disabled={bezig === p.id}>
                    Verbinding controleren
                  </Button>
                )}
              </div>
            </div>

            {(p.laatste_fout || p.laatste_ophaal_op) && (
              <div style={klein}>
                {p.laatste_ophaal_op
                  ? `Laatst opgehaald: ${new Date(p.laatste_ophaal_op).toLocaleString('nl-NL')}`
                  : 'Nog nooit opgehaald.'}
                {p.laatste_fout && (
                  <span style={{ color: 'var(--da-700, #b91c1c)' }}> · Laatste fout: {p.laatste_fout}</span>
                )}
              </div>
            )}

            {magBeheren && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <span style={klein}>E-mailadres</span>
                  <input
                    style={veldStijl}
                    defaultValue={p.adres}
                    onBlur={e => e.target.value !== p.adres && wijzig(p.id, 'adres', e.target.value.trim())}
                  />
                </label>

                <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <span style={klein}>Standaard werkmaatschappij</span>
                  <select
                    style={veldStijl}
                    defaultValue={p.standaard_werkmaatschappij_id ?? ''}
                    onChange={e => wijzig(p.id, 'standaard_werkmaatschappij_id', e.target.value || null)}
                  >
                    <option value="">— geen —</option>
                    {werkmaatschappijen.map(w => <option key={w.id} value={w.id}>{w.naam}</option>)}
                  </select>
                </label>

                <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <span style={klein}>Dagbudget AI (in centen)</span>
                  <input
                    type="number" min={0} style={veldStijl} defaultValue={p.dagbudget_cent}
                    onBlur={e => Number(e.target.value) !== p.dagbudget_cent && wijzig(p.id, 'dagbudget_cent', Number(e.target.value))}
                  />
                </label>

                <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <span style={klein}>Wie krijgt meldingen</span>
                  <select
                    multiple
                    style={{ ...veldStijl, minHeight: 90 }}
                    defaultValue={p.notificatie_medewerkers}
                    onBlur={e => {
                      const gekozen = Array.from(e.target.selectedOptions).map(o => o.value)
                      wijzig(p.id, 'notificatie_medewerkers', gekozen)
                    }}
                  >
                    {medewerkers.map(m => <option key={m.id} value={m.id}>{m.naam}</option>)}
                  </select>
                </label>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, justifyContent: 'flex-end' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                    <input type="checkbox" checked={p.actief} onChange={e => wijzig(p.id, 'actief', e.target.checked)} />
                    Postbus uitlezen
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                    <input
                      type="checkbox"
                      checked={p.automatisch_aanmaken}
                      onChange={e => zetAutomatisch(p, e.target.checked)}
                    />
                    Automatisch dossiers aanmaken
                  </label>
                </div>
              </div>
            )}
          </Card>
        ))}
      </div>

      {/* ── Nabehandeling ── */}
      <Card style={{ padding: 14 }}>
        <div style={kop}>Nabehandeling in Outlook</div>
        <p style={{ ...zacht, marginBottom: 10 }}>
          Eén regel voor alle drie de postbussen: <strong>een beslissing van een mens haalt de mail uit het
          zicht, een beslissing van EVA nooit.</strong> Afgehandelde en genegeerde mail gaat naar de map
          “Verwerkt door EVA”. Mail die EVA zelf als “geen aanvraag” beoordeelt blijft ongelezen in Postvak IN
          staan — dat oordeel heeft immers niemand gezien.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {(['aan', 'alleen_categorie', 'uit'] as const).map(s => (
            <label key={s} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13 }}>
              <input
                type="radio"
                name="nabehandeling"
                checked={nabehandelStand === s}
                disabled={!magBeheren || bezig === 'nabehandeling'}
                onChange={() => wijzigNabehandeling(s)}
                style={{ marginTop: 3 }}
              />
              <span>{NABEHANDEL_LABELS[s]}</span>
            </label>
          ))}
        </div>
      </Card>

      {/* ── Aliassen ── */}
      <Card style={{ padding: 14 }}>
        <div style={kop}>Herkende adressen</div>
        <p style={{ ...zacht, marginBottom: 10 }}>
          Elke keer dat je zelf een opdrachtgever kiest, onthoudt EVA dat adres. Daardoor wordt de herkenning
          vanzelf beter. Adressen op de negeerlijst worden nooit verwerkt.
        </p>

        {magBeheren && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <input
              style={{ ...veldStijl, maxWidth: 320 }}
              placeholder="adres@voorbeeld.nl of @voorbeeld.nl"
              value={nieuwNegeer}
              onChange={e => setNieuwNegeer(e.target.value)}
            />
            <Button
              variant="outline"
              disabled={!nieuwNegeer.trim()}
              onClick={async () => {
                const res = await voegNegeerAdresToe(nieuwNegeer)
                if (!res.ok) toast.error(res.error ?? 'Toevoegen mislukt')
                else { toast.success('Op de negeerlijst gezet'); setNieuwNegeer(''); router.refresh() }
              }}
            >
              Negeren
            </Button>
          </div>
        )}

        {aliassen.length === 0 ? (
          <p style={klein}>Nog geen adressen onthouden.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 320, overflowY: 'auto' }}>
            {aliassen.map(a => (
              <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                <Badge tone={a.soort === 'negeer' ? 'error' : 'neutral'}>
                  {a.soort === 'negeer' ? 'negeer' : 'koppel'}
                </Badge>
                <span style={{ flex: 1 }}>{a.patroon}</span>
                <span style={klein}>{a.relatieNaam ?? ''}</span>
                {magBeheren && (
                  <Button
                    variant="ghost"
                    onClick={async () => {
                      const ok = await bevestig({
                        titel: 'Adres vergeten?',
                        omschrijving: `EVA herkent ${a.patroon} daarna niet meer automatisch.`,
                        destructief: true,
                        bevestigLabel: 'Verwijderen',
                      })
                      if (!ok) return
                      await verwijderAlias(a.id)
                      toast.success('Verwijderd')
                      router.refresh()
                    }}
                  >
                    verwijderen
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
