/**
 * Alle berichten voor deze taal, per naamruimte (één JSON-bestand per scherm of onderdeel).
 * Voeg een nieuwe naamruimte in alle drie de talen toe (nl, pl, ta) — de pariteitstest
 * (i18n/berichten.test.ts) wordt rood zodra er één ontbreekt of een sleutel mist.
 */
import gedeeld from './gedeeld.json'
import taal from './taal.json'
import algemeen from './algemeen.json'
import home from './home.json'
import profiel from './profiel.json'
import notificaties from './notificaties.json'
import dialogen from './dialogen.json'
import planning from './planning.json'
import prikklok from './prikklok.json'
import uren from './uren.json'
import verlof from './verlof.json'
import taken from './taken.json'
import dossiers from './dossiers.json'
import dossiertabs from './dossiertabs.json'
import servicedesk from './servicedesk.json'
import houtrot from './houtrot.json'
import opname from './opname.json'
import bezoek from './bezoek.json'
import oplevering from './oplevering.json'
import kwaliteit from './kwaliteit.json'
import materieel from './materieel.json'
import handboek from './handboek.json'
import toolbox from './toolbox.json'
import formulieren from './formulieren.json'
import werkbon from './werkbon.json'
import vertalen from './vertalen.json'
import updates from './updates.json'

const berichten = {
  gedeeld,
  taal,
  algemeen,
  home,
  profiel,
  notificaties,
  dialogen,
  planning,
  prikklok,
  uren,
  verlof,
  taken,
  dossiers,
  dossiertabs,
  servicedesk,
  houtrot,
  opname,
  bezoek,
  oplevering,
  kwaliteit,
  materieel,
  handboek,
  toolbox,
  formulieren,
  werkbon,
  vertalen,
  updates,
}

export default berichten
