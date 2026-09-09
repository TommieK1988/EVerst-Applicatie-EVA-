'use client'

/**
 * Beheerscherm voor de e-mailsjablonen.
 *
 * Eén lijst per groep, één regel per mailmoment. Wat je ziet is wat er verstuurd wordt: een
 * mailmoment zonder eigen sjabloon toont de standaardtekst uit de code met het label "standaard".
 * Pas als je hem aanpast ontstaat er een rij in `mail_sjablonen` — "Terug naar standaard" gooit die
 * weer weg. Zo is er nooit twijfel wélke tekst uitgaat.
 */

import { useMemo, useState, useTransition } from 'react'
import toast from 'react-hot-toast'
import { Button, Input, Textarea, Badge, useDialogen } from '@/components/ui'
import {
  MAIL_GROEPEN, MAIL_SOORTEN, MAIL_SOORT_INFO,
  type MailSjabloon, type MailSoort,
} from '@/lib/mail/sjablonen'
import {
  maakMailSjabloon, updateMailSjabloon, verwijderMailSjabloon, updateDocumentMail,
  type DocumentMailRij,
} from './actions'

type Props = { sjablonen: MailSjabloon[]; documentMails: DocumentMailRij[] }

/** Eén regel in de lijst: een mailmoment, met of zonder eigen sjabloon. */
type Regel = {
  soort: MailSoort
  /** null = draait nog op de standaardtekst uit de code. */
  sjabloon: MailSjabloon | null
  /** Extra variant naast de eerste; die telt niet mee bij het versturen. */
  variant: boolean
}

const rand = { border: '1px solid var(--border)', borderRadius: 8 }
const label: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: 'var(--fg-muted)', display: 'block', marginBottom: 4 }
const uitleg: React.CSSProperties = { fontSize: 12, color: 'var(--fg-muted)', margin: 0, lineHeight: 1.55 }

export default function MailSjablonenBeheer({ sjablonen, documentMails }: Props) {
  const { bevestig } = useDialogen()
  const [rijen, setRijen] = useState(sjablonen)
  const [open, setOpen] = useState<string | null>(null)
  const [bezig, start] = useTransition()

  // Per soort de sjablonen op volgorde; de eerste actieve is degene die verstuurd wordt.
  const perSoort = useMemo(() => {
    const kaart = new Map<MailSoort, MailSjabloon[]>()
    for (const s of rijen) kaart.set(s.soort, [...(kaart.get(s.soort) ?? []), s])
    return kaart
  }, [rijen])

  const lijst: Regel[] = useMemo(() => {
    const uit: Regel[] = []
    for (const soort of MAIL_SOORTEN) {
      const eigen = perSoort.get(soort) ?? []
      if (eigen.length === 0) uit.push({ soort, sjabloon: null, variant: false })
      else eigen.forEach((s, i) => uit.push({ soort, sjabloon: s, variant: i > 0 }))
    }
    return uit
  }, [perSoort])

  function aanpassen(soort: MailSoort) {
    start(async () => {
      try {
        const id = await maakMailSjabloon(soort)
        const info = MAIL_SOORT_INFO[soort]
        setRijen(l => [...l, {
          id, soort, naam: info.label, actief: true, volgorde: 0,
          onderwerp: info.standaard.onderwerp, tekst: info.standaard.tekst,
        }])
        setOpen(id)
      } catch { toast.error('Aanmaken mislukt') }
    })
  }

  function bewaar(id: string, patch: Partial<MailSjabloon>) {
    start(async () => {
      const res = await updateMailSjabloon(id, patch)
      if (!res.ok) { toast.error(res.error); return }
      setRijen(l => l.map(s => (s.id === id ? { ...s, ...patch } : s)))
      toast.success('Opgeslagen')
    })
  }

  async function herstel(s: MailSjabloon) {
    const ok = await bevestig({
      titel: 'Terug naar de standaardtekst?',
      omschrijving: `De aangepaste tekst van "${MAIL_SOORT_INFO[s.soort].label}" verdwijnt. Deze mail gaat daarna weer met de standaardtekst van EVA de deur uit.`,
      bevestigLabel: 'Terugzetten',
      destructief: true,
    })
    if (!ok) return
    start(async () => {
      const res = await verwijderMailSjabloon(s.id)
      if (!res.ok) { toast.error(res.error); return }
      setRijen(l => l.filter(x => x.id !== s.id))
      setOpen(null)
      toast.success('Standaardtekst hersteld')
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 26 }}>
      {MAIL_GROEPEN.map(groep => {
        const inGroep = lijst.filter(r => MAIL_SOORT_INFO[r.soort].groep === groep)
        if (inGroep.length === 0) return null
        return (
          <section key={groep} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <h2 style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--fg-muted)', margin: 0 }}>
              {groep}
            </h2>
            {inGroep.map(regel => (
              <SjabloonRegel
                key={regel.sjabloon?.id ?? regel.soort}
                regel={regel}
                open={open === (regel.sjabloon?.id ?? regel.soort)}
                bezig={bezig}
                onToggle={() => setOpen(o => (o === (regel.sjabloon?.id ?? regel.soort) ? null : (regel.sjabloon?.id ?? regel.soort)))}
                onAanpassen={() => aanpassen(regel.soort)}
                onBewaar={bewaar}
                onHerstel={herstel}
              />
            ))}
          </section>
        )
      })}

      <NieuweVariant bezig={bezig} onKies={aanpassen} />

      {documentMails.length > 0 && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <h2 style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--fg-muted)', margin: '10px 0 0' }}>
            Mails bij een documentsjabloon
          </h2>
          <p style={uitleg}>
            Deze mailteksten horen bij een Word-sjabloon — de bijlage en de begeleidende tekst blijven
            bij elkaar. Je bewerkt ze hier of in Instellingen → Documentsjablonen; het is dezelfde tekst.
          </p>
          {documentMails.map(d => (
            <DocumentMailRegel
              key={d.id}
              rij={d}
              open={open === d.id}
              bezig={bezig}
              onToggle={() => setOpen(o => (o === d.id ? null : d.id))}
            />
          ))}
        </section>
      )}
    </div>
  )
}

