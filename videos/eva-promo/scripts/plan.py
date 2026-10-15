# Eén bron voor scènes: schrijft STORYBOARD.md, SCRIPT.md en boards/storyboard.html.
S = [
 ("01-hook","Elke klus begint met een mail",4,"cut","hook","De belofte","Eén mail schuift in beeld op het groene merkvlak",
  "Elke klus begint met een mail.","assets/img/mail-card.png — mailkaart uit het postvak"),
 ("02-intro","Eén systeem",6,"zoom-through","product_intro","De belofte","Everts-logo; desktop-planbord en telefoon naast elkaar",
  "Met EVA doe je de rest in één systeem — op kantoor, én op de bouwplaats.","assets/img/everts-logo-1078.png — logo; assets/img/ds-planning.png — desktop; assets/img/phone-nl.png — telefoon"),
 ("03-postvak","Postvak",9,"crossfade","feature_showcase","Op kantoor","Echt postvak-scherm: zoom naar het voorstel, velden lichten op, klik op Dossier aanmaken",
  "In het postvak leest EVA de aanvraag mee. Opdrachtgever, werkadres en contactpersoon staan al klaar. Eén klik — en het dossier staat.","assets/img/mailintake-clean.png — postvak"),
 ("04-dossier","Dossier en object",8,"push-slide LEFT","feature_showcase","Op kantoor","Dossier-tabgroepen waaieren uit; objectkaart VvE Laan van Meervoort schuift eronder",
  "Elke klus krijgt een dossier, gekoppeld aan het object: de VvE, het complex of het pand.","assets/img/sidebar.png — dossier-sidebar"),
 ("05-calculatie","Meetstaat en prijzenboek",9,"crossfade","feature_showcase","Op kantoor","Echte meetstaat; prijzenboek (recepten, schilderwerk, materialen) schuift ernaast",
  "De opname wordt een meetstaat, de meetstaat een calculatie. Met het prijzenboek: vaste recepten, schilderbehandelingen en materiaalprijzen.","assets/img/pv-meetstaat.png — meetstaat"),
 ("06-offerte","Offerte",9,"push-slide LEFT","feature_showcase","Op kantoor","Offertedocument; stappen gecontroleerd → goedgekeurd → verzonden; knop Offerte verzenden",
  "EVA controleert de calculatie. Daarna laat je de offerte goedkeuren en verstuur je hem — en het dossier schuift vanzelf door.","assets/img/everts-logo-1078.png — logo op de offerte"),
 ("07-planning","Planning",7,"zoom-through","feature_showcase","Op kantoor","Echt planbord, dan medewerkerplanning; een planbalk wordt gesleept",
  "Gegund? Sleep het werk op het planbord, en verdeel het over je mensen.","assets/img/ds-planning.png — projectplanning; assets/img/ds-planning-mw.png — medewerkerplanning"),
 ("08-mobiel","EVA Mobiel",11,"push-slide UP","feature_showcase","Op de bouwplaats","Drie echte telefoonschermen (NL, PL, Tamil); functie-chips lichten op",
  "De vakman ziet het meteen op zijn telefoon. Inklokken, uren schrijven, foto's maken en navigeren naar het werk. In het Nederlands, Pools of Tamil.","assets/img/phone-nl.png; assets/img/phone-pl.png; assets/img/phone-ta.png — startscherm in drie talen"),
 ("09-houtrot","Houtrotregistratie",9,"crossfade","feature_showcase","Op de bouwplaats","Telefoon: locatie, werkzaamheden, voor/na-foto; kantoor: reparatietotaal",
  "Houtrot? Kies de locatie, voeg de werkzaamheden toe, en maak een voor- en na-foto. Kantoor ziet meteen het reparatietotaal.",""),
 ("10-kwaliteit","Veiligheid en kwaliteit",8,"crossfade","benefit_highlight","Op de bouwplaats","Toolbox aftekenen; kaarten VCA, kwaliteitsinspectie, opleverrapport",
  "Toolboxmeetings, kwaliteitsinspecties en het opleverrapport: ter plekke ingevuld, met foto's, en meteen vastgelegd.",""),
 ("11-enquete","Bewonersenquête",9,"crossfade","benefit_highlight","Bewoner en opdrachtgever","Telefoon met enquête (sterren, aandachtspunt met foto); kantoor: gemiddelden en nieuwe melding",
  "Na de oplevering vullen bewoners een korte enquête in. EVA vat de cijfers samen, en aandachtspunten komen met foto bij de projectleider.","assets/img/everts-logo-1078.png — logo in de enquête"),
 ("12-portaal","Klantportaal",7,"push-slide LEFT","benefit_highlight","Bewoner en opdrachtgever","Klantportaal: planning met fases en activiteiten, foto's, documenten",
  "De opdrachtgever kijkt mee in het klantportaal: planning, foto's, documenten en facturen.","assets/img/eve-beeldmerk.png — beeldmerk"),
 ("13-financieel","Financieel",9,"zoom-through","feature_showcase","De cirkel rond","Echt financieel overzicht; totalen tellen op; inkoopfactuur goedgekeurd",
  "Daarna sluit de cirkel. Termijnen, meerwerk en facturen. Inkoopfacturen goedkeuren. En stuurcijfers voor het management.","assets/img/verkoop-crop.png — financieel"),
 ("14-servicedesk","Servicedesk",9,"push-slide LEFT","feature_showcase","De cirkel rond","Servicedeskbord: Nieuw, Offerte uitgebracht, Loopt, Gereed; badge verzamelfactuur",
  "Kleine klussen en mutaties lopen via de servicedesk: alle bonnen op één bord, van nieuw tot gereed — en samen op één verzamelfactuur.",""),
 ("15-meer","En nog veel meer",8,"crossfade","benefit_highlight","De cirkel rond","Tegels: wagenpark, materieel, KAM/VGM, bedrijfsagenda, mijn acties, Vraag EVA",
  "En ook het wagenpark, het materieel, je acties en de bedrijfsagenda. Heb je een vraag? Vraag het EVA.",""),
 ("16-outro","EVA",6,"blur-crossfade","branding","De cirkel rond","Groene merkachtergrond, beeldmerk, EVA, belofte",
  "EVA. Eén systeem — van eerste mail tot laatste factuur.","assets/img/eve-beeldmerk.png — beeldmerk"),
]
head = open('STORYBOARD.md').read().split('\n## Frame 1')[0].replace('duration: 90s','duration: 128s')
sb=[head.rstrip()+'\n']; sc=["# SCRIPT — eva-promo\n\n**Voice:** Google Cloud TTS nl-NL (Chirp 3 HD) — stem nog te kiezen\n**Voice settings:** spreektempo 1.0\n**Voice direction:** Rustig, helder en warm. Collega tegen collega, geen reclamestem.\n\n---\n"]
t=0; acts=[]; cards=[]; prev=None
for i,(f,title,d,tr,typ,act,scene,vo,assets) in enumerate(S,1):
    sb.append(f"\n## Frame {i} — {title}\n\n- scene: {scene}\n- voiceover: \"{vo}\"\n- duration: {d}s\n- transition_in: {tr}\n- status: built\n- src: compositions/frames/{f}.html\n- type: {typ}\n- act: {act}\n- asset_candidates: {assets}\n")
    sc.append(f"\n## Line {i} — {title} (Frame {i})\n\n**Time:** {t:.1f} – {t+d:.1f}s\n\n    {vo}\n")
    if act!=prev: cards.append(f'</div><section class="act">{act}</section><div class="grid">'); prev=act
    at=round(t+d*0.6,1); ats=('%g'%at)
    cards.append(f'<div class="frame"><img src="stills/frame-{i-1:02d}-at-{ats}s.png" alt=""><div class="title">{i:02d}: {title}</div><div class="time">{t:g} to {t+d:g}s</div><p class="words">"{vo}"</p></div>')
    t+=d
open('STORYBOARD.md','w').write(''.join(sb)); open('SCRIPT.md','w').write(''.join(sc))
h=open('boards/storyboard.html').read()
top=h.split('<section class="act">')[0].replace('ca. 84 s','ca. 2:08')
top=top.rsplit('<div class="grid">',1)[0] if top.count('<div class="grid">') else top
body=''.join(cards)[len('</div>'):]+'</div></body></html>'
open('boards/storyboard.html','w').write(top+body)
print(t)
