'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import type { UrenRegel, BewakingscodeOptie } from '@/lib/dossiers/actions'
import { updateUurlogBewakingscode } from '@/lib/dossiers/actions'
import { fmt, fmtUren, fmtTarief, fmtDatum, TH, TD } from './tab-ui'

interface Props {
  dossierId: string
  regels: UrenRegel[]
  totalen: { uren: number; bedrag: number }
  bewakingscodes: BewakingscodeOptie[]
  perMedewerker: boolean
}

export default function UrenDetailTable({ dossierId, regels, totalen, bewakingscodes, perMedewerker }: Props) {
  const router = useRouter()
  const [pending, start] = useTransition()

  function wijzigCode(regel: UrenRegel, nieuwCode: string) {
    if (!regel.bouw7Id || !regel.bouw7ProjectId || !regel.hourTypeId) return
    const optie = bewakingscodes.find((o) => o.code === nieuwCode)
    if (!optie) return

    start(async () => {
      const res = await updateUurlogBewakingscode(
        dossierId,
        {
          id: regel.bouw7Id!,
          bouw7ProjectId: regel.bouw7ProjectId!,
          logHours: String(regel.uren),
          logDate: regel.datum ?? '',
          hourTypeId: regel.hourTypeId!,
        },
        optie.pslId,
      )
      if (res.ok) {
        toast.success('Bewakingscode bijgewerkt in Bouw7')
        router.refresh()
      } else {
        toast.error(res.error ?? 'Bouw7-update mislukt')
      }
    })
  }

  const tabel: React.CSSProperties = { width: '100%', borderCollapse: 'collapse' }

  return (
    <table style={tabel}>
      <thead>
        {perMedewerker ? (
          <tr>
            <TH>Medewerker</TH>
            <TH>Datum</TH>
            <TH>Uursoort</TH>
            <TH>Bewakingscode</TH>
            <TH right>Uren</TH>
            <TH right>Uurtarief</TH>
            <TH right>Bedrag</TH>
          </tr>
        ) : (
          <tr>
            <TH>Bewakingscode</TH>
            <TH>Omschrijving</TH>
            <TH right>Geboekte uren</TH>
            <TH right>Gem. tarief</TH>
            <TH right>Arbeidskosten</TH>
          </tr>
        )}
      </thead>
      <tbody>
        {regels.map((r, i) =>
          perMedewerker ? (
            <tr key={i} style={{ opacity: pending ? 0.6 : 1 }}>
              <TD>{r.medewerker ?? '—'}</TD>
              <TD>{fmtDatum(r.datum)}</TD>
              <TD>{r.uursoort ?? '—'}</TD>
              <TD>
                {r.bouw7Id != null && bewakingscodes.length > 0 ? (
                  <select
                    disabled={pending}
                    value={r.code ?? ''}
                    onChange={(e) => wijzigCode(r, e.target.value)}
                    style={{
                      fontSize: 12, border: '1px solid var(--neutral-200)', borderRadius: 4,
                      padding: '2px 4px', background: 'var(--neutral-50)', cursor: 'pointer',
                      minWidth: 120,
                    }}
                  >
                    {!r.code && <option value="">— geen code —</option>}
                    {bewakingscodes.map((o) => (
                      <option key={o.pslId} value={o.code}>
                        {o.code}{o.naam ? ` · ${o.naam}` : ''}
                      </option>
                    ))}
                  </select>
                ) : (
                  r.code ? `${r.code}${r.codeNaam ? ` · ${r.codeNaam}` : ''}` : '—'
                )}
              </TD>
              <TD right>{fmtUren(r.uren)}</TD>
              <TD right>{fmtTarief(r.uurtarief)}</TD>
              <TD right accent={r.bedrag > 0}>{fmt(r.bedrag)}</TD>
            </tr>
          ) : (
            <tr key={i}>
              <TD>{r.code ?? '—'}</TD>
              <TD>{r.codeNaam ?? '—'}</TD>
              <TD right>{fmtUren(r.uren)}</TD>
              <TD right>{fmtTarief(r.uurtarief)}</TD>
              <TD right accent={r.bedrag > 0}>{fmt(r.bedrag)}</TD>
            </tr>
          ),
        )}
        <tr style={{ background: 'var(--neutral-100, #eef2f3)' }}>
          <TD vet>Totaal</TD>
          {perMedewerker ? (
            <><TD>{''}</TD><TD>{''}</TD><TD>{''}</TD></>
          ) : (
            <TD>{''}</TD>
          )}
          <TD right vet>{fmtUren(totalen.uren, true)}</TD>
          <TD>{''}</TD>
          <TD right vet>{fmt(totalen.bedrag, true)}</TD>
        </tr>
      </tbody>
    </table>
  )
}
