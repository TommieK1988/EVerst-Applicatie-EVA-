'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { createAdminClient } from '@everts/database/server'
import { vereisPortaalOnderdeel } from '@/lib/portaal/auth'
import { meldKlantberichtAanTeam } from '@/lib/portaal/chat'
import { meldMeerwerkbesluitAanTeam } from '@/lib/portaal/meldingen'
import { BEOORDEELBARE_STATUS } from '@/lib/portaal/meerwerk'
import { setMeerwerkStatus } from '@/lib/dossiers/meerwerk'
import type { PortaalBerichtBijlage } from '@everts/database/platform-types'

/**
 * De muterende acties van het klantportaal.
 *
 * Elke export hier is een publiek endpoint — een 'use server'-functie is
 * aanroepbaar door iedereen die de naam kent, niet alleen door onze eigen
 * pagina. Daarom begint elke functie met `vereisPortaalOnderdeel`, dat in één
 * keer sessie, dossiereigendom én de vraag of dit onderdeel überhaupt aanstaat
 * afhandelt. Het dossier-id komt van de client en wordt nooit vertrouwd.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createAdminClient() as any

const BUCKET = 'portaal-bijlagen'
/** Zelfde grens als het tokenportaal onder /p/: ruim genoeg voor een telefoonfoto. */
const MAX_BYTES = 8 * 1024 * 1024
const TOEGESTANE_TYPES = new Set([
  'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
  'application/pdf',
])
const MAX_BERICHT = 4000
const MAX_BIJLAGEN = 5

export type PortaalActieResultaat = { ok: true } | { ok: false; error: string }

/**
 * Bericht van de klant. Bijlagen zijn al geüpload met `portaalUploadBijlage` —
 * de client stuurt alleen nog de opslagpaden mee, die hier tegen de bucket en
 * het dossier worden gecontroleerd.
 */
export async function portaalPlaatsBericht(
  dossierId: string,
  bericht: string,
  bijlagen: PortaalBerichtBijlage[] = [],
): Promise<PortaalActieResultaat> {
  try {
    const { gebruiker } = await vereisPortaalOnderdeel(dossierId, 'chat')

    const tekst = (bericht ?? '').trim()
    if (!tekst && bijlagen.length === 0) return { ok: false, error: 'Typ een bericht.' }
    if (tekst.length > MAX_BERICHT) return { ok: false, error: 'Het bericht is te lang.' }
    if (bijlagen.length > MAX_BIJLAGEN) return { ok: false, error: 'Maximaal 5 bijlagen per bericht.' }

    // Alleen paden binnen de eigen dossiermap. Zonder deze controle kan een
    // geprepareerd verzoek een pad van een ánder dossier aan zijn bericht
    // hangen en dat via de bijlage-proxy alsnog uitlezen.
    const prefix = `${dossierId}/`
    const veilig = bijlagen.filter(b => typeof b?.pad === 'string' && b.pad.startsWith(prefix))
    if (veilig.length !== bijlagen.length) {
      return { ok: false, error: 'Een van de bijlagen hoort niet bij dit project.' }
    }

    await db().from('portaal_berichten').insert({
      dossier_id: dossierId,
      auteur_type: 'klant',
      portaal_gebruiker_id: gebruiker.id,
      bericht: tekst,
      bijlagen: veilig,
      intern: false,
    })

    // Eigen leesmarkering meteen bijwerken: je hebt je eigen bericht gelezen.
    await markeerGelezen(dossierId, gebruiker.id)

    await meldKlantberichtAanTeam({
      dossierId,
      afzender: await afzenderNaam(gebruiker.contactpersoon_id, gebruiker.particulier_id),
      fragment: tekst.slice(0, 140) || 'Bijlage toegevoegd',
    })

    revalidatePath(`/portaal/project/${dossierId}/berichten`)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: foutTekst(e) }
  }
}

/** Eén bijlage uploaden. Aparte stap zodat een grote foto het bericht niet blokkeert. */
export async function portaalUploadBijlage(
  dossierId: string,
  formData: FormData,
): Promise<{ ok: true; bijlage: PortaalBerichtBijlage } | { ok: false; error: string }> {
  try {
    await vereisPortaalOnderdeel(dossierId, 'chat')

    const bestand = formData.get('bestand')
    if (!(bestand instanceof File)) return { ok: false, error: 'Geen bestand ontvangen.' }
    if (bestand.size === 0) return { ok: false, error: 'Het bestand is leeg.' }
    if (bestand.size > MAX_BYTES) return { ok: false, error: 'Het bestand is groter dan 8 MB.' }
    if (!TOEGESTANE_TYPES.has(bestand.type)) {
      return { ok: false, error: 'Alleen foto\'s en PDF-bestanden kunnen worden meegestuurd.' }
    }

    // Naam uit de client nooit als pad gebruiken: die kan '../' bevatten. We
    // verzinnen zelf een pad en bewaren de oorspronkelijke naam als tekst.
    const ext = (bestand.name.split('.').pop() ?? 'bin').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5)
    const pad = `${dossierId}/${crypto.randomUUID()}.${ext || 'bin'}`

    const { error } = await createAdminClient().storage
      .from(BUCKET)
      .upload(pad, bestand, { contentType: bestand.type, upsert: false })
    if (error) return { ok: false, error: 'Uploaden mislukt. Probeer het opnieuw.' }

    return {
      ok: true,
      bijlage: {
        pad,
        naam: bestand.name.slice(0, 200),
        content_type: bestand.type,
        grootte: bestand.size,
      },
    }
  } catch (e) {
    return { ok: false, error: foutTekst(e) }
  }
}

