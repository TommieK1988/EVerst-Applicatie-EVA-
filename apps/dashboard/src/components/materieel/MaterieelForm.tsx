'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import toast from 'react-hot-toast'
import { PageHeader, Button } from '@/components/ui'
import { nieuwMaterieelSchema, type NieuwMaterieelInput } from '@/lib/materieel/validations'
import {
  MATERIEEL_CATEGORIEEN, CATEGORIE_LABELS,
  MATERIEEL_STATUSSEN, STATUS_META,
  type MaterieelObject, type Optie,
} from '@/lib/materieel/types'
import { maakMaterieelObject, updateMaterieelObject } from '@/app/(platform)/materieelbeheer/actions'

const labelStyle: React.CSSProperties = {
  fontFamily: 'var(--font-ui)', fontSize: 12, fontWeight: 600,
  color: 'var(--fg-soft)', marginBottom: 4, display: 'block',
}
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px', borderRadius: 8,
  border: '1px solid var(--border)', background: 'var(--bg)',
  fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--fg)',
}
const foutStyle: React.CSSProperties = { fontSize: 11, color: 'var(--error-600, #dc2626)', marginTop: 3 }
/** Veld dat niet van toepassing is bij meerdere exemplaren tegelijk. */
const opSlotStyle: React.CSSProperties = {
  ...inputStyle, background: 'var(--neutral-100)', color: 'var(--fg-muted)', cursor: 'not-allowed',
}

function Veld({ label, children, fout }: { label: string; children: React.ReactNode; fout?: string }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      {children}
      {fout && <div style={foutStyle}>{fout}</div>}
    </div>
  )
}

type Props = {
  /** Meegeven om te bewerken; weglaten = nieuw object. */
  bestaand?: MaterieelObject
  /** Voor de medewerker-keuze bij aanmaken. */
  medewerkerOpties?: Optie[]
}

