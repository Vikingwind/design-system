# Entur illustrasjon (prototype)

Figma-plugin som gjør en kort beskrivelse om til en Entur Linje-illustrasjon og setter den inn i Figma som vektorer i tre fargemoduser. Den følger prosessen i skillen `entur-illustration` (rute B, `references/raster-first.md`):

1. **Utkast:** en PNG i Linje-stil, laget fra skillens promptmal. Enten lager du den selv med Figmas bildegenerering, eller så lager broen den hos fal.ai med Nano Banana og biblioteksillustrasjoner som stilreferanser.
2. **Vurdering, valgfritt:** Claude ser utkastet mot biblioteket og sjekklisten i skillen og skriver rettelsene.
3. **Trace:** skillens `illustrator-trace.mjs` gjør utkastet om til levende strøk med runde ender i Illustrator, med breddeprofil, bibliotekets bakgrunnssirkel og papirunderlag på dyr.
4. **I Figma:** én ramme per fargemodus, standard, `-darkmode` og `-contrast`, med `.ai`-fila ved siden av i jobbmappa.

## Hvorfor en lokal bro

En Figma-plugin kan ikke starte programmer på maskinen, og Figma har ingen image trace. Pluginen sender derfor jobben til en liten Node-server på din egen Mac, broen, som kjører trace-scriptet i Illustrator og sender SVG-ene tilbake.

```
Figma: Make an image ──▶ PNG ─┐
Figma: ui.html ──fetch──▶ bro (127.0.0.1:7317) ──▶ fal.ai: utkast (valgfritt)
                                                ──▶ Claude: vurdering (valgfritt)
                                                ──▶ Illustrator: illustrator-trace.mjs
Figma: code.js ◀── SVG-er ─┘  figma.createNodeFromSvg
```

Broen har ingen avhengigheter og lytter bare på `127.0.0.1`. Den kjører én jobb om gangen.

## Krav

