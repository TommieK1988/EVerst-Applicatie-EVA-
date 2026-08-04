/**
 * Mapping van Calc4You-onderdeelcodes naar de EVA-schilderbibliotheek.
 *
 * Achtergrond
 * -----------
 * In `Bibliotheek - Onderhoud..c4y` is elke detailregel gecodeerd als
 * `<behandeling zonder spatie>-<onderdeelcode>`, bijvoorbeeld `OHD03-khn-m¹`.
 * De code-suffix (`khn-m¹`) is de betrouwbare sleutel: hij is per onderdeel
 * consistent en heeft altijd dezelfde eenheid. De omschrijving is dat níét —
 * dezelfde code heet per behandeling anders, met typefouten
 * (`khB` = "kozijnen 10-20cm" / "Kozijnen hout 10-20cm" / "Hout kozijnen 10-20cm").
 * Daarom mappen we op code, niet op tekst.
 *
 * Twee series naast elkaar
 * ------------------------
 * Het bestand bevat twee normeringen die elkaar deels overlappen:
 *  - de beschrijvende serie (`-m²`/`-m¹`-suffix), consequent en dekkend
 *    (34× = in vrijwel elke behandeling);
 *  - de letterserie (`khA`–`khD`, `rhA`–`rhK`, …), fijnmaziger per maat maar
 *    slechts in een handvol behandelingen aanwezig.
 * Beide worden geïmporteerd als aparte types onder hetzelfde onderdeel. Waar ze
 * hetzelfde fysieke ding beschrijven (bv. `dhA` en `dhv-m²` = "deuren hout vlak")
 * blijven het twee types met een eigen norm; het importscript rapporteert die
 * paren zodat later besloten kan worden er één te laten vervallen.
 *
 * Onderdeelnamen volgen de EVA-stijl: enkelvoud met hoofdletter, het type los.
 * De vier bestaande onderdelen (Houten kozijn 001, Houten raam 005, Houten deur
 * 008) worden hergebruikt via hun code.
 */

/** Ondergronden, afgeleid van de c4y-hoofdgroep. */
export const ONDERGROND = {
  OH: 'hout',
  OK: 'kunststof',
  OM: 'metaal',
  OS: 'steenachtig',
}

/**
 * Onderdelen. `code` is de sleutel in `schilder_onderdelen`; de drie
 * driecijferige codes bestaan al in EVA en worden hergebruikt, niet gedupliceerd.
 */