export default function MaterieelForm({ bestaand, medewerkerOpties = [] }: Props) {
  const router = useRouter()
  const bewerken = !!bestaand

  const {
    register, handleSubmit, watch, formState: { errors, isSubmitting },
  } = useForm<NieuwMaterieelInput>({
    resolver: zodResolver(nieuwMaterieelSchema),
    defaultValues: {
      toegewezen_medewerker_id: '',
      aantal: 1,
      omschrijving: bestaand?.omschrijving ?? '',
      categorie: bestaand?.categorie ?? 'gereedschap',
      status: bestaand?.status ?? 'beschikbaar',
      inventarisnummer: bestaand?.inventarisnummer ?? '',
      // Zonder gekochte sticker staat hier de id (dat zet een database-trigger).
      // Die tonen we niet: een uuid in een veld "Stickercode" leest als rommel.
      qr_code: bestaand && bestaand.qr_code !== bestaand.id ? bestaand.qr_code ?? '' : '',
      merk: bestaand?.merk ?? '',
      type: bestaand?.type ?? '',
      serienummer: bestaand?.serienummer ?? '',
      leverancier: bestaand?.leverancier ?? '',
      aankoopdatum: bestaand?.aankoopdatum ?? '',
      garantie_tot: bestaand?.garantie_tot ?? '',
      aanschafwaarde: bestaand?.aanschafwaarde ?? ('' as unknown as number),
      vervangingswaarde: bestaand?.vervangingswaarde ?? ('' as unknown as number),
      boekwaarde: bestaand?.boekwaarde ?? ('' as unknown as number),
      opmerkingen: bestaand?.opmerkingen ?? '',
    },
  })

  // Meerdere exemplaren tegelijk inboeken. Stickercode, inventarisnummer en
  // serienummer horen dan bij niemand in het bijzonder — die velden gaan op slot
  // (en react-hook-form stuurt ze als `undefined` mee, dus ze blijven leeg).
  const aantal = Number(watch('aantal') ?? 1)
  const meerdere = !bewerken && aantal > 1

  async function onSubmit(waarden: NieuwMaterieelInput) {
    if (bewerken) {
      const res = await updateMaterieelObject(bestaand!.id, waarden)
      if (!res.ok) { toast.error(res.error); return }
      toast.success('Materieel bijgewerkt')
      router.push(`/materieelbeheer/${res.data.id}`)
      router.refresh()
      return
    }

    const res = await maakMaterieelObject(waarden)
    if (!res.ok) { toast.error(res.error); return }

    // Bij één exemplaar het verse paspoort openen (daar hoort de sticker op).
    // Bij meerdere heeft dat geen zin — dan is de lijst met alle nieuwe regels
    // de plek waar je verder werkt.
    const { id, aantal: gemaakt } = res.data
    toast.success(gemaakt > 1 ? `${gemaakt} stuks toegevoegd` : 'Materieel toegevoegd')
    router.push(gemaakt > 1 ? '/materieelbeheer' : `/materieelbeheer/${id}`)
    router.refresh()
  }

  return (
    <div className="eva-page-full">
      <PageHeader eyebrow="Materieelbeheer" title={bewerken ? 'Materieel bewerken' : 'Nieuw materieel'} />

      <form onSubmit={handleSubmit(onSubmit)} style={{ maxWidth: 720, marginTop: 16 }}>
        <div className="materieel-form-grid" style={{
          display: 'grid', gap: 16,
          background: 'var(--bg-elev, var(--bg))', border: '1px solid var(--border)',
          borderRadius: 12, padding: 20,
        }}>
          <div style={{ gridColumn: '1 / -1' }}>
            <Veld label="Omschrijving *" fout={errors.omschrijving?.message}>
              <input {...register('omschrijving')} style={inputStyle} placeholder="Bijv. Festool boormachine" />
            </Veld>
          </div>

          {!bewerken && (
            <Veld label="Aantal" fout={errors.aantal?.message}>
              <input type="number" min="1" max="50" step="1" {...register('aantal')} style={{ ...inputStyle, maxWidth: 120 }} />
              <p style={{ fontSize: 11, color: 'var(--fg-muted)', marginTop: 4 }}>
                {meerdere
                  ? `Er komen ${aantal} losse objecten in de lijst, elk met een eigen paspoort en QR-code.`
                  : 'Meer dan één van hetzelfde? Vul hier in hoeveel — je krijgt er evenveel losse objecten voor terug.'}
              </p>
            </Veld>
          )}

          {!bewerken && (
            <div style={{ gridColumn: '1 / -1' }}>
              <Veld label="Toewijzen aan medewerker" fout={errors.toegewezen_medewerker_id?.message}>
                <select {...register('toegewezen_medewerker_id')} style={inputStyle}>
                  <option value="">— Algemeen gebruik (niemand persoonlijk) —</option>
                  {medewerkerOpties.map((o) => (
                    <option key={o.id} value={o.id}>{o.naam}</option>
                  ))}
                </select>
              </Veld>
              <p style={{ fontSize: 11, color: 'var(--fg-muted)', marginTop: 4 }}>
                Kies je niemand, dan staat het materieel voor algemeen gebruik. Later wijzigen kan via Toewijzen op het paspoort.
              </p>
            </div>
          )}

          <Veld label="Categorie *" fout={errors.categorie?.message}>
            <select {...register('categorie')} style={inputStyle}>
              {MATERIEEL_CATEGORIEEN.map((c) => (
                <option key={c} value={c}>{CATEGORIE_LABELS[c]}</option>
              ))}
            </select>
          </Veld>

          <Veld label="Status" fout={errors.status?.message}>
            <select {...register('status')} style={inputStyle}>
              {MATERIEEL_STATUSSEN.map((s) => (
                <option key={s} value={s}>{STATUS_META[s].label}</option>
              ))}
            </select>
          </Veld>

          <Veld label="Inventarisnummer" fout={errors.inventarisnummer?.message}>
            <input
              {...register('inventarisnummer', { disabled: meerdere })}
              style={meerdere ? opSlotStyle : inputStyle}
              placeholder={meerdere ? 'Per stuk invullen' : 'Optioneel'}
            />
          </Veld>

          <Veld label="Stickercode" fout={errors.qr_code?.message}>
            <input
              {...register('qr_code', { disabled: meerdere })}
              style={meerdere ? opSlotStyle : inputStyle}
              placeholder={meerdere ? 'Per stuk invullen' : 'Code van de gekochte sticker'}
            />
          </Veld>

          <Veld label="Serienummer" fout={errors.serienummer?.message}>
            <input
              {...register('serienummer', { disabled: meerdere })}
              style={meerdere ? opSlotStyle : inputStyle}
              placeholder={meerdere ? 'Per stuk invullen' : ''}
            />
          </Veld>

          {meerdere && (
            <p style={{ gridColumn: '1 / -1', fontSize: 11, color: 'var(--fg-muted)', marginTop: -8 }}>
              Inventarisnummer, stickercode en serienummer horen bij één exemplaar. Die vul je per stuk in
              op het paspoort, nadat ze zijn aangemaakt.
            </p>
          )}

          <Veld label="Merk" fout={errors.merk?.message}>
            <input {...register('merk')} style={inputStyle} />
          </Veld>

          <Veld label="Type" fout={errors.type?.message}>
            <input {...register('type')} style={inputStyle} />
          </Veld>

          <Veld label="Leverancier" fout={errors.leverancier?.message}>
            <input {...register('leverancier')} style={inputStyle} />
          </Veld>

          <Veld label="Aankoopdatum" fout={errors.aankoopdatum?.message}>
            <input type="date" {...register('aankoopdatum')} style={inputStyle} />
          </Veld>

          <Veld label="Garantie tot" fout={errors.garantie_tot?.message}>
            <input type="date" {...register('garantie_tot')} style={inputStyle} />
          </Veld>

          <Veld label="Aanschafwaarde (€ excl. btw)" fout={errors.aanschafwaarde?.message}>
            <input type="number" step="0.01" min="0" {...register('aanschafwaarde')} style={inputStyle} />
          </Veld>

          <Veld label="Boekwaarde (€ excl. btw)" fout={errors.boekwaarde?.message}>
            <input type="number" step="0.01" min="0" {...register('boekwaarde')} style={inputStyle} />
          </Veld>

          {/* Vervangingswaarde: wat kost het vandaag om dit terug te kopen. Dat
              is het bedrag dat je bij verlies of diefstal nodig hebt — niet de
              historische aanschafprijs. */}
          <Veld label="Vervangingswaarde (€ excl. btw)" fout={errors.vervangingswaarde?.message}>
            <input type="number" step="0.01" min="0" {...register('vervangingswaarde')} style={inputStyle} />
          </Veld>

          <div style={{ gridColumn: '1 / -1' }}>
            <Veld label="Opmerkingen" fout={errors.opmerkingen?.message}>
              <textarea {...register('opmerkingen')} style={{ ...inputStyle, minHeight: 72, resize: 'vertical' }} />
            </Veld>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <Button type="submit" variant="primary" disabled={isSubmitting}>
            {isSubmitting ? 'Bezig…' : bewerken ? 'Opslaan' : meerdere ? `${aantal} stuks toevoegen` : 'Materieel toevoegen'}
          </Button>
          <Button type="button" variant="secondary" onClick={() => router.back()}>
            Annuleren
          </Button>
        </div>
      </form>

      {/* Twee kolommen op desktop, één op telefoon. */}
      <style>{`
        .materieel-form-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        @media (max-width: 640px) {
          .materieel-form-grid { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  )
}
