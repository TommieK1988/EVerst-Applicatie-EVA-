'use client'

import React, { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { VASTGOED_OBJECT_SOORTEN, type VastgoedObject, type VastgoedObjectSoort } from '@everts/database'
import { Button, Input, Label, Alert } from '@/components/ui'
import { zoekAdres } from '@/lib/adres/pdok'
import type { ObjectInvoer } from '@/lib/objecten/validations'
import { isUitBouw7 } from '@/lib/objecten/types'

export type RelatieOptie = { id: string; naam: string; heeftBouw7: boolean }

type Props = {
  /** Leeg = nieuw object. */
  object?: VastgoedObject | null
  relaties: RelatieOptie[]
  onOpslaan: (invoer: ObjectInvoer) => Promise<{ ok: true; data?: { id: string }; waarschuwing?: string } | { ok: false; fout: string }>
}

const rij: React.CSSProperties = { display: 'grid', gap: 14 }
const twee: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }
const blok: React.CSSProperties = {
  background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 12,
  padding: 20, display: 'grid', gap: 16,
}
const kopje: React.CSSProperties = {
  fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 700,
  color: 'var(--fg-muted)', letterSpacing: '0.02em',
}

export default function ObjectForm({ object, relaties, onOpslaan }: Props) {
  const router = useRouter()
  const [bezigOpslaan, startOpslaan] = useTransition()
  const [adresBezig, setAdresBezig] = useState(false)

  const [v, setV] = useState<ObjectInvoer>({
    objectnummer: object?.objectnummer ?? '',
    naam: object?.naam ?? '',
    soort: (object?.soort ?? 'complex') as VastgoedObjectSoort,
    vve_code: object?.vve_code ?? null,
    adres_straat: object?.adres_straat ?? null,
    adres_huisnummer: object?.adres_huisnummer ?? null,
    adres_postcode: object?.adres_postcode ?? null,
    adres_plaats: object?.adres_plaats ?? null,
    omschrijving: object?.omschrijving ?? null,
    contact_naam: object?.contact_naam ?? null,
    contact_telefoon: object?.contact_telefoon ?? null,
    contact_email: object?.contact_email ?? null,
    standaard_opdrachtgever_id: object?.standaard_opdrachtgever_id ?? null,
    standaard_contactpersoon_id: object?.standaard_contactpersoon_id ?? null,
    notities: object?.notities ?? null,
    actief: object?.actief ?? true,
  })

  const zet = <K extends keyof ObjectInvoer>(k: K, w: ObjectInvoer[K]) =>
    setV(prev => ({ ...prev, [k]: w }))

  const uitBouw7 = object ? isUitBouw7(object) : false
  const gekozenRelatie = relaties.find(r => r.id === v.standaard_opdrachtgever_id)

  /**
   * Postcode + huisnummer → straat en plaats via PDOK. Alleen aanvullen, nooit
   * overschrijven wat er al staat: bij complexen typt men vaak zelf een reeks in.
   */
  async function vulAdresAan() {
    if (!v.adres_postcode?.trim() || !v.adres_huisnummer?.trim()) return
    setAdresBezig(true)
    try {
      const [treffer] = await zoekAdres({ postcode: v.adres_postcode, huisnummer: v.adres_huisnummer, rows: 1 })
      if (!treffer) { toast('Geen adres gevonden bij deze postcode en huisnummer', { icon: 'ℹ️' }); return }
      setV(prev => ({
        ...prev,
        adres_straat: prev.adres_straat?.trim() ? prev.adres_straat : treffer.straat,
        adres_plaats: prev.adres_plaats?.trim() ? prev.adres_plaats : treffer.stad,
      }))
    } catch {
      toast.error('Adres opzoeken lukte niet')
    } finally {
      setAdresBezig(false)
    }
  }

  function opslaan() {
    startOpslaan(async () => {
      const res = await onOpslaan(v)
      if (!res.ok) { toast.error(res.fout); return }
      if (res.waarschuwing) toast(res.waarschuwing, { icon: '⚠️', duration: 7000 })
      else toast.success(object ? 'Object opgeslagen' : 'Object aangemaakt')
      router.push(res.ok && res.data?.id ? `/objecten/${res.data.id}` : `/objecten/${object?.id ?? ''}`)
      router.refresh()
    })
  }

  return (
    <div style={{ display: 'grid', gap: 16, maxWidth: 860 }}>
      {uitBouw7 && (
        <Alert tone="info">
          Dit object bestaat ook in Bouw7. Naam, nummer, adres en opdrachtgever worden bij het
          opslaan naar Bouw7 doorgeschreven; de overige velden zijn alleen van EVA.
        </Alert>
      )}

      <div style={blok}>
        <div style={kopje}>Identiteit</div>
        <div style={twee}>
          <div style={rij}>
            <Label htmlFor="objectnummer">Objectnummer *</Label>
            <Input
              id="objectnummer" value={v.objectnummer}
              onChange={e => zet('objectnummer', e.target.value)}
              placeholder="bv. HW1013"
            />
            <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>
              De code waarmee dit object herkenbaar is. Moet uniek zijn en is in Bouw7 verplicht.
            </span>
          </div>
          <div style={rij}>
            <Label htmlFor="soort">Soort</Label>
            <select
              id="soort" value={v.soort}
              onChange={e => zet('soort', e.target.value as VastgoedObjectSoort)}
              style={{
                height: 38, borderRadius: 8, border: '1px solid var(--border)',
                background: 'var(--bg)', color: 'var(--fg)', padding: '0 10px',
                fontFamily: 'var(--font-ui)', fontSize: 14,
              }}
            >
              {VASTGOED_OBJECT_SOORTEN.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </div>
        </div>

        <div style={rij}>
          <Label htmlFor="naam">Naam *</Label>
          <Input
            id="naam" value={v.naam} onChange={e => zet('naam', e.target.value)}
            placeholder="bv. Complex 1013, Stortenbekerstraat / Vaillantlaan"
          />
        </div>

        <div style={twee}>
          <div style={rij}>
            <Label htmlFor="vve_code">VvE-code</Label>
            <Input id="vve_code" value={v.vve_code ?? ''} onChange={e => zet('vve_code', e.target.value)} />
          </div>
          <div style={rij}>
            <Label htmlFor="opdrachtgever">Standaard opdrachtgever</Label>
            <select
              id="opdrachtgever" value={v.standaard_opdrachtgever_id ?? ''}
              onChange={e => zet('standaard_opdrachtgever_id', e.target.value || null)}
              style={{
                height: 38, borderRadius: 8, border: '1px solid var(--border)',
                background: 'var(--bg)', color: 'var(--fg)', padding: '0 10px',
                fontFamily: 'var(--font-ui)', fontSize: 14,
              }}
            >
              <option value="">— geen —</option>
              {relaties.map(r => <option key={r.id} value={r.id}>{r.naam}</option>)}
            </select>
            {gekozenRelatie && !gekozenRelatie.heeftBouw7 && (
              <span style={{ fontSize: 12, color: 'hsl(var(--warning))' }}>
                Deze relatie bestaat nog niet in Bouw7. Het object wordt dan alleen in EVA opgeslagen.
              </span>
            )}
            {!v.standaard_opdrachtgever_id && (
              <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>
                Bouw7 vereist een opdrachtgever bij een object. Zonder deze keuze blijft het object alleen in EVA staan.
              </span>
            )}
          </div>
        </div>
      </div>

      <div style={blok}>
        <div style={kopje}>Adres</div>
        <div style={twee}>
          <div style={rij}>
            <Label htmlFor="postcode">Postcode</Label>
            <Input
              id="postcode" value={v.adres_postcode ?? ''}
              onChange={e => zet('adres_postcode', e.target.value)}
              onBlur={vulAdresAan}
            />
          </div>
          <div style={rij}>
            <Label htmlFor="huisnummer">Huisnummer</Label>
            <Input
              id="huisnummer" value={v.adres_huisnummer ?? ''}
              onChange={e => zet('adres_huisnummer', e.target.value)}
              onBlur={vulAdresAan}
              placeholder="bv. 12 of 12-16"
            />
          </div>
        </div>
        <div style={twee}>
          <div style={rij}>
            <Label htmlFor="straat">Straat</Label>
            <Input
              id="straat" value={v.adres_straat ?? ''}
              onChange={e => zet('adres_straat', e.target.value)}
              placeholder="bij een complex mag hier de hele reeks staan"
            />
          </div>
          <div style={rij}>
            <Label htmlFor="plaats">Plaats</Label>
            <Input id="plaats" value={v.adres_plaats ?? ''} onChange={e => zet('adres_plaats', e.target.value)} />
          </div>
        </div>
        {adresBezig && <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>Adres opzoeken…</span>}
        <div style={rij}>
          <Label htmlFor="omschrijving">Adressen / omschrijving</Label>
          <textarea
            id="omschrijving" value={v.omschrijving ?? ''}
            onChange={e => zet('omschrijving', e.target.value)}
            rows={3}
            placeholder={'bv.\nNetscherstraat 9 t/m 91\nRuijsdaelstraat 65 t/m 73'}
            style={{
              borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)',
              color: 'var(--fg)', padding: 10, fontFamily: 'var(--font-ui)', fontSize: 14, resize: 'vertical',
            }}
          />
        </div>
      </div>

      <div style={blok}>
        <div style={kopje}>Contactpersoon ter plaatse</div>
        <span style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: -8 }}>
          Bijvoorbeeld de huismeester of beheerder. Wordt voorgesteld bij een nieuwe aanvraag op dit object.
        </span>
        <div style={twee}>
          <div style={rij}>
            <Label htmlFor="contact_naam">Naam</Label>
            <Input id="contact_naam" value={v.contact_naam ?? ''} onChange={e => zet('contact_naam', e.target.value)} />
          </div>
          <div style={rij}>
            <Label htmlFor="contact_telefoon">Telefoon</Label>
            <Input id="contact_telefoon" value={v.contact_telefoon ?? ''} onChange={e => zet('contact_telefoon', e.target.value)} />
          </div>
        </div>
        <div style={rij}>
          <Label htmlFor="contact_email">E-mail</Label>
          <Input id="contact_email" type="email" value={v.contact_email ?? ''} onChange={e => zet('contact_email', e.target.value)} />
        </div>
      </div>

      <div style={blok}>
        <div style={kopje}>Notities</div>
        <textarea
          value={v.notities ?? ''} onChange={e => zet('notities', e.target.value)} rows={4}
          placeholder="Bijzonderheden over dit object — bereikbaarheid, sleutels, afspraken."
          style={{
            borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)',
            color: 'var(--fg)', padding: 10, fontFamily: 'var(--font-ui)', fontSize: 14, resize: 'vertical',
          }}
        />
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
          <input type="checkbox" checked={v.actief} onChange={e => zet('actief', e.target.checked)} />
          Actief — inactieve objecten verschijnen niet meer in de keuzelijsten
        </label>
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <Button variant="primary" onClick={opslaan} disabled={bezigOpslaan || !v.naam.trim() || !v.objectnummer.trim()}>
          {bezigOpslaan ? 'Opslaan…' : object ? 'Opslaan' : 'Object aanmaken'}
        </Button>
        <Button variant="secondary" onClick={() => router.back()} disabled={bezigOpslaan}>
          Annuleren
        </Button>
      </div>
    </div>
  )
}
