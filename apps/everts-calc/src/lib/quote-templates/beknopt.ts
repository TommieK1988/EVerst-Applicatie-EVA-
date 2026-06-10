/**
 * Beknopte Aanbieding Template
 * Stijl: compact, één pagina, geen specificatie-detail, focus op prijs + voorwaarden
 */
export const TEMPLATE_BEKNOPT = /* html */`
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

  /* Accentlijn boven */
  .pagina::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 4mm;
    background: {{layout.primaire_kleur}};
  }

  /* Header */
  .top { display:flex; justify-content:space-between; align-items:center; margin-bottom:8mm; padding-top:2mm; }
  .bedrijf-logo { max-height:14mm; max-width:45mm; object-fit:contain; }
  .bedrijf-naam { font-size:12pt; font-weight:800; color:{{layout.primaire_kleur}}; }
  .bedrijf-info { font-size:8pt; color:#94a3b8; margin-top:1mm; }
  .offerte-stempel { background:{{layout.primaire_kleur}}; color:white; padding:3mm 5mm; border-radius:6px; text-align:right; }
  .stempel-type { font-size:9pt; font-weight:700; letter-spacing:1px; text-transform:uppercase; }
  .stempel-nr { font-size:11pt; font-weight:800; font-family:monospace; margin-top:1mm; }
  .stempel-datum { font-size:8pt; opacity:0.8; margin-top:1mm; }

  /* Klant */
  .klant-blok { display:flex; gap:5mm; margin-bottom:7mm; }
  .klant-card { flex:1; border:1px solid #e2e8f0; border-radius:6px; padding:3mm 4mm; }
  .card-label { font-size:7.5pt; font-weight:700; color:{{layout.primaire_kleur}}; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:1.5mm; }
  .card-inhoud { font-size:9pt; color:#334155; line-height:1.6; }

  /* Aanhef */
  .aanhef-blok { margin-bottom:5mm; border-top:1px solid #e2e8f0; padding-top:5mm; }
  .aanhef { font-size:10pt; margin-bottom:2.5mm; }
  .inleiding { font-size:9.5pt; color:#475569; line-height:1.7; }

  /* Prijs tabel — compact, alleen totalen per sectie */
  .prijs-blok { margin:6mm 0; }
  .prijs-titel { font-size:11pt; font-weight:800; color:#0f172a; border-bottom:2px solid {{layout.primaire_kleur}}; padding-bottom:2mm; margin-bottom:4mm; }
  .prijs-tabel { width:100%; border-collapse:collapse; font-size:9pt; }
  .prijs-tabel tr { border-bottom:1px solid #f1f5f9; }
  .prijs-tabel tr:last-child { border-bottom:none; }
  .prijs-tabel td { padding:2.5mm 3mm; }
  .prijs-tabel td.naam { color:#334155; width:99%; }
  .prijs-tabel td.nr { color:#94a3b8; font-size:8pt; padding-right:4mm; white-space:nowrap; }
  .prijs-tabel td.bedrag { text-align:right; font-weight:600; white-space:nowrap; }
  .prijs-tabel tr:nth-child(odd) { background:#fafafa; }

  /* Totaal blok */
  .totaal-blok {
    margin-top:4mm;
    border-top:2px solid #e2e8f0;
    padding-top:4mm;
    display:flex;
    justify-content:flex-end;
  }
  .totaal-tabel { border-collapse:collapse; font-size:9.5pt; min-width:90mm; }
  .totaal-tabel td { padding:1.5mm 0; }
  .totaal-tabel td.l { color:#475569; padding-right:8mm; }
  .totaal-tabel td.r { text-align:right; font-weight:600; }
  .totaal-tabel tr.hoofd td { font-size:12pt; font-weight:800; color:#0f172a; border-top:1.5px solid #334155; padding-top:2mm; }
  .totaal-tabel tr.sub td { font-size:8pt; color:#92400e; font-style:italic; }

  /* Slottekst */
  .slottekst { font-size:9pt; color:#475569; line-height:1.7; margin-top:5mm; padding-top:5mm; border-top:1px solid #e2e8f0; }

  /* Voorwaarden */
  .terms-blok { margin-bottom:5mm; }
  .terms-titel { font-weight:700; font-size:10pt; margin-bottom:2mm; color:{{layout.primaire_kleur}}; }
  .terms-tekst { line-height:1.7; color:#475569; font-size:9pt; }
</style>

<!-- ══ PAGINA 1 — AANBIEDING ══ -->
<div class="pagina" style="display:flex;flex-direction:column;">

  <div class="top">
    <div>
      {{#if bedrijf.logo_url}}
      <img class="bedrijf-logo" src="{{bedrijf.logo_url}}" alt="">
      <div style="margin-top:1mm;font-weight:600;font-size:9pt;">{{bedrijf.naam}}</div>
      {{else}}
      <div class="bedrijf-naam">{{bedrijf.naam}}</div>
      {{/if}}
      <div class="bedrijf-info">
        {{#if bedrijf.adres}}{{bedrijf.adres}} · {{/if}}
        {{#if bedrijf.postcode_plaats}}{{bedrijf.postcode_plaats}}{{/if}}<br>
        {{#if bedrijf.telefoon}}T {{bedrijf.telefoon}} · {{/if}}
        {{#if bedrijf.email}}{{bedrijf.email}}{{/if}}
      </div>
    </div>
    <div class="offerte-stempel">
      <div class="stempel-type">Aanbieding</div>
      <div class="stempel-nr">{{offerte.nummer}}</div>
      <div class="stempel-datum">{{offerte.datum}}{{#if offerte.geldig_tot_iso}} · geldig t/m {{offerte.geldig_tot}}{{/if}}</div>
    </div>
  </div>

  <div class="klant-blok">
    <div class="klant-card">
      <div class="card-label">Aan</div>
      <div class="card-inhoud">
        <strong>{{klant.bedrijf_of_naam}}</strong>
        {{#if klant.naam}}{{#if klant.bedrijfsnaam}}<br>t.a.v. {{klant.naam}}{{/if}}{{/if}}
        {{#if klant.adres}}<br>{{klant.adres}}{{/if}}
        {{#if klant.postcode_plaats}}<br>{{klant.postcode_plaats}}{{/if}}
      </div>
    </div>
    <div class="klant-card">
      <div class="card-label">Betreft</div>
      <div class="card-inhoud">
        <strong>{{offerte.titel}}</strong>
        {{#if offerte.referentie}}<br><span style="color:#94a3b8;font-size:8.5pt;">Ref: {{offerte.referentie}}</span>{{/if}}
        {{#if offerte.contactpersoon}}<br><span style="color:#94a3b8;font-size:8.5pt;">Contact: {{offerte.contactpersoon}}</span>{{/if}}
        {{#if bedrijf.kvk}}<br><span style="color:#94a3b8;font-size:8.5pt;">KvK {{bedrijf.kvk}}{{#if bedrijf.btw}} · BTW {{bedrijf.btw}}{{/if}}</span>{{/if}}
      </div>
    </div>
  </div>

  <div class="aanhef-blok">
    <div class="aanhef">{{offerte.aanhef}}</div>
    {{#if offerte.inleiding}}<div class="inleiding">{{{offerte.inleiding}}}</div>{{/if}}
  </div>

  <!-- Prijsoverzicht per sectie -->
  <div class="prijs-blok">
    <div class="prijs-titel">Prijsoverzicht</div>
    <table class="prijs-tabel">
      {{#each normale_secties}}
      {{#if_eq this.niveau 1}}
      <tr>
        <td class="nr">{{this.nummer}}</td>
        <td class="naam">{{this.naam}}</td>
        <td class="bedrag">{{this.subtotaal}}</td>
      </tr>
      {{/if_eq}}
      {{/each}}
    </table>

    <div class="totaal-blok">
      <table class="totaal-tabel">
        <tr><td class="l">Subtotaal ex BTW</td><td class="r">{{totalen.subtotaal}}</td></tr>
        {{#if heeft_stelposten}}
        <tr class="sub"><td class="l">w.v. stelposten{{#unless totalen.stelposten_in_totaal}} (excl.){{/unless}}</td><td class="r">{{totalen.stelposten_subtotaal}}</td></tr>
        {{/if}}
        {{#if heeft_opties}}
        <tr class="sub" style="color:#b45309;"><td class="l">Opties (niet inbegrepen)</td><td class="r">{{totalen.opties_subtotaal}}</td></tr>
        {{/if}}
        <tr><td class="l">BTW {{totalen.btw_pct}}%</td><td class="r">{{totalen.btw_bedrag}}</td></tr>
        <tr class="hoofd"><td class="l">Totaal incl BTW</td><td class="r">{{totalen.totaal}}</td></tr>
      </table>
    </div>
  </div>

  {{#if offerte.slottekst}}<div class="slottekst">{{{offerte.slottekst}}}</div>{{/if}}

</div><!-- /pagina 1 -->

<!-- ══ PAGINA 2 — VOORWAARDEN (optioneel) ══ -->
{{#if layout.toon_voorwaarden}}
{{#if heeft_terms}}
<div class="pagina page-break">
  <div style="font-size:13pt;font-weight:800;color:#0f172a;border-bottom:2px solid {{layout.primaire_kleur}};padding-bottom:2mm;margin-bottom:6mm;">
    Voorwaarden &amp; opmerkingen
  </div>
  {{#if voorwaarden}}<div class="terms-blok"><div class="terms-titel">Voorwaarden</div><div class="terms-tekst">{{{voorwaarden}}}</div></div>{{/if}}
  {{#if uitsluitingen}}<div class="terms-blok"><div class="terms-titel">Uitsluitingen</div><div class="terms-tekst">{{{uitsluitingen}}}</div></div>{{/if}}
  {{#if opmerkingen}}<div class="terms-blok"><div class="terms-titel">Opmerkingen</div><div class="terms-tekst">{{{opmerkingen}}}</div></div>{{/if}}
</div>
{{/if}}
{{/if}}
`