export const ONDERDELEN = {
  // ── Hout ────────────────────────────────────────────────────────────────
  HOUTEN_DEUR:        { code: '008', naam: 'Houten deur',              ondergrond: 'hout' },
  HOUTEN_KOZIJN:      { code: '001', naam: 'Houten kozijn',            ondergrond: 'hout' },
  HOUTEN_RAAM:        { code: '005', naam: 'Houten raam',              ondergrond: 'hout' },
  HOUTEN_PANEEL:      { code: 'HPA', naam: 'Houten paneel',            ondergrond: 'hout' },
  HOUTEN_GOOTLIJST:   { code: 'HGL', naam: 'Houten goot- en lijstwerk', ondergrond: 'hout' },
  HOUTEN_OPPERVLAK:   { code: 'HOP', naam: 'Houten oppervlak',         ondergrond: 'hout' },
  HOUTEN_TRAP:        { code: 'HTR', naam: 'Houten trap',              ondergrond: 'hout' },
  GLASROEDE:          { code: 'GRO', naam: 'Glasroede',                ondergrond: 'hout' },

  // ── Kunststof ───────────────────────────────────────────────────────────
  KUNSTSTOF_DEUR:     { code: 'KDE', naam: 'Kunststof deur',           ondergrond: 'kunststof' },
  KUNSTSTOF_KOZIJN:   { code: 'KKO', naam: 'Kunststof kozijn',         ondergrond: 'kunststof' },
  KUNSTSTOF_RAAM:     { code: 'KRA', naam: 'Kunststof raam',           ondergrond: 'kunststof' },
  KUNSTSTOF_PANEEL:   { code: 'KPA', naam: 'Kunststof paneel',         ondergrond: 'kunststof' },
  KUNSTSTOF_GOOTLIJST:{ code: 'KGL', naam: 'Kunststof goot- en lijstwerk', ondergrond: 'kunststof' },
  KUNSTSTOF_HWA:      { code: 'KHW', naam: 'Kunststof hemelwaterafvoer',   ondergrond: 'kunststof' },
  KUNSTSTOF_DIVERSEN: { code: 'KDI', naam: 'Kunststof diversen',       ondergrond: 'kunststof' },

  // ── Metaal — aluminium ──────────────────────────────────────────────────
  ALU_DEUR:           { code: 'ADE', naam: 'Aluminium deur',           ondergrond: 'metaal' },
  ALU_KOZIJN:         { code: 'AKO', naam: 'Aluminium kozijn',         ondergrond: 'metaal' },
  ALU_RAAM:           { code: 'ARA', naam: 'Aluminium raam',           ondergrond: 'metaal' },
  ALU_PANEEL:         { code: 'APA', naam: 'Aluminium paneel',         ondergrond: 'metaal' },
  ALU_OPPERVLAK:      { code: 'AOP', naam: 'Aluminium oppervlak',      ondergrond: 'metaal' },

  // ── Metaal — staal ──────────────────────────────────────────────────────
  STALEN_DEUR:        { code: 'SDE', naam: 'Stalen deur',              ondergrond: 'metaal' },
  STALEN_KOZIJN:      { code: 'SKO', naam: 'Stalen kozijn',            ondergrond: 'metaal' },
  STALEN_RAAM:        { code: 'SRA', naam: 'Stalen raam',              ondergrond: 'metaal' },
  STALEN_HEKWERK:     { code: 'SHW', naam: 'Stalen hekwerk',           ondergrond: 'metaal' },
  STALEN_LEUNING:     { code: 'SLE', naam: 'Stalen leuning',           ondergrond: 'metaal' },
  STALEN_LEIDING:     { code: 'SLD', naam: 'Stalen leiding',           ondergrond: 'metaal' },
  STALEN_BEPLATING:   { code: 'SBP', naam: 'Stalen beplating',         ondergrond: 'metaal' },
  STAALPROFIEL:       { code: 'SPR', naam: 'Staalprofiel',             ondergrond: 'metaal' },
  STALEN_RADIATOR:    { code: 'SRD', naam: 'Stalen radiator',          ondergrond: 'metaal' },
  STALEN_HWA:         { code: 'SHW2',naam: 'Stalen hemelwaterafvoer',  ondergrond: 'metaal' },
  STALEN_GOOTBEUGEL:  { code: 'SGB', naam: 'Stalen gootbeugel',        ondergrond: 'metaal' },
  STAALWERK_DIVERSEN: { code: 'SDI', naam: 'Staalwerk diversen',       ondergrond: 'metaal' },
  STAALWERK_VERZINKT: { code: 'SVZ', naam: 'Verzinkt staalwerk',       ondergrond: 'metaal' },

  // ── Steenachtig ─────────────────────────────────────────────────────────
  MUURWERK:           { code: 'MUU', naam: 'Muurwerk',                 ondergrond: 'steenachtig' },
  GESTUUKTE_WAND:     { code: 'STU', naam: 'Gestuukte wand',           ondergrond: 'steenachtig' },
  BETONWAND:          { code: 'BWA', naam: 'Betonwand',                ondergrond: 'steenachtig' },
  BETONLATEI:         { code: 'BLA', naam: 'Betonlatei',               ondergrond: 'steenachtig' },
  BETONBAND:          { code: 'BBA', naam: 'Betonband',                ondergrond: 'steenachtig' },
  PLAFOND:            { code: 'PLA', naam: 'Plafond',                  ondergrond: 'steenachtig' },
  STEENACHTIG_OPPERVLAK: { code: 'SOP', naam: 'Steenachtig oppervlak', ondergrond: 'steenachtig' },
}

