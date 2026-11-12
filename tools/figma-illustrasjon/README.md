# Entur illustrasjon (prototype)

Figma-plugin som gjør et utkast fra Figmas bildegenerering om til en Entur Linje-illustrasjon og setter den inn i Figma som vektorer i tre fargemoduser. Den følger prosessen i skillen `entur-illustration` (rute B, `references/raster-first.md`):

1. **Utkast:** pluginen fyller ut skillens promptmal, og du lager en PNG i Linje-stil med **Make an image** i Figma.
2. **Vurdering, valgfritt:** Claude ser utkastet mot biblioteket og sjekklisten i skillen og skriver rettelsene.
3. **Trace:** skillens `illustrator-trace.mjs` gjør utkastet om til levende strøk med runde ender i Illustrator, med breddeprofil, bibliotekets bakgrunnssirkel og papirunderlag på dyr og objekter.
4. **I Figma:** én ramme per fargemodus, standard, `-darkmode` og `-contrast`, koblet til bibliotekets fargevariabler, med `.ai`-fila i jobbmappa.

## Hvorfor en lokal bro

En Figma-plugin kan ikke starte programmer på maskinen, og Figma har ingen image trace. Pluginen sender derfor utkastet til en liten Node-server på din egen Mac, broen, som kjører trace-scriptet i Illustrator og sender SVG-ene tilbake.

```
Figma: Make an image ──▶ PNG ─┐
Figma: ui.html ──fetch──▶ bro (127.0.0.1:7317) ──▶ Illustrator: illustrator-trace.mjs
Figma: code.js ◀── SVG-er ─┘  figma.createNodeFromSvg
```

Broen har ingen avhengigheter og lytter bare på `127.0.0.1`. Den kjører én jobb om gangen.

## Krav