/* ─────────────────────────────── Eén mailmoment ─────────────────────────────── */

function SjabloonRegel({
  regel, open, bezig, onToggle, onAanpassen, onBewaar, onHerstel,
}: {
  regel: Regel
  open: boolean
  bezig: boolean
  onToggle: () => void
  onAanpassen: () => void
  onBewaar: (id: string, patch: Partial<MailSjabloon>) => void
  onHerstel: (s: MailSjabloon) => void
}) {
  const info = MAIL_SOORT_INFO[regel.soort]
  const s = regel.sjabloon
  const [soort, setSoort] = useState<MailSoort>(regel.soort)
  const [onderwerp, setOnderwerp] = useState(s?.onderwerp ?? info.standaard.onderwerp)
  const [tekst, setTekst] = useState(s?.tekst ?? info.standaard.tekst)

  const gewijzigd = !!s && (soort !== s.soort || onderwerp !== s.onderwerp || tekst !== s.tekst)

  return (
    <div style={{ ...rand, background: 'var(--bg)' }}>
      <button
        onClick={onToggle}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
          background: 'none', border: 0, cursor: 'pointer', textAlign: 'left',
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>
          {info.label}
          {regel.variant && <span style={{ fontWeight: 400, color: 'var(--fg-muted)' }}> — variant</span>}
        </span>
        {s
          ? <Badge tone={regel.variant ? 'neutral' : 'brand'}>{regel.variant ? 'niet in gebruik' : 'aangepast'}</Badge>
          : <Badge tone="neutral" variant="outline">standaard</Badge>}
        <span style={{ color: 'var(--fg-muted)', fontSize: 12 }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div style={{ padding: '0 14px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p style={uitleg}>{info.wanneer}</p>

          {s && (
            <div>
              <span style={label}>Om welke e-mail gaat dit sjabloon?</span>
              <select
                value={soort}
                onChange={e => setSoort(e.target.value as MailSoort)}
                style={{ ...rand, padding: '6px 8px', fontSize: 13, width: '100%', background: 'var(--bg)', color: 'var(--fg)' }}
              >
                {MAIL_SOORTEN.map(k => (
                  <option key={k} value={k}>{MAIL_SOORT_INFO[k].groep} — {MAIL_SOORT_INFO[k].label}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <span style={label}>Onderwerp</span>
            <Input value={onderwerp} disabled={!s} onChange={e => setOnderwerp(e.target.value)} />
          </div>

          <div>
            <span style={label}>Bericht</span>
            <Textarea
              value={tekst}
              disabled={!s}
              rows={Math.min(22, Math.max(8, tekst.split('\n').length + 2))}
              onChange={e => setTekst(e.target.value)}
              style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 12.5, lineHeight: 1.6 }}
            />
          </div>

          <VariabelenHulp soort={regel.soort} />

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {s ? (
              <>
                <Button size="sm" variant="primary" disabled={bezig || !gewijzigd}
                  onClick={() => onBewaar(s.id, { soort, onderwerp, tekst })}>
                  Opslaan
                </Button>
                <Button size="sm" variant="ghost" disabled={bezig} onClick={() => onHerstel(s)}>
                  Terug naar standaard
                </Button>
              </>
            ) : (
              <>
                <Button size="sm" variant="primary" disabled={bezig} onClick={onAanpassen}>
                  Tekst aanpassen
                </Button>
                <span style={uitleg}>Deze mail gaat nu met de standaardtekst van EVA de deur uit.</span>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/* ─────────────────────── Mail die bij een documentsjabloon hoort ─────────────────────── */

function DocumentMailRegel({
  rij, open, bezig, onToggle,
}: { rij: DocumentMailRij; open: boolean; bezig: boolean; onToggle: () => void }) {
  const [onderwerp, setOnderwerp] = useState(rij.onderwerp)
  const [tekst, setTekst] = useState(rij.tekst)
  const [, start] = useTransition()
  const gewijzigd = onderwerp !== rij.onderwerp || tekst !== rij.tekst

  function bewaar() {
    start(async () => {
      const res = await updateDocumentMail(rij.id, { onderwerp, tekst })
      if (res.ok) toast.success('Opgeslagen')
      else toast.error(res.error)
    })
  }

  return (
    <div style={{ ...rand, background: 'var(--bg)' }}>
      <button
        onClick={onToggle}
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'none', border: 0, cursor: 'pointer', textAlign: 'left' }}
      >
        <span style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>{rij.naam}</span>
        <Badge tone="neutral" variant="outline">{rij.documentsoortLabel}</Badge>
        {!rij.actief && <Badge tone="warning">inactief</Badge>}
        <span style={{ color: 'var(--fg-muted)', fontSize: 12 }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div style={{ padding: '0 14px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <span style={label}>Onderwerp</span>
            <Input value={onderwerp} onChange={e => setOnderwerp(e.target.value)} />
          </div>
          <div>
            <span style={label}>Bericht</span>
            <Textarea
              value={tekst}
              rows={Math.min(20, Math.max(6, tekst.split('\n').length + 2))}
              onChange={e => setTekst(e.target.value)}
              style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 12.5, lineHeight: 1.6 }}
            />
          </div>
          <p style={uitleg}>
            Welke variabelen hier mogen, hangt af van het documentsjabloon — de sjabloon-editor laat
            ze zien. De opmaak van de mail zelf maakt EVA; dit is alleen de tekst.
          </p>
          <div>
            <Button size="sm" variant="primary" disabled={bezig || !gewijzigd} onClick={bewaar}>Opslaan</Button>
          </div>
        </div>
      )}
    </div>
  )
}

/* ──────────────────────────────── Hulpblokken ──────────────────────────────── */

function VariabelenHulp({ soort }: { soort: MailSoort }) {
  const info = MAIL_SOORT_INFO[soort]
  const chip: React.CSSProperties = {
    fontFamily: 'var(--font-mono, monospace)', fontSize: 11, background: 'var(--bg-subtle, #f2f4f3)',
    borderRadius: 4, padding: '1px 5px', whiteSpace: 'nowrap',
  }
  return (
    <div style={{ ...rand, padding: '10px 12px', background: 'var(--bg-subtle, #fafbfa)', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div>
        <span style={label}>Variabelen — worden ingevuld bij het versturen</span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {info.variabelen.map(v => (
            <span key={v.sleutel} style={chip} title={v.uitleg}>{`{${v.sleutel}}`}</span>
          ))}
        </div>
      </div>

      {info.blokken.length > 0 && (
        <div>
          <span style={label}>Blokken — stukken die EVA zelf opmaakt; zet ze op een eigen regel</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {info.blokken.map(b => (
              <span key={b.sleutel} style={chip} title={b.uitleg}>{`{${b.sleutel}}`}</span>
            ))}
          </div>
        </div>
      )}

      <p style={uitleg}>
        Een lege regel begint een nieuwe alinea. <code style={chip}>**vet**</code> maakt tekst vet,{' '}
        <code style={chip}>[tekst](https://…)</code> maakt een link, en een alinea die begint met{' '}
        <code style={chip}>[klein]</code> komt in kleine grijze letters te staan.
      </p>
    </div>
  )
}

function NieuweVariant({ bezig, onKies }: { bezig: boolean; onKies: (s: MailSoort) => void }) {
  const [tonen, setTonen] = useState(false)
  const [soort, setSoort] = useState<MailSoort>('offerte')

  if (!tonen) {
    return (
      <div>
        <Button size="sm" variant="secondary" onClick={() => setTonen(true)}>+ Sjabloon toevoegen</Button>
      </div>
    )
  }

  return (
    <div style={{ ...rand, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div>
        <span style={label}>Om welke e-mail gaat dit sjabloon?</span>
        <select
          value={soort}
          onChange={e => setSoort(e.target.value as MailSoort)}
          style={{ ...rand, padding: '6px 8px', fontSize: 13, width: '100%', background: 'var(--bg)', color: 'var(--fg)' }}
        >
          {MAIL_SOORTEN.map(k => (
            <option key={k} value={k}>{MAIL_SOORT_INFO[k].groep} — {MAIL_SOORT_INFO[k].label}</option>
          ))}
        </select>
      </div>
      <p style={uitleg}>
        Bestaat er voor deze mail al een sjabloon, dan komt dit erbij als variant. Verstuurd wordt
        altijd de bovenste: varianten zijn er om een tekst voor te bereiden, niet om te kiezen.
      </p>
      <div style={{ display: 'flex', gap: 8 }}>
        <Button size="sm" variant="primary" disabled={bezig} onClick={() => { onKies(soort); setTonen(false) }}>
          Toevoegen
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setTonen(false)}>Annuleren</Button>
      </div>
    </div>
  )
}