/** Watermerk bijwerken zodat de ongelezen-teller klopt. */
export async function portaalMarkeerBerichtenGelezen(dossierId: string): Promise<void> {
  try {
    const { gebruiker } = await vereisPortaalOnderdeel(dossierId, 'chat')
    await markeerGelezen(dossierId, gebruiker.id)
  } catch {
    // stil: een niet-bijgewerkte teller is geen fout waar de klant iets mee kan
  }
}

async function markeerGelezen(dossierId: string, portaalGebruikerId: string): Promise<void> {
  await db().from('portaal_bericht_gelezen').upsert(
    {
      dossier_id: dossierId,
      lezer_type: 'klant',
      lezer_id: portaalGebruikerId,
      gelezen_tot: new Date().toISOString(),
    },
    { onConflict: 'dossier_id,lezer_type,lezer_id' },
  )
}

async function afzenderNaam(contactpersoonId: string | null, particulierId: string | null): Promise<string> {
  const tabel = contactpersoonId ? 'contactpersonen' : particulierId ? 'particulieren' : null
  const id = contactpersoonId ?? particulierId
  if (!tabel || !id) return 'de klant'
  const { data } = await db().from(tabel)
    .select('voornaam, tussenvoegsel, achternaam').eq('id', id).maybeSingle()
  if (!data) return 'de klant'
  return [data.voornaam, data.tussenvoegsel, data.achternaam].filter(Boolean).join(' ') || 'de klant'
}

/**
 * Een guard-fout is voor de klant altijd hetzelfde: "dit kan niet". De
 * onderliggende reden (dossier bestaat niet / hoort bij iemand anders /
 * onderdeel staat uit) is precies de informatie die je niet wilt prijsgeven.
 */
function foutTekst(e: unknown): string {
  if (e instanceof Error && e.name === 'GeenToegangError') {
    return 'U heeft hier geen toegang toe. Ververs de pagina.'
  }
  console.error('[portaal] actie mislukt', e)
  return 'Er ging iets mis. Probeer het opnieuw.'
}

/**
 * De klant keurt een meerwerkregel goed of wijst hem af.
 *
 * Dit is bindend: de regel gaat meteen op `akkoord` of `afgewezen`, met alle
 * gevolgen die dat in EVA al had — bewakingscode in Bouw7, statusmapping naar de
 * Bouw7-regel, meetellen in het contracttotaal. Dat is ook de bedoeling: het
 * domeinproces eist schriftelijk klantakkoord vóór uitvoering, en deze klik ís
 * die akkoordverklaring. Daarom wordt hij vastgelegd met naam, tijdstip en IP.
 *
 * Alleen vanaf `offerte_verstuurd`: de klant beoordeelt nooit iets waar hij geen
 * onderbouwing bij heeft gekregen.
 */
export async function portaalBeoordeelMeerwerk(
  dossierId: string,
  regelId: string,
  besluit: 'akkoord' | 'afgewezen',
  opmerking?: string,
): Promise<PortaalActieResultaat> {
  try {
    const { gebruiker } = await vereisPortaalOnderdeel(dossierId, 'meerwerk')
    if (besluit !== 'akkoord' && besluit !== 'afgewezen') {
      return { ok: false, error: 'Onbekend besluit.' }
    }

    // Het regel-id komt van de client. Controleren dat hij bij dít dossier hoort
    // en in de juiste stand staat -- anders kan een geprepareerd verzoek een
    // meerwerkregel van een ander project op akkoord zetten.
    const { data: regel } = await db()
      .from('meerwerk_regels')
      .select('id, dossier_id, status, omschrijving, bedrag_excl_btw')
      .eq('id', regelId)
      .eq('dossier_id', dossierId)
      .maybeSingle()

    if (!regel) return { ok: false, error: 'Deze post hoort niet bij dit project.' }
    if (regel.status !== BEOORDEELBARE_STATUS) {
      return { ok: false, error: 'Deze post staat niet (meer) open voor uw akkoord. Ververs de pagina.' }
    }

    const naam = await afzenderNaam(gebruiker.contactpersoon_id, gebruiker.particulier_id)
    // Vercel zet het echte adres in x-forwarded-for; de eerste is de bezoeker.
    const kop = await headers()
    const ip = (kop.get('x-forwarded-for') ?? '').split(',')[0].trim() || null

    const res = await setMeerwerkStatus(regelId, besluit, {
      actor: { soort: 'klant', id: gebruiker.id, naam, ip },
      besluitOpmerking: opmerking?.trim() || null,
    })
    if (!res.ok) return { ok: false, error: res.error }

    const bedrag = Number(regel.bedrag_excl_btw)
    await meldMeerwerkbesluitAanTeam({
      dossierId,
      afzender: naam,
      besluit,
      omschrijving: String(regel.omschrijving ?? 'Meerwerk'),
      // Bij regie en stelposten op geboekte kosten staat hier geen vast bedrag;
      // dan liever niets dan een misleidende nul in de melding.
      bedrag: Number.isFinite(bedrag) && bedrag !== 0
        ? bedrag.toLocaleString('nl-NL', { style: 'currency', currency: 'EUR' })
        : 'bedrag volgens nacalculatie',
    })

    revalidatePath(`/portaal/project/${dossierId}`)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: foutTekst(e) }
  }
}
