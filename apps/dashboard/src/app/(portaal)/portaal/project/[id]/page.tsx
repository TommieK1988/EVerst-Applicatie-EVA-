import { Suspense } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { GeenToegangError } from '@/lib/auth/rechten'
import { getPortaalDossier, type PortaalBetrokkene } from '@/lib/portaal/dossiers'
import { getPortaalPlanning } from '@/lib/portaal/planning'
import { getPortaalAandachtspunten } from '@/lib/portaal/aandachtspunten'
import { getPortaalMeerwerk } from '@/lib/portaal/meerwerk'
import { getPortaalFotos } from '@/lib/portaal/bestanden'
import { getPortaalChat } from '@/lib/portaal/chat'
import { periode, datum, datumTijd, euro } from '@/lib/portaal/format'
import { Kaart, Kolommen, Leeg } from '../../ui'
import { Chat } from './berichten/Chat'
import { MeerwerkLijst } from './MeerwerkLijst'

export const metadata: Metadata = { title: 'Project' }
export const dynamic = 'force-dynamic'

/**
 * Overzicht van één project.
 *
 * Op een breed scherm twee kolommen: links wat er met het project gebeurt
 * (planning, aandachtspunten, meerwerk, foto's), rechts een meelopende kolom met
 * de mensen en het gesprek — de twee dingen die je tijdens het lezen bij de hand
 * wilt hebben. Onder `lg` stapelt alles en blijft het precies zoals het was.
 *
 * Elk zwaar blok zit in een eigen `<Suspense>`: de facturen en het meerwerk
 * hangen aan Bouw7 en dat mag de rest van de pagina niet ophouden.
 */
