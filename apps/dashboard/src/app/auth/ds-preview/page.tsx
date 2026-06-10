'use client'
/**
 * /auth/ds-preview — Publieke visuele preview van de EVA DS in context.
 * Toont alle kernschermen met mock-data zonder authenticatie.
 */
import React from 'react'
import {
  Button, Badge, Avatar, AvatarGroup, PageHeader, Card, CardHeader, CardBody, CardFooter,
  Input, Separator, StatCard, EmptyState, Progress, Alert, Spinner,
  WerkbonKaart, WerkbonKaartCompact, DossierKaart as KanbanDossierKaart, KanbanBoard, KanbanColumn,
} from '@/components/ui'
import {
  Euro, Users, FileText, Clock, MapPin, Plus, Search,
  Building2, CheckCircle2, AlertTriangle, TrendingUp,
} from 'lucide-react'

/* ── sectie-wrapper ─────────────────────────────────────── */
function Section({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 56 }}>
      <div style={{ marginBottom: 20, paddingBottom: 14, borderBottom: '1px solid var(--border)' }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--fg-muted)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>
          Scherm preview
        </div>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: '-0.01em', color: 'var(--fg)' }}>{title}</h2>
        {sub && <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--fg-muted)' }}>{sub}</p>}
      </div>
      {children}
    </section>
  )
}

/* ── Mock DossierKaart (eigen layout, DS tokens) ─────────── */
function MockDossierKaart({
  nummer, titel, klant, bedrag, datum, pm, urgent,
}: { nummer: string; titel: string; klant: string; bedrag: string; datum: string; pm?: string; urgent?: boolean }) {
  const [hovered, setHovered] = React.useState(false)
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'relative',
        padding: '14px 16px',
        border: '1px solid var(--border)',
        borderRadius: 10,
        background: hovered ? 'var(--bg-active)' : 'var(--bg-elev)',
        cursor: 'pointer',
        display: 'flex', flexDirection: 'column', gap: 8,
        transition: 'background 0.12s, box-shadow 0.12s',
        boxShadow: hovered ? '0 4px 12px rgba(0,0,0,0.08)' : 'none',
      }}
    >
      {urgent && <span style={{ position: 'absolute', left: 0, top: 8, bottom: 8, width: 3, background: 'var(--error-500)', borderRadius: '0 2px 2px 0' }} />}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, paddingLeft: urgent ? 6 : 0 }}>
        <span style={{ fontSize: 11, color: 'var(--fg-muted)', fontFamily: 'var(--font-mono)' }}>{nummer}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--fg)', whiteSpace: 'nowrap' }}>{bedrag}</span>
      </div>
      <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--fg)', lineHeight: 1.3, paddingLeft: urgent ? 6 : 0 }}>{titel}</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingLeft: urgent ? 6 : 0 }}>
        <span style={{ fontSize: 12, color: 'var(--fg-muted)', fontWeight: 500 }}>{klant}</span>
        <span style={{ fontSize: 11, color: 'var(--fg-muted)' }}>{datum}</span>
      </div>
      {pm && <div style={{ fontSize: 11, color: 'var(--fg-muted)', paddingLeft: urgent ? 6 : 0 }}>PM: {pm}</div>}
    </div>
  )
}

/* ── Detail sectie-kaart ─────────────────────────────────── */
function Blok({ titel, children }: { titel: string; children: React.ReactNode }) {
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', background: 'var(--bg-elev)' }}>
      <div style={{ padding: '10px 18px', borderBottom: '1px solid var(--border)', background: 'var(--bg-elev)' }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--fg-muted)' }}>{titel}</span>
      </div>
      <div style={{ padding: 18 }}>{children}</div>
    </div>
  )
}

function Rij({ label, waarde }: { label: string; waarde: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 8, padding: '7px 0', borderBottom: '1px solid var(--border-soft)' }}>
      <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', paddingTop: 2 }}>{label}</span>
      <span style={{ fontSize: 13, color: 'var(--fg)', fontWeight: 500 }}>{waarde ?? '—'}</span>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════ */
