/* Handleiding EVA — presentatie (huisstijl Everts) */
const pptxgen = require('pptxgenjs');
const p = new pptxgen();
p.layout = 'LAYOUT_WIDE';           // 13.3 x 7.5 inch
p.author = 'Everts Groep';
p.title = 'Handleiding EVA';

/* ── Huisstijl ── */
const GREEN = '009439', DEEP = '007530', DARK = '0A5E28', G950 = '013A20';
const LIME = '61AC2B', INK = '1F2933', TINT = 'ECFAF0', WHITE = 'FFFFFF';
const MUTE = '6B7680', LINE = 'DCE3E7', CARD = 'F4F8F5';
const HEAD = 'Cambria', BODY = 'Calibri';
const LOGO = 'logo.png';
const W = 13.333, H = 7.5;

/* Footer op lichte slides */
function footer(slide, n) {
  slide.addText('Handleiding EVA · Everts Groep', { x: 0.5, y: 7.05, w: 8, h: 0.3, fontFace: BODY, fontSize: 9, color: MUTE, align: 'left' });
  slide.addText(String(n), { x: 12.4, y: 7.05, w: 0.5, h: 0.3, fontFace: BODY, fontSize: 9, color: MUTE, align: 'right' });
}
/* Titel op lichte content-slide (geen accentlijn — bewust) */
function title(slide, kicker, ttl) {
  slide.addText(kicker.toUpperCase(), { x: 0.6, y: 0.45, w: 8, h: 0.3, fontFace: BODY, fontSize: 12, bold: true, color: GREEN, charSpacing: 3 });
  slide.addText(ttl, { x: 0.58, y: 0.72, w: 11, h: 0.7, fontFace: HEAD, fontSize: 32, bold: true, color: INK });
}
/* Groene "chip"-cirkel met korte tekst als motief */
function chip(slide, x, y, label, d = 0.44, fill = GREEN, col = WHITE) {
  slide.addShape(p.ShapeType.ellipse, { x, y, w: d, h: d, fill: { color: fill }, line: { type: 'none' } });
  slide.addText(label, { x: x - 0.1, y, w: d + 0.2, h: d, align: 'center', valign: 'middle', fontFace: BODY, fontSize: 13, bold: true, color: col });
}

/* ══ Slide 1 — Titel (donker) ══ */
{
  const s = p.addSlide();
  s.background = { color: G950 };
  // subtiel groen vlak rechts als diepte (geen stripe: groot blok)
  s.addShape(p.ShapeType.rect, { x: 9.9, y: 0, w: 3.43, h: 7.5, fill: { color: '02311C' }, line: { type: 'none' } });
  s.addImage({ path: LOGO, x: 0.85, y: 0.8, w: 1.0, h: 1.0 });
  s.addText('EVERTS.', { x: 0.85, y: 1.95, w: 6, h: 0.5, fontFace: BODY, fontSize: 22, bold: true, color: WHITE, charSpacing: 4 });
  s.addText('EVA · EVERTS PLATFORM', { x: 0.87, y: 2.45, w: 8, h: 0.3, fontFace: BODY, fontSize: 12, color: '8FBFA3', charSpacing: 4 });
  s.addText('Handleiding EVA', { x: 0.8, y: 3.15, w: 11, h: 1.1, fontFace: HEAD, fontSize: 54, bold: true, color: WHITE });
  s.addText('Praktische basisgids voor alle medewerkers', { x: 0.85, y: 4.35, w: 10, h: 0.6, fontFace: BODY, fontSize: 22, color: 'CDE7D6' });
  // pill met tagline
  s.addShape(p.ShapeType.roundRect, { x: 0.85, y: 5.25, w: 5.7, h: 0.55, rectRadius: 0.27, fill: { color: '0B4A2C' }, line: { color: LIME, width: 1 } });
  s.addText('Van aanvraag tot oplevering — op één plek', { x: 0.85, y: 5.25, w: 5.7, h: 0.55, align: 'center', valign: 'middle', fontFace: BODY, fontSize: 13, bold: true, color: 'DFF3E6' });
  s.addText('Versie 1.0   ·   28 juli 2026   ·   Levend document', { x: 0.85, y: 6.5, w: 11, h: 0.35, fontFace: BODY, fontSize: 13, color: '8FBFA3' });
  s.addText('Everts Groep · Enschede', { x: 0.85, y: 6.85, w: 11, h: 0.3, fontFace: BODY, fontSize: 11, color: '6E9C82' });
}

