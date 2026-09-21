'use client'

/**
 * Wat je na een gesprek wilt vastleggen, achter één duimdoel.
 *
 * Eén knop in de voetbalk die een paneel opent met drie tabjes — niet drie losse knoppen. Op
 * een telefoon is één ruim trefgebied beter dan drie smalle, en de drie formulieren delen de
 * helft van hun velden (wie, wanneer). Welk tabje je nodig hebt weet je pas als het paneel
 * open is: "ik moet hier iets mee" komt eerder dan "dit wordt een verkoopkans".
 *
 * De notitie staat vooraan omdat dat het vaakst gebeurt — na élk gesprek — en de andere twee
 * alleen als er echt iets uit voortkomt.
 *
 * Tabjes waarvoor het recht ontbreekt verschijnen niet. Een formulier tonen dat bij opslaan
 * "geen toegang" geeft is erger dan het weglaten.
 *
 * Dezelfde sheet hangt onder het klantbeeld en onder de kaart van één contactpersoon. Het
 * verschil zit in wat al vaststaat: bij de klant weet je de opdrachtgever maar niet met wie
 * je sprak, bij de persoon precies andersom. Vandaar `relaties` als lijst (één element =
 * geen keuze, meer = een keuzelijst) en `vasteContactpersoonId` in plaats van de "met wie"-
 * vraag. Een notitie kan niet zonder opdrachtgever — `relatie_notities.relatie_id` is `not
 * null` — dus zonder werkgever blijft dat tabje weg.
 */

import React from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { Plus } from 'lucide-react'
import MobielStickyFooter from '@/components/mobiel/MobielStickyFooter'
import BottomSheet from '@/components/mobiel/BottomSheet'
import SpraakTextarea from '@/components/mobiel/SpraakTextarea'
import { plaatsRelatieNotitie } from '@/lib/relaties/notities-actions'
import { maakVerkoopkans } from '@/lib/commercie/verkoopkansen'
import { werkdagenVooruit } from '@/lib/commercie/types'
import { maakTaak } from '@/app/(platform)/taken/actions/taken'
import { GRIJS, OPPERVLAK, RAND, TEKST, label, primaireKnop, veld } from './stijl'

type Tab = 'notitie' | 'kans' | 'actie'

const TAB_LABEL: Record<Tab, string> = {
  notitie: 'Notitie',
  kans:    'Verkoopkans',
  actie:   'Actie',
}

/** Vandaag als YYYY-MM-DD in Nederlandse tijd — zelfde aanpak als `vandaagNL` op de server. */
function vandaag(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Amsterdam' })
}