/**
 * De 117 onderdeelcodes uit het bestand → (onderdeel, type, eenheid).
 *
 * `bron_code` (de sleutel van dit object) is de c4y-suffix en wordt bewaard op
 * `schilder_types.bron_code`, zodat een herhaalde import idempotent is.
 * De eenheid komt uit het bestand en is per code consistent (0 conflicten
 * geconstateerd over alle 834 regels).
 */
export const CODE_MAPPING = {
  // ── Houten deur ─────────────────────────────────────────────────────────
  'dhv-m²':  { onderdeel: 'HOUTEN_DEUR', type: 'vlak',                  eenheid: 'm²' },
  'dhg-m²':  { onderdeel: 'HOUTEN_DEUR', type: 'met glas',              eenheid: 'm²' },
  'dhpr-m²': { onderdeel: 'HOUTEN_DEUR', type: 'geprofileerd',          eenheid: 'm²' },
  'dhA':     { onderdeel: 'HOUTEN_DEUR', type: 'vlak, zonder ruit',     eenheid: 'm²' },
  'dhB':     { onderdeel: 'HOUTEN_DEUR', type: 'met 1 ruit',            eenheid: 'm²' },
  'dhC':     { onderdeel: 'HOUTEN_DEUR', type: 'met 2 ruiten',          eenheid: 'm²' },
  'dhD':     { onderdeel: 'HOUTEN_DEUR', type: 'met 6 ruiten',          eenheid: 'm²' },
  'dhE':     { onderdeel: 'HOUTEN_DEUR', type: 'met meerdere ruiten',   eenheid: 'm²' },
  'dhF':     { onderdeel: 'HOUTEN_DEUR', type: 'kanteldeur/schrootjes', eenheid: 'm²' },

  // ── Houten kozijn ───────────────────────────────────────────────────────
  'khn-m¹':  { onderdeel: 'HOUTEN_KOZIJN', type: 'normaal profiel', eenheid: 'm¹' },
  'khz-m¹':  { onderdeel: 'HOUTEN_KOZIJN', type: 'zwaar profiel',   eenheid: 'm¹' },
  'khA':     { onderdeel: 'HOUTEN_KOZIJN', type: '< 10 cm',         eenheid: 'm¹' },
  'khB':     { onderdeel: 'HOUTEN_KOZIJN', type: '10-20 cm',        eenheid: 'm¹' },
  'khC':     { onderdeel: 'HOUTEN_KOZIJN', type: '20-30 cm',        eenheid: 'm¹' },
  'khD':     { onderdeel: 'HOUTEN_KOZIJN', type: '> 30 cm',         eenheid: 'm²' },

  // ── Houten raam ─────────────────────────────────────────────────────────
  'rh-m¹':   { onderdeel: 'HOUTEN_RAAM', type: 'standaard',                       eenheid: 'm¹' },
  'rhl-m¹':  { onderdeel: 'HOUTEN_RAAM', type: 'standaard, licht',                eenheid: 'm¹' },
  'rhA':     { onderdeel: 'HOUTEN_RAAM', type: '< 10 cm',                         eenheid: 'm¹' },
  'rhB':     { onderdeel: 'HOUTEN_RAAM', type: 'vast, 10-20 cm',                  eenheid: 'm¹' },
  'rhC':     { onderdeel: 'HOUTEN_RAAM', type: '< 10 cm, 3 diktekanten',          eenheid: 'm¹' },
  'rhD':     { onderdeel: 'HOUTEN_RAAM', type: '10-20 cm, 3 diktekanten',         eenheid: 'm¹' },
  'rhE':     { onderdeel: 'HOUTEN_RAAM', type: '< 10 cm, 1 diktekant',            eenheid: 'm¹' },
  'rhF':     { onderdeel: 'HOUTEN_RAAM', type: '10-20 cm, 1 diktekant',           eenheid: 'm¹' },
  'rhG':     { onderdeel: 'HOUTEN_RAAM', type: 'schuif, < 10 cm',                 eenheid: 'm¹' },
  'rhH':     { onderdeel: 'HOUTEN_RAAM', type: 'schuif, 10-20 cm',                eenheid: 'm¹' },
  'rhI':     { onderdeel: 'HOUTEN_RAAM', type: 'tuimel-/taats, < 10 cm',          eenheid: 'm¹' },
  'rhJ':     { onderdeel: 'HOUTEN_RAAM', type: 'tuimel-/taats, 10-20 cm',         eenheid: 'm¹' },
  'rhK':     { onderdeel: 'HOUTEN_RAAM', type: 'glasroeden',                      eenheid: 'm¹' },

  // ── Houten paneel ───────────────────────────────────────────────────────
  'phv-m²':  { onderdeel: 'HOUTEN_PANEEL', type: 'vlak',                  eenheid: 'm²' },
  'phg-m²':  { onderdeel: 'HOUTEN_PANEEL', type: 'groef',                 eenheid: 'm²' },
  'phA':     { onderdeel: 'HOUTEN_PANEEL', type: '< 10 cm',               eenheid: 'm¹' },
  'phB':     { onderdeel: 'HOUTEN_PANEEL', type: '10-20 cm',              eenheid: 'm¹' },
  'phC':     { onderdeel: 'HOUTEN_PANEEL', type: '20-30 cm',              eenheid: 'm¹' },
  'phD':     { onderdeel: 'HOUTEN_PANEEL', type: '> 30 cm',               eenheid: 'm²' },
  'phE':     { onderdeel: 'HOUTEN_PANEEL', type: 'rabatdelen/schrootjes', eenheid: 'm²' },

  // ── Houten goot- en lijstwerk ───────────────────────────────────────────
  'gl-m²':   { onderdeel: 'HOUTEN_GOOTLIJST', type: 'standaard',                eenheid: 'm²' },
  'glb-m²':  { onderdeel: 'HOUTEN_GOOTLIJST', type: 'gootlijst boeiboord',      eenheid: 'm²' },
  'glpr-m²': { onderdeel: 'HOUTEN_GOOTLIJST', type: 'geprofileerd',             eenheid: 'm²' },
  'glgk-st.':{ onderdeel: 'HOUTEN_GOOTLIJST', type: 'gootklos',                 eenheid: 'st' },
  'glA':     { onderdeel: 'HOUTEN_GOOTLIJST', type: 'boeiboord en luifel',      eenheid: 'm²' },
  'ghA':     { onderdeel: 'HOUTEN_GOOTLIJST', type: 'gootlijst boeiboord en luifel', eenheid: 'm²' },
  'ghB':     { onderdeel: 'HOUTEN_GOOTLIJST', type: 'goot zonder klossen',      eenheid: 'm²' },
  'ghC':     { onderdeel: 'HOUTEN_GOOTLIJST', type: 'goot met klossen',         eenheid: 'm²' },
  'ghD':     { onderdeel: 'HOUTEN_GOOTLIJST', type: 'geprofileerde gootlijst',  eenheid: 'm²' },
  'ghF':     { onderdeel: 'HOUTEN_GOOTLIJST', type: 'boeiboord',                eenheid: 'm¹' },

  // ── Houten oppervlak ────────────────────────────────────────────────────
  'ho-m²':   { onderdeel: 'HOUTEN_OPPERVLAK', type: 'vlak',        eenheid: 'm²' },
  'ho-m¹':   { onderdeel: 'HOUTEN_OPPERVLAK', type: 'strekkend',   eenheid: 'm¹' },
  'hobe-m²': { onderdeel: 'HOUTEN_OPPERVLAK', type: 'betimmering', eenheid: 'm²' },
  'hop-m¹':  { onderdeel: 'HOUTEN_OPPERVLAK', type: 'plint',       eenheid: 'm¹' },
  'hdag-m²': { onderdeel: 'HOUTEN_OPPERVLAK', type: 'dagkant',     eenheid: 'm²' },

  // ── Houten trap / glasroede ─────────────────────────────────────────────
  'trap-m²':  { onderdeel: 'HOUTEN_TRAP', type: 'standaard', eenheid: 'm²' },
  'roede-m¹': { onderdeel: 'GLASROEDE',   type: 'standaard', eenheid: 'm¹' },

  // ── Kunststof ───────────────────────────────────────────────────────────
  'dkv-m²':  { onderdeel: 'KUNSTSTOF_DEUR',      type: 'vlak',           eenheid: 'm²' },
  'dkg-m²':  { onderdeel: 'KUNSTSTOF_DEUR',      type: 'met glas',       eenheid: 'm²' },
  'kk-m¹':   { onderdeel: 'KUNSTSTOF_KOZIJN',    type: 'normaal profiel', eenheid: 'm¹' },
  'kkz-m¹':  { onderdeel: 'KUNSTSTOF_KOZIJN',    type: 'zwaar profiel',  eenheid: 'm¹' },
  'rk-m¹':   { onderdeel: 'KUNSTSTOF_RAAM',      type: 'standaard',      eenheid: 'm¹' },
  'pkv-m²':  { onderdeel: 'KUNSTSTOF_PANEEL',    type: 'vlak',           eenheid: 'm²' },
  'pkg-m²':  { onderdeel: 'KUNSTSTOF_PANEEL',    type: 'groef',          eenheid: 'm²' },
  'glk-m²':  { onderdeel: 'KUNSTSTOF_GOOTLIJST', type: 'standaard',      eenheid: 'm²' },
  'glbk-m²': { onderdeel: 'KUNSTSTOF_GOOTLIJST', type: 'gootlijst boeiboord', eenheid: 'm²' },
  'hwak-m¹': { onderdeel: 'KUNSTSTOF_HWA',       type: 'standaard',      eenheid: 'm¹' },
  'kdiv-m²': { onderdeel: 'KUNSTSTOF_DIVERSEN',  type: 'standaard',      eenheid: 'm²' },

  // ── Aluminium ───────────────────────────────────────────────────────────
  'dav-m²':  { onderdeel: 'ALU_DEUR',      type: 'vlak',          eenheid: 'm²' },
  'dag-m²':  { onderdeel: 'ALU_DEUR',      type: 'met glas',      eenheid: 'm²' },
  'ka-m¹':   { onderdeel: 'ALU_KOZIJN',    type: 'normaal profiel', eenheid: 'm¹' },
  'kapr-m¹': { onderdeel: 'ALU_KOZIJN',    type: 'geprofileerd',  eenheid: 'm¹' },
  'ra-m¹':   { onderdeel: 'ALU_RAAM',      type: 'standaard',     eenheid: 'm¹' },
  'pav-m²':  { onderdeel: 'ALU_PANEEL',    type: 'vlak',          eenheid: 'm²' },
  'pag-m²':  { onderdeel: 'ALU_PANEEL',    type: 'groef',         eenheid: 'm²' },
  'alu-m²':  { onderdeel: 'ALU_OPPERVLAK', type: 'vlak',          eenheid: 'm²' },
  'alu-m¹':  { onderdeel: 'ALU_OPPERVLAK', type: 'strekkend',     eenheid: 'm¹' },

  // ── Staal ───────────────────────────────────────────────────────────────
  'ds-m²':   { onderdeel: 'STALEN_DEUR',   type: 'standaard',       eenheid: 'm²' },
  'dsA':     { onderdeel: 'STALEN_DEUR',   type: 'vlak',            eenheid: 'm²' },
  'ks-m¹':   { onderdeel: 'STALEN_KOZIJN', type: 'normaal profiel', eenheid: 'm¹' },
  'ksA':     { onderdeel: 'STALEN_KOZIJN', type: '< 10 cm',         eenheid: 'm¹' },
  'ksB':     { onderdeel: 'STALEN_KOZIJN', type: '10-20 cm',        eenheid: 'm¹' },
  'rs-m¹':   { onderdeel: 'STALEN_RAAM',   type: 'standaard',       eenheid: 'm¹' },

  'sthw-m²': { onderdeel: 'STALEN_HEKWERK', type: 'standaard',            eenheid: 'm²' },
  'hsA':     { onderdeel: 'STALEN_HEKWERK', type: 'stijlen en regels',    eenheid: 'm²' },
  'hsb':     { onderdeel: 'STALEN_HEKWERK', type: 'met gaas',             eenheid: 'm²' },
  'hsC':     { onderdeel: 'STALEN_HEKWERK', type: 'met beplating',        eenheid: 'm²' },
  'hsE':     { onderdeel: 'STALEN_HEKWERK', type: 'leuningen en regels',  eenheid: 'm¹' },

  'stleu-m¹':{ onderdeel: 'STALEN_LEUNING',  type: 'standaard',    eenheid: 'm¹' },
  'stle-m¹': { onderdeel: 'STALEN_LEIDING',  type: 'standaard',    eenheid: 'm¹' },

  'stplv-m²':{ onderdeel: 'STALEN_BEPLATING', type: 'vlak',         eenheid: 'm²' },
  'stplp-m²':{ onderdeel: 'STALEN_BEPLATING', type: 'geprofileerd', eenheid: 'm²' },
  'psA':     { onderdeel: 'STALEN_BEPLATING', type: '< 10 cm',      eenheid: 'm¹' },
  'psB':     { onderdeel: 'STALEN_BEPLATING', type: '10-20 cm',     eenheid: 'm¹' },
  'psC':     { onderdeel: 'STALEN_BEPLATING', type: '20-30 cm',     eenheid: 'm¹' },
  'psD':     { onderdeel: 'STALEN_BEPLATING', type: '> 30 cm',      eenheid: 'm²' },

  'prsA':    { onderdeel: 'STAALPROFIEL', type: '< 30 cm',    eenheid: 'm¹' },
  'prsB':    { onderdeel: 'STAALPROFIEL', type: '30-120 cm',  eenheid: 'm²' },
  'prsC':    { onderdeel: 'STAALPROFIEL', type: '> 120 cm',   eenheid: 'm²' },

  'strv-m²': { onderdeel: 'STALEN_RADIATOR',  type: 'vlak',      eenheid: 'm²' },
  'strr-m²': { onderdeel: 'STALEN_RADIATOR',  type: 'rib',       eenheid: 'm²' },
  'hwas-m¹': { onderdeel: 'STALEN_HWA',       type: 'standaard', eenheid: 'm¹' },
  'stgb-st': { onderdeel: 'STALEN_GOOTBEUGEL', type: 'standaard', eenheid: 'st' },

  'st-m²':   { onderdeel: 'STAALWERK_DIVERSEN', type: 'vlak',      eenheid: 'm²' },
  'st-m¹':   { onderdeel: 'STAALWERK_DIVERSEN', type: 'strekkend', eenheid: 'm¹' },
  'stzk-m²': { onderdeel: 'STAALWERK_VERZINKT', type: 'vlak',      eenheid: 'm²' },
  'stzk-m¹': { onderdeel: 'STAALWERK_VERZINKT', type: 'strekkend', eenheid: 'm¹' },

  // ── Steenachtig ─────────────────────────────────────────────────────────
  'mu-m²':   { onderdeel: 'MUURWERK',       type: 'standaard',        eenheid: 'm²' },
  'wsA':     { onderdeel: 'MUURWERK',       type: 'vlak, volle voeg', eenheid: 'm²' },
  'wsG':     { onderdeel: 'GESTUUKTE_WAND', type: 'standaard',        eenheid: 'm²' },
  'wbA':     { onderdeel: 'BETONWAND',      type: 'standaard',        eenheid: 'm²' },
  'pbA':     { onderdeel: 'BETONWAND',      type: 'geprefabriceerd',  eenheid: 'm²' },

  'bela-m¹': { onderdeel: 'BETONLATEI', type: 'standaard', eenheid: 'm¹' },
  'LBA':     { onderdeel: 'BETONLATEI', type: '< 10 cm',   eenheid: 'm¹' },
  'lbB':     { onderdeel: 'BETONLATEI', type: '10-20 cm',  eenheid: 'm¹' },
  'lbC':     { onderdeel: 'BETONLATEI', type: '20-30 cm',  eenheid: 'm¹' },
  'bbd':     { onderdeel: 'BETONBAND',  type: '10-20 cm',  eenheid: 'm¹' },
  'bbc':     { onderdeel: 'BETONBAND',  type: '20-30 cm',  eenheid: 'm¹' },

  'pl-m²':   { onderdeel: 'PLAFOND', type: 'standaard', eenheid: 'm²' },
  'plA':     { onderdeel: 'PLAFOND', type: 'vlak',      eenheid: 'm²' },

  'm²':      { onderdeel: 'STEENACHTIG_OPPERVLAK', type: 'antigraffiti', eenheid: 'm²' },
}