/* ══ Slide 2 — Wat is EVA? ══ */
{
  const s = p.addSlide(); s.background = { color: WHITE };
  title(s, 'Introductie', 'Wat is EVA?');
  s.addText('EVA is het centrale platform van Everts Groep. Alles rond een klus staat erin en is met elkaar verbonden — van de eerste aanvraag tot de laatste factuur.',
    { x: 0.6, y: 1.55, w: 12.1, h: 0.7, fontFace: BODY, fontSize: 16, color: '39424B' });
  const items = [
    ['Hoofdproces', 'Aanvraag → offerte → opdracht → oplevering → factuur'],
    ['Planning', 'Wie werkt wanneer op welk project, plus de bedrijfsagenda'],
    ['Relaties', 'Klanten, contactpersonen en particulieren'],
    ['Financieel', 'Facturen, uren en managementoverzichten'],
    ['Apps', 'EvertsCalc, formulieren, actielijsten, wagenpark, KAM/VGM'],
    ['Op maat', 'Je ziet alleen wat je nodig hebt — bepaald door je rechten'],
  ];
  const x0 = 0.6, y0 = 2.5, cw = 3.95, ch = 1.9, gx = 0.13, gy = 0.18;
  items.forEach((it, i) => {
    const c = i % 3, r = Math.floor(i / 3);
    const x = x0 + c * (cw + gx), y = y0 + r * (ch + gy);
    s.addShape(p.ShapeType.roundRect, { x, y, w: cw, h: ch, rectRadius: 0.08, fill: { color: CARD }, line: { color: LINE, width: 1 } });
    chip(s, x + 0.28, y + 0.32, String(i + 1));
    s.addText(it[0], { x: x + 0.95, y: y + 0.3, w: cw - 1.1, h: 0.5, fontFace: HEAD, fontSize: 18, bold: true, color: DEEP, valign: 'middle' });
    s.addText(it[1], { x: x + 0.3, y: y + 0.92, w: cw - 0.6, h: 0.85, fontFace: BODY, fontSize: 13, color: '4A545D' });
  });
  footer(s, 2);
}

