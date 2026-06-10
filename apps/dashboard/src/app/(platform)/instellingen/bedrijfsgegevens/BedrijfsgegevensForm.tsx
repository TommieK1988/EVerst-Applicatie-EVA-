'use client'

import { useState, useTransition } from 'react'
import { saveBedrijfsgegevens } from './actions'
import type { Bedrijfsgegevens } from '@everts/database'
import { Button, Card, CardBody, Input, Alert } from '@/components/ui'

type Status =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'success' }
  | { kind: 'error'; message: string; missingTable?: boolean }

export function BedrijfsgegevensForm({
  initial,
  parent,
}: {
  initial: Bedrijfsgegevens | null
  parent?: Bedrijfsgegevens | null
}) {
  const [pending, startTransition] = useTransition()
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const isWm = initial?.type === 'werkmaatschappij'

  return (
    <form
      action={(formData) => {
        setStatus({ kind: 'saving' })
        startTransition(async () => {
          const result = await saveBedrijfsgegevens(formData)
          if (result.ok) setStatus({ kind: 'success' })
          else setStatus({ kind: 'error', message: result.error, missingTable: result.missingTable })
        })
      }}
      style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
    >
      {initial?.id        && <input type="hidden" name="id"        value={initial.id} />}
      {initial?.type      && <input type="hidden" name="type"      value={initial.type} />}
      {initial?.parent_id && <input type="hidden" name="parent_id" value={initial.parent_id} />}

      <FormSection title="Algemeen">
        <Field label="Bedrijfsnaam *" name="naam"       required defaultValue={initial?.naam ?? ''}       fallback={parent?.naam} />
        {isWm && <Field label="Code" name="code" defaultValue={initial?.code ?? ''} placeholder="bv. EOS, BM" />}
        <Field label="KvK-nummer"    name="kvk_nummer"  defaultValue={initial?.kvk_nummer ?? ''}          fallback={parent?.kvk_nummer} />
        <Field label="BTW-nummer"    name="btw_nummer"  defaultValue={initial?.btw_nummer ?? ''}          fallback={parent?.btw_nummer} />
        <Field label="IBAN"          name="iban"        defaultValue={initial?.iban ?? ''}                 fallback={parent?.iban} />
      </FormSection>

      <FormSection title="Adres">
        <Field label="Straat + nr" name="adres_straat"   defaultValue={initial?.adres_straat ?? ''}   fallback={parent?.adres_straat} />
        <Field label="Postcode"    name="adres_postcode" defaultValue={initial?.adres_postcode ?? ''} fallback={parent?.adres_postcode} />
        <Field label="Plaats"      name="adres_plaats"   defaultValue={initial?.adres_plaats ?? ''}   fallback={parent?.adres_plaats} />
        <Field label="Land"        name="adres_land"     defaultValue={initial?.adres_land ?? 'Nederland'} fallback={parent?.adres_land} />
      </FormSection>

      <FormSection title="Contact">
        <Field label="Telefoon" name="telefoon" defaultValue={initial?.telefoon ?? ''} fallback={parent?.telefoon} />
        <Field label="E-mail"   name="email"    type="email" defaultValue={initial?.email ?? ''} fallback={parent?.email} />
        <Field label="Website"  name="website"  defaultValue={initial?.website ?? ''}  fallback={parent?.website} />
      </FormSection>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 4 }}>
        <Button type="submit" variant="primary" disabled={pending} loading={pending}>
          {pending ? 'Opslaan…' : 'Opslaan'}
        </Button>

        {status.kind === 'success' && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 500, color: 'var(--accent)' }}>
            <CheckIcon /> Opgeslagen
          </span>
        )}
        {status.kind === 'error' && (
          <Alert tone="error">
            {status.missingTable ? 'Tabel "bedrijfsgegevens" bestaat niet. Draai eerst de SQL migratie.' : status.message}
          </Alert>
        )}
      </div>
    </form>
  )
}

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardBody>
        <p className="eva-section-label">{title}</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
          {children}
        </div>
      </CardBody>
    </Card>
  )
}

function Field({
  label, name, type = 'text', defaultValue, required, placeholder, fallback,
}: {
  label: string; name: string; type?: string
  defaultValue?: string; required?: boolean
  placeholder?: string; fallback?: string | null
}) {
  const effectivePlaceholder = fallback ? `← ${fallback} (van organisatie)` : placeholder
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <span style={{ fontFamily: 'var(--font-ui)', fontSize: 11, fontWeight: 600, color: 'var(--fg-muted)', letterSpacing: '0.02em' }}>{label}</span>
      <Input name={name} type={type} defaultValue={defaultValue} required={required}
        placeholder={effectivePlaceholder} />
    </label>
  )
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 10l4 4 8-9"/>
    </svg>
  )
}