export default function VastleggenSheet({
  relaties, titelVoorvoegsel, contactpersonen, vasteContactpersoonId, medewerkers,
  currentMedewerkerId, magNotitie, magVerkoopkans,
}: {
  /**
   * De opdrachtgever(s) waar een notitie of verkoopkans aan hangt. Eén element = vast, meer
   * dan één = een keuzelijst (een contactpersoon kan bij meerdere organisaties werken), leeg
   * = alleen een losse actie.
   */
  relaties: { id: string; naam: string }[]
  /** Waar de actietitel mee begint: de klantnaam of de naam van de persoon die je sprak. */
  titelVoorvoegsel: string
  /** Kandidaten voor "met wie sprak je?"; leeg als dat al vaststaat. */
  contactpersonen: { id: string; naam: string }[]
  /** Staat de persoon al vast (je kijkt naar zijn kaart), dan vervalt die vraag. */
  vasteContactpersoonId?: string | null
  /** Alle actieve medewerkers met een account; draagt de keuze "wie pakt dit op". */
  medewerkers: { id: string; naam: string; authUserId: string | null }[]
  currentMedewerkerId: string | null
  magNotitie: boolean
  magVerkoopkans: boolean
}) {
  const router = useRouter()
  const [open, setOpen]   = React.useState(false)
  const [bezig, setBezig] = React.useState(false)
  const [fout, setFout]   = React.useState<string | null>(null)

  const tabs: Tab[] = [
    ...(magNotitie && relaties.length > 0 ? ['notitie' as const] : []),
    ...(magVerkoopkans ? ['kans' as const] : []),
    'actie' as const,
  ]
  const [tab, setTab] = React.useState<Tab>(tabs[0] ?? 'actie')

  // Bij welke opdrachtgever het hoort. De eerste is de primaire werkgever, en dat is in
  // verreweg de meeste gevallen de juiste.
  const [relatieId, setRelatieId] = React.useState(relaties[0]?.id ?? '')

  // Notitie
  const [tekst, setTekst] = React.useState('')
  const [cpId, setCpId]   = React.useState('')

  // Verkoopkans en actie delen wie/wanneer.
  const [uitleg, setUitleg]         = React.useState('')
  const [houderId, setHouderId]     = React.useState(currentMedewerkerId ?? '')
  const [deadline, setDeadline]     = React.useState(() => werkdagenVooruit(vandaag(), 5))
  const [actieTitel, setActieTitel] = React.useState('')

  function sluit() {
    setOpen(false)
    setFout(null)
    setTekst(''); setCpId(''); setUitleg(''); setActieTitel('')
  }

  async function bewaarNotitie() {
    const inhoud = tekst.trim()
    if (!inhoud) { setFout('Schrijf of spreek eerst iets in.'); return }
    if (!relatieId) { setFout('Kies bij welke opdrachtgever dit hoort.'); return }
    const res = await plaatsRelatieNotitie(relatieId, inhoud, vasteContactpersoonId || cpId || null)
    if (!res.ok) { setFout(res.error); return }
    toast.success('Notitie vastgelegd')
    sluit(); router.refresh()
  }

  async function bewaarKans() {
    const tekstKans = uitleg.trim()
    if (!tekstKans) { setFout('Beschrijf de kans.'); return }
    if (!houderId)  { setFout('Kies wie dit oppakt.'); return }
    const res = await maakVerkoopkans({
      uitleg: tekstKans,
      actiehouderId: houderId,
      deadline,
      relatieId: relatieId || undefined,
    })
    if (!res.ok) { setFout(res.error); return }
    toast.success('Verkoopkans aangemaakt')
    sluit(); router.refresh()
  }

  async function bewaarActie() {
    const t = actieTitel.trim()
    if (!t) { setFout('Geef de actie een titel.'); return }
    const houder = medewerkers.find(m => m.id === houderId)
    if (!houder?.authUserId) {
      setFout('Deze collega heeft geen account; kies iemand anders.')
      return
    }
    // Een losse taak: er is hier geen dossier om hem aan te hangen. De klantnaam staat in de
    // titel, zodat de actie in "Mijn acties" nog te plaatsen is.
    await maakTaak({
      titel: t,
      deadline: deadline || undefined,
      assignees: [{ user_id: houder.authUserId, rol: 'verantwoordelijke' }],
    })
    toast.success('Actie aangemaakt')
    sluit(); router.refresh()
  }

  async function bewaar() {
    if (bezig) return
    setBezig(true)
    setFout(null)
    try {
      if (tab === 'notitie') await bewaarNotitie()
      else if (tab === 'kans') await bewaarKans()
      else await bewaarActie()
    } catch (e) {
      setFout(e instanceof Error ? e.message : 'Opslaan lukte niet. Probeer het opnieuw.')
    } finally {
      setBezig(false)
    }
  }

  return (
    <>
      <MobielStickyFooter>
        <button
          type="button"
          onClick={() => { setOpen(true); setActieTitel(`${titelVoorvoegsel}: `) }}
          style={{ ...primaireKnop, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
        >
          <Plus size={19} aria-hidden />
          Vastleggen
        </button>
      </MobielStickyFooter>

      {/* Alleen "Vastleggen" als sheet-titel: de klantnaam staat al in de schermkop, en erbij
          zetten laat de titel bij een naam als "Woningstichting Haag Wonen" over twee regels
          breken. */}
      {open && (
        <BottomSheet titel="Vastleggen" onSluit={sluit}>
          {/* Tabjes */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
            {tabs.map(t => (
              <button
                key={t}
                type="button"
                onClick={() => { setTab(t); setFout(null) }}
                style={{
                  flex: 1, padding: '9px 6px', borderRadius: 10, fontSize: 13.5, fontWeight: 700,
                  cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
                  border: `1px solid ${tab === t ? 'transparent' : RAND}`,
                  background: tab === t ? TEKST : OPPERVLAK,
                  color: tab === t ? 'var(--bg-elev)' : GRIJS,
                }}
              >
                {TAB_LABEL[t]}
              </button>
            ))}
          </div>

          {/* Werkt iemand bij meerdere organisaties, dan bepaalt deze keuze waar de notitie of
              de kans landt. Bij één opdrachtgever is er niets te kiezen en blijft hij weg. */}
          {relaties.length > 1 && tab !== 'actie' && (
            <div style={{ marginBottom: 12 }}>
              <label style={label} htmlFor="vastleg-relatie">Bij welke opdrachtgever?</label>
              <select
                id="vastleg-relatie"
                value={relatieId}
                onChange={e => setRelatieId(e.target.value)}
                style={veld}
              >
                {relaties.map(r => (
                  <option key={r.id} value={r.id}>{r.naam}</option>
                ))}
              </select>
            </div>
          )}

          {tab === 'notitie' && (
            <>
              <label style={label} htmlFor="notitie-tekst">Wat is er besproken?</label>
              <SpraakTextarea
                id="notitie-tekst"
                value={tekst}
                onChange={setTekst}
                placeholder="Spreek in of typ wat er is afgesproken…"
                rows={4}
                style={veld}
              />
              {!vasteContactpersoonId && contactpersonen.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <label style={label} htmlFor="notitie-cp">Met wie sprak je?</label>
                  <select
                    id="notitie-cp"
                    value={cpId}
                    onChange={e => setCpId(e.target.value)}
                    style={veld}
                  >
                    <option value="">Geen specifieke contactpersoon</option>
                    {contactpersonen.map(c => (
                      <option key={c.id} value={c.id}>{c.naam}</option>
                    ))}
                  </select>
                </div>
              )}
            </>
          )}

          {tab === 'kans' && (
            <>
              <label style={label} htmlFor="kans-uitleg">Waar gaat de kans over?</label>
              <SpraakTextarea
                id="kans-uitleg"
                value={uitleg}
                onChange={setUitleg}
                placeholder="Bijvoorbeeld: volgend jaar het schilderwerk aan blok C"
                rows={3}
                style={veld}
              />
            </>
          )}

          {tab === 'actie' && (
            <>
              <label style={label} htmlFor="actie-titel">Wat moet er gebeuren?</label>
              <input
                id="actie-titel"
                value={actieTitel}
                onChange={e => setActieTitel(e.target.value)}
                placeholder="Bijvoorbeeld: offerte 2451 nabellen"
                style={veld}
              />
            </>
          )}

          {/* Wie en wanneer: gedeeld door verkoopkans en actie.

              Onder elkaar en niet naast elkaar. Naast elkaar werd "Tom Kamminga (jij)" op een
              375px-scherm al afgekapt, en namen als "Marieke van den Broek-Jansen" verdwijnen
              dan half. Verticale ruimte is hier niet schaars: de sheet is niet vol. */}
          {tab !== 'notitie' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
              <div style={{ minWidth: 0 }}>
                <label style={label} htmlFor="vastleg-houder">Wie pakt dit op?</label>
                <select
                  id="vastleg-houder"
                  value={houderId}
                  onChange={e => setHouderId(e.target.value)}
                  style={veld}
                >
                  <option value="">Kies…</option>
                  {medewerkers.map(m => (
                    <option key={m.id} value={m.id}>
                      {m.id === currentMedewerkerId ? `${m.naam} (jij)` : m.naam}
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ minWidth: 0 }}>
                <label style={label} htmlFor="vastleg-deadline">Uiterlijk</label>
                <input
                  id="vastleg-deadline"
                  type="date"
                  value={deadline}
                  onChange={e => setDeadline(e.target.value)}
                  style={veld}
                />
              </div>
            </div>
          )}

          {fout && (
            <div style={{
              marginTop: 12, padding: 11, borderRadius: 10,
              background: 'rgba(180,35,24,.08)', color: '#b42318',
              fontSize: 13.5, lineHeight: 1.45,
            }}>
              {fout}
            </div>
          )}

          <button
            type="button"
            onClick={bewaar}
            disabled={bezig}
            style={{
              ...primaireKnop, width: '100%', marginTop: 16,
              opacity: bezig ? 0.6 : 1,
            }}
          >
            {bezig ? 'Bezig…' : 'Opslaan'}
          </button>
        </BottomSheet>
      )}
    </>
  )
}
