import React from 'react'
import AppHeader from './AppHeader'
import StatusBadge from './StatusBadge'

export type DossierInfo = {
  titel: string
  dossiernummer: string | null
  statusLabel: string
  statusColor: string
  klant_naam: string | null
  categorie: string | null
  fase: string
  begindatum: string | null
  einddatum: string | null
  referentie: string | null
  contact_naam: string | null
  contact_telefoon: string | null
  contact_email: string | null
  werkadres: string | null
  rollen: { label: string; naam: string | null }[]
  aanneemsom: string | null
  totaalIncl: string | null
}

function Sectie({ titel, children }: { titel: string; children: React.ReactNode }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e3e8ea', borderRadius: 12, padding: 14, marginBottom: 10 }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: '#6b757c', marginBottom: 10 }}>
        {titel}
      </div>
      {children}
    </div>
  )
}

function Veld({ label, waarde }: { label: string; waarde?: React.ReactNode }) {
  const leeg = waarde == null || waarde === ''
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#9aa4ab', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>
        {label}
      </div>
      <div style={{ fontSize: 13, fontWeight: 500, color: leeg ? '#9aa4ab' : '#232a30', wordBreak: 'break-word' }}>
        {leeg ? '—' : waarde}
      </div>
    </div>
  )
}

const grid2: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 16px' }

export default function DossierInfoView({ info }: { info: DossierInfo }) {
  return (
    <>
      <AppHeader title={info.titel} sub={info.dossiernummer ?? undefined} backHref="/m/dossiers" />
      <div style={{ padding: 12 }}>
        {/* Status */}
        <div style={{ background: '#fff', border: '1px solid #e3e8ea', borderRadius: 12, padding: 14, marginBottom: 10 }}>
          <StatusBadge label={info.statusLabel} color={info.statusColor} lg />
        </div>

        <Sectie titel="Project">
          <div style={grid2}>
            <Veld label="Dossiernummer" waarde={info.dossiernummer} />
            <Veld label="Fase" waarde={info.fase} />
            <Veld label="Categorie" waarde={info.categorie} />
            <Veld label="Referentie" waarde={info.referentie} />
            <Veld label="Begindatum" waarde={info.begindatum} />
            <Veld label="Einddatum" waarde={info.einddatum} />
          </div>
        </Sectie>

        <Sectie titel="Opdrachtgever & contact">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Veld label="Opdrachtgever" waarde={info.klant_naam} />
            <div style={grid2}>
              <Veld label="Contactpersoon" waarde={info.contact_naam} />
              <Veld
                label="Telefoon"
                waarde={info.contact_telefoon
                  ? <a href={`tel:${info.contact_telefoon.replace(/\s/g, '')}`} style={{ color: '#009439', textDecoration: 'none', fontWeight: 600 }}>{info.contact_telefoon}</a>
                  : null}
              />
            </div>
            <Veld
              label="E-mail"
              waarde={info.contact_email
                ? <a href={`mailto:${info.contact_email}`} style={{ color: '#009439', textDecoration: 'none', fontWeight: 600 }}>{info.contact_email}</a>
                : null}
            />
          </div>
        </Sectie>

        <Sectie titel="Werkadres">
          <Veld
            label="Adres"
            waarde={info.werkadres
              ? <a href={`https://maps.google.com/?q=${encodeURIComponent(info.werkadres)}`} target="_blank" rel="noopener noreferrer" style={{ color: '#009439', textDecoration: 'none', fontWeight: 600 }}>{info.werkadres}</a>
              : null}
          />
        </Sectie>

        <Sectie titel="Rollen">
          <div style={grid2}>
            {info.rollen.map(r => <Veld key={r.label} label={r.label} waarde={r.naam} />)}
          </div>
        </Sectie>

        <Sectie titel="Financieel">
          <div style={grid2}>
            <Veld label="Aanneemsom excl. BTW" waarde={info.aanneemsom} />
            <Veld label="Totaal incl. BTW" waarde={info.totaalIncl} />
          </div>
        </Sectie>
      </div>
    </>
  )
}