/* ══ Slide 3 — Aan de slag (inloggen) ══ */
{
  const s = p.addSlide(); s.background = { color: WHITE };
  title(s, 'Aan de slag', 'Inloggen en de eerste keer');
  // Links: stappen
  const steps = [
    'Open EVA in je browser of tik op het EVA-pictogram op je telefoon.',
    'Klik op "Inloggen met Microsoft".',
    'Log in met je Everts-account, net als bij Outlook of Teams.',
    'Je komt automatisch op je Overzicht terecht.',
  ];
  s.addText('Inloggen met je Everts Microsoft-account', { x: 0.6, y: 1.6, w: 6.6, h: 0.4, fontFace: HEAD, fontSize: 18, bold: true, color: INK });
  steps.forEach((tx, i) => {
    const y = 2.2 + i * 0.82;
    chip(s, 0.65, y, String(i + 1), 0.42, GREEN);
    s.addText(tx, { x: 1.25, y: y - 0.05, w: 5.9, h: 0.65, fontFace: BODY, fontSize: 14, color: '39424B', valign: 'middle' });
  });
  // Rechts: kaart "eerste keer" + let op
  s.addShape(p.ShapeType.roundRect, { x: 7.5, y: 1.6, w: 5.2, h: 2.65, rectRadius: 0.1, fill: { color: TINT }, line: { color: 'BFE6CD', width: 1 } });
  s.addText('De eerste keer instellen', { x: 7.8, y: 1.8, w: 4.6, h: 0.4, fontFace: HEAD, fontSize: 16, bold: true, color: DEEP });
  s.addText([
    { text: 'Profielfoto ', options: { bold: true } }, { text: '— zichtbaar in de app', options: {} },
    { text: '\nHandtekening ', options: { bold: true } }, { text: '— voor werkbonnen & offertes', options: {} },
    { text: '\nNotificaties ', options: { bold: true } }, { text: '— in de app en/of per e-mail', options: {} },
  ], { x: 7.8, y: 2.25, w: 4.6, h: 1.9, fontFace: BODY, fontSize: 13.5, color: '39424B', lineSpacingMultiple: 1.25 });
  s.addShape(p.ShapeType.roundRect, { x: 7.5, y: 4.45, w: 5.2, h: 1.75, rectRadius: 0.1, fill: { color: 'FFF6E6' }, line: { color: 'F0D69A', width: 1 } });
  s.addText('Nog geen toegang?', { x: 7.8, y: 4.6, w: 4.6, h: 0.4, fontFace: HEAD, fontSize: 15, bold: true, color: '9A6810' });
  s.addText('EVA werkt alleen met accounts die de beheerder heeft vrijgegeven. Je maakt geen apart wachtwoord aan en je kunt jezelf niet registreren.',
    { x: 7.8, y: 5.0, w: 4.6, h: 1.1, fontFace: BODY, fontSize: 13, color: '6B5416' });
  footer(s, 3);
}

/* ══ Slide 4 — De interface ══ */
{
  const s = p.addSlide(); s.background = { color: WHITE };
  title(s, 'Oriëntatie', 'De interface — waar vind je wat?');
  // Zijbalk kaart
  s.addShape(p.ShapeType.roundRect, { x: 0.6, y: 1.6, w: 6.0, h: 4.9, rectRadius: 0.1, fill: { color: CARD }, line: { color: LINE, width: 1 } });
  s.addText('De zijbalk (hoofdmenu)', { x: 0.9, y: 1.8, w: 5.4, h: 0.4, fontFace: HEAD, fontSize: 18, bold: true, color: DEEP });
  const groups = [
    ['Hoofdproces', 'Aanvragen · Offertes · Opdrachten · Servicedesk · Afgesloten'],
    ['Planning', 'Projectplanning · Medewerkerplanning · Bedrijfsagenda'],
    ['Beheer', 'Relaties · Medewerkers · Wagenpark · KAM/VGM'],
    ['Financieel', 'Facturen · Uren · Management'],
    ['Apps', 'Formulieren · Actielijsten · EvertsCalc'],
  ];
  groups.forEach((g, i) => {
    const y = 2.35 + i * 0.8;
    s.addText(g[0], { x: 0.95, y, w: 2.0, h: 0.35, fontFace: BODY, fontSize: 13.5, bold: true, color: INK });
    s.addText(g[1], { x: 0.95, y: y + 0.31, w: 5.3, h: 0.4, fontFace: BODY, fontSize: 11.5, color: '5A646D' });
  });
  // Topbalk kaart
  s.addShape(p.ShapeType.roundRect, { x: 6.9, y: 1.6, w: 5.8, h: 4.9, rectRadius: 0.1, fill: { color: CARD }, line: { color: LINE, width: 1 } });
  s.addText('De topbalk (rechtsboven)', { x: 7.2, y: 1.8, w: 5.2, h: 0.4, fontFace: HEAD, fontSize: 18, bold: true, color: DEEP });
  const top = [
    ['Zoeken', 'Spring direct naar een klant of project — Ctrl/⌘ + K'],
    ['Sterretje', '"Wat is nieuw" — rood stipje = ongelezen nieuws'],
    ['?-knop', 'Uitleg over precies de pagina waar je nu bent'],
    ['Zon / maan', 'Wissel tussen licht en donker thema'],
    ['Belletje', 'Je meldingen (notificaties)'],
  ];
  top.forEach((t, i) => {
    const y = 2.4 + i * 0.8;
    chip(s, 7.2, y, '', 0.34, GREEN);
    s.addText(t[0], { x: 7.7, y: y - 0.06, w: 2.2, h: 0.35, fontFace: BODY, fontSize: 13.5, bold: true, color: INK });
    s.addText(t[1], { x: 7.7, y: y + 0.26, w: 4.8, h: 0.4, fontFace: BODY, fontSize: 11.5, color: '5A646D' });
  });
  footer(s, 4);
}

