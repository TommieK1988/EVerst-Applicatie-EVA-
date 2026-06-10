/**
 * Uitgebreide Calculatie Offerte Template
 * Stijl: zakelijk groen, intern gebruik, alle velden zichtbaar incl. kostprijs & uren
 */
export const TEMPLATE_UITGEBREID = /* html */`
<style>
  * { box-sizing: border-box; }
  body { font-family: {{layout.lettertype}}; font-size: {{layout.lettergrootte}}pt; color: #1e293b; }
  .pagina {
    width: 210mm;
    min-height: 277mm;
    padding: {{layout.marge_boven}}mm {{layout.marge_rechts}}mm {{layout.marge_onder}}mm {{layout.marge_links}}mm;
    position: relative;
    background: white;
  }

  /* Kleuren */
  :root { --kleur: {{layout.primaire_kleur}}; }

  /* Briefhoofd */
  .header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8mm; padding-bottom:4mm; border-bottom:2px solid {{layout.primaire_kleur}}; }
  .bedrijf-logo { max-height:16mm; max-width:50mm; object-fit:contain; }
  .bedrijf-naam { font-size:13pt; font-weight:800; color:{{layout.primaire_kleur}}; }
  .bedrijf-info { font-size:8pt; color:#64748b; line-height:1.6; margin-top:1mm; }
  .doc-type { font-size:11pt; font-weight:800; color:#0f172a; text-transform:uppercase; letter-spacing:1px; }
  .meta-tabel { border-collapse:collapse; font-size:8.5pt; margin-left:auto; }
  .meta-tabel td { padding:0.5mm 0; }
  .meta-label { color:#94a3b8; padding-right:4mm; }
  .meta-waarde { font-weight:600; }

  /* Intern warning */
  .intern-banner { background:#7c3aed; color:white; text-align:center; font-size:9pt; font-weight:700; letter-spacing:2px; padding:3px 0 3px; margin:-{{layout.marge_boven}}mm -{{layout.marge_rechts}}mm 5mm -{{layout.marge_links}}mm; padding-top:{{layout.marge_boven}}mm; }

  /* Klant + project */
  .info-grid { display:grid; grid-template-columns:1fr 1fr; gap:4mm; margin-bottom:8mm; }
  .info-card { background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; padding:3mm 4mm; }
  .info-card-titel { font-size:7.5pt; font-weight:700; color:{{layout.primaire_kleur}}; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:2mm; }
  .info-card-item { font-size:8.5pt; color:#334155; line-height:1.6; }
  .info-card-label { color:#94a3b8; font-size:8pt; }

  /* Tekst */
  .aanhef { margin-bottom:2mm; font-size:10pt; }
  .inleiding { line-height:1.7; color:#334155; font-size:9.5pt; margin-bottom:4mm; }

  /* Totaalbox */
  .totaal-box { background:#f0fdf4; border:1.5px solid #86efac; border-radius:8px; padding:5mm 7mm; max-width:100mm; margin:auto 0 5mm auto; }
  .t-rij { display:flex; justify-content:space-between; font-size:9pt; margin-bottom:1.5mm; color:#475569; }
  .t-rij.groot { font-size:12pt; font-weight:800; color:#065f46; border-top:1.5px solid #86efac; padding-top:2mm; margin-top:1mm; }
  .t-rij.sub { font-size:8pt; color:#6b7280; font-style:italic; }

  /* Specificatie */
  .sectie-kop { font-size:12pt; font-weight:800; color:#0f172a; border-bottom:2px solid {{layout.primaire_kleur}}; padding-bottom:2mm; margin-bottom:5mm; }

  .sectie { margin-bottom:5mm; }
  .s-header { display:flex; justify-content:space-between; padding:2.5mm 4mm; font-weight:700; font-size:9.5pt; border-radius:4px 4px 0 0; background:{{layout.primaire_kleur}}; color:white; }
  .s-header.n2 { background:#475569; }
  .s-header.n3 { background:#e2e8f0; color:#334155; }
  .s-header.opt { background:#d97706; }

  /* Uitgebreide tabel: bevat ook kostprijs + uren */
  .calc-tabel { width:100%; border-collapse:collapse; font-size:8pt; border:1px solid #e2e8f0; border-top:none; }
  .calc-tabel thead tr { background:#f8fafc; border-bottom:1px solid #e2e8f0; }
  .calc-tabel th { padding:1.5mm 2mm; color:#64748b; font-weight:600; text-align:right; white-space:nowrap; font-size:7.5pt; }
  .calc-tabel th.l { text-align:left; width:40%; }
  .calc-tabel td { padding:1.5mm 2mm; text-align:right; color:#475569; white-space:nowrap; }
  .calc-tabel td.l { text-align:left; white-space:normal; color:#334155; }
  .calc-tabel tr.even { background:#f8fafc; }
  .calc-tabel tr.sp td { color:#92400e; font-style:italic; }
  .sp-tag { font-size:6.5pt; font-weight:700; font-style:normal; color:#b45309; margin-right:1.5mm; }
  .marge-pos { color:#065f46; font-weight:600; }
  .marge-neg { color:#dc2626; font-weight:600; }

  .s-subtotaal { border:1px solid #e2e8f0; border-top:none; padding:2mm 3mm; display:flex; justify-content:flex-end; gap:6mm; background:#f1f5f9; font-size:8.5pt; font-weight:600; }
  .s-subtotaal span:first-child { color:#64748b; }

  /* Stelpost / optie box */
  .ibox { border-radius:6px; padding:4mm; margin:5mm 0; }
  .ibox.sp { background:#fff7ed; border:1.5px solid #fed7aa; }
  .ibox.opt { background:#fffbeb; border:1.5px solid #fcd34d; }
  .ibox-titel { font-weight:700; font-size:9.5pt; margin-bottom:2mm; }
  .ibox.sp .ibox-titel { color:#92400e; }
  .ibox.opt .ibox-titel { color:#b45309; }
  .ibox-tabel { width:100%; border-collapse:collapse; font-size:8pt; }
  .ibox-tabel td { padding:1mm 0; }
  .ibox-tabel td.omschr { font-style:italic; width:99%; color:#78350f; }
  .ibox-tabel td.bedrag { text-align:right; font-weight:600; white-space:nowrap; }
  .ibox-totaal { border-top:1px solid; margin-top:2mm; padding-top:2mm; display:flex; justify-content:space-between; font-weight:700; font-size:9pt; }
  .ibox.sp .ibox-totaal { color:#92400e; border-color:#fed7aa; }
  .ibox.opt .ibox-totaal { color:#b45309; border-color:#fcd34d; }

  /* Totaalblok onder specificatie */
  .spec-totaal { border-top:2px solid #e2e8f0; padding-top:3mm; margin-top:5mm; max-width:95mm; margin-left:auto; font-size:9pt; }
  .st-rij { display:flex; justify-content:space-between; margin-bottom:1.5mm; color:#475569; }
  .st-rij.groot { font-size:11pt; font-weight:800; color:#0f172a; border-top:1.5px solid #334155; padding-top:2mm; margin-top:1mm; }
  .st-rij.sub { font-size:8pt; color:#92400e; font-style:italic; }

  /* Samenvatting marge/winst (alleen intern) */
  .marge-box { background:#f0fdf4; border:1.5px solid #86efac; border-radius:6px; padding:4mm; margin:6mm 0; }
  .marge-box-titel { font-weight:700; font-size:10pt; color:#065f46; margin-bottom:3mm; }
  .marge-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:3mm; }
  .marge-item { text-align:center; background:white; border-radius:4px; padding:3mm; border:1px solid #bbf7d0; }
  .marge-item .waarde { font-size:12pt; font-weight:800; color:#065f46; }
  .marge-item .label { font-size:8pt; color:#64748b; margin-top:1mm; }

  /* Voorwaarden */
  .terms-blok { margin-bottom:5mm; }
  .terms-titel { font-weight:700; font-size:10pt; margin-bottom:2mm; }
  .terms-tekst { line-height:1.7; color:#475569; font-size:9pt; }

  .slottekst { font-size:9pt; color:#475569; line-height:1.7; margin-top:4mm; }
</style>

{{#if offerte.is_intern}}
<div class="intern-banner">INTERN DOCUMENT — NIET VOOR KLANT</div>
{{/if}}

<!-- ══ PAGINA 1 — VOORBLAD ══ -->
{{#if layout.toon_voorblad}}
<div class="pagina" style="display:flex;flex-direction:column;">
  <div class="header">
    <div>
      {{#if bedrijf.logo_url}}
      <img class="bedrijf-logo" src="{{bedrijf.logo_url}}" alt="">
      <div style="margin-top:1mm;font-weight:700;font-size:9.5pt;">{{bedrijf.naam}}</div>
      {{else}}
      <div class="bedrijf-naam">{{bedrijf.naam}}</div>
      {{/if}}
      <div class="bedrijf-info">
        {{#if bedrijf.adres}}<div>{{bedrijf.adres}}</div>{{/if}}
        {{#if bedrijf.postcode_plaats}}<div>{{bedrijf.postcode_plaats}}</div>{{/if}}
        {{#if bedrijf.telefoon}}<div>T {{bedrijf.telefoon}}</div>{{/if}}
        {{#if bedrijf.email}}<div>{{bedrijf.email}}</div>{{/if}}
      </div>
    </div>
    <div style="text-align:right;">
      <div class="doc-type">{{#if offerte.is_intern}}Interne Calculatie{{else}}Offerte{{/if}}</div>
      <table class="meta-tabel">
        <tr><td class="meta-label">Nummer</td><td class="meta-waarde" style="font-family:monospace;color:{{layout.primaire_kleur}};">{{offerte.nummer}}</td></tr>
        <tr><td class="meta-label">Datum</td><td class="meta-waarde">{{offerte.datum}}</td></tr>
        {{#if offerte.geldig_tot_iso}}<tr><td class="meta-label">Geldig tot</td><td class="meta-waarde">{{offerte.geldig_tot}}</td></tr>{{/if}}
        {{#if offerte.referentie}}<tr><td class="meta-label">Referentie</td><td class="meta-waarde">{{offerte.referentie}}</td></tr>{{/if}}
        {{#if bedrijf.kvk}}<tr><td class="meta-label">KvK</td><td class="meta-waarde">{{bedrijf.kvk}}</td></tr>{{/if}}
      </table>
    </div>
  </div>

  <div class="info-grid">
    <div class="info-card">
      <div class="info-card-titel">Klantgegevens</div>
      <div class="info-card-item" style="font-weight:700;">{{klant.bedrijf_of_naam}}</div>
      {{#if klant.naam}}{{#if klant.bedrijfsnaam}}<div class="info-card-item">t.a.v. {{klant.naam}}</div>{{/if}}{{/if}}
      <div class="info-card-item">{{klant.adres}}</div>
      <div class="info-card-item">{{klant.postcode_plaats}}</div>
      {{#if klant.email}}<div class="info-card-item" style="color:#64748b;">{{klant.email}}</div>{{/if}}
    </div>
    <div class="info-card">
      <div class="info-card-titel">Projectinfo</div>
      <div class="info-card-item" style="font-weight:700;">{{offerte.titel}}</div>
      {{#if offerte.contactpersoon}}<div class="info-card-item"><span class="info-card-label">Contact: </span>{{offerte.contactpersoon}}</div>{{/if}}
      {{#if offerte.referentie}}<div class="info-card-item"><span class="info-card-label">Ref: </span>{{offerte.referentie}}</div>{{/if}}
    </div>
  </div>

  <div class="aanhef">{{offerte.aanhef}}</div>
  {{#if offerte.inleiding}}<div class="inleiding">{{{offerte.inleiding}}}</div>{{/if}}

  <div style="margin-top:auto;">
    <div class="totaal-box">
      <div class="t-rij"><span>Subtotaal ex BTW</span><span>{{totalen.subtotaal}}</span></div>
      {{#if heeft_stelposten}}
      <div class="t-rij sub"><span>w.v. stelposten{{#unless totalen.stelposten_in_totaal}} (excl.){{/unless}}</span><span>{{totalen.stelposten_subtotaal}}</span></div>
      {{/if}}
      {{#if heeft_opties}}
      <div class="t-rij sub" style="color:#b45309;"><span>Opties (n.v.t.)</span><span>{{totalen.opties_subtotaal}}</span></div>
      {{/if}}
      <div class="t-rij"><span>BTW {{totalen.btw_pct}}%</span><span>{{totalen.btw_bedrag}}</span></div>
      <div class="t-rij groot"><span>Totaal incl BTW</span><span>{{totalen.totaal}}</span></div>
    </div>
  </div>

  {{#if offerte.slottekst}}<div class="slottekst">{{{offerte.slottekst}}}</div>{{/if}}
</div>
{{/if}}

<!-- ══ PAGINA 2 — SPECIFICATIE ══ -->
{{#if layout.toon_specificatie}}
<div class="pagina page-break">
  <div class="sectie-kop">Specificatie</div>

  {{#each normale_secties}}
  <div class="sectie">
    <div class="s-header {{#if_eq this.niveau 2}}n2{{/if_eq}}{{#if_eq this.niveau 3}}n3{{/if_eq}}{{#if this.is_optioneel}}opt{{/if}}">
      <span>{{this.display_naam}}</span>
      {{#unless this.toon_detail}}<span>{{this.subtotaal}}</span>{{/unless}}
    </div>
    {{#if this.toon_detail}}
    {{#if this.heeft_regels}}
    <table class="calc-tabel">
      <thead>
        <tr>
          <th class="l">Omschrijving</th>
          <th>Hoev.</th>
          <th style="text-align:left;">Eenh.</th>
          <th>VP/eenh</th>
          <th>KP/eenh</th>
          <th>Uren</th>
          <th>Marge</th>
          <th>Totaal</th>
        </tr>
      </thead>
      <tbody>
        {{#each this.regels}}
        <tr class="{{#if this.is_stelpost}}sp{{/if}}">
          <td class="l">{{#if this.is_stelpost}}<span class="sp-tag">SP</span>{{/if}}{{this.omschrijving}}</td>
          <td>{{this.hoeveelheid}}</td>
          <td style="text-align:left;color:#94a3b8;">{{this.eenheid}}</td>
          <td>{{this.eenheidsprijs}}</td>
          <td style="color:#94a3b8;">{{this.kostprijs}}</td>
          <td style="color:#94a3b8;">{{this.uren}}</td>
          <td>{{this.marge_pct}}</td>
          <td style="font-weight:600;">{{this.totaal}}</td>
        </tr>
        {{#if this.heeft_opmerking}}
        <tr><td colspan="8" style="padding:0 3mm 2mm 6mm;color:#64748b;font-size:7.5pt;font-style:italic;text-align:left;">{{{this.opmerking}}}</td></tr>
        {{/if}}
        {{/each}}
      </tbody>
    </table>
    <div class="s-subtotaal"><span>Subtotaal {{this.naam}}</span><span>{{this.subtotaal}}</span></div>
    {{/if}}
    {{else}}
    <div style="border:1px solid #e2e8f0;border-top:none;padding:3mm 4mm;display:flex;justify-content:space-between;background:#f8fafc;font-size:9pt;">
      <span style="color:#64748b;font-style:italic;">{{this.aantal_regels}} regels</span>
      <span style="font-weight:600;">{{this.subtotaal}}</span>
    </div>
    {{/if}}
  </div>
  {{/each}}

  {{#if heeft_stelposten}}
  <div class="ibox sp">
    <div class="ibox-titel">Stelposten</div>
    <table class="ibox-tabel">
      {{#each stelpost_regels}}
      <tr><td class="omschr"><span class="sp-tag">SP</span>{{this.omschrijving}} <span style="color:#b45309;font-size:7.5pt;">({{this.sectie_naam}})</span></td><td class="bedrag" style="color:#92400e;">{{this.totaal}}</td></tr>
      {{/each}}
    </table>
    <div class="ibox-totaal"><span>Totaal stelposten</span><span>{{totalen.stelposten_subtotaal}}</span></div>
  </div>
  {{/if}}

  {{#if heeft_opties}}
  <div class="ibox opt">
    <div class="ibox-titel">Opties <span style="font-weight:400;font-size:8pt;">(niet inbegrepen)</span></div>
    <table class="ibox-tabel">
      {{#each optie_secties}}
      <tr><td class="omschr" style="color:#78350f;">{{this.display_naam}}</td><td class="bedrag" style="color:#b45309;">{{this.subtotaal}}</td></tr>
      {{/each}}
    </table>
    <div class="ibox-totaal"><span>Totaal opties</span><span>{{totalen.opties_subtotaal}}</span></div>
  </div>
  {{/if}}

  <div class="spec-totaal">
    <div class="st-rij"><span>Subtotaal ex BTW</span><span>{{totalen.subtotaal}}</span></div>
    {{#if heeft_stelposten}}<div class="st-rij sub"><span>w.v. stelposten</span><span>{{totalen.stelposten_subtotaal}}</span></div>{{/if}}
    <div class="st-rij"><span>BTW {{totalen.btw_pct}}%</span><span>{{totalen.btw_bedrag}}</span></div>
    <div class="st-rij groot"><span>Totaal incl BTW</span><span>{{totalen.totaal}}</span></div>
  </div>
</div>
{{/if}}

<!-- ══ PAGINA 3 — VOORWAARDEN ══ -->
{{#if layout.toon_voorwaarden}}
{{#if heeft_terms}}
<div class="pagina page-break">
  <div class="sectie-kop">Voorwaarden &amp; opmerkingen</div>
  {{#if voorwaarden}}<div class="terms-blok"><div class="terms-titel">Voorwaarden</div><div class="terms-tekst">{{{voorwaarden}}}</div></div>{{/if}}
  {{#if uitsluitingen}}<div class="terms-blok"><div class="terms-titel">Uitsluitingen</div><div class="terms-tekst">{{{uitsluitingen}}}</div></div>{{/if}}
  {{#if opmerkingen}}<div class="terms-blok"><div class="terms-titel">Opmerkingen</div><div class="terms-tekst">{{{opmerkingen}}}</div></div>{{/if}}
</div>
{{/if}}
{{/if}}
`
