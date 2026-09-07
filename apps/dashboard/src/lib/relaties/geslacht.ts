/**
 * Geslacht van een contactpersoon bepalen: eerst uit de Bouw7-aanhef, anders uit de voornaam.
 *
 * Bewust een eigen module en niet in lib/bouw7/sync.ts: dat bestand draait onder `'use server'`,
 * en daar mag geen synchrone functie uit worden geexporteerd. tsc keurt dat goed, de
 * Next-build valt erover om.
 */

/**
 * Bouw7-aanhef naar geslacht.
 *
 * `salutation` is in Bouw7 een vrij tekstveld, dus de spelling varieert: "De heer", "heer",
 * "meneer", "Mevrouw", "mevrouw " komen allemaal voor. Een aanhef die er een van beide noemt
 * is eenduidig; een die ze allebei noemt ("Geachte heer/mevrouw") is juist het bewijs dat het
 * geslacht in Bouw7 onbekend is, en levert bewust null op.
 */
export function geslachtUitAanhef(aanhef?: string | null): 'man' | 'vrouw' | null {
  const s = (aanhef ?? '').toLowerCase().replace(/[^a-z]+/g, ' ').trim()
  if (!s) return null
  const vrouw = /\b(mevrouw|mevr|mw)\b/.test(s)
  const man   = /\b(heer|dhr|meneer)\b/.test(s)
  if (vrouw && man) return null
  if (vrouw) return 'vrouw'
  if (man) return 'man'
  return null
}

/**
 * Geslacht raden uit een voornaam — de terugval als Bouw7 geen aanhef heeft.
 *
 * Bouw7 vult `salutation` bij ruim tweederde van de contactpersonen ("De heer", "Mevrouw"),
 * en dat is de betrouwbare bron; zie `geslachtUitAanhef` hierboven. Voor de rest
 * is de voornaam het enige aanknopingspunt.
 *
 * Raden is hier alleen verantwoord omdat het resultaat één ding aanstuurt: de aanhef van een
 * brief of offerte ("Geachte heer" / "Geachte mevrouw"). Fout gokken is daar zichtbaar en
 * gênant, dus de lijst is bewust **conservatief**:
 *
 * - namen die in Nederland zowel man als vrouw kunnen zijn (Robin, Chris, Alex, Sam, Kim,
 *   Bo, Dominique, Sacha, Jamie, Nikki) staan er **niet** in — die leveren null op, en dan
 *   blijft het veld leeg in plaats van dat er een gok in komt te staan;
 * - wat geen persoonsnaam is ("VvE Sparrelaan", "Servicedesk", "Back Office", "Nationaal
 *   Grondbezit B.V.") matcht vanzelf niet, want het staat niet in de lijst. Dat is precies de
 *   bedoeling: in de relatiestam staan veel VvE's en beheerkantoren als contactpersoon.
 *
 * Een leeg veld is altijd het veilige antwoord: de offerte valt dan terug op
 * "Geachte heer/mevrouw".
 */