/* ══ Slide 5 — Het hoofdproces (flow) ══ */
{
  const s = p.addSlide(); s.background = { color: G950 };
  s.addText('HET HART VAN EVA', { x: 0.6, y: 0.55, w: 8, h: 0.3, fontFace: BODY, fontSize: 12, bold: true, color: LIME, charSpacing: 3 });
  s.addText('Het hoofdproces — één dossier dat meegroeit', { x: 0.58, y: 0.85, w: 12, h: 0.7, fontFace: HEAD, fontSize: 30, bold: true, color: WHITE });
  const steps = ['Aanvraag', 'Offerte', 'Opdracht', 'Uitvoering', 'Oplevering', 'Factuur', 'Afgesloten'];
  const n = steps.length, x0 = 0.6, gap = 0.18, bw = (W - 1.2 - gap * (n - 1)) / n, y = 2.5, bh = 1.15;
  steps.forEach((st, i) => {
    const x = x0 + i * (bw + gap);
    const fill = i === n - 1 ? '0B4A2C' : DEEP;
    s.addShape(p.ShapeType.roundRect, { x, y, w: bw, h: bh, rectRadius: 0.08, fill: { color: fill }, line: { color: '2E6B49', width: 1 } });
    s.addText(String(i + 1), { x, y: y + 0.12, w: bw, h: 0.3, align: 'center', fontFace: HEAD, fontSize: 15, bold: true, color: LIME });
    s.addText(st, { x, y: y + 0.5, w: bw, h: 0.5, align: 'center', valign: 'middle', fontFace: BODY, fontSize: 13, bold: true, color: WHITE });
    if (i < n - 1) s.addText('›', { x: x + bw - 0.02, y, w: gap + 0.04, h: bh, align: 'center', valign: 'middle', fontFace: BODY, fontSize: 20, bold: true, color: '7FB79A' });
  });
  s.addText('Je vindt elke stap als apart menu-item onder "Hoofdproces". Hetzelfde dossier schuift telkens verder — je hoeft niets over te typen. De koppeling naar de geaccepteerde offerteversie blijft altijd bewaard.',
    { x: 0.6, y: 4.2, w: 12.1, h: 1.0, fontFace: BODY, fontSize: 15, color: 'CDE7D6', align: 'center' });
  // mini-kaart: nieuwe aanvraag
  s.addShape(p.ShapeType.roundRect, { x: 2.4, y: 5.35, w: 8.5, h: 1.35, rectRadius: 0.1, fill: { color: '063A22' }, line: { color: '2E6B49', width: 1 } });
  s.addText('Nieuwe aanvraag maken', { x: 2.7, y: 5.5, w: 8, h: 0.35, fontFace: HEAD, fontSize: 14, bold: true, color: LIME });
  s.addText('Aanvragen  ›  Nieuwe aanvraag  ›  vul opdrachtgever, omschrijving, werkmaatschappij, categorie en adres in  ›  Opslaan.',
    { x: 2.7, y: 5.9, w: 7.9, h: 0.7, fontFace: BODY, fontSize: 12.5, color: 'CDE7D6' });
}

