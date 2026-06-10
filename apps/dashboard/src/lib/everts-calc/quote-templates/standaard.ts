/**
 * Standaard Zakelijke Offerte Template
 * Stijl: professioneel blauw, klassieke indeling, volledige specificatie
 *
 * Variabelen: zie quote-renderer.ts → RenderContext
 */
export const TEMPLATE_STANDAARD = /* html */`
<style>
  :root {
    --kleur: {{layout.primaire_kleur}};
    --kleur-licht: {{layout.secundaire_kleur}};
    --kleur-niveau-2: {{layout.kleur_niveau_2}};
    --kleur-niveau-3: {{layout.kleur_niveau_3}};
    --marge: {{layout.marge_links}}mm;
    --font: {{layout.lettertype}};
    --fsize: {{layout.lettergrootte}}pt;
  }
  * { box-sizing: border-box; }
  body { font-family: var(--font); font-size: var(--fsize); color: #1e293b; }

  /* ── Pagina ──────────────────────────────────────── */
  .pagina {
    width: 210mm;
    min-height: 277mm;
    padding: {{layout.marge_boven}}mm {{layout.marge_rechts}}mm {{layout.marge_onder}}mm {{layout.marge_links}}mm;
    position: relative;
    background: white;
  }
  @media screen {
    .pagina { box-shadow: 0 4px 24px rgba(0,0,0,0.12); margin: 0 auto 20px; }
  }
  @media print {
    .pagina { width: 100% !important; min-height: 0 !important; box-shadow: none !important; margin: 0 !important; }
    .page-break { break-before: page !important; page-break-before: always !important; }
  }

  /* ── Briefhoofd ──────────────────────────────────── */
  .briefhoofd { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10mm; }
  .bedrijf-logo { max-height: 18mm; max-width: 55mm; object-fit: contain; }
  .bedrijf-naam { font-size: 14pt; font-weight: 800; color: var(--kleur); margin-bottom: 2mm; }
  .bedrijf-info { font-size: 8.5pt; color: #64748b; line-height: 1.6; }
  .offerte-meta { text-align: right; }
  .offerte-titel { font-size: 18pt; font-weight: 800; color: #0f172a; margin-bottom: 3mm; letter-spacing: -0.5px; }
  .meta-tabel { margin-left: auto; border-collapse: collapse; font-size: 8.5pt; }
  .meta-tabel td { padding: 0.8mm 0; }
  .meta-label { color: #94a3b8; padding-right: 5mm; }
  .meta-waarde { font-weight: 600; }
  .meta-waarde.mono { font-family: monospace; color: var(--kleur); }

  /* ── Klantadres ──────────────────────────────────── */
  .klantblok { margin-bottom: 8mm; padding: 4mm 5mm; border-left: 3px solid var(--kleur); background: #f8fafc; }
  .klant-naam { font-weight: 700; font-size: 10.5pt; }
  .klant-info { font-size: 9pt; color: #475569; line-height: 1.7; margin-top: 1mm; }

  /* ── Tekst ───────────────────────────────────────── */
  .aanhef { margin-bottom: 3mm; font-size: 10pt; }
  .inleiding { line-height: 1.75; color: #334155; margin-bottom: 5mm; font-size: 9.5pt; }

  /* ── Totaalbox voorblad ──────────────────────────── */
  .totaal-samenvatting {
    margin-top: auto;
    margin-bottom: 6mm;
    background: #eff6ff;
    border: 1.5px solid #bfdbfe;
    border-radius: 8px;
    padding: 5mm 7mm;
    max-width: 95mm;
    margin-left: auto;
  }
  .totaal-rij { display: flex; justify-content: space-between; margin-bottom: 1.5mm; font-size: 9pt; color: #475569; }
  .totaal-rij.hoofd { font-size: 12pt; font-weight: 800; color: #0f172a; border-top: 1.5px solid #93c5fd; padding-top: 2mm; margin-top: 1mm; }
  .totaal-rij.stelpost { color: #92400e; font-style: italic; font-size: 8pt; }
  .totaal-rij.optie { color: #b45309; font-style: italic; font-size: 8pt; }

  .slottekst { font-size: 9pt; color: #475569; line-height: 1.7; margin-top: 4mm; }

  /* ── Betalingscondities voorblad ─────────────────── */
  .betalingsconditie-blok { margin-top: 4mm; font-size: 8.5pt; color: #475569; text-align: right; }
  .betalingsconditie-label { font-weight: 600; color: #334155; }

  /* ── Pagina 2: specificatie ──────────────────────── */
  .sectie-titel {
    font-size: 13pt;
    font-weight: 800;
    color: #0f172a;
    border-bottom: 2.5px solid var(--kleur);
    padding-bottom: 2mm;
    margin-bottom: 6mm;
  }

  /* ── Sectie ──────────────────────────────────────── */
  .sectie { margin-bottom: 5mm; }
  .sectie-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 2.5mm 4mm;
    font-weight: 700;
    font-size: 9.5pt;
    border-radius: 4px 4px 0 0;
    background: var(--kleur);
    color: white;
  }
  .sectie-header.niveau-2 { background: var(--kleur-niveau-2); }
  .sectie-header.niveau-3 { background: var(--kleur-niveau-3); color: #334155; }
  .sectie-header.optie { background: #d97706; }
  .optie-tag {
    display: inline-block;
    background: rgba(255,255,255,0.25);
    padding: 0 2mm;
    border-radius: 3px;
    font-size: 7.5pt;
    letter-spacing: 0.05em;
    margin-right: 3mm;
  }

  /* ── Niveau inspringing ──────────────────────────── */
  .sectie.niveau-2 { margin-left: 6mm; }
  .sectie.niveau-3 { margin-left: 12mm; }

  /* ── Regels tabel ────────────────────────────────── */
  .regels-tabel { width: 100%; border-collapse: collapse; font-size: 8.5pt; border: 1px solid #e2e8f0; border-top: none; table-layout: fixed; }
  .regels-tabel thead tr { background: #f8fafc; border-bottom: 1px solid #e2e8f0; }
  .regels-tabel th { padding: 2mm 2.5mm; color: #64748b; font-weight: 600; text-align: right; white-space: nowrap; }
  .regels-tabel th.links { text-align: left; width: 99%; }
  .regels-tabel td { padding: 2mm 2.5mm; text-align: right; color: #475569; white-space: nowrap; }
  .regels-tabel td.omschrijving { text-align: left; color: #334155; white-space: normal; }
  .regels-tabel td.totaal-cel { font-weight: 600; }
  .regels-tabel tr.even { background: #f8fafc; }
  .regels-tabel tr.stelpost td { color: #92400e; font-style: italic; }
  .sp-tag { font-size: 7pt; font-weight: 700; font-style: normal; color: #b45309; margin-right: 2mm; }
  .opmerking-rij td { padding: 0 3mm 2mm 8mm; color: #64748b; font-size: 8pt; font-style: italic; line-height: 1.5; text-align: left; white-space: pre-wrap; }
  .opmerking-rij img { max-width: 200px; max-height: 150px; object-fit: contain; margin: 2px 4px 2px 0; vertical-align: top; display: inline-block; white-space: normal; }

  .sectie-subtotaal {
    border: 1px solid #e2e8f0;
    border-top: none;
    padding: 2mm 3mm;
    display: flex;
    justify-content: flex-end;
    gap: 8mm;
    background: #f1f5f9;
    font-size: 8.5pt;
    font-weight: 600;
  }
  .sectie-subtotaal span:first-child { color: #64748b; }

  .sectie-collapsed {
    border: 1px solid #e2e8f0;
    border-top: none;
    padding: 3mm 4mm;
    display: flex;
    justify-content: space-between;
    background: #f8fafc;
    font-size: 9pt;
  }
  .sectie-collapsed .aantal { color: #64748b; font-style: italic; }

  /* ── Stelposten / opties box ─────────────────────── */
  .info-box { border-radius: 6px; padding: 4mm 5mm; margin: 6mm 0; }
  .info-box.stelpost { background: #fff7ed; border: 1.5px solid #fed7aa; }
  .info-box.optie { background: #fffbeb; border: 1.5px solid #fcd34d; }
  .info-box-titel { font-weight: 700; font-size: 10pt; margin-bottom: 3mm; }
  .info-box.stelpost .info-box-titel { color: #92400e; }
  .info-box.optie .info-box-titel { color: #b45309; }
  .info-box-tabel { width: 100%; border-collapse: collapse; font-size: 8.5pt; }
  .info-box-tabel td { padding: 1mm 0; }
  .info-box-tabel td.omschrijving { color: #78350f; font-style: italic; width: 99%; }
  .info-box-tabel td.bedrag { text-align: right; font-weight: 600; white-space: nowrap; }
  .info-box-totaal {
    border-top: 1px solid;
    margin-top: 2mm;
    padding-top: 2mm;
    display: flex;
    justify-content: space-between;
    font-weight: 700;
    font-size: 9pt;
  }
  .info-box.stelpost .info-box-totaal { color: #92400e; border-color: #fed7aa; }
  .info-box.optie .info-box-totaal { color: #b45309; border-color: #fcd34d; }

  /* ── Totaalblok onderaan specificatie ────────────── */
  .specificatie-totaal {
    border-top: 2px solid #e2e8f0;
    padding-top: 4mm;
    margin-top: 6mm;
    max-width: 95mm;
    margin-left: auto;
    font-size: 9pt;
  }

  /* ── Pagina 3: voorwaarden ───────────────────────── */
  .terms-blok { margin-bottom: 6mm; }
  .terms-titel { font-weight: 700; font-size: 10.5pt; margin-bottom: 2mm; }
  .terms-tekst { line-height: 1.7; color: #475569; font-size: 9pt; }

  /* ── Intern banner ───────────────────────────────── */
  .intern-banner {
    background: #7c3aed;
    color: white;
    text-align: center;
    font-size: 9pt;
    font-weight: 700;
    letter-spacing: 0.1em;
    padding: 3px 0;
    margin: -{{layout.marge_boven}}mm -{{layout.marge_rechts}}mm 6mm -{{layout.marge_links}}mm;
    padding-top: {{layout.marge_boven}}mm;
  }

  /* ── Voettekst ───────────────────────────────────── */
  .voettekst {
    position: fixed;
    bottom: {{layout.marge_onder}}mm;
    left: {{layout.marge_links}}mm;
    right: {{layout.marge_rechts}}mm;
    font-size: 8pt;
    color: #94a3b8;
    border-top: 1px solid #e2e8f0;
    padding-top: 2mm;
    display: flex;
    justify-content: space-between;
  }
</style>

<!-- ═══════════════════════════════════════════════════ -->
<!-- PAGINA 1 — VOORBLAD                                -->
<!-- ═══════════════════════════════════════════════════ -->
{{#if layout.toon_voorblad}}
<div class="pagina" style="display:flex;flex-direction:column;">

  {{#if offerte.is_intern}}
  <div class="intern-banner">INTERN DOCUMENT — NIET VOOR KLANT</div>
  {{/if}}

  <!-- Briefhoofd -->
  <div class="briefhoofd">
    <div>
      {{#if bedrijf.logo_url}}
      <img class="bedrijf-logo" src="{{bedrijf.logo_url}}" alt="Logo">
      <div style="margin-top:2mm;font-weight:700;">{{bedrijf.naam}}</div>
      {{else}}
      <div class="bedrijf-naam">{{bedrijf.naam}}</div>
      {{/if}}
      <div class="bedrijf-info">
        {{#if bedrijf.adres}}<div>{{bedrijf.adres}}</div>{{/if}}
        {{#if bedrijf.postcode_plaats}}<div>{{bedrijf.postcode_plaats}}</div>{{/if}}
        {{#if bedrijf.telefoon}}<div>T {{bedrijf.telefoon}}</div>{{/if}}
        {{#if bedrijf.email}}<div>{{bedrijf.email}}</div>{{/if}}
        {{#if bedrijf.website}}<div>{{bedrijf.website}}</div>{{/if}}
      </div>
    </div>
    <div class="offerte-meta">
      <div class="offerte-titel">{{#if offerte.is_intern}}INTERNE BEGROTING{{else}}OFFERTE{{/if}}</div>
      <table class="meta-tabel">
        <tr><td class="meta-label">Nummer</td><td class="meta-waarde mono">{{offerte.nummer}}</td></tr>
        <tr><td class="meta-label">Datum</td><td class="meta-waarde">{{offerte.datum}}</td></tr>
        {{#if offerte.geldig_tot_iso}}
        <tr><td class="meta-label">Geldig tot</td><td class="meta-waarde">{{offerte.geldig_tot}}</td></tr>
        {{/if}}
        {{#if offerte.referentie}}
        <tr><td class="meta-label">Referentie</td><td class="meta-waarde">{{offerte.referentie}}</td></tr>
        {{/if}}
        {{#if bedrijf.kvk}}
        <tr><td class="meta-label">KvK</td><td class="meta-waarde">{{bedrijf.kvk}}</td></tr>
        {{/if}}
        {{#if bedrijf.btw}}
        <tr><td class="meta-label">BTW</td><td class="meta-waarde">{{bedrijf.btw}}</td></tr>
        {{/if}}
      </table>
    </div>
  </div>

  <!-- Klantadres -->
  <div class="klantblok">
    <div class="klant-naam">{{klant.bedrijf_of_naam}}</div>
    <div class="klant-info">
      {{#if klant.naam}}{{#if klant.bedrijfsnaam}}<div>t.a.v. {{klant.naam}}</div>{{/if}}{{/if}}
      {{#if klant.adres}}<div>{{klant.adres}}</div>{{/if}}
      {{#if klant.postcode_plaats}}<div>{{klant.postcode_plaats}}</div>{{/if}}
      {{#if klant.email}}<div>{{klant.email}}</div>{{/if}}
    </div>
  </div>

  <!-- Aanhef + inleiding -->
  <div class="aanhef">{{offerte.aanhef}}</div>
  {{#if offerte.inleiding}}
  <div class="inleiding">{{{offerte.inleiding}}}</div>
  {{/if}}

  <!-- Totaal samenvatting (push naar onderkant) -->
  <div style="margin-top:auto;">
    {{#if offerte.betalingscondities}}
    <div class="betalingsconditie-blok">
      <span class="betalingsconditie-label">Betalingscondities:</span> {{offerte.betalingscondities}}
    </div>
    {{/if}}
    <div class="totaal-samenvatting">
      <div class="totaal-rij"><span>Subtotaal ex BTW</span><span>{{totalen.subtotaal}}</span></div>
      {{#if heeft_stelposten}}
      <div class="totaal-rij stelpost">
        <span>w.v. stelposten{{#unless totalen.stelposten_in_totaal}} (niet meegerekend){{/unless}}</span>
        <span>{{totalen.stelposten_subtotaal}}</span>
      </div>
      {{/if}}
      {{#if heeft_opties}}
      <div class="totaal-rij optie"><span>Opties (niet inbegrepen)</span><span>{{totalen.opties_subtotaal}}</span></div>
      {{/if}}
      <div class="totaal-rij"><span>BTW {{totalen.btw_pct}}%</span><span>{{totalen.btw_bedrag}}</span></div>
      <div class="totaal-rij hoofd"><span>Totaal incl BTW</span><span>{{totalen.totaal}}</span></div>
    </div>
  </div>

  {{#if offerte.slottekst}}
  <div class="slottekst">{{{offerte.slottekst}}}</div>
  {{/if}}

</div><!-- /pagina 1 -->
{{/if}}

<!-- ═══════════════════════════════════════════════════ -->
<!-- PAGINA 2 — SPECIFICATIE                            -->
<!-- ═══════════════════════════════════════════════════ -->
{{#if layout.toon_specificatie}}
<div class="pagina page-break">

  <div class="sectie-titel">Specificatie</div>

  {{#each normale_secties}}
  <div class="sectie {{#if_eq this.niveau 2}}niveau-2{{/if_eq}}{{#if_eq this.niveau 3}}niveau-3{{/if_eq}}">
    <div class="sectie-header {{#if_eq this.niveau 2}}niveau-2{{/if_eq}}{{#if_eq this.niveau 3}}niveau-3{{/if_eq}}{{#if this.is_optioneel}}optie{{/if}}">
      <span>
        {{#if this.is_optioneel}}<span class="optie-tag">OPTIE</span>{{/if}}
        {{this.display_naam}}
      </span>
      {{#unless this.toon_detail}}<span>{{this.subtotaal}}</span>{{/unless}}
    </div>

    {{#if this.toon_detail}}
    {{#if this.heeft_regels}}
    <table class="regels-tabel">
      <colgroup>
        <col style="width:52%">
        <col style="width:10%">
        <col style="width:8%">
        <col style="width:15%">
        <col style="width:15%">
      </colgroup>
      <thead>
        <tr>
          <th class="links">Omschrijving</th>
          <th>Hoev.</th>
          <th style="text-align:left;">Eenh.</th>
          <th>Prijs/eenh</th>
          <th>Totaal</th>
        </tr>
      </thead>
      <tbody>
        {{#each this.regels}}
        <tr class="{{#if_eq @index 0}}{{else}}{{#if (lookup ../this 'even')}}even{{/if}}{{/if_eq}}{{#if this.is_stelpost}} stelpost{{/if}}">
          <td class="omschrijving">
            {{#if this.is_stelpost}}<span class="sp-tag">SP</span>{{/if}}
            {{this.omschrijving}}
          </td>
          <td>{{this.hoeveelheid}}</td>
          <td style="text-align:left;color:#94a3b8;">{{this.eenheid}}</td>
          <td>{{this.eenheidsprijs}}</td>
          <td class="totaal-cel">{{this.totaal}}</td>
        </tr>
        {{#if this.heeft_opmerking}}
        <tr class="opmerking-rij">
          <td colspan="5">{{{this.opmerking}}}</td>
        </tr>
        {{/if}}
        {{/each}}
      </tbody>
    </table>
    <div class="sectie-subtotaal">
      <span>Subtotaal {{this.naam}}</span>
      <span>{{this.subtotaal}}</span>
    </div>
    {{/if}}
    {{else}}
    <div class="sectie-collapsed">
      <span class="aantal">{{this.aantal_regels}} regel{{#if_gt this.aantal_regels 1}}s{{/if_gt}}</span>
      <span style="font-weight:600;">{{this.subtotaal}}</span>
    </div>
    {{/if}}
  </div>
  {{/each}}

  <!-- Stelposten samenvatting -->
  {{#if heeft_stelposten}}
  <div class="info-box stelpost">
    <div class="info-box-titel">Stelposten</div>
    <table class="info-box-tabel">
      {{#each stelpost_regels}}
      <tr>
        <td class="omschrijving"><span class="sp-tag">SP</span>{{this.omschrijving}} <span style="color:#b45309;font-size:7.5pt;">({{this.sectie_naam}})</span></td>
        <td class="bedrag" style="color:#92400e;">{{this.totaal}}</td>
      </tr>
      {{/each}}
    </table>
    <div class="info-box-totaal">
      <span>Totaal stelposten{{#unless totalen.stelposten_in_totaal}} (niet inbegrepen in offertebedrag){{/unless}}</span>
      <span>{{totalen.stelposten_subtotaal}}</span>
    </div>
  </div>
  {{/if}}

  <!-- Opties samenvatting -->
  {{#if heeft_opties}}
  <div class="info-box optie">
    <div class="info-box-titel">Opties <span style="font-weight:400;font-size:8pt;">(niet inbegrepen in offertebedrag)</span></div>
    <table class="info-box-tabel">
      {{#each optie_secties}}
      <tr>
        <td class="omschrijving" style="color:#78350f;">{{this.display_naam}}</td>
        <td class="bedrag" style="color:#b45309;">{{this.subtotaal}}</td>
      </tr>
      {{/each}}
    </table>
    <div class="info-box-totaal"><span>Totaal opties</span><span>{{totalen.opties_subtotaal}}</span></div>
  </div>
  {{/if}}

  <!-- Totaalblok -->
  <div class="specificatie-totaal">
    <div class="totaal-rij"><span>Subtotaal ex BTW</span><span>{{totalen.subtotaal}}</span></div>
    {{#if heeft_stelposten}}
    <div class="totaal-rij stelpost">
      <span>w.v. stelposten{{#unless totalen.stelposten_in_totaal}} (excl.){{/unless}}</span>
      <span>{{totalen.stelposten_subtotaal}}</span>
    </div>
    {{/if}}
    <div class="totaal-rij"><span>BTW {{totalen.btw_pct}}%</span><span>{{totalen.btw_bedrag}}</span></div>
    <div class="totaal-rij hoofd"><span>Totaal incl BTW</span><span>{{totalen.totaal}}</span></div>
    {{#if heeft_opties}}
    <div class="totaal-rij optie"><span>Opties (niet inbegrepen)</span><span>{{totalen.opties_subtotaal}}</span></div>
    {{/if}}
  </div>

</div><!-- /pagina 2 -->
{{/if}}

<!-- ═══════════════════════════════════════════════════ -->
<!-- PAGINA 3 — VOORWAARDEN                             -->
<!-- ═══════════════════════════════════════════════════ -->
{{#if layout.toon_voorwaarden}}
{{#if heeft_terms}}
<div class="pagina page-break">
  <div class="sectie-titel">Voorwaarden &amp; opmerkingen</div>

  {{#if voorwaarden}}
  <div class="terms-blok">
    <div class="terms-titel">Voorwaarden</div>
    <div class="terms-tekst">{{{voorwaarden}}}</div>
  </div>
  {{/if}}

  {{#if uitsluitingen}}
  <div class="terms-blok">
    <div class="terms-titel">Uitsluitingen</div>
    <div class="terms-tekst">{{{uitsluitingen}}}</div>
  </div>
  {{/if}}

  {{#if opmerkingen}}
  <div class="terms-blok">
    <div class="terms-titel">Opmerkingen</div>
    <div class="terms-tekst">{{{opmerkingen}}}</div>
  </div>
  {{/if}}
</div><!-- /pagina 3 -->
{{/if}}
{{/if}}
`