- macOS med Node 24 (repoets versjon) og Adobe Illustrator 2026. Illustrator bør være startet før du sporer.
- Skillen `entur-illustration`. Den ligger i `skills/entur-illustration` når [entur/design-system#546](https://github.com/entur/design-system/pull/546) er merget. Før det setter du `skillDir` til skillen i en checkout av grenen `entur-illustration-skill`. Broen leser promptmalen, sjekklisten og trace-scriptet derfra, så endringer i skillen gjelder med en gang. At øyne og neser blir med på dyr, krever skillen fra og med commit `b43329774`.
- For dyr: en carriers-fil, en `.ai` med strøkene `swell` og `point` (skillens `references/handoff.md`). Uten den får dyrelinjene jevn bredde.
- For utkast i Figma: Figma AI, som bruker AI-kredittene i planen fila ligger i.

**Godkjente verktøy i Entur:** bare Figma, Claude og Illustrator. Bruk derfor utkast fra Figma. To valg i pluginen går utenom og står av som standard: utkast hos fal.ai, og vurdering over Anthropic API med en egen nøkkel og egen faktura. Panelet viser dem bare når `falKey` eller `anthropicApiKey` står i config-fila. Vurderingen kan du heller få fra Claude i Code-fanen. Weave er heller ikke med: det er en egen tjeneste med egen konto og egne kreditter, og API-et finnes bare på Weave Enterprise.

## Oppsett

1. Start broen fra roten av repoet:

   ```bash
   node tools/figma-illustrasjon/bridge/server.mjs
   ```

   Første gang lager den config-fila `~/.config/entur-illustrasjon/config.json`, som bare du kan lese, og skriver ut en parkode. La Terminal-vinduet stå åpent mens du bruker pluginen.

2. Legg inn nøklene selv i config-fila, for eksempel med `nano ~/.config/entur-illustrasjon/config.json` (TextEdit kan gjøre om anførselstegnene, og da blir fila ugyldig). Fila ligger utenfor repoet, så nøklene kan ikke bli med i en commit. Ikke lim dem inn i en chat. Du kan også sette miljøvariablene `FAL_KEY` og `ANTHROPIC_API_KEY`; verdiene i fila går foran. Broen leser fila på nytt for hver jobb, så du trenger ikke starte den på nytt.

   ```json
   {
     "falKey": "…",
     "anthropicApiKey": "…",
     "carriersFile": "~/…/linje-profiles.ai",
     "outputDir": "~/Documents/Entur-illustrasjoner",
     "skillDir": "~/…/design-system/skills/entur-illustration",
     "illustratorApp": "/Applications/Adobe Illustrator 2026/Adobe Illustrator.app",
     "pairingCode": "ABCD-EFGH"
   }
   ```

   | Nøkkel             | Standard                                                     | Brukes til                             |
   | ------------------ | ------------------------------------------------------------ | -------------------------------------- |
   | `falKey`           | tom                                                          | utkast og redigeringsrunder hos fal.ai |
   | `anthropicApiKey`  | tom                                                          | vurdering                              |
   | `carriersFile`     | tom                                                          | breddeprofilene på dyrelinjene         |
   | `outputDir`        | `~/Documents/Entur-illustrasjoner`                           | én mappe per jobb                      |
   | `skillDir`         | `skills/entur-illustration` i repoet                         | promptmal, sjekkliste og trace-script  |
   | `illustratorApp`   | `/Applications/Adobe Illustrator 2026/Adobe Illustrator.app` | Illustrator-versjonen som tracer       |
   | `pairingCode`      | lages første gang                                            | kobler pluginen til broen              |
   | `falModel`         | `fal-ai/nano-banana-2/edit`                                  | bildemodellen hos fal.ai               |
   | `falResolution`    | `2K`                                                         | oppløsning på utkastet                 |
   | `reviewModel`      | `claude-opus-5-5`                                            | modellen som vurderer                  |
   | `anthropicBaseUrl` | `https://api.anthropic.com`                                  | Messages API-adressen                  |
   | `port`             | `7317`                                                       | må stemme med `devAllowedDomains`      |

3. Importer pluginen i Figma desktop: **Plugins → Development → Import plugin from manifest…** og velg `tools/figma-illustrasjon/manifest.json`.

4. Kjør **Plugins → Development → Entur illustrasjon** og lim inn parkoden fra Terminal. Pluginen husker den.

## Bruk

Velg **Dyr** eller **Person** og skriv én setning om motivet: hvem, hva de gjør og høyst én ting. Formatet er kvadrat, 320 × 320. **Navn** blir navnet på filene og rammene (`Bear`, `Bear-darkmode`, `Bear-contrast`); står det tomt, lages det fra beskrivelsen. **Fersken-element** er den ene tingen som får Peach 40. Velg så to til fire stilreferanser. Standardvalget er det skillen anbefaler: Dog, Rabbit, Squirrel og Sheep for dyr; Woman holding package, Man checking the time, Man and woman hugging og Woman walking with luggage for personer. Velg gjerne dyr med en kropp som ligner motivet.

### Utkast fra Figma

1. Under **1. Prompt til Figma** fyller pluginen ut skillens prompt. Trykk **Kopier**.
2. Tegn et kvadrat (for eksempel 1024 × 1024) og la det være markert, åpne **Actions → Make an image**, og lim inn prompten. Legg gjerne ved to til tre biblioteks-PNG-er som referanser med **+** i promptfeltet; det holder stilen nærmere biblioteket. Filene ligger i `apps/documentation/src/downloads/illustrations/<Kategori>/<Motiv>/PNG/`; for dyr, bruk `-background`-versjonen.
3. Marker bildet Figma laget, og trykk **Bruk «…»**.
4. Står det en Anthropic-nøkkel i config-fila, kan du trykke **Vurder utkastet med Claude**. Du får avvikene og en rettelse du kan lime inn i **Edit with prompt** på bildet. Marker det nye bildet og vurder eller spor det.
5. Trykk **Spor utkastet**.

Bildet som spores, skal være strekutkastet, ikke et foto. Broen avviser bilder som ikke er kvadratiske, og bilder som ser ut som foto, før noe går til Illustrator. Et foto eller en stockillustrasjon kan ikke spores; beskriv motivet med ord i stedet.

### Utkast fra fal.ai

Ikke godkjent i Entur. Valget vises bare når `falKey` står i config-fila. Broen lager utkastet selv, med stilreferansene og skillens prompt. Legg eventuelt ved eget foto eller et fritt lisensiert bilde for positur, ved å slippe en fil i panelet, velge en fil eller bruke et markert bilde. En illustrasjon fra andre beskriver du heller med ord. Med **Automatisk vurdering med Claude** ser Claude hvert utkast og retter avvik i opptil to redigeringsrunder før tracen. Et ferdig utkast fra andre steder kan du spore direkte med **Bildet er et ferdig utkast**.

### Resultatet

Pluginen setter inn en seksjon med de tre fargemodusene på sine flater (hvit, Ebony 100 og Lavender 90), utkastet ved siden av og ett biblioteksmotiv i de samme tre modusene under, til sammenligning. Rammene har flaten som fyll så du ser modusene riktig; fjern fyllet hvis du eksporterer rammen.

**Fargevariabler:** Pluginen kobler hver farge i de tre rammene til variablene i biblioteket **Tokens-Illustration colors** (samlingen Illustration colors), slik komponentene i Illustration Library er bygd. Biblioteket må være slått på i fila.

| Farge i tracen    | Dyr               | Personer                                |
| ----------------- | ----------------- | --------------------------------------- |
| Strek             | `Line/Body`       | `Line/Default` (fylt: `Fill/Default`)   |
| Papir (hvitt)     | `Fill/Body`       | `Fill/Skin`                             |
| Grått (`tint`)    | `Fill/BodyShadow` | –                                       |
| Bakgrunnssirkelen | `Fill/Circle`     | –                                       |
| Peach             | `Fill/Highlight`  | `Fill/Highlight 1`                      |
| Lavendel / coral  | –                 | `Fill/Highlight 2` / `Fill/Highlight 3` |

Standard- og darkmode-rammen bruker `Animal/Standard/…` eller `People/Standard/…`, og kontrastrammen `…/Contrast/…`. Darkmode-rammen står i modusen **Dark**, de to andre i **Light**, så du kan bytte modus på rammen som på en bibliotekskomponent. Farger uten variabel blir stående og står i panelet etter innsettingen. På personer får alt papir `Fill/Skin`; klær som skal bli Ebony 30 i mørk modus, bytter du selv til `Fill/Cloth`.

Hver jobb får en mappe i `outputDir` med utkastene (`utkast-1.png` …), prompten, vurderingene, `jobb.json` og resultatet: `<Navn>.ai` med levende strøk og `<Navn>.svg`, `<Navn>-darkmode.svg` og `<Navn>-contrast.svg`. Panelet viser stien til `.ai`-fila. Rammene i Figma er kopier: endrer du `.ai`-fila senere, må du lime eller importere den inn i Figma på nytt, og en ny trace gir en ny seksjon.

## Kostnader

| Hva                                         | Pris                                   | Per jobb                                        |
| ------------------------------------------- | -------------------------------------- | ----------------------------------------------- |
| Utkast i Figma, **Make an image**           | Figma AI-kreditter                     | en kjøring per utkast og per rettelse           |
| Utkast hos fal.ai, `nano-banana-2/edit`, 2K | 0,12 USD per bilde (fal.ai, nov. 2026) | 0,12 USD, opptil 0,36 USD med to rettelser      |
| Vurdering, Claude Opus 5.5                  | 4 / 20 USD per million tokens inn / ut | anslått 0,10–0,25 USD per vurdering (ikke målt) |
| Trace i Illustrator                         | ingen                                  | –                                               |

Panelet viser kostnaden før en fal.ai-jobb og den faktiske summen etterpå, regnet fra fal.ai-prisen og tokenbruken Claude rapporterer. fal.ai krever minst 10 USD i kreditt. Er kontoen hos fal.ai eller Anthropic tom, sier panelet det, og ingenting trekkes.

## Begrensninger

- **Bare dyr og personer, bare kvadrat.** Objekter, scener og landskap kommer senere. Objekter tegnes etter skillen best med rute A (scriptet), ikke med en bildemodell.
- **Figma tegner ikke for pluginen.** En plugin har ikke tilgang til Figmas bildegenerering, så i Figma-modus lager du utkastet selv med **Make an image**.
- **Noe etterarbeid gjenstår.** På dyr legger tracen tilbake øyne og neser og lager én enkel bakkelinje. Skillens øvrige finish-steg gjøres i `.ai`-fila: hodestørrelse, glatt hår, 2–5 foldemerker og enklere tilbehør på personer, og hvite felt mellom beina på dyr. MCP-verktøyene i `scripts/illustrator-mcp.mjs` hjelper.
- **Breddeprofilene finnes bare i `.ai`-fila.** En linje med breddeprofil kan ikke være et SVG-strøk, så SVG-en, og dermed Figma, får dyrelinjene som fylte konturer, slik bibliotekets egne eksporter.
- **Mørk modus kjenner ikke `cloth` og `vehicle`.** Tracen gjør all hvit om til `paper`, og pluginen kobler den til `Fill/Skin` på personer. Klær og kjøretøy kobles om for hånd til `Fill/Cloth` og transportvariablene.
- **Tracen tar fra sekunder til minutter.** Et utkast på 1024 px tok 12 sekunder med noen få små dokumenter åpne i Illustrator, men 14 minutter med åtte dokumenter åpne, blant dem de store kildefilene i biblioteket. Trace-scriptet gir opp etter 30 minutter. Panelet advarer når Illustrator har mer enn to dokumenter åpne.
- **Vurderingen er en hjelp, ikke sjekken.** Sammenlign resultatet med biblioteksmotivet i alle tre modusene før det tas i bruk, og send nye motiver til `#talk-designsystem`.
- **Én jobb om gangen.** **Avbryt** stopper broen, men et trace-script som alt kjører i Illustrator, går ferdig.
- **Bare som utviklingsplugin.** `devAllowedDomains` gjelder bare for utviklingsplugins. Skal pluginen publiseres i organisasjonen, må broen nås på en annen måte. `id` i `manifest.json` er en plassholder.
- **Parkoden** hindrer at andre nettsider i nettleseren din kan starte betalte jobber på broen. Stopp broen når du ikke bruker den.
- Mens panelet er åpent, kan ingen andre plugins kjøre i filen.

## Filer

| Fil                   | Innhold                                                                   |
| --------------------- | ------------------------------------------------------------------------- |
| `manifest.json`       | Plugin-manifestet; `devAllowedDomains` og `reasoning` forklarer broen     |
| `ui.html`             | Panelet: skjema, prompt til Figma, kontakt med broen, fremdrift           |
| `code.js`             | Leser markert bilde og setter inn rammene med `figma.createNodeFromSvg`   |
| `bridge/server.mjs`   | HTTP-serveren og jobbene                                                  |
| `bridge/pipeline.mjs` | Stilreferanser, utkast, vurdering, kontroll av utkastet og trace          |
| `bridge/prompt.mjs`   | Leser promptmalen og sjekklisten fra skillen, med og uten referansebilder |
| `bridge/fal.mjs`      | fal.ai sin kø-API                                                         |
| `bridge/review.mjs`   | Vurderingen med Claude (Messages API, bildeinput, JSON-svar)              |
| `bridge/config.mjs`   | Config-fila i `~/.config/entur-illustrasjon/`                             |