/* ══ Slide 6 — Dossier & tabbladen ══ */
{
  const s = p.addSlide(); s.background = { color: WHITE };
  title(s, 'In een dossier', 'De tabbladen van een dossier');
  s.addText('Klik in een lijst op een dossier om het te openen. De zijbalk toont dan de tabbladen. Niet elk tabblad staat er altijd — sommige verschijnen pas in een latere fase of als een optie aanstaat.',
    { x: 0.6, y: 1.55, w: 12.1, h: 0.7, fontFace: BODY, fontSize: 15, color: '39424B' });
  const tabs = [
    ['Informatie', 'Kerngegevens, status, rollen, datums'],
    ['Bestanden', 'Documenten en foto’s'],
    ['Calculatie', 'De begroting van de klus'],
    ['Werkbegroting', 'Interne begroting van de opdracht'],
    ['Planning', 'Ingeplande dagen en mensen'],
    ['Acties', 'Taken bij dit dossier'],
    ['Meerwerk', 'Extra werk (met klantakkoord)'],
    ['Oplevering', 'Opleverpunten en oplevering'],
    ['Financieel', 'Kosten en opbrengsten'],
  ];
  const x0 = 0.6, y0 = 2.45, cw = 3.95, ch = 1.28, gx = 0.13, gy = 0.15;
  tabs.forEach((tb, i) => {
    const c = i % 3, r = Math.floor(i / 3);
    const x = x0 + c * (cw + gx), y = y0 + r * (ch + gy);
    s.addShape(p.ShapeType.roundRect, { x, y, w: cw, h: ch, rectRadius: 0.08, fill: { color: CARD }, line: { color: LINE, width: 1 } });
    s.addShape(p.ShapeType.ellipse, { x: x + 0.28, y: y + 0.44, w: 0.4, h: 0.4, fill: { color: TINT }, line: { color: GREEN, width: 1 } });
    s.addText(String(i + 1), { x: x + 0.18, y: y + 0.44, w: 0.6, h: 0.4, align: 'center', valign: 'middle', fontFace: BODY, fontSize: 12, bold: true, color: DEEP });
    s.addText(tb[0], { x: x + 0.85, y: y + 0.2, w: cw - 1.0, h: 0.4, fontFace: HEAD, fontSize: 15, bold: true, color: INK });
    s.addText(tb[1], { x: x + 0.85, y: y + 0.6, w: cw - 1.0, h: 0.55, fontFace: BODY, fontSize: 11.5, color: '5A646D' });
  });
  footer(s, 6);
}

/* ══ Slide 7 — Kernmodules (apps) ══ */
{
  const s = p.addSlide(); s.background = { color: WHITE };
  title(s, 'Kernfuncties', 'De belangrijkste modules');
  const mods = [
    ['Relaties', 'Klanten, contactpersonen en particulieren beheren.'],
    ['EvertsCalc', 'Calculaties en offertes; bibliotheek met recepten en materialen.'],
    ['Planning', 'Project- en medewerkerplanning, bedrijfsagenda, werkbonnen.'],
    ['Servicedesk', 'Aparte ingang voor storingen en regie-/serviceklussen.'],
    ['Formulieren', 'Digitale formulieren samenstellen en (mobiel) invullen.'],
    ['Facturen & Management', 'Verkoopfacturen, uren en stuuroverzichten.'],
  ];
  const x0 = 0.6, y0 = 1.7, cw = 3.95, ch = 2.35, gx = 0.13, gy = 0.2;
  mods.forEach((m, i) => {
    const c = i % 3, r = Math.floor(i / 3);
    const x = x0 + c * (cw + gx), y = y0 + r * (ch + gy);
    s.addShape(p.ShapeType.roundRect, { x, y, w: cw, h: ch, rectRadius: 0.1, fill: { color: WHITE }, line: { color: LINE, width: 1.25 } });
    s.addShape(p.ShapeType.roundRect, { x, y, w: cw, h: 0.14, rectRadius: 0.06, fill: { color: GREEN }, line: { type: 'none' } });
    s.addShape(p.ShapeType.ellipse, { x: x + 0.32, y: y + 0.42, w: 0.62, h: 0.62, fill: { color: TINT }, line: { color: GREEN, width: 1.25 } });
    s.addText(String.fromCharCode(65 + i), { x: x + 0.32, y: y + 0.42, w: 0.62, h: 0.62, align: 'center', valign: 'middle', fontFace: HEAD, fontSize: 20, bold: true, color: DEEP });
    s.addText(m[0], { x: x + 0.32, y: y + 1.2, w: cw - 0.6, h: 0.55, fontFace: HEAD, fontSize: 17, bold: true, color: INK });
    s.addText(m[1], { x: x + 0.32, y: y + 1.68, w: cw - 0.6, h: 0.6, fontFace: BODY, fontSize: 12.5, color: '5A646D' });
  });
  footer(s, 7);
}