export default function DsPreview() {
  return (
    <div className="eva" style={{ background: 'var(--bg)', minHeight: '100dvh', fontFamily: 'var(--font-ui)', WebkitFontSmoothing: 'antialiased' }}>

      {/* ── Eigen mini-header ─ */}
      <div style={{ position: 'sticky', top: 0, zIndex: 50, background: 'var(--bg-elev)', borderBottom: '1px solid var(--border)', padding: '12px 40px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-beeldmerk.svg" alt="EVA" style={{ width: 28, height: 28 }} />
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, letterSpacing: '0.06em', fontSize: 16 }}>EVERTS.</span>
          <Separator className="h-5" orientation="vertical" />
          <span style={{ fontSize: 12, color: 'var(--fg-muted)', fontWeight: 600 }}>DS Preview — alle schermen zonder inloggen</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Badge tone="brand" dot>Componenten actief</Badge>
          <Badge tone="success" dot>0 type-fouten</Badge>
        </div>
      </div>

      <div style={{ padding: '40px 40px 80px', maxWidth: 1320, margin: '0 auto' }}>

        {/* ═══════════════ 1 · DASHBOARD ═══════════════ */}
        <Section title="Dashboard / Overzicht" sub="Wat de ingelogde gebruiker ziet na het inloggen">
          {/* Hero */}
          <div style={{
            borderRadius: 18, overflow: 'hidden', padding: '32px 36px',
            backgroundImage: 'url(/polygon-bg.png)', backgroundSize: 'cover', backgroundPosition: 'center',
            marginBottom: 16, minHeight: 140,
            display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
          }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.75)', letterSpacing: '0.14em', textTransform: 'uppercase' }}>
              Maandag 2 juni 2026 · Week 23
            </div>
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 20, letterSpacing: '0.06em', color: 'white', marginBottom: 10 }}>EVERTS.</div>
              <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em', color: 'white', lineHeight: 1.1 }}>
                Goedemorgen, Tom.
              </h1>
              <p style={{ margin: '6px 0 0', fontSize: 14, color: 'rgba(255,255,255,0.85)' }}>3 acties wachten vandaag op jou.</p>
            </div>
          </div>

          {/* KPI stat cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 16 }}>
            <StatCard tone="brand" icon={<FileText className="h-5 w-5" />} label="Open aanvragen" value="12" trend={{ direction: 'up', value: '+3', compare: 'vs vorige week' }} />
            <StatCard tone="success" icon={<CheckCircle2 className="h-5 w-5" />} label="Gewonnen offertes" value="8" trend={{ direction: 'up', value: '+2', compare: 'deze maand' }} />
            <StatCard tone="info" icon={<Building2 className="h-5 w-5" />} label="Actieve opdrachten" value="23" trend={{ direction: 'flat', value: 'stabiel' }} />
            <StatCard tone="warning" icon={<Clock className="h-5 w-5" />} label="Taken vandaag" value="3" trend={{ direction: 'down', value: '-1', compare: 'vs gisteren' }} />
          </div>
        </Section>

        {/* ═══════════════ 2 · AANVRAGEN (KANBAN) ═══════════════ */}
        <Section title="Aanvragen — Kanban-bord" sub="Hoofdscherm Aanvragen: dossiers per status in kolommen, drag-and-drop">
          <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', background: 'var(--bg-elev)' }}>
            {/* Toolbar */}
            <div style={{ width: '100%' }}>
              <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Input prefix={<Search className="h-3.5 w-3.5" />} placeholder="Zoek aanvraag…" className="w-56" />
                </div>
                <Button variant="primary" size="sm">
                  <Plus className="h-3.5 w-3.5" /> Nieuwe aanvraag
                </Button>
              </div>
              {/* Kolommen */}
              <div style={{ display: 'flex', overflowX: 'auto' }}>
                {[
                  {
                    key: 'nieuw', label: 'Nieuw', color: 'var(--brand-500)', items: [
                      { nummer: 'AANV-0041', titel: 'Kozijn renovatie voorgevel', klant: 'Fam. Jansen', bedrag: '€ 8.400', datum: '29 mei', pm: 'H. de Boer', urgent: true },
                      { nummer: 'AANV-0042', titel: 'Dakkapel plaatsen', klant: 'VvE Parkzicht', bedrag: '€ 4.200', datum: '1 jun' },
                    ],
                  },
                  {
                    key: 'werkopname', label: 'Werkopname', color: 'var(--info-500)', items: [
                      { nummer: 'AANV-0038', titel: 'Schilderwerk buitengevel', klant: 'Woonstichting Noord', bedrag: '€ 22.000', datum: '25 mei', pm: 'E. Bos' },
                    ],
                  },
                  {
                    key: 'uitwerken_begroting', label: 'Calculatie', color: 'var(--warning-500)', items: [
                      { nummer: 'AANV-0035', titel: 'Badkamer renovatie', klant: 'Acme B.V.', bedrag: '€ 14.500', datum: '20 mei', pm: 'H. de Boer' },
                      { nummer: 'AANV-0033', titel: 'Vloerisolatie kelder', klant: 'Fam. Peters', bedrag: '€ 6.800', datum: '18 mei' },
                    ],
                  },
                  {
                    key: 'offerte_gereed', label: 'Offerte gereed', color: 'var(--success-500)', items: [
                      { nummer: 'AANV-0031', titel: 'Liftschacht verbouwing', klant: 'Zorgcentrum De Linde', bedrag: '€ 38.000', datum: '15 mei', pm: 'E. Bos' },
                    ],
                  },
                ].map(kol => (
                  <div key={kol.key} style={{ width: 260, flexShrink: 0, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column' }}>
                    <div style={{ display: 'flex', alignItems: 'center', padding: '12px 12px 10px', borderBottom: `2px solid ${kol.color}`, flexShrink: 0 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--fg)', flex: 1 }}>{kol.label}</span>
                      <span style={{ minWidth: 18, height: 18, borderRadius: 9, padding: '0 5px', background: 'var(--bg-active)', color: 'var(--fg-muted)', fontSize: 10, fontWeight: 700, display: 'grid', placeItems: 'center' }}>
                        {kol.items.length}
                      </span>
                    </div>
                    <div style={{ flex: 1, overflowY: 'auto', padding: 10, display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 360 }}>
                      {kol.items.map(item => (
                        <MockDossierKaart key={item.nummer} {...item} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Section>

        {/* ═══════════════ 3 · DOSSIER DETAIL ═══════════════ */}
        <Section title="Dossier detail — Aanvraag" sub="Detailpagina met tabbladen: Informatie, Bestanden, Calculatie, Taken">
          <div style={{ display: 'flex', gap: 6, marginBottom: 20, borderBottom: '1px solid var(--border)', paddingBottom: 0 }}>
            {['Informatie', 'Bestanden', 'Calculatie', 'Taken', 'VCA'].map((t, i) => (
              <button key={t} style={{
                padding: '8px 14px', background: 'none', border: 'none',
                borderBottom: i === 0 ? '2px solid var(--brand-500)' : '2px solid transparent',
                color: i === 0 ? 'var(--brand-700)' : 'var(--fg-muted)',
                fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: i === 0 ? 600 : 500,
                cursor: 'pointer', marginBottom: -1,
              }}>{t}</button>
            ))}
          </div>

          <PageHeader
            eyebrow="Aanvragen"
            title={['AANV-0041', 'Kozijn renovatie voorgevel']}
            status={{ label: 'Werkopname', tone: 'warning', dot: true }}
            actions={
              <div style={{ display: 'flex', gap: 8 }}>
                <Button variant="outline" size="md">Offerte maken</Button>
                <Button variant="primary" size="md">Opname plannen</Button>
              </div>
            }
          />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 4 }}>
            <Blok titel="Aanvraaggegevens">
              <Rij label="Aanvraagnummer" waarde="AANV-0041" />
              <Rij label="Status" waarde={<Badge tone="warning" dot>Werkopname</Badge>} />
              <Rij label="Aangemaakt" waarde="29 mei 2026" />
              <Rij label="Urgentie" waarde={<Badge tone="error">Spoed</Badge>} />
              <Rij label="Categorie" waarde="Renovatie" />
              <Rij label="Omschrijving" waarde="Kozijnen voorgevel vervangen inclusief dorpels en afkitting" />
            </Blok>
            <Blok titel="Klant & locatie">
              <Rij label="Klant" waarde={<span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Avatar name="Familie Jansen" size="sm" /> Familie Jansen</span>} />
              <Rij label="Type" waarde={<Badge tone="brand">Klant</Badge>} />
              <Rij label="Adres" waarde="Kerkstraat 12, 7511 EC Enschede" />
              <Rij label="Contactpersoon" waarde="P. Jansen · +31 6 12345678" />
              <Rij label="Projectleider" waarde={<span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Avatar name="Henk de Boer" size="sm" /> Henk de Boer</span>} />
            </Blok>
          </div>

          <div style={{ marginTop: 14 }}>
            <Alert tone="info" title="Opnameafspraak gepland">
              Werkopname is ingepland op 5 juni 2026, 09:00–11:00. Medewerker: H. de Boer.
            </Alert>
          </div>
        </Section>

        {/* ═══════════════ 4 · RELATIES ═══════════════ */}
        <Section title="Relaties — overzicht" sub="Klantenlijst met filter-tabs, zoekbalk, Avatar en Badge per type">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <PageHeader
              eyebrow="48 relaties"
              title="Relaties"
              actions={<Button variant="primary"><Plus className="h-4 w-4" />Nieuwe relatie</Button>}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ display: 'flex', gap: 2, background: 'var(--bg-elev)', border: '1px solid var(--border)', borderRadius: 8, padding: 3 }}>
                {[{ label: 'Alle', n: 48, active: true }, { label: 'Klanten', n: 31 }, { label: 'Leveranciers', n: 12 }, { label: 'Onderaannemers', n: 5 }].map(t => (
                  <button key={t.label} style={{
                    padding: '5px 11px', background: t.active ? 'var(--bg-active)' : 'transparent', border: 'none', borderRadius: 6,
                    fontFamily: 'var(--font-ui)', fontSize: 12, fontWeight: t.active ? 600 : 500,
                    color: t.active ? 'var(--fg)' : 'var(--fg-muted)', cursor: 'pointer', display: 'flex', gap: 5, alignItems: 'center',
                  }}>
                    {t.label}
                    <span style={{ background: t.active ? 'var(--accent)' : 'var(--border)', color: t.active ? 'white' : 'var(--fg-muted)', borderRadius: 10, padding: '1px 6px', fontSize: 10, fontWeight: 700 }}>{t.n}</span>
                  </button>
                ))}
              </div>
              <Input prefix={<Search className="h-3.5 w-3.5" />} placeholder="Zoek op naam, e-mail of stad…" className="w-72" />
            </div>
            <Card>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    {['Naam', 'Type', 'Stad', 'Telefoon', 'E-mail'].map(h => (
                      <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, color: 'var(--fg-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', background: 'var(--neutral-50)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    { naam: 'Familie Jansen', type: 'klant' as const, stad: 'Enschede', tel: '+31 6 12345678', email: 'p.jansen@gmail.com' },
                    { naam: 'VvE Parkzicht', type: 'klant' as const, stad: 'Hengelo', tel: '+31 74 123456', email: 'bestuur@vveparkzicht.nl' },
                    { naam: 'Woonstichting Noord', type: 'klant' as const, stad: 'Almelo', tel: '+31 546 123456', email: 'admin@wsnoord.nl' },
                    { naam: 'Veldhuis Dakwerken', type: 'onderaannemer' as const, stad: 'Enschede', tel: '+31 6 98765432', email: 'info@veldhuis.nl' },
                    { naam: 'Bouwmaterialen Oost', type: 'leverancier' as const, stad: 'Deventer', tel: '+31 570 123456', email: 'info@bmoost.nl' },
                  ].map((r, i) => {
                    const tone = r.type === 'klant' ? 'brand' : r.type === 'leverancier' ? 'info' : 'warning'
                    const label = r.type === 'klant' ? 'Klant' : r.type === 'leverancier' ? 'Leverancier' : 'Onderaannemer'
                    return (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border-soft)', cursor: 'pointer' }}>
                        <td style={{ padding: '11px 16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <Avatar name={r.naam} size="md" />
                            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)' }}>{r.naam}</span>
                          </div>
                        </td>
                        <td style={{ padding: '11px 16px' }}><Badge tone={tone as any}>{label}</Badge></td>
                        <td style={{ padding: '11px 16px', fontSize: 13, color: 'var(--fg-soft)' }}>{r.stad}</td>
                        <td style={{ padding: '11px 16px', fontSize: 13, color: 'var(--fg-soft)' }}>{r.tel}</td>
                        <td style={{ padding: '11px 16px', fontSize: 13, color: 'var(--fg-soft)' }}>{r.email}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </Card>
          </div>
        </Section>

        {/* ═══════════════ 5 · MEDEWERKERS ═══════════════ */}
        <Section title="Medewerkers — overzicht" sub="HR-scherm met Avatar, Badge intern/extern, actief-status">
          <PageHeader
            eyebrow="HR"
            title="Medewerkers"
            status={{ label: '18 medewerkers', tone: 'neutral' }}
            actions={<Button variant="primary"><Plus className="h-4 w-4" />Nieuwe medewerker</Button>}
          />
          <Card>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Naam', 'Functie', 'Afdeling', 'Type', 'Status'].map(h => (
                    <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, color: 'var(--fg-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', borderBottom: '1px solid var(--border)', background: 'var(--neutral-50)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  { naam: 'Henk de Boer', functie: 'Projectleider', afdeling: 'Uitvoering', extern: false, actief: true },
                  { naam: 'Maria Everts', functie: 'Calculator', afdeling: 'Calculatie', extern: false, actief: true },
                  { naam: 'Jan Smits', functie: 'Monteur', afdeling: 'Uitvoering', extern: false, actief: true },
                  { naam: 'Erik Bos', functie: 'ZZP Loodgieter', afdeling: '', extern: true, actief: true },
                  { naam: 'Sandra Kamp', functie: 'Binnendienst', afdeling: 'Administratie', extern: false, actief: false },
                ].map((m, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border-soft)', cursor: 'pointer' }}>
                    <td style={{ padding: '11px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Avatar name={m.naam} size="md" />
                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)' }}>{m.naam}</span>
                      </div>
                    </td>
                    <td style={{ padding: '11px 16px', fontSize: 13, color: 'var(--fg)' }}>{m.functie}</td>
                    <td style={{ padding: '11px 16px', fontSize: 13, color: 'var(--fg-muted)' }}>{m.afdeling || '—'}</td>
                    <td style={{ padding: '11px 16px' }}><Badge tone={m.extern ? 'warning' : 'success'}>{m.extern ? 'Extern' : 'Intern'}</Badge></td>
                    <td style={{ padding: '11px 16px' }}><Badge variant="outline" tone={m.actief ? 'success' : 'neutral'} dot>{m.actief ? 'Actief' : 'Inactief'}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </Section>

        {/* ═══════════════ 6 · WERKBONNEN ═══════════════ */}
        <Section title="Mijn werkbonnen — planning" sub="Werkbonnen per status: Gepland, Onderweg, Bezig, Afgerond, Probleem">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 20 }}>
            <WerkbonKaart
              status="bezig"
              werkbonId="WB-2041"
              dossier="OPDR-0118"
              title="Kozijn herstellen voorgevel"
              category="Houtrotherstel"
              meta={<span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><MapPin size={13} color="var(--neutral-400)" />Kerkstraat 12, Enschede</span>}
              progress={{ value: 65 }}
              footer={<><span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Avatar name="Henk de Boer" size="sm" /><span style={{ fontSize: 11, color: 'var(--fg-muted)' }}>Henk de Boer</span></span><Button variant="outline" size="sm">Bekijk</Button></>}
            />
            <WerkbonKaart
              status="onderweg"
              werkbonId="WB-2042"
              dossier="OPDR-0120"
              title="Storingsmelding lekkage dak"
              category="Storingsdienst"
              tasks={{ total: 4, done: 1 }}
              footer={<><span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Avatar name="Jan Smits" size="sm" /><span style={{ fontSize: 11, color: 'var(--fg-muted)' }}>Jan Smits</span></span><Button variant="outline" size="sm">Bekijk</Button></>}
            />
            <WerkbonKaart
              status="probleem"
              werkbonId="WB-2043"
              title="Schilderwerk kozijnen"
              category="Buitenschilderwerk"
              priorityHigh
              progress={{ value: 20 }}
            />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <WerkbonKaartCompact status="afgerond" time="08:00–10:30" werkbonId="WB-2040" title="Inspectie dak" location="Dorpsweg 4, Enschede" />
            <WerkbonKaartCompact status="gepland" time="14:00–16:00" werkbonId="WB-2044" title="Vochtmeting kelder" location="Parkweg 8, Hengelo" />
          </div>
        </Section>

        {/* ═══════════════ 7 · INSTELLINGEN ═══════════════ */}
        <Section title="Instellingen — overzicht" sub="Instellingen-hub met navigatie-cards per categorie">
          <PageHeader eyebrow="Platform" title="Instellingen" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
            {[
              { titel: 'Bedrijfsgegevens', omschrijving: 'Naam, adres, logo, huisstijl', icon: <Building2 className="h-5 w-5" />, tone: 'brand' as const },
              { titel: 'Medewerkers & rollen', omschrijving: 'Gebruikers, rechten, afdelingen', icon: <Users className="h-5 w-5" />, tone: 'info' as const },
              { titel: 'CAO & tarieven', omschrijving: 'Uurtarieven, CAO-schalen, kostprijzen', icon: <Euro className="h-5 w-5" />, tone: 'success' as const },
              { titel: 'BTW-tarieven', omschrijving: 'Hoge en lage BTW-tarieven', icon: <FileText className="h-5 w-5" />, tone: 'neutral' as const },
              { titel: 'Offerte-layouts', omschrijving: 'Sjablonen voor offertes en facturen', icon: <FileText className="h-5 w-5" />, tone: 'neutral' as const },
              { titel: 'Betalingscondities', omschrijving: 'Standaard betalingstermijnen', icon: <TrendingUp className="h-5 w-5" />, tone: 'warning' as const },
            ].map((item, i) => (
              <Card key={i} interactive>
                <CardBody>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 10, background: `var(--${item.tone === 'neutral' ? 'neutral-100' : item.tone + '-50'})`, color: `var(--${item.tone === 'neutral' ? 'neutral-600' : item.tone + '-600'})`, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                      {item.icon}
                    </div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--fg)', marginBottom: 4 }}>{item.titel}</div>
                      <div style={{ fontSize: 12, color: 'var(--fg-muted)' }}>{item.omschrijving}</div>
                    </div>
                  </div>
                </CardBody>
              </Card>
            ))}
          </div>
        </Section>

        {/* ═══════════════ 8 · FEEDBACK / STATES ═══════════════ */}
        <Section title="Feedback & states" sub="Hoe succes, waarschuwingen, fouten en lege toestanden eruitzien">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 640 }}>
            <Alert tone="success" title="Aanvraag opgeslagen">De aanvraag is succesvol aangemaakt en toegewezen aan Henk de Boer.</Alert>
            <Alert tone="warning" title="Offerte verloopt binnenkort">Offerte AANV-0038 verloopt op 15 juni. <strong>Herinner de klant.</strong></Alert>
            <Alert tone="error" title="Verzenden mislukt" onClose={() => {}}>De factuur kon niet worden verstuurd. Controleer het e-mailadres van de klant.</Alert>
            <Alert tone="info" title="Nieuwe integratie beschikbaar">Bouw7 kan nu worden gekoppeld via Instellingen → Integraties.</Alert>
          </div>
          <div style={{ marginTop: 20, display: 'flex', alignItems: 'center', gap: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Spinner size="sm" /> <span style={{ fontSize: 13, color: 'var(--fg-muted)' }}>Laden...</span>
            </div>
            <Progress value={72} className="w-40" />
            <Progress value={35} tone="warning" className="w-40" />
            <Progress value={8} tone="error" className="w-40" />
          </div>
        </Section>

        {/* footer */}
        <div style={{ textAlign: 'center', padding: '24px 0', borderTop: '1px solid var(--border)', color: 'var(--fg-muted)', fontSize: 12 }}>
          EVA Design System v0.2 · Preview op <strong>localhost:3000/auth/ds-preview</strong> · Geen login vereist
        </div>
      </div>
    </div>
  )
}