/**
 * Codes die vóór het mappen worden hersteld. Zie het correctierapport van het
 * importscript; elke correctie wordt daar geteld en benoemd.
 */
export const CODE_CORRECTIES = {
  // Ontbrekend koppelteken tussen behandeling en onderdeelcode.
  'OHT04phv-m²': 'OHT04-phv-m²',
  'OHT05phv-m²': 'OHT05-phv-m²',
  'OHT51phv-m²': 'OHT51-phv-m²',
  'OHT52phv-m²': 'OHT52-phv-m²',
}

/**
 * Onderdeelcodes die naar een andere code worden samengevoegd: `bela-m¹1` is
 * een dubbele beton-latei-code die inhoudelijk gelijk is aan `bela-m¹`.
 */
export const SUFFIX_SAMENVOEGING = {
  'bela-m¹1': 'bela-m¹',
}

/**
 * Regels waarvan de code een ándere behandeling aanwijst dan de groep waar ze
 * in staan. De code is leidend — anders belandt een prijs onder de verkeerde
 * behandeling. Sleutel = volledige regelcode, waarde = de juiste behandeling.
 *
 * Onderbouwing bij `OMA50-alu-m¹`: die regel stond onder OMA 52, maar heeft
 * materiaalprijs € 1,35 — exact het niveau van OMA 50 (ka-m¹ € 1,86,
 * ra-m¹ € 1,35), terwijl OMA 52 op € 0,99–1,34 zit. Bovendien had OMA 52 dan
 * drie aluminium-regels en OMA 50 geen enkele in m¹. De code klopt, de groep niet.
 *
 * Bij `OSD11-bela-m¹` wijzen de aanwijzingen twee kanten op: de arbeidsnorm
 * (0,19 u) past bij het zwaardere OSD 11, de materiaalprijs (€ 6,43) bij
 * OSD 07. We volgen de code — dat lost tevens op dat OSD 07 anders twee
 * betonlatei-regels zou krijgen. Het importscript meldt deze afweging.
 */
export const BEHANDELING_CORRECTIES = {
  'OMA03-alu-m¹':  'OMA 03',
  'OMA02-alu-m¹':  'OMA 02',
  'OMA50-alu-m¹':  'OMA 50',
  'OSD11-bela-m¹': 'OSD 11',
}
