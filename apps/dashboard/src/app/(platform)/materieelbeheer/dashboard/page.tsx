import React from 'react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { createAdminClient } from '@everts/database/server'
import { PageHeader } from '@/components/ui'
import { getMedewerkerOpties, getInstellingen } from '@/lib/materieel/data'
import StatusBadge from '@/components/materieel/StatusBadge'
import {
  CATEGORIE_LABELS, STATUS_META, MATERIEEL_STATUSSEN,
  type MaterieelStatus, type MaterieelCategorie,
} from '@/lib/materieel/types'

export const metadata: Metadata = { title: 'Materieel-dashboard' }
export const dynamic = 'force-dynamic'

function euro(v: number): string {
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v)
}

type ObjRow = {
  id: string; omschrijving: string; status: MaterieelStatus; categorie: MaterieelCategorie
  aanschafwaarde: number | null; boekwaarde: number | null; garantie_tot: string | null
  toegewezen_medewerker_id: string | null; toegewezen_team_id: string | null
  laatst_gescand_door: string | null; laatst_gescand_at: string | null
}
type KeuringRow = { object_id: string; soort: string; geldig_tot: string | null }
type OnderhoudRow = { object_id: string; kosten: number | null }

export default async function MaterieelDashboardPage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any

  const [objRes, keurRes, ondRes, medewerkerOpties, instellingen] = await Promise.all([
    supabase.from('materieel_objecten').select('id, omschrijving, status, categorie, aanschafwaarde, boekwaarde, garantie_tot, toegewezen_medewerker_id, toegewezen_team_id, laatst_gescand_door, laatst_gescand_at').eq('actief', true),
    supabase.from('materieel_keuringen').select('object_id, soort, geldig_tot'),
    supabase.from('materieel_onderhoud').select('object_id, kosten'),
    getMedewerkerOpties(),
    getInstellingen(),
  ])

  const objecten = (objRes.data ?? []) as ObjRow[]
  const keuringen = (keurRes.data ?? []) as KeuringRow[]
  const onderhoud = (ondRes.data ?? []) as OnderhoudRow[]
  const objMap = new Map(objecten.map((o) => [o.id, o]))
  const medewerkerNaam = new Map(medewerkerOpties.map((m) => [m.id, m.naam]))

  const totaalWaarde = objecten.reduce((s, o) => s + (o.aanschafwaarde ?? 0), 0)
  const boekwaarde = objecten.reduce((s, o) => s + (o.boekwaarde ?? 0), 0)
  const onderhoudskosten = onderhoud.reduce((s, o) => s + (o.kosten ?? 0), 0)

  const perStatus = MATERIEEL_STATUSSEN.map((s) => ({ status: s, aantal: objecten.filter((o) => o.status === s).length }))
  const aantalVermist = objecten.filter((o) => o.status === 'vermist').length
  const aantalDefect = objecten.filter((o) => o.status === 'defect').length

  const nu = Date.now()
  const dagen = (v: string | null) => (v ? Math.ceil((new Date(v).getTime() - nu) / 86400000) : null)
  const verlopenKeuringen = keuringen
    .map((k) => ({ ...k, dagen: dagen(k.geldig_tot) }))
    .filter((k) => k.dagen !== null && k.dagen <= instellingen.keuring_waarschuwing_dagen)
    .sort((a, b) => (a.dagen ?? 0) - (b.dagen ?? 0))

  // Top 10 meest gerepareerd
  const reparatiesPer = new Map<string, number>()
  onderhoud.forEach((o) => reparatiesPer.set(o.object_id, (reparatiesPer.get(o.object_id) ?? 0) + 1))
  const top10 = [...reparatiesPer.entries()]
    .map(([id, aantal]) => ({ id, aantal, naam: objMap.get(id)?.omschrijving ?? 'Onbekend' }))
    .sort((a, b) => b.aantal - a.aantal).slice(0, 10)

  // Algemeen gebruik: geen medewerker en geen team gekoppeld. Toon wie het als
  // laatste in handen had (laatste scan), zodat het traceerbaar blijft.
  const algemeenGebruik = objecten
    .filter((o) => !o.toegewezen_medewerker_id && !o.toegewezen_team_id)
    .map((o) => ({
      id: o.id,
      naam: o.omschrijving,
      laatsteGebruiker: o.laatst_gescand_door ? medewerkerNaam.get(o.laatst_gescand_door) ?? 'Onbekend' : null,
      wanneer: o.laatst_gescand_at,
    }))
    .sort((a, b) => (b.wanneer ?? '').localeCompare(a.wanneer ?? ''))

  // Gereedschap per medewerker
  const perMedewerker = new Map<string, number>()
  objecten.forEach((o) => { if (o.toegewezen_medewerker_id) perMedewerker.set(o.toegewezen_medewerker_id, (perMedewerker.get(o.toegewezen_medewerker_id) ?? 0) + 1) })
  const medewerkerLijst = [...perMedewerker.entries()]
    .map(([id, aantal]) => ({ naam: medewerkerNaam.get(id) ?? 'Onbekend', aantal }))
    .sort((a, b) => b.aantal - a.aantal)

  return (
    <div className="eva-page-full">
      <PageHeader eyebrow="Materieelbeheer" title="Dashboard" />

      {/* KPI-kaarten */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginTop: 12 }}>
        <Kpi label="Materieelwaarde" waarde={euro(totaalWaarde)} sub={`boekwaarde ${euro(boekwaarde)}`} />
        <Kpi label="Aantal objecten" waarde={String(objecten.length)} />
        <Kpi label="Vermist" waarde={String(aantalVermist)} accent={aantalVermist > 0 ? '#dc2626' : undefined} />
        <Kpi label="Defect" waarde={String(aantalDefect)} accent={aantalDefect > 0 ? '#f97316' : undefined} />
        <Kpi label="Keuringen verlopen/bijna" waarde={String(verlopenKeuringen.length)} accent={verlopenKeuringen.length > 0 ? '#f97316' : undefined} />
        <Kpi label="Onderhoudskosten" waarde={euro(onderhoudskosten)} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginTop: 20 }}>
        {/* Status-verdeling */}
        <Blok titel="Status-verdeling">
          {perStatus.filter((s) => s.aantal > 0).length === 0 ? <Leeg /> : perStatus.filter((s) => s.aantal > 0).map((s) => (
            <div key={s.status} style={rijStyle}>
              <StatusBadge status={s.status} />
              <strong style={{ fontSize: 14 }}>{s.aantal}</strong>
            </div>
          ))}
        </Blok>

        {/* Verlopen keuringen */}
        <Blok titel="Keuringen — verlopen of bijna">
          {verlopenKeuringen.length === 0 ? <Leeg tekst="Alles up-to-date 🎉" /> : verlopenKeuringen.slice(0, 8).map((k, i) => (
            <Link key={i} href={`/materieelbeheer/${k.object_id}`} style={{ ...rijStyle, textDecoration: 'none' }}>
              <span style={{ fontSize: 13, color: 'var(--fg)' }}>{objMap.get(k.object_id)?.omschrijving ?? 'Onbekend'} — {k.soort}</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: (k.dagen ?? 0) < 0 ? '#dc2626' : '#f97316' }}>
                {(k.dagen ?? 0) < 0 ? `${Math.abs(k.dagen ?? 0)}d verlopen` : `nog ${k.dagen}d`}
              </span>
            </Link>
          ))}
        </Blok>

        {/* Top 10 meest gerepareerd */}
        <Blok titel="Top 10 meest gerepareerd">
          {top10.length === 0 ? <Leeg /> : top10.map((t, i) => (
            <Link key={t.id} href={`/materieelbeheer/${t.id}`} style={{ ...rijStyle, textDecoration: 'none' }}>
              <span style={{ fontSize: 13, color: 'var(--fg)' }}>{i + 1}. {t.naam}</span>
              <strong style={{ fontSize: 13 }}>{t.aantal}×</strong>
            </Link>
          ))}
        </Blok>

        {/* Algemeen gebruik — wie had het als laatste */}
        <Blok titel="Algemeen gebruik — laatst in bezit">
          {algemeenGebruik.length === 0 ? <Leeg tekst="Alles staat op naam of op een team" /> : algemeenGebruik.slice(0, 10).map((a) => (
            <Link key={a.id} href={`/materieelbeheer/${a.id}`} style={{ ...rijStyle, textDecoration: 'none' }}>
              <span style={{ fontSize: 13, color: 'var(--fg)' }}>{a.naam}</span>
              <span style={{ fontSize: 12, color: a.laatsteGebruiker ? 'var(--fg-soft)' : 'var(--fg-muted)', textAlign: 'right' }}>
                {a.laatsteGebruiker
                  ? <>{a.laatsteGebruiker}{a.wanneer && <span style={{ color: 'var(--fg-muted)' }}> · {new Date(a.wanneer).toLocaleDateString('nl-NL')}</span>}</>
                  : 'nog niet gescand'}
              </span>
            </Link>
          ))}
        </Blok>

        {/* Per medewerker */}
        <Blok titel="Gereedschap per medewerker">
          {medewerkerLijst.length === 0 ? <Leeg /> : medewerkerLijst.map((m, i) => (
            <div key={i} style={rijStyle}>
              <span style={{ fontSize: 13, color: 'var(--fg)' }}>{m.naam}</span>
              <strong style={{ fontSize: 13 }}>{m.aantal}</strong>
            </div>
          ))}
        </Blok>
      </div>
    </div>
  )
}

const rijStyle: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)' }

function Kpi({ label, waarde, sub, accent }: { label: string; waarde: string; sub?: string; accent?: string }) {
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 16, background: 'var(--bg-elev, var(--bg))' }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--fg-muted)' }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: accent ?? 'var(--fg)', marginTop: 4, fontFamily: 'var(--font-display, var(--font-ui))' }}>{waarde}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--fg-muted)', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

function Blok({ titel, children }: { titel: string; children: React.ReactNode }) {
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 16, background: 'var(--bg-elev, var(--bg))' }}>
      <h3 style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--fg-muted)', marginBottom: 8 }}>{titel}</h3>
      {children}
    </div>
  )
}

function Leeg({ tekst = 'Geen gegevens' }: { tekst?: string }) {
  return <p style={{ fontSize: 13, color: 'var(--fg-muted)', padding: '6px 0' }}>{tekst}</p>
}