/* ══ Slide 8 — Rollen & rechten ══ */
{
  const s = p.addSlide(); s.background = { color: WHITE };
  title(s, 'Toegang', 'Rollen, rechten en samenwerken');
  s.addText('EVA werkt met rechten per module. Daarom ziet niet iedereen hetzelfde menu.',
    { x: 0.6, y: 1.55, w: 12, h: 0.5, fontFace: BODY, fontSize: 16, color: '39424B' });
  const levels = [
    ['Niets', 'Het onderdeel staat niet in jouw zijbalk.', 'E7ECEF', '5A646D'],
    ['Lezen', 'Je kunt bekijken, maar niet wijzigen.', TINT, DEEP],
    ['Muteren', 'Je kunt bekijken én aanpassen.', GREEN, WHITE],
  ];
  const x0 = 0.6, y = 2.35, cw = 3.95, ch = 2.0, gx = 0.13;
  levels.forEach((lv, i) => {
    const x = x0 + i * (cw + gx);
    const dark = lv[2] === GREEN;
    s.addShape(p.ShapeType.roundRect, { x, y, w: cw, h: ch, rectRadius: 0.1, fill: { color: lv[2] }, line: { color: dark ? GREEN : LINE, width: 1.25 } });
    s.addText(lv[0], { x: x + 0.35, y: y + 0.35, w: cw - 0.7, h: 0.6, fontFace: HEAD, fontSize: 24, bold: true, color: lv[3] });
    s.addText(lv[1], { x: x + 0.35, y: y + 1.05, w: cw - 0.7, h: 0.8, fontFace: BODY, fontSize: 14, color: dark ? 'E8F5EC' : '4A545D' });
  });
  s.addShape(p.ShapeType.roundRect, { x: 0.6, y: 4.7, w: 12.1, h: 1.7, rectRadius: 0.1, fill: { color: CARD }, line: { color: LINE, width: 1 } });
  s.addText('Rollen binnen een dossier', { x: 0.9, y: 4.85, w: 11.5, h: 0.4, fontFace: HEAD, fontSize: 16, bold: true, color: DEEP });
  s.addText('Los van rechten heeft een dossier rollen — wie is bijvoorbeeld calculator en wie projectleider. Die stel je in op het Informatie-tabblad. Rollen bepalen ook welke dossiers op jouw persoonlijke Overzicht verschijnen. Wijzigingen zijn direct voor collega’s zichtbaar; jullie werken in dezelfde live-gegevens.',
    { x: 0.9, y: 5.25, w: 11.5, h: 1.05, fontFace: BODY, fontSize: 13.5, color: '4A545D' });
  footer(s, 8);
}