- macOS med Node 24 (repoets versjon) og Adobe Illustrator 2026. Illustrator bør være startet før du sporer.
- Skillen `entur-illustration`. Den ligger i `skills/entur-illustration` når [entur/design-system#546](https://github.com/entur/design-system/pull/546) er merget. Før det setter du `skillDir` til skillen i en checkout av grenen `entur-illustration-skill`. Broen leser promptmalen, sjekklisten og trace-scriptet derfra, så endringer i skillen gjelder med en gang.
- For dyr og objekter: en carriers-fil, en `.ai` med strøkene `swell` og `point` (skillens `references/handoff.md`). Uten den får linjene jevn bredde.
- Figma AI, som bruker AI-kredittene i planen fila ligger i.
- Biblioteket **Tokens-Illustration colors** slått på i Figma-fila, for fargevariablene.

**Godkjente verktøy i Entur:** bare Figma, Claude og Illustrator. Pluginen bruker bare dem: Figma lager utkastet, Illustrator sporer det. Vurderingen i panelet går over Anthropic API med en egen nøkkel og egen faktura, og står derfor av. Den vises bare når `anthropicApiKey` står i config-fila. Vurderingen får du heller fra Claude i Code-fanen.

## Oppsett

1. Start broen fra roten av repoet:

   ```bash
   node tools/figma-illustrasjon/bridge/server.mjs
   ```

   Første gang lager den config-fila `~/.config/entur-illustrasjon/config.json`, som bare du kan lese, og skriver ut en parkode. La Terminal-vinduet stå åpent mens du bruker pluginen.

2. Sett stien til carriers-fila i config-fila, for eksempel med `nano ~/.config/entur-illustrasjon/config.json` (TextEdit kan gjøre om anførselstegnene, og da blir fila ugyldig). Broen leser fila på nytt for hver jobb, så du trenger ikke starte den på nytt.

   ```json
   {
     "anthropicApiKey": "",
     "carriersFile": "~/Documents/Entur-illustrasjoner/linje-profiles.ai",
     "outputDir": "~/Documents/Entur-illustrasjoner",
     "skillDir": "~/…/design-system/skills/entur-illustration",
     "illustratorApp": "/Applications/Adobe Illustrator 2026/Adobe Illustrator.app",
     "pairingCode": "ABCD-EFGH"
   }
   ```

   | Nøkkel             | Standard                                                     | Brukes til                                     |
   | ------------------ | ------------------------------------------------------------ | ---------------------------------------------- |
   | `carriersFile`     | tom                                                          | breddeprofilene på dyrelinjene                 |
   | `outputDir`        | `~/Documents/Entur-illustrasjoner`                           | én mappe per jobb                              |
   | `skillDir`         | `skills/entur-illustration` i repoet                         | promptmal, sjekkliste og trace-script          |
   | `illustratorApp`   | `/Applications/Adobe Illustrator 2026/Adobe Illustrator.app` | Illustrator-versjonen som sporer og åpner fila |
   | `pairingCode`      | lages første gang                                            | kobler pluginen til broen                      |
   | `anthropicApiKey`  | tom                                                          | vurdering over Anthropic API; ikke godkjent    |
   | `reviewModel`      | `claude-opus-5-5`                                            | modellen som vurderer                          |
   | `anthropicBaseUrl` | `https://api.anthropic.com`                                  | Messages API-adressen                          |
   | `port`             | `7317`                                                       | må stemme med `devAllowedDomains`              |

3. Importer pluginen i Figma desktop: **Plugins → Development → Import plugin from manifest…** og velg `tools/figma-illustrasjon/manifest.json`.

4. Kjør **Plugins → Development → Entur illustrasjon** og lim inn parkoden fra Terminal. Pluginen husker den.

## Bruk

Velg **Dyr**, **Person** eller **Objekt** og skriv én setning om motivet: hvem, hva de gjør og høyst én ting; for et objekt hvilken ting, og hva som skjer med den. Formatet er kvadrat, 320 × 320. **Navn** blir navnet på filene og rammene (`Bear`, `Bear-darkmode`, `Bear-contrast`); står det tomt, lages det fra beskrivelsen. **Fersken-element** er den ene tingen som får Peach 40. På objekter i biblioteket er det en liten detalj, aldri hele tingen: bevegelsesstreker rundt bjella og papirflyet, listen og ringene på kalenderen, stubben på billetten, timemerkene på klokka eller brikken på kortet. Står feltet tomt, foreslår prompten slike detaljer. Velg så to til fire stilreferanser. Standardvalget er det skillen anbefaler: Dog, Rabbit, Squirrel og Sheep for dyr; Woman holding package, Man checking the time, Man and woman hugging og Woman walking with luggage for personer; Ticket, Calendar, Clock og Notification for objekter. Velg gjerne dyr med en kropp som ligner motivet.

1. Under **1. Prompt til Figma** fyller pluginen ut skillens prompt. Trykk **Kopier**.
2. Tegn et kvadrat (for eksempel 1024 × 1024) og la det være markert, åpne **Actions → Make an image**, og lim inn prompten. Legg gjerne ved to til tre biblioteks-PNG-er som referanser med **+** i promptfeltet; det holder stilen nærmere biblioteket. Filene ligger i `apps/documentation/src/downloads/illustrations/<Kategori>/<Motiv>/PNG/`; for dyr og objekter, bruk versjonen med sirkel (`-background`, `in circle` eller `_Circle`).
3. Marker bildet Figma laget, og trykk **Bruk «…»**.
4. Står det en Anthropic-nøkkel i config-fila, kan du trykke **Vurder utkastet med Claude**. Du får avvikene og en rettelse du kan lime inn i **Edit with prompt** på bildet. Marker det nye bildet og vurder eller spor det.
5. For dyr og objekter: la **Bakgrunnssirkel** stå på hvis utkastet har en sirkel bak motivet. Da bytter tracen den med bibliotekets sirkel. Har utkastet ingen sirkel, som to måker i lufta, slår du den av.
6. Trykk **Spor utkastet**. Feiler sporingen, sier panelet hvorfor, og **Prøv igjen** starter samme jobb på nytt. **Ny illustrasjon** tar deg tilbake til skjemaet med det du har fylt ut, så du kan endre noe først.

Bildet som spores, skal være strekutkastet, ikke et foto. Har det gjennomsiktig bakgrunn, legger broen det på hvitt først; ellers blir tracen en mørk firkant. Broen avviser bilder som ikke er kvadratiske, og bilder som ser ut som foto, før noe går til Illustrator. Et foto eller en stockillustrasjon kan ikke spores; beskriv motivet med ord i stedet.

### Resultatet

Pluginen setter inn en seksjon med de tre fargemodusene på sine flater (hvit, Ebony 100 og Lavender 90), utkastet ved siden av og ett biblioteksmotiv i de samme tre modusene under, til sammenligning. Rammene har flaten som fyll så du ser modusene riktig; fjern fyllet hvis du eksporterer rammen.

**Sjekk mot utkastet:** etter tracen kjører broen skillens `trace-check.mjs`. Den legger sporingen over utkastet og finner det som mangler (et øye, en mørk vingetupp, en strek, en fargeflate) og det som er lagt til (en prikk, en sirkel, hvitt fyll utenfor figuren, som bare synes i darkmode). Panelet lister avvikene, og når det er noen, legges sjekkbildet `<Navn>-sjekk` ved siden av rammene, med hvert avvik nummerert: rødt mangler, blått er lagt til. Korte streker kan være fjernet med vilje, fordi skillen forenkler dyrene. Har skillen ikke skriptet ennå, hopper broen over steget.

**Åpne i Illustrator:** knappen i resultatet åpner jobbens `.ai`-fil i Illustrator, så du kan se sporingen og gjøre etterarbeidet. Broen åpner bare fila jobben laget. Den åpnes ikke av seg selv: hvert dokument som står åpent i Illustrator, gjør neste trace tregere, så lukk fila når du er ferdig.

**Fargevariabler:** Pluginen kobler hver farge i de tre rammene til variablene i biblioteket **Tokens-Illustration colors** (samlingen Illustration colors), slik komponentene i Illustration Library er bygd. Biblioteket må være slått på i fila.

| Farge i tracen    | Dyr og objekter   | Personer                                |
| ----------------- | ----------------- | --------------------------------------- |
| Strek             | `Line/Body`       | `Line/Default` (fylt: `Fill/Default`)   |
| Papir (hvitt)     | `Fill/Body`       | `Fill/Skin`                             |
| Grått (`tint`)    | `Fill/BodyShadow` | –                                       |
| Bakgrunnssirkelen | `Fill/Circle`     | –                                       |
| Peach             | `Fill/Highlight`  | `Fill/Highlight 1`                      |
| Lavendel / coral  | –                 | `Fill/Highlight 2` / `Fill/Highlight 3` |

Objektene i biblioteket er koblet til de samme `Animal`-variablene som dyrene. Standard- og darkmode-rammen bruker `Animal/Standard/…` eller `People/Standard/…`, og kontrastrammen `…/Contrast/…`. Darkmode-rammen står i modusen **Dark**, de to andre i **Light**, så du kan bytte modus på rammen som på en bibliotekskomponent. Farger uten variabel blir stående og står i panelet etter innsettingen. På personer får alt papir `Fill/Skin`; klær som skal bli Ebony 30 i mørk modus, bytter du selv til `Fill/Cloth`.

Hver jobb får en mappe i `outputDir` med utkastet (`utkast-1.png`), `jobb.json` og resultatet: `<Navn>.ai` med levende strøk og `<Navn>.svg`, `<Navn>-darkmode.svg` og `<Navn>-contrast.svg`. Rammene i Figma er kopier: endrer du `.ai`-fila senere, må du lime eller importere den inn i Figma på nytt, og en ny trace gir en ny seksjon.

## Kostnader

| Hva                               | Pris                                         |
| --------------------------------- | -------------------------------------------- |
| Utkast i Figma, **Make an image** | Figma AI-kreditter per bilde og per rettelse |
| Trace i Illustrator               | ingen                                        |
| Vurdering over Anthropic API      | av; bare med egen nøkkel                     |

## Begrensninger

- **Bare dyr, personer og objekter, bare kvadrat.** Scener og landskap kommer senere. Objekter spores som dyr (svulmende linjer, sirkel, papirunderlag), men med skillens `--object`: mørke prikker blir vanlig strek, ikke øyne, og sirkelen som synes gjennom hakk og tomme ringer, får ikke skyggefarge. Sjekken kjøres også med `--object`.
- **Figma tegner ikke for pluginen.** En plugin har ikke tilgang til Figmas bildegenerering, så du lager utkastet selv med **Make an image**.
- **Noe etterarbeid gjenstår.** På dyr legger tracen tilbake øyne og neser og lager én enkel bakkelinje. Skillens øvrige finish-steg gjøres i `.ai`-fila: hodestørrelse, glatt hår, 2–5 foldemerker og enklere tilbehør på personer, og hvite felt mellom beina på dyr. MCP-verktøyene i `scripts/illustrator-mcp.mjs` hjelper.
- **Breddeprofilene finnes bare i `.ai`-fila.** En linje med breddeprofil kan ikke være et SVG-strøk, så SVG-en, og dermed Figma, får dyrelinjene som fylte konturer, slik bibliotekets egne eksporter.
- **Mørk modus kjenner ikke `cloth` og `vehicle`.** Tracen gjør all hvit om til `paper`, og pluginen kobler den til `Fill/Skin` på personer. Klær og kjøretøy kobles om for hånd til `Fill/Cloth` og transportvariablene.
- **Tracen tar fra sekunder til minutter.** Et utkast på 1024 px tok 12 sekunder med noen få små dokumenter åpne i Illustrator, men 14 minutter med åtte dokumenter åpne, blant dem de store kildefilene i biblioteket. Trace-scriptet gir opp etter 30 minutter. Panelet advarer når Illustrator har mer enn to dokumenter åpne.
- **Sjekk resultatet selv.** Sammenlign det med biblioteksmotivet i alle tre modusene før det tas i bruk, og send nye motiver til `#talk-designsystem`.
- **Broen starter seg selv på nytt etter en oppdatering.** `server.mjs` starter selve broen (`serve.mjs`) og starter den igjen når broens kode endres på disk, for eksempel etter oppdateringskommandoen. En jobb som kjører, går ferdig først. Kjører det likevel en eldre bro, viser panelet **Start broen på nytt**, og knappen ber broen starte seg selv på nytt. En bro fra før versjon 5 kan ikke det, og må startes på nytt i Terminal én gang. Broen og panelet har hvert sitt versjonsnummer (`VERSION` i `bridge/serve.mjs`, `BRIDGE_VERSION` i `ui.html`), som økes sammen når de endrer hva de sender hverandre.
- **Én jobb om gangen.** **Avbryt** stopper broen, men et trace-script som alt kjører i Illustrator, går ferdig.
- **Bare som utviklingsplugin.** `devAllowedDomains` gjelder bare for utviklingsplugins. Skal pluginen publiseres i organisasjonen, må broen nås på en annen måte. `id` i `manifest.json` er en plassholder.
- **Parkoden** hindrer at andre nettsider i nettleseren din kan starte jobber på broen. Stopp broen når du ikke bruker den.
- Mens panelet er åpent, kan ingen andre plugins kjøre i filen.

## Filer

| Fil                   | Innhold                                                                     |
| --------------------- | --------------------------------------------------------------------------- |
| `manifest.json`       | Plugin-manifestet; `devAllowedDomains` og `reasoning` forklarer broen       |
| `ui.html`             | Panelet: skjema, prompt til Figma, kontakt med broen, fremdrift             |
| `code.js`             | Leser markert bilde, setter inn rammene og kobler fargene til variablene    |
| `bridge/server.mjs`   | Starter broen og starter den på nytt etter en oppdatering eller fra panelet |
| `bridge/serve.mjs`    | HTTP-serveren, jobbene, sjekken mot utkastet og åpning av `.ai`-fila        |
| `bridge/pipeline.mjs` | Stilreferanser, kontroll av utkastet og trace                               |
| `bridge/prompt.mjs`   | Leser promptmalen og sjekklisten fra skillen                                |
| `bridge/review.mjs`   | Vurderingen over Anthropic API, bare med egen nøkkel                        |
| `bridge/config.mjs`   | Config-fila i `~/.config/entur-illustrasjon/`                               |