/** Namen die eenduidig mannelijk zijn in de Nederlandse context. */
const MAN = new Set([
  'aad', 'aart', 'abel', 'abdel', 'adri', 'adriaan', 'ahmed', 'albert', 'alexander', 'ali',
  'andre', 'andré', 'andries', 'anton', 'antoine', 'arend', 'arie', 'arif', 'arjan',
  'arjen', 'arnaud', 'arno', 'arnold', 'arthur', 'ate', 'aziz',
  'barend', 'bart', 'bas', 'bastiaan', 'bauke', 'ben', 'benjamin', 'bennie', 'benny', 'bernard',
  'bert', 'berend', 'bjorn', 'björn', 'boudewijn', 'bram', 'brian', 'bruno', 'burak',
  'carel', 'carlo', 'casper', 'cees', 'chiel', 'christiaan', 'christian', 'christoph',
  'christophe', 'cor', 'cornelis', 'corné', 'corne', 'daan', 'daniel', 'daniël', 'danny',
  'dave', 'david', 'dennis', 'derk', 'dick', 'diederik', 'dirk', 'dries', 'douwe', 'duncan',
  'eddy', 'eddie', 'edward', 'edwin', 'egbert', 'elbert', 'emiel', 'emile', 'emre', 'erik',
  'erwin', 'etienne', 'evert', 'ewout', 'fabian', 'faried', 'ferdinand', 'ferry', 'floris',
  'frank', 'frans', 'fred', 'freddy', 'frederik', 'frits', 'gabriel', 'geert', 'gerard',
  'gerben', 'gerrit', 'gert', 'gijs', 'gijsbert', 'glenn', 'godfried', 'guido', 'gustaaf',
  'hamid', 'hans', 'harm', 'harold', 'harrie', 'harry', 'hasan', 'hein', 'hendrik', 'hendrikus',
  'henk', 'henri', 'herman', 'hessel', 'hidde', 'hugo', 'huib', 'huub', 'ian', 'ibrahim',
  'ids', 'ivo', 'jaap', 'jack', 'jacob', 'jacobus', 'jan', 'janwillem', 'jarno', 'jasper',
  'jean', 'jelle', 'jelmer', 'jeroen', 'jesse', 'jilles', 'jim', 'joachim', 'job', 'jochem',
  'joep', 'joeri', 'johan', 'johannes', 'john', 'joop', 'joost', 'jordi', 'jorg', 'jorn',
  'jos', 'joshua', 'joris', 'jouke', 'julian', 'jurgen', 'jurriaan', 'justin',
  'karel', 'kees', 'kevin', 'klaas', 'koen', 'koos', 'lars', 'laurens', 'leen', 'leendert',
  'lennart', 'leo', 'leon', 'levi', 'lex', 'louis', 'lourens', 'luc', 'lucas', 'ludo',
  'luuk', 'maarten', 'maikel', 'malik', 'manfred', 'marc', 'marcel', 'marco', 'marinus',
  'mario', 'marius', 'mark', 'marnix', 'martijn', 'martin', 'marten', 'mathijs', 'matthijs',
  'maurice', 'maurits', 'max', 'mees', 'mehmet', 'melvin', 'menno', 'mesut', 'michael',
  'michel', 'michiel', 'mohamed', 'mohammed', 'murat', 'nathan', 'nick', 'nico', 'niek',
  'niels', 'nils', 'norbert', 'olaf', 'oliver', 'olivier', 'omar', 'onno', 'oscar', 'otto',
  'paul', 'pascal', 'patrick', 'peer', 'peter', 'petrus', 'philip', 'pieter', 'piet',
  'pim', 'quinten', 'ralph', 'ramon', 'raymond', 'reinier', 'reinder', 'remco', 'remy',
  'rene', 'rené', 'richard', 'rick', 'rien', 'rik', 'rob', 'robbert', 'robert', 'roel',
  'roelof', 'rogier', 'roger', 'roland', 'rolf', 'ron', 'ronald', 'roy', 'rudolf', 'rudi',
  'ruben', 'rudy', 'ruud', 'sander', 'sebastiaan', 'sem', 'sef', 'sepp', 'sicco', 'sietse',
  'siem', 'simon', 'sjaak', 'sjoerd', 'stan', 'stef', 'stefan', 'sten', 'steven', 'stijn',
  'sven', 'teun', 'thijs', 'theo', 'thomas', 'tijmen', 'tim', 'timo', 'tjeerd', 'tom',
  'ton', 'tonnie', 'tycho', 'ulco', 'victor', 'vincent', 'walter', 'ward', 'werner',
  'wessel', 'wibo', 'wiebe', 'wietse', 'wil', 'wilbert', 'willem', 'willy', 'wim', 'wouter',
  'yannick', 'youri', 'yusuf', 'zeger',
])