/* ══ Slide 9 — Hulp & tips ══ */
{
  const s = p.addSlide(); s.background = { color: WHITE };
  title(s, 'Handig om te weten', 'Waar vind je hulp?');
  const tips = [
    ['?', '?-knop rechtsboven', 'Uitleg over precies de pagina waar je nu bent.'],
    ['K', 'Zoeken (Ctrl/⌘ + K)', 'Spring direct naar een klant, project of dossier.'],
    ['✶', 'Wat is nieuw', 'Het sterretje toont nieuwe functies; stipje = ongelezen.'],
    ['◔', 'Automatisch uitloggen', 'Aan het eind van de werkdag; log opnieuw in met Microsoft.'],
    ['↺', 'Iets ziet er vreemd uit?', 'Ververs de pagina (F5); helpt dat niet, log uit en weer in.'],
    ['◈', 'Mobiel', 'Werkbonnen, uren en formulieren werken ook op je telefoon.'],
  ];
  const x0 = 0.6, y0 = 1.7, cw = 5.95, ch = 1.35, gx = 0.2, gy = 0.18;
  tips.forEach((t, i) => {
    const c = i % 2, r = Math.floor(i / 2);
    const x = x0 + c * (cw + gx), y = y0 + r * (ch + gy);
    s.addShape(p.ShapeType.roundRect, { x, y, w: cw, h: ch, rectRadius: 0.09, fill: { color: CARD }, line: { color: LINE, width: 1 } });
    s.addShape(p.ShapeType.ellipse, { x: x + 0.3, y: y + 0.37, w: 0.6, h: 0.6, fill: { color: GREEN }, line: { type: 'none' } });
    s.addText(t[0], { x: x + 0.3, y: y + 0.37, w: 0.6, h: 0.6, align: 'center', valign: 'middle', fontFace: BODY, fontSize: 18, bold: true, color: WHITE });
    s.addText(t[1], { x: x + 1.1, y: y + 0.28, w: cw - 1.3, h: 0.4, fontFace: HEAD, fontSize: 15.5, bold: true, color: INK });
    s.addText(t[2], { x: x + 1.1, y: y + 0.68, w: cw - 1.3, h: 0.55, fontFace: BODY, fontSize: 12.5, color: '5A646D' });
  });
  footer(s, 9);
}

/* ══ Slide 10 — Afsluiting (donker) ══ */
{
  const s = p.addSlide(); s.background = { color: G950 };
  s.addShape(p.ShapeType.rect, { x: 0, y: 0, w: 3.43, h: 7.5, fill: { color: '02311C' }, line: { type: 'none' } });
  s.addImage({ path: LOGO, x: 1.0, y: 2.9, w: 1.45, h: 1.45 });
  s.addText('Aan de slag met EVA', { x: 3.9, y: 2.7, w: 8.8, h: 0.9, fontFace: HEAD, fontSize: 40, bold: true, color: WHITE });
  s.addText('Log in met je Microsoft-account en verken je Overzicht. Vragen? Gebruik de ?-knop op elke pagina of vraag je beheerder.',
    { x: 3.95, y: 3.7, w: 8.7, h: 1.0, fontFace: BODY, fontSize: 17, color: 'CDE7D6' });
  s.addShape(p.ShapeType.roundRect, { x: 3.95, y: 4.9, w: 7.2, h: 0.6, rectRadius: 0.29, fill: { color: '0B4A2C' }, line: { color: LIME, width: 1 } });
  s.addText('Levend document — houd "Wat is nieuw" in de gaten', { x: 3.95, y: 4.9, w: 7.2, h: 0.6, align: 'center', valign: 'middle', fontFace: BODY, fontSize: 13, bold: true, color: 'DFF3E6' });
  s.addText('EVERTS.  ·  Everts Groep · Enschede', { x: 3.95, y: 6.4, w: 8, h: 0.35, fontFace: BODY, fontSize: 12, color: '6E9C82', charSpacing: 2 });
}

p.writeFile({ fileName: 'Handleiding-EVA-presentatie.pptx' }).then(f => console.log('written', f));