export default async function ProjectOverzicht({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  // Ook hier vangen, niet alleen in de layout: die twee renderen naast elkaar,
  // en een ongevangen fout in de pagina levert een foutscherm op in plaats van
  // een 404 — met EVA-teksten die een klant niets aangaan.
  let dossier
  try {
    dossier = await getPortaalDossier(id)
  } catch (e) {
    if (e instanceof GeenToegangError) notFound()
    throw e
  }

  const { onderdelen } = dossier

  return (
    <Kolommen
      hoofd={
        <>
          {onderdelen.planning && (
            <Suspense fallback={<Kaart titel="Planning"><Laden /></Kaart>}>
              <PlanningBlok dossierId={id} />
            </Suspense>
          )}

          {onderdelen.meerwerk && (
            <Suspense fallback={<Kaart titel="Meerwerk"><Laden /></Kaart>}>
              <MeerwerkBlok dossierId={id} />
            </Suspense>
          )}

          {onderdelen.aandachtspunten && (
            <Suspense fallback={<Kaart titel="Aandachtspunten"><Laden /></Kaart>}>
              <PuntenBlok dossierId={id} />
            </Suspense>
          )}

          {onderdelen.fotos && (
            <Suspense fallback={<Kaart titel="Foto's"><Laden /></Kaart>}>
              <FotoStrip dossierId={id} />
            </Suspense>
          )}
        </>
      }
      zij={
        <>
          <ContactBlok betrokkenen={dossier.betrokkenen} />

          {/* Het gesprek staat op breed scherm gewoon in beeld; daar is de ruimte
              voor en het is precies wat je wilt kunnen doen terwijl je de rest
              leest. Op een telefoon zou dezelfde chat de pagina eindeloos maken,
              dus daar blijft het een eigen tabblad. */}
          {onderdelen.chat && (
            <div className="hidden lg:block">
              <Suspense fallback={<Kaart titel="Berichten"><Laden /></Kaart>}>
                <ChatBlok dossierId={id} />
              </Suspense>
            </div>
          )}
        </>
      }
    />
  )
}

function Laden() {
  return <p className="text-[13px] text-neutral-400">Bezig met laden…</p>
}

/* ── Zijkolom ─────────────────────────────────────────────────────────────── */

function ContactBlok({ betrokkenen }: { betrokkenen: PortaalBetrokkene[] }) {
  return (
    <Kaart titel="Uw contactpersonen bij Everts">
      {betrokkenen.length === 0 ? (
        <Leeg>Zodra het projectteam is samengesteld, ziet u hier bij wie u terechtkunt.</Leeg>
      ) : (
        <ul className="divide-y divide-neutral-100">
          {betrokkenen.map((b, i) => (
            <li key={i} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
              {b.fotoUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={b.fotoUrl} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
              ) : (
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-xs font-bold text-neutral-500">
                  {b.naam.split(/\s+/).map(w => w[0]).slice(0, 2).join('')}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold leading-tight">{b.naam}</p>
                <p className="text-xs text-neutral-500">{b.rol}</p>
                <div className="mt-1 space-y-0.5 text-xs">
                  {/* Mobiel eerst: dat is het nummer waarop je iemand op de bouw
                      bereikt. Het vaste nummer is de terugvaloptie. */}
                  {b.mobiel && (
                    <a href={`tel:${b.mobiel.replace(/\s/g, '')}`} className="block font-medium text-brand-600 hover:underline">
                      {b.mobiel}
                    </a>
                  )}
                  {b.telefoon && (
                    <a href={`tel:${b.telefoon.replace(/\s/g, '')}`} className="block text-neutral-600 hover:underline">
                      {b.telefoon}
                    </a>
                  )}
                  {b.email && (
                    <a href={`mailto:${b.email}`} className="block truncate text-neutral-500 hover:underline">
                      {b.email}
                    </a>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Kaart>
  )
}

async function ChatBlok({ dossierId }: { dossierId: string }) {
  const berichten = await getPortaalChat(dossierId)
  return (
    <Kaart titel="Berichten" subtitel="Uw vraag komt bij het projectteam terecht">
      <Chat dossierId={dossierId} berichten={berichten} compact />
    </Kaart>
  )
}

/* ── Hoofdkolom ───────────────────────────────────────────────────────────── */

/**
 * Fases met hun periode. Staat er detailplanning aan, dan komen de activiteiten
 * eronder. Namen van medewerkers komen hier in geen enkele stand in beeld — de
 * datalaag haalt ze niet eens op.
 */
async function PlanningBlok({ dossierId }: { dossierId: string }) {
  const fases = await getPortaalPlanning(dossierId)

  return (
    <Kaart titel="Planning">
      {fases.length === 0 ? (
        <Leeg>De planning van dit project is nog niet gedeeld.</Leeg>
      ) : (
        <ol className="space-y-3">
          {fases.map((f, i) => (
            <li key={i} className="border-l-2 border-brand-200 pl-3.5">
              <p className="text-sm font-semibold">{f.naam}</p>
              <p className="text-xs text-neutral-500">{periode(f.start, f.eind)}</p>
              {f.activiteiten.length > 0 && (
                <ul className="mt-1.5 space-y-1">
                  {f.activiteiten.map(a => (
                    <li key={a.id} className="flex justify-between gap-3 text-xs text-neutral-600">
                      <span className="truncate">{a.titel}</span>
                      <span className="shrink-0 text-neutral-400">{periode(a.start, a.eind)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ol>
      )}
    </Kaart>
  )
}

async function MeerwerkBlok({ dossierId }: { dossierId: string }) {
  const data = await getPortaalMeerwerk(dossierId)

  return (
    <Kaart
      titel="Meerwerk"
      subtitel={
        data.openAantal > 0
          ? `${data.openAantal} post${data.openAantal === 1 ? '' : 'en'} wacht${data.openAantal === 1 ? '' : 'en'} op uw akkoord`
          : data.regels.length > 0
          ? `Goedgekeurd: ${euro(data.goedgekeurdExcl)} excl. btw`
          : undefined
      }
    >
      {data.regels.length === 0 ? (
        <Leeg>Er is voor dit project nog geen meerwerk vastgelegd.</Leeg>
      ) : (
        <MeerwerkLijst dossierId={dossierId} regels={data.regels} />
      )}
    </Kaart>
  )
}

async function PuntenBlok({ dossierId }: { dossierId: string }) {
  const punten = await getPortaalAandachtspunten(dossierId)

  return (
    <Kaart
      titel="Aandachtspunten"
      subtitel={punten.length > 0 ? `${punten.length} punt${punten.length === 1 ? '' : 'en'}` : undefined}
    >
      {punten.length === 0 ? (
        <Leeg>Er staan op dit moment geen punten open.</Leeg>
      ) : (
        <ul className="divide-y divide-neutral-100">
          {punten.map(p => (
            <li key={p.id} className="py-2.5 first:pt-0 last:pb-0">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm">
                    {p.volgnummer != null && (
                      <span className="mr-1.5 font-bold text-neutral-400">
                        {String(p.volgnummer).padStart(2, '0')}
                      </span>
                    )}
                    {p.omschrijving}
                  </p>
                  <p className="mt-0.5 text-xs text-neutral-500">
                    {[p.ruimte, p.moment, p.deadline ? `gereed ${datum(p.deadline)}` : null]
                      .filter(Boolean).join(' · ')}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-neutral-100 px-2.5 py-0.5 text-[11px] font-semibold text-neutral-600">
                  {p.status}
                </span>
              </div>
              {p.fotoUrls.length > 0 && (
                <div className="mt-2 flex gap-1.5">
                  {p.fotoUrls.slice(0, 4).map((u, i) => (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img key={i} src={u} alt="" className="h-14 w-14 rounded-md object-cover" />
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Kaart>
  )
}

/**
 * De laatste foto's, met een doorverwijzing naar de volledige galerij. Genoeg om
 * te zien dát er iets gebeurt; wie alles wil zien klikt door.
 */
async function FotoStrip({ dossierId }: { dossierId: string }) {
  const fotos = await getPortaalFotos(dossierId)
  if (fotos.length === 0) return null

  return (
    <Kaart
      titel="Foto's"
      actie={
        <Link href={`/portaal/project/${dossierId}/fotos`} className="text-xs font-semibold text-brand-600 hover:underline">
          Alle {fotos.length} foto&apos;s
        </Link>
      }
    >
      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {fotos.slice(0, 8).map(f => (
          <li key={f.sleutel}>
            <a href={f.url} target="_blank" rel="noopener noreferrer" className="group block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={f.thumbUrl ?? f.url}
                alt={f.naam}
                loading="lazy"
                className="aspect-square w-full rounded-lg object-cover transition group-hover:opacity-90"
              />
            </a>
          </li>
        ))}
      </ul>
      {fotos[0]?.datum && (
        <p className="mt-2 text-[11px] text-neutral-400">Laatste foto: {datumTijd(fotos[0].datum)}</p>
      )}
    </Kaart>
  )
}
