'use client'

/**
 * Het Werkadres-blok van het behandelscherm: het adres met de adresservice
 * erachter, en wie er ter plaatse te bereiken is (bewoner, huismeester).
 *
 * Het contact ter plaatse werd altijd al uit de mail gelezen en op het dossier
 * gezet, maar stond hier niet -- dus niemand kon het nakijken. Nu wel, voorgevuld
 * en aanpasbaar. De waarden leven in `useWerkadres`.
 */

import { FormSection } from '@/components/ui/form-field'

import type { useWerkadres } from './gebruik-werkadres'
import { klein, veldStijl, Veld } from './velden'

export default function WerkadresBlok({ adres, zekerheid, bewerkbaar }: {
  adres: ReturnType<typeof useWerkadres>
  zekerheid: Record<string, number>
  bewerkbaar: boolean
}) {
  const a = adres
  return (
    <FormSection title="Werkadres">
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 8 }}>
        <Veld label="Straat" score={zekerheid.werkadres_straat}>
          <input style={veldStijl} value={a.straat} onChange={e => a.setStraat(e.target.value)} onBlur={a.controleer} disabled={!bewerkbaar} />
        </Veld>
        <Veld label="Huisnummer" score={zekerheid.werkadres_huisnummer}>
          <input style={veldStijl} value={a.huisnummer} onChange={e => a.setHuisnummer(e.target.value)} onBlur={a.controleer} disabled={!bewerkbaar} />
        </Veld>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 8 }}>
        <Veld label="Postcode" score={zekerheid.werkadres_postcode}>
          <input style={veldStijl} value={a.postcode} onChange={e => a.setPostcode(e.target.value)} onBlur={a.controleer} disabled={!bewerkbaar} />
        </Veld>
        <Veld label="Plaats" score={zekerheid.werkadres_stad}>
          <input style={veldStijl} value={a.stad} onChange={e => a.setStad(e.target.value)} onBlur={a.controleer} disabled={!bewerkbaar} />
        </Veld>
      </div>
      {a.bevestigd && <span style={{ ...klein, color: 'var(--su-700, #15803d)' }}>Adres bevestigd door de adresservice.</span>}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 8 }}>
        <Veld label="Contact ter plaatse" score={zekerheid.werkadres_contact_naam}>
          <input style={veldStijl} value={a.contact.naam} onChange={e => a.setContactNaam(e.target.value)} placeholder="Bewoner of huismeester" disabled={!bewerkbaar} />
        </Veld>
        <Veld label="Telefoon" score={zekerheid.werkadres_contact_telefoon}>
          <input type="tel" style={veldStijl} value={a.contact.telefoon} onChange={e => a.setContactTelefoon(e.target.value)} disabled={!bewerkbaar} />
        </Veld>
      </div>
      <Veld label="E-mail ter plaatse" score={zekerheid.werkadres_contact_email}>
        <input type="email" style={veldStijl} value={a.contact.email} onChange={e => a.setContactEmail(e.target.value)} disabled={!bewerkbaar} />
      </Veld>
    </FormSection>
  )
}