/** Namen die eenduidig vrouwelijk zijn in de Nederlandse context. */
const VROUW = new Set([
  'aafke', 'agnes', 'aleid', 'alexandra', 'alice', 'alicia', 'aline', 'amanda', 'amber',
  'amy', 'anita', 'anja', 'anke', 'ann', 'anna', 'anne', 'anneke', 'annelies', 'annemarie',
  'annemieke', 'annet', 'annette', 'annika', 'antoinette', 'ariane', 'astrid', 'aukje',
  'barbara', 'bea', 'beatrice', 'beatrix', 'belinda', 'berdien', 'bianca', 'birgit', 'brenda',
  'britt', 'carla', 'carmen', 'carolien', 'caroline', 'catharina', 'cathelijne', 'cecile',
  'chantal', 'charlotte', 'christel', 'christien', 'christina', 'christine', 'cindy',
  'claudia', 'colette', 'conny', 'cora', 'corina', 'corinne', 'daniella', 'daniëlle',
  'danielle', 'debbie', 'debora', 'denise', 'diana', 'diane', 'dianne', 'dieuwertje',
  'dorien', 'doris', 'edith', 'eefje', 'eline', 'elisabeth', 'elise', 'elke', 'ella',
  'ellen', 'elly', 'els', 'elsbeth', 'emma', 'erica', 'erika', 'esmee', 'esther', 'eva',
  'evelien', 'evelyn', 'femke', 'fenna', 'fleur', 'floortje', 'francien', 'francisca',
  'franka', 'geertje', 'gerda', 'gerdien', 'gerrie', 'gerry', 'gertrude', 'gina', 'gonnie',
  'grietje', 'hanneke', 'hannah', 'hanna', 'heleen', 'helen', 'helena', 'hendrika',
  'henriette', 'henriëtte', 'hilde', 'hillie', 'ida', 'ilona', 'ilse', 'inge', 'ingeborg',
  'ingrid', 'irene', 'iris', 'isabel', 'isabelle', 'jacqueline', 'janet', 'janneke',
  'jantien', 'jasmijn', 'jeanet', 'jeanette', 'jeannette', 'jeanine', 'jennifer', 'jenny',
  'jessica', 'joke', 'jolanda', 'jolien', 'josee', 'josefien', 'josephine', 'judith',
  'julia', 'juliette', 'karen', 'karin', 'karina', 'katja', 'kirsten', 'klaartje', 'krista',
  'kristel', 'laura', 'lea', 'leonie', 'lianne', 'lidia', 'lidwien', 'liesbeth', 'lieke',
  'lilian', 'linda', 'lisa', 'lisanne', 'lisette', 'lotte', 'louise', 'lucia', 'lydia',
  'maaike', 'madelon', 'maike', 'manon', 'marga', 'margo', 'margot', 'margreet', 'margriet',
  'maria', 'marian', 'mariane', 'marianne', 'marieke', 'mariska', 'marjan', 'marjolein',
  'marjolijn', 'marleen', 'marlies', 'marloes', 'martine', 'mathilde', 'maud', 'melanie',
  'merel', 'mieke', 'miranda', 'mirjam', 'mirte', 'moniek', 'monique', 'myrthe', 'nadia',
  'nancy', 'nathalie', 'natasja', 'nelleke', 'nicole', 'nienke', 'nina', 'noor', 'noortje',
  'olga', 'patricia', 'paulien', 'pauline', 'petra', 'petronella', 'pien', 'priscilla',
  'rachel', 'ramona', 'renate', 'renee', 'renée', 'ria', 'rianne', 'rita', 'roos', 'rosa',
  'rosanne', 'ruth', 'sabine', 'sandra', 'sanne', 'sara', 'sarah', 'saskia', 'selma',
  'sharon', 'sietske', 'silvia', 'simone', 'sonja', 'sophie', 'stefanie', 'stephanie',
  'suzanne', 'sylvia', 'tamara', 'tanja', 'tessa', 'thea', 'tineke', 'trees', 'trudy',
  'valerie', 'vanessa', 'vera', 'veronique', 'vivian', 'wendy', 'wilhelmina', 'willemien',
  'willeke', 'wilma', 'yvonne', 'zoe', 'zoë',
])

/**
 * Geslacht op basis van de voornaam, of null als de naam onbekend of dubbelzinnig is.
 *
 * Neemt bewust alleen het eerste naamdeel: "Jan Willem" en "Anne-Marie" worden op het eerste
 * stuk beoordeeld, en losse initialen ("E.", "F.A.") vallen af omdat er geen naamdeel van
 * twee letters overblijft om op te matchen.
 */
export function geslachtUitVoornaam(voornaam?: string | null): 'man' | 'vrouw' | null {
  const eerste = (voornaam ?? '')
    .toLowerCase()
    .split(/[\s.\-_/]+/)
    .map(deel => deel.replace(/[^a-zà-ÿ]/g, ''))
    .find(deel => deel.length >= 2)
  if (!eerste) return null
  if (MAN.has(eerste)) return 'man'
  if (VROUW.has(eerste)) return 'vrouw'
  return null
}
