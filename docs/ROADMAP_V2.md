# BONMATCH V2 — NIGHT LEAGUE: roadmap

Documento vivo: lo aggiorno alla fine di ogni milestone. Se il lavoro si interrompe, si riprende dalla prima milestone non marcata ✅ nella tabella "Avanzamento".

## Avanzamento

| # | Milestone | Stato |
|---|---|---|
| M0 | Audit del repository e roadmap | ✅ |
| M1 | Architettura dei nuovi modelli e contratti API (docs/ARCHITETTURA.md) | ✅ |
| M2 | Design system NIGHT LEAGUE: token, font, Lucide, Motion, componenti, shell responsive | ✅ |
| M3 | Dashboard "Spogliatoio" con hero MATCHDAY, azioni rapide, feed attività; restyling gruppi e partite | ✅ |
| M4 | BONCALL: convocazioni, risposte atomiche, conversione idempotente, promemoria, notifiche in-app | ✅ |
| M5 | PWA e Web Push (service worker, VAPID, subscription, preferenze, fasce silenziose) | ✅ |
| M6 | BONCARD e BONRATING (attributi, overall, edizioni, progressione, esportazione PNG) | ✅ |
| M7 | MATCHDAY e formazioni, Bilancia migliorato, locandina esportabile | ✅ |
| M8 | Rivalità | ✅ |
| M9 | Stagioni, nuove classifiche, Hall of Fame | ✅ |
| M10 | Premi partita e achievement | ✅ |
| M11 | Club personalizzati (stemma, colori, maglie, copertina) | ✅ |
| M12 | Calendario intelligente e partite ricorrenti | ✅ |
| M13 | Cassa del gruppo (registro dichiarato/verificato) | ✅ |
| M14 | Terzo tempo evoluto | ✅ |
| M15 | BONWRAPPED | ✅ |
| M16 | Revisione schermate, test e2e, accessibilità, responsive | ✅ |
| M17 | Documentazione e consegna | ✅ |

## 1. Stato iniziale (audit del 2 novembre 2026, commit `e15613f`)

**Stack:** Node.js 22, Express 5, Mongoose 8, Socket.IO 4, JWT + bcryptjs, zod; React 19 + Vite 7 + React Router 7, CSS a token; Jest + Supertest; Playwright + axe-core; collection Postman. Backend in CommonJS a strati (routes → validators → controllers → services → models), errori centralizzati.

**Verifiche eseguite all'avvio della V2:** 101 test backend verdi, 9 test end-to-end verdi (nell'ultima esecuzione della V1), collection Postman 41/41. Nessun TODO, mock o placeholder nel codice; l'unico dato dimostrativo è l'anteprima statica della landing, dichiarata come tale.

**Limite ambientale ereditato:** MongoDB reale non è disponibile in questo ambiente: tutto gira su `backend/dev/mongo-lite` (emulatore scritto per lo sviluppo). Ogni nuova query deve restare nel sottoinsieme supportato o l'emulatore va esteso.

## 2. Funzionalità già presenti (V1)

| Area | Presente | Verificata da |
|---|---|---|
| Account | registrazione, login, logout con revoca del token, profilo (foto data URL, ruolo, piede, modalità soprannomi) | `auth.test.js`, e2e `auth.spec.js` |
| Gruppi | creazione, codice/link invito, ruoli admin, rimozione/uscita, impostazioni (organizzatori, minimo partite, chi perde offre, premi extra) | `groups.test.js` |
| Soprannomi | proposta, rifiuto, sostituzione, rimozione admin, storico | `nicknames.test.js` |
| Partite | 4 campi da configurazione, stati, iscrizione atomica con `freeSlots`, lista d'attesa FIFO, quote, pagato (booleano) | `matches.test.js` (anche concorrenza) |
| Squadre | Bilancia (enumerazione divisioni + scelta casuale tra le migliori, portieri separati), squadre a mano | `teams.test.js` |
| Dopo partita | risultato e marcatori, MVP (48 h, parità), voti 1-10 anonimi, terzo tempo con opzioni extra, pagella testo/immagine | `voting.test.js` |
| Classifiche | 6 classifiche, periodi mese/stagione/sempre, minimo partite, parità | `rankings.test.js` |
| Chat | paginata, reazioni, messaggi di sistema, non letti | `chat.test.js` |
| Tempo reale | Socket.IO autenticato, stanze gruppo/utente, eventi dopo il salvataggio, riconnessione con recupero | `realtime.test.js`, e2e `live.spec.js` |
| Notifiche | in-app per 8 tipi, promemoria il giorno prima | `chat.test.js`, `scheduler.test.js` |
| Interfaccia | tema scuro/chiaro, mobile/desktop, axe AA, nessun overflow a 390 px | e2e `a11y.spec.js` |

## 3. Da migliorare

- **Design:** l'identità "spogliatoio moderno" va sostituita da NIGHT LEAGUE (nuova palette, gerarchie editoriali, layout meno uniformi). Le icone sono SVG fatti a mano: il prompt chiede una sola libreria coerente → Lucide, mantenendo l'API `<Icon name>` per non toccare ogni pagina.
- **Home:** oggi `/` reindirizza all'elenco partite. Serve una dashboard vera.
- **Bilancia:** non considera gli attributi tecnici (non esistono ancora) né l'equilibrio dei ruoli oltre ai portieri.
- **Classifiche:** la "stagione" è fissa (1 settembre); niente storico per stagione, niente confronto con la precedente.
- **Pagamenti:** solo un booleano `paid`, senza distinzione dichiarato/verificato né storico.
- **Terzo tempo:** nessuno storico né statistiche stagionali.
- **Componenti:** `ui.jsx` contiene molti componenti in un file; vanno separati e completati (BottomSheet, Tooltip, ConfirmDialog, Badge, ProgressBar…). Oggi le conferme usano `window.confirm`.

## 4. Mancanti

BONCALL, Web Push, PWA, feed attività, BONCARD, BONRATING e grafici di progressione, schermata MATCHDAY e locandina, rivalità, stagioni configurabili, Hall of Fame, premi partita aggiuntivi, achievement, identità del club con upload dello stemma, calendario e ricorrenze, cassa del gruppo, BONWRAPPED, rate limiting, test unitari del frontend.

## 5. Problemi tecnici individuati

1. **MongoDB reale mai verificato** (vedi sopra). Mitigazione: restare su operatori standard; documentare.
2. **Nessun rate limiting** su login/registrazione → aggiungere `express-rate-limit`.
3. **Corpi delle richieste:** zod con `.strict()` blocca le chiavi inattese, ma un controllo generico contro chiavi `$...` (operator injection) aggiunge difesa in profondità.
4. **Membro rimosso** resta tra gli iscritti delle partite aperte → da sistemare liberando il posto.
5. **Programma periodico** in-process: va reso idempotente anche per i nuovi promemoria (claim atomici, chiavi di deduplica).
6. **Notifiche senza deduplica** e senza preferenze utente → con BONCALL e push servono chiave di deduplica, preferenze, fasce silenziose e limiti di frequenza.
7. **Upload:** oggi solo data URL nel JSON; lo stemma richiede multipart con validazione del tipo reale (magic bytes) e dimensione.
8. **Fuso orario:** le ricorrenze richiedono calcoli in `Europe/Rome` con ora legale (helper già scritto nel seed, da spostare in `utils/time.js`).

## 6. Architettura proposta (sintesi; dettaglio in `docs/ARCHITETTURA.md`)

- **Stesso stack**, nessun cambio di framework. Nuove dipendenze motivate: `lucide-react` (icone), `motion` (animazioni), `@fontsource/space-grotesk` (titoli editoriali), `web-push` (VAPID e invio), `multer` (upload multipart), `express-rate-limit`, `vitest` + Testing Library + jsdom (test frontend).
- **Servizi di dominio nuovi**, uno per area: `pollService` (BONCALL), `pushService`, `activityService`, `playerStatsService` (statistiche condivise da BONCARD, rivalità, classifiche, wrapped), `ratingService` (overall), `seasonService`, `awardService`, `achievementService`, `seriesService` (ricorrenze), `ledgerService` (cassa), `wrappedService`.
- **Un solo motore statistico:** `playerStatsService` costruisce una volta le "righe partita per giocatore" (squadra, esito, gol, voti, MVP, premi) da cui derivano classifiche, BONCARD, rivalità, record e wrapped. Niente logica duplicata.
- **Eventi:** ogni azione persiste prima i dati, poi un `Activity` (feed), poi notifiche (in-app + push filtrata da preferenze) e infine l'evento Socket.IO.

## 7. Modifiche ai modelli MongoDB

| Modello | Modifica | Compatibilità |
|---|---|---|
| `User` | `notificationPrefs` (categorie, push, fasce silenziose), `settings.motion` | campi nuovi con default |
| `Group` | `motto`, `secondaryColor`, `crestUrl`, `coverUrl`, `kits`, `settings.season` (modalità), `settings.awards`, `settings.cashbox` | default; i gruppi esistenti funzionano senza modifiche |
| `Match` | `fromPoll` (indice unico parziale), `series` + `occurrenceKey`, `awards` (premi attivi), `participants[].payment` (stato dichiarato/verificato) | `paid` resta e viene derivato |
| `Rating` | `attributes` facoltativi (VEL, TIR, PAS, DRI, DIF, FIS) | voti esistenti validi |
| `Notification` | `dedupeKey` (indice unico parziale per utente), `category`, `pushedAt` | campi facoltativi |
| nuovi | `Poll`, `PushSubscription`, `Activity`, `Season`, `AwardVote`, `Achievement`, `Rivalry`, `MatchSeries`, `LedgerEntry` | — |

## 8. Piano delle migrazioni

Nessuna migrazione distruttiva. Tutti i campi nuovi hanno default, quindi i documenti esistenti restano validi. Uno script idempotente `npm run migrate` (nella cartella `backend`) fa solo:
1. `participants[].payment`: se manca, lo ricava da `paid` (`true` → `dichiarato`).
2. crea gli indici nuovi (anche `Model.init()` all'avvio li crea).
Il seed resta non distruttivo e viene esteso solo con dati nuovi se mancano.

## 9. Ordine di implementazione

Quello della tabella "Avanzamento". Motivo: prima i contratti e il design system (tutto il resto li usa), poi le funzioni a più valore (dashboard, BONCALL, notifiche), poi il motore statistico che alimenta BONCARD, rivalità, stagioni, premi e wrapped, infine le aree indipendenti (club, calendario, cassa, terzo tempo) e la revisione completa.

## 10. Rischi e dipendenze

| Rischio | Impatto | Mitigazione |
|---|---|---|
| Push reali non verificabili qui (nessun servizio push raggiungibile, nessun dispositivo) | alto | invio testato con un trasporto sostituibile; service worker testato in Chromium; limite dichiarato |
| iOS: push solo con PWA installata nella schermata Home (iOS 16.4+) | medio | rilevamento e messaggio esplicito, notifiche in-app sempre attive |
| Emulatore mongo-lite non copre tutto MongoDB | medio | query semplici; estendere l'emulatore con test quando serve |
| Volume del lavoro rispetto al contesto disponibile | alto | milestone piccole e verificabili, roadmap aggiornata a ogni passo |
| Animazioni pesanti su telefoni medi | medio | solo transform/opacity, `prefers-reduced-motion`, nessuna animazione continua |
| Statistiche fuorvianti con pochi dati | medio | soglie minime, etichette "provvisorio", nessuna percentuale sotto il campione minimo |

## Registro delle milestone

Ogni milestone chiusa aggiunge qui: cosa è stato fatto, file principali, test eseguiti, cosa non è stato verificato.

### M1 — Architettura (✅)
`docs/ARCHITETTURA.md`: principi, modelli estesi e nuovi, regole BONCALL, notifiche e push, algoritmo BONCARD/overall, stagioni, endpoint, sicurezza, struttura frontend.

### M2 — Design system NIGHT LEAGUE (✅)
- Token: palette del prompt (fondo `#090D0C`, lime `#C7FF36`, oro `#F5D98C`, arancio `#FF704A`), varianti di testo con contrasto AA calcolato, tema chiaro completo, scala tipografica responsive, luce "da stadio" statica sullo sfondo.
- Font locali: Barlow Condensed (titoli, numeri), Space Grotesk (titoli editoriali), Inter (testo).
- Icone: tutte Lucide dietro `components/Icon.jsx` (stessi nomi di prima).
- Componenti in `components/ui/`: Button, IconButton, Card, CardHeader, StatCard, CountUp, Countdown, Badge, ProgressBar, Tooltip, Skeleton, EmptyState, ErrorState, Modal, BottomSheet, ConfirmDialog (`useConfirm`, sostituisce ogni `window.confirm`), FormField, FormAlert, SegmentedControl (frecce da tastiera), Tabs/TabPanel, SlotsBar, StatusPill, NotificationItem, LeaderboardRow.
- `components/brand/BrandLogo.jsx` con varianti completa/compatta e toni auto/onDark/onLight/mono; logo dichiarato provvisorio.
- Shell: navigazione da un'unica mappa (`layouts/navigation.js`), sidebar a sezioni, barra in basso con "Crea" e "Altro" in bottom sheet, transizione tra pagine con Motion, preferenza "animazioni ridotte" nel profilo (salvata in `settings.motion`) oltre a `prefers-reduced-motion`.
- Test: 101 backend verdi; build di produzione riuscita; screenshot 390/1280 di partite e scheda partita senza overflow.
- Non verificato in questa milestone: axe-core sulle nuove schermate (si rifà in M16).

### M3 — Dashboard "Spogliatoio" (✅)
- Backend: modello `Activity` con chiave di idempotenza (indice unico parziale), `activityService` (registra e trasmette `activity:new`), `statsEngine` (motore statistico unico, ora usato anche dalle classifiche), `dashboardService`; rotte `GET /groups/:id/dashboard` e `GET /groups/:id/activity?before=&limit=`. Il feed nasce da eventi reali: nuova partita, iscrizione, ingresso dalla lista d'attesa, risultato, MVP, premio, nuovo membro.
- `npm run migrate`: ricostruisce il feed dai dati già salvati in ordine cronologico, idempotente (seconda esecuzione: 0 voci). Il seed lo usa a sua volta.
- Emulatore: aggiunto `$type` (serve agli indici parziali), con `tests/mongoLite.test.js`.
- Frontend: `/gruppi/:id` è la dashboard (hero MATCHDAY con countdown, posti, convocati e "Ci sono"; azioni rapide; votazioni da fare; il tuo campionato con forma V/P/S e avviso quando il campione è piccolo; posizioni in classifica; feed animato in tempo reale; prossime partite). Partite passate in formato "risultati" compatto. Navigazione con Home.
- Test: 109 backend verdi (nuovi `dashboard.test.js`, `mongoLite.test.js`), build ok, screenshot 390/1280 senza overflow.

### M4 — BONCALL e notifiche in-app (✅)
- `services/registration.js`: posti atomici e lista d'attesa condivisi da partite e convocazioni (le partite ora usano questo modulo; tutti i test precedenti restano verdi).
- Modello `Poll`, `pollService` (creazione fissa o a opzioni, risposte, completamento e riapertura, conversione idempotente con indice unico `Match.fromPoll`, annullamento, programma periodico: scadenza, promemoria a metà tempo, avviso 2 ore prima), rotte `/groups/:id/polls` e `/polls/:pid/*`.
- Notifiche: `category`, `dedupeKey` con indice unico per utente, preferenze per categoria in `User.notificationPrefs` (le critiche non si spengono), avvisi "mancano 2/1", "completa", "posto libero" (al massimo uno all'ora), "si gioca", ricerca sostituto (uno al giorno per partita).
- Frontend: elenco convocazioni, creazione (data fissa o 2-5 alternative), scheda con countdown, risposte in tempo reale, alternative con disponibilità, pannello organizzatore; convocazioni aperte in dashboard; "Crea" offre partita o BONCALL.
- Seed: due convocazioni dimostrative aggiunte solo se il gruppo non ne ha.
- Test: 124 backend verdi (15 BONCALL: concorrenza sull'ultimo posto, conversioni simultanee, deduplica, preferenze, scadenze); e2e `boncall.spec.js` con due browser verde.
- Non ancora: invio push (M5). `pushService` per ora segna `pushStatus: "saltata"`.

### M5 — PWA e Web Push (✅)
- Backend: `web-push` con VAPID da `.env` (`npm run vapid` genera le chiavi), modello `PushSubscription` (endpoint unico, solo https, massimo 10 per utente, segue l'ultimo account del browser), `pushService` con regole: consenso esplicito, categoria, fascia silenziosa in Europe/Rome, limite orario, eliminazione delle subscription scadute (404/410) o con 5 errori; invio in background (`idle()` per i test). Rotte `/push/config`, `/push/subscriptions` (POST/DELETE), `/push/test`. Preferenze aggiornabili a pezzi in `PATCH /users/me`.
- Frontend: `manifest.webmanifest`, icone PNG (any, maskable, apple-touch, badge), `sw.js` (pagine rete-prima con pagina offline, asset in cache, API e Socket.IO mai in cache, push con deep link, badge), `offline.html` che si ricarica da sola al ritorno della rete; impostazioni notifiche nel profilo (attivazione solo al clic, spiegazione per iOS e browser senza supporto, prova, categorie, fascia silenziosa, limite orario), installazione dell'app, badge sull'icona, riallineamento quando si torna all'app.
- Test: 132 backend verdi (8 sulle push con trasporto finto); e2e `pwa.spec.js` (manifest e icone, service worker attivo, offline, nessuna API in cache, nessuna richiesta di permesso al caricamento, errore spiegato senza VAPID); suite e2e completa 13/13 verde, axe compreso.
- **Non verificato:** consegna reale di una push. In questo ambiente non c'è nessun servizio push raggiungibile (FCM, Mozilla, Apple) e nessun dispositivo: la sottoscrizione di Chromium fallirebbe e l'invio è stato provato solo con un trasporto sostituito. Va verificato su un telefono vero con le chiavi VAPID configurate e il sito servito in HTTPS (o su localhost).

### M6 — BONCARD e BONRATING (✅)
- `services/playerRating.js` (funzioni pure: media bayesiana, attributi 10-99 con campioni e stato provvisorio, overall tecnico pesato per ruolo, forma limitata a ±1, overall 40-99), `services/seasonService.js` (stagione annuale/trimestrale/mensile; personalizzata in M9), `services/playerService.js` (carta nel contesto gruppo o carriera solo per sé, edizioni con requisiti e motivo, progressione con andamento, forma, record, stagioni).
- `Rating.attributes` facoltativi (VEL, TIR, PAS, DRI, DIF, FIS) inviati con i voti 1-10; validazione 1-10.
- Rotte `GET /groups/:id/players/:userId/card?scope=gruppo|carriera` e `/progression`.
- Frontend: componente `PlayerCard` (sagoma originale, 6 edizioni con colori propri, reveal con Motion), esportazione PNG verticale 1080×1920 via canvas con foto o iniziali, `LineChart` SVG accessibile con tabella nascosta, pagina giocatore con trasparenza dell'overall, edizioni, statistiche con avvisi sui campioni piccoli, migliori prestazioni, record e confronto stagioni; voti per abilità con slider facoltativi nella votazione; link alla carta da membri, classifiche, dashboard e menu.
- Seed: circa metà dei voti dimostrativi include le abilità.
- Test: 143 backend verdi (11 nuovi: proprietà dell'algoritmo e API, permessi sulla carriera, edizioni). Build ok, screenshot 390/1280 senza overflow.
- Non verificato: esportazione PNG su telefoni reali (testata solo la generazione del codice, non la condivisione nativa).

### M7 — MATCHDAY e Bilancia v2 (✅)
- Bilancia v2 (`teamService`): la forza è l'overall della BONCARD (voto generale, abilità se valutate, forma; 5 per chi non ha dati), portieri separati, difensori e attaccanti distribuiti (uno squilibrio evitabile costa più della tolleranza), casualità controllata, "Rigenera" non ripropone la formazione attuale se esiste un'alternativa equilibrata. Le squadre restano modificabili a mano.
- `services/headToHead.js` (scontri diretti, partite insieme, gol, MVP, voti, ultime 5, serie in corso, soglia di affidabilità 3) e `matchdayService` con rotta `GET /matches/:mid/matchday` (overall dei convocati, media delle squadre, in forma, rivalità in campo).
- Frontend: schermata `/partite/:id/matchday` con locandina, countdown, VS con overall medio, campo con formazioni 1-2-2 e badge overall, in forma, rivalità, convocati con link alla BONCARD; esportazione della locandina verticale 1080×1920 e quadrata 1080×1080 (solo nomi, soprannomi, campo e data). Accesso da scheda partita e hero della home.
- Test: 147 backend verdi (nuovi: ruoli divisi, niente formazione ripetuta, testa a testa, MATCHDAY via API).

### M8 — Rivalità (✅)
- Modello `Rivalry` (coppia unica per gruppo, nessun testo libero quindi niente contenuti offensivi, stato proposta/attiva/rifiutata), `rivalryService` (rivalità naturali da almeno 3 scontri diretti, schermata VS, proposta, risposta solo dello sfidato, chiusura da parte di uno dei due, riproposta dopo un rifiuto), notifica `rivalita` nella categoria "social".
- Rotte `GET/POST /groups/:id/rivalries`, `GET /groups/:id/rivalries/:userId?with=`, `POST /rivalries/:rid/accept|decline`, `DELETE /rivalries/:rid`.
- Frontend: pagina Rivalità (proposte da accettare, dichiarate, naturali, sfida un compagno con anteprima del testa a testa) e schermata VS con ingresso animato, record, confronto a barre, partite insieme, serie in corso, ultimi scontri, avviso quando i confronti sono meno di 3.
- Test: 151 backend verdi (4 nuovi), screenshot 390/1280 senza overflow.

### M9 — Stagioni, nuove classifiche, Hall of Fame (✅)
- Stagioni: `Group.settings.season` (annuale con mese di inizio, trimestrale, mensile, personalizzata) e modello `Season` per le personalizzate (sovrapposizioni rifiutate con 422). Nessuna partita viene toccata cambiando modalità: la stagione è solo una finestra sulle partite. Rotte `GET/POST /groups/:id/seasons` (POST solo admin e solo in modalità personalizzata) e `DELETE /groups/:id/seasons/:sid`.
- `playerService` (BONCARD, edizioni, progressione) usa la stagione configurata; fuori da ogni stagione personalizzata mostra "Fuori stagione" senza errori.
- Classifiche: 12 in tutto. Le 6 storiche sono invariate; nuove `forma`, `media_gol`, `difensore`, `portiere`, `rendimento`, `crescita`, ognuna con requisito esplicito e stato `available: false` + motivo se nessuno lo soddisfa. `GET /groups/:id/rankings?period=mese|stagione|sempre` oppure `?season=<chiave>`; la risposta include `season`, `previous` e, per ogni voce, `previousPosition` (confronto con la stagione precedente). La home continua a mostrare le 6 storiche.
- Hall of Fame (`GET /groups/:id/hall-of-fame`): vincitori (più forti, MVP, bomber, più vincenti) di ogni stagione chiusa con partite, record assoluti (più gol in una partita, vittoria più larga, serie di vittorie, presenze, MVP, capocannoniere, miglior voto medio con minimo partite), più premiati (MVP + premi di partita + titoli stagionali). Dove i dati non bastano: `available: false`, mai valori inventati.
- Frontend: selettore periodo (sempre / mese / stagione corrente / stagioni passate), frecce di variazione accessibili, 12 schede con requisito e motivo dell'indisponibilità, pagina Hall of Fame (`/gruppi/:id/hall-of-fame`, voce nel menu), impostazioni admin di stagione (modalità, mese di inizio, stagioni personalizzate).
- Test: 164 backend verdi (13 nuovi in `seasons.test.js`: nuove classifiche, modalità, sovrapposizioni, permessi, confronto con la precedente, Hall of Fame vuota e piena, accesso dei non membri). Build ok, verifica visiva a 1280 px senza errori in console.

### M10 — Premi partita e achievement (✅)
- Premi di partita opzionali: `Group.settings.awards` (portiere, difensore, bomber, sorpresa, ironico con nome scelto dall'admin), tutti spenti di default e attivabili solo dall'admin. Al primo risultato la partita memorizza i premi attivi (`Match.awards`) e i vincitori (`Match.awardWinners`, già letto dal motore statistico). Il **bomber** è automatico dai marcatori (pari merito inclusi, segue le correzioni del risultato, vuoto se non ci sono marcatori); gli altri si decidono con **voto anonimo** (`AwardVote`, unico per partita-votante-premio, niente voto a sé stessi, solo chi ha giocato) o con **assegnazione dell'organizzatore**. I premi a voto si chiudono insieme all'MVP, una sola volta (aggiornamento atomico); l'MVP non si chiude in anticipo finché mancano voti ai premi. Annuncio idempotente: messaggio in chat, voce del feed (`premio_partita`) e notifica ai vincitori.
- Rotte: `GET /matches/:mid/awards`, `POST /matches/:mid/awards/:key/vote`, `POST /matches/:mid/awards/:key/assign` (organizzatore/admin). Valgono per le partite il cui risultato viene inserito dopo l'attivazione.
- Achievement (`Achievement`, indice unico utente-gruppo-chiave, assegnati solo dal backend): prima partita, 10/25/50 presenze, primo gol, 10/25 gol, primo MVP, 5 MVP, tris e serie da 5 vittorie, fedeltà (6 mesi nel gruppo e 10 presenze). Ricalcolati dopo ogni risultato e chiusura MVP; notifica e feed solo per traguardi recenti (3 giorni), quelli arretrati si registrano con la data della partita e senza avvisi. `GET /groups/:id/players/:uid/achievements` con avanzamento reale. `npm run migrate` e il seed ricostruiscono lo storico (idempotente).
- Frontend: pannello "Premi della serata" nella partita (voto, assegnazione, premiazione animata con Motion, statica con animazioni ridotte dal profilo), traguardi nella BONCARD, impostazioni admin dei premi, voci nel feed.
- Test: 176 backend verdi (12 nuovi in `awards.test.js`: attivazione e permessi, bomber, voto, chiusura e pari merito, idempotenza, assegnazione, achievement con concorrenza, storico).
- Limite: gli "effetti" di premiazione sono animazioni leggere (nessun suono né schermata a pieno schermo); disattivabili con "animazioni ridotte" del profilo.

### M11 — Club personalizzati (✅)
- `Group`: `motto` (80), `secondaryColor`, `crestUrl`, `coverUrl`, `kits { light, dark } { primary, secondary }`. Colori validati come `#RRGGBB` (nessun valore libero che finisca in CSS), modificabili solo dagli admin con `PATCH /groups/:id`.
- Upload sicuro (`multer` in memoria, un solo file nel campo `file`): tipo deciso dai **primi byte** (PNG, JPEG, WebP; SVG, GIF, PDF e file con estensione falsa rifiutati con 422), limiti 128 KB per lo stemma e 700 KB per la copertina (413 oltre il limite), salvataggio come data URL, nessun file su disco. Rotte `PUT/DELETE /groups/:id/club/crest|cover` solo admin; `GET /groups/:id/club` per i membri (identità con copertina + statistiche reali: partite, gol, gol a partita, giocatori, MVP assegnati, stagione attiva, capocannoniere, più presenze, più MVP con pari merito). Il riepilogo del gruppo include lo stemma ma solo un flag per la copertina, per non appesantire gli elenchi. Gruppi privati per impostazione predefinita: nessuna lettura senza appartenenza.
- Frontend: pagina `/gruppi/:id/club` (voce "Il club") con copertina, stemma, motto, statistiche, maglie disegnate in SVG con i colori scelti, editor admin con anteprima e controlli lato client (tipo e peso); lo stemma sostituisce l'emoji in intestazione e nell'elenco gruppi, con il simbolo e il colore come fallback grafico. Il client API accetta `FormData`.
- Test: 183 backend verdi (7 nuovi in `club.test.js`). Verificato a mano il caricamento dal browser, compreso un SVG rinominato `.png` (rifiutato dal server).
- Limite: nessun ridimensionamento lato server (non c'è libreria di immagini): i limiti di peso servono a questo; l'admin deve caricare immagini già piccole.

### M12 — Calendario e partite ricorrenti (✅)
- `utils/zone.js`: conversione orario locale ↔ UTC per qualsiasi fuso IANA con ora legale (nessuna libreria), data locale, giorno ISO. `Group.settings.timezone` (default `Europe/Rome`, validato come fuso reale) governa generazione delle ricorrenze, calendario ed esportazione.
- `MatchSeries` (giorno ISO, orario locale, campo, posti, costo, inizio/fine) e occorrenze come normali `Match` con `series`, `occurrenceKey` (data locale) e indice unico parziale `{series, occurrenceKey}`: la generazione (alla creazione, poi dal programma periodico) è **idempotente** anche in parallelo e non ricrea mai un'occorrenza annullata o modificata. Orizzonte 28 giorni. La modifica di una singola partita la "stacca" dalla serie (`detached`); la modifica della serie si propaga solo alle occorrenze future aperte, senza iscritti e non staccate. Fine della serie con o senza annullamento (notificato) delle prossime. Permessi: crea chi può creare partite; modifica/ferma solo l'autore o un admin.
- Calendario: `GET /calendar?from&to[&group]` (partite e convocazioni dei gruppi dell'utente, max 100 giorni), disponibilità per giorno (`GET/PUT/DELETE /groups/:id/availability`, una per utente e giorno, non nel passato, elenco dei disponibili visibile al gruppo), `GET /calendar/export.ics` (iCalendar con UTC, UID stabile, righe piegate a 75 byte, testo con escape; solo partite non annullate dei propri gruppi). Rotte serie: `GET/POST /groups/:id/series`, `PATCH/DELETE /series/:sid`.
- Frontend: `/calendario` con vista mese, settimana, prossime e passate, filtro per gruppo, dettaglio del giorno, disponibilità, pannello ricorrenze (modifica, ferma, ferma e annulla), esportazione `.ics` (con token nell'header, nessun URL di sottoscrizione pubblico), "Ripeti ogni settimana" in Nuova partita. Verificato a 1280 e 390 px senza overflow.
- Test: 200 backend verdi (17 nuovi in `calendar.test.js`: ora legale 2026/2027, idempotenza in parallelo, occorrenze annullate/modificate, permessi, fuso del gruppo, calendario, disponibilità, `.ics`).
- Limiti: niente sottoscrizione `webcal://` (richiederebbe un token nell'URL); il fuso si imposta via API (`settings.timezone`) ma non ha ancora un campo nelle impostazioni dell'interfaccia; le frecce del calendario non gestiscono gesti di scorrimento.

### M13 — Cassa del gruppo (✅)
- Registro contabile interno (`LedgerEntry`): tipi `quota`, `versamento`, `spesa`, `rimborso`; stati `dichiarato` → `verificato` → `annullato`; ogni passaggio finisce nello storico della voce (chi, quando, da/a, nota) e le voci non si cancellano mai. Nessuna transazione reale: l'interfaccia lo dichiara ovunque.
- Regola cardine: **un pagamento dichiarato non vale finché chi riceve il denaro (organizzatore della partita o admin) non lo conferma**. Chi paga può solo dichiarare o ritirare; solo chi riceve conferma o revoca (la revoca lascia traccia). I passaggi sono atomici (`findOneAndUpdate` con stato di partenza) e le quote hanno indice unico per partita e membro: richieste simultanee non duplicano né confermano due volte.
- `Match.participants[].payment` (`da_pagare|dichiarato|verificato`) specchia la voce; `paid` resta ed è derivato (`verificato`); i dati V1 con solo `paid` sono letti come verificati. La rotta `PATCH /matches/:mid/participants/:uid/payment` accetta `{payment}` e, per compatibilità, `{paid}` (dichiara per chi paga, conferma per l'organizzatore). Chi lascia la partita: la dichiarazione decade, il denaro confermato resta come credito.
- Saldi per membro (`GET /groups/:id/cashbox`): dovuto (partite chiuse o giocate, quota = costo ÷ presenti), pagato, versato, spese anticipate, rimborsi; contano solo le voci confermate, le dichiarate sono esposte a parte. Gli admin vedono tutti i saldi, un membro solo il proprio. Riepilogo per partita (costo, quota, confermato, dichiarato, mancante) e `GET /matches/:mid/payments`.
- Cassa comune facoltativa (`settings.cashbox`, solo admin): versamenti (un membro dichiara, l'admin conferma) e spese dalla cassa; il fondo è fatto solo di versamenti confermati meno uscite (le quote pagano il campo e non entrano nel fondo). Spese e rimborsi li registra un admin. Storico paginato `GET /groups/:id/ledger` (admin: tutto; membro: le proprie voci e le spese), `POST /groups/:id/ledger`, `.../verify`, `.../cancel` (motivo obbligatorio per una voce già confermata).
- Notifiche `pagamento` (categoria "partite") all'organizzatore quando qualcuno dichiara e al giocatore quando è confermato.
- Migrazione: `npm run migrate` importa i `paid: true` della V1 come quote verificate (storico "importato"), una sola volta (testato).
- Frontend: stato a tre livelli nella partita (Ho pagato / Conferma / Ritira / Revoca), pagina Cassa (saldo, quote, spese, cassa comune, da confermare, riepilogo per partita, saldi degli admin, storico con dettaglio dei passaggi, registrazione di voci), interruttore della cassa comune nelle impostazioni.
- Test: 213 backend verdi (13 nuovi in `cashbox.test.js`). **Modificato un test V1** (`matches.test.js`, pagamenti): prima un giocatore poteva segnarsi "pagato" da solo e contava subito; ora conta solo dopo la conferma (requisito della V2), quindi l'asserzione sul `paidCount` è stata aggiornata e ne sono state aggiunte altre.
- Limiti: nessun import/esporta del registro (CSV); le voci di un gruppo non si spostano tra gruppi; un solo livello di ruoli (admin/organizzatore) senza un "cassiere" dedicato.

### M14 — Terzo tempo evoluto (✅)
- `GET /groups/:id/third-half?period=sempre|stagione` oppure `?season=<chiave>` (`limit` 1-100): votazioni **in corso** (scadenza, quanti hanno scelto), **storico** serata per serata (vincitori, voti per opzione, partecipazione, risultato) e **statistiche** (serate, voti, partecipazione, preferenze con vittorie e quota di voti, premio più scelto con parità, serie di vittorie consecutive della stessa opzione). Solo dati aggregati: chi ha votato cosa resta anonimo. Le votazioni scadute vengono chiuse prima della lettura.
- "Chi perde offre il primo giro": resta facoltativo e **solo informativo** (compare nello storico se il gruppo lo ha attivato, con il pareggio "alla romana"); nessun importo, nessun debito, nessun legame con la cassa (verificato nei test).
- Frontend: pagina `/gruppi/:id/terzo-tempo` con selettore stagione, votazioni in corso con conto alla rovescia, premiazione animata del premio più scelto (statica con le animazioni ridotte), statistiche, preferenze e storico; nella scheda della partita la scadenza del voto è ora ben visibile con il conto alla rovescia. Risultati in tempo reale già presenti (`voting:updated`).
- Corretto un difetto grafico: le barre `.progress` fuori dalle righe delle classifiche non si vedevano (elemento `inline`).
- Test: 221 backend verdi (8 nuovi in `thirdHalf.test.js`).

### M15 — BONWRAPPED (✅)
- `GET /groups/:id/wrapped?season=corrente|sempre|<chiave>&user=<id>` (`wrappedService`): riepilogo di un giocatore del gruppo (di default chi chiama; qualunque membro del gruppo può vedere quello di un compagno, perché le statistiche sono già visibili nel gruppo). Tutto dal motore statistico: partite ed esiti, gol (solo dove sono inseriti i marcatori, altrimenti `null`), MVP, voto medio, migliore partita, record, **momenti** (primo gol, tripletta, serie da almeno 3 vittorie, goleada da almeno 4 gol di scarto, MVP), avversario più incontrato e compagno più frequente (almeno 3 partite), premi di partita e traguardi del periodo, progressione (prima contro seconda metà delle partite valutate, solo con almeno 4 partite valutate), posizioni nelle classifiche del periodo.
- **Nessun dato inventato:** una sezione senza dati sufficienti viene omessa; con meno di 3 partite l'API risponde `enough: false` con il motivo e il frontend mostra un messaggio invece di numeri. Fuori da ogni stagione personalizzata risponde allo stesso modo, senza errori.
- Frontend: `/gruppi/:id/wrapped` con schermate in stile storie (frecce da tastiera, indicatore di avanzamento cliccabile, ingresso animato con Motion, statico con animazioni ridotte), scelta del periodo (stagione corrente, tutto, passate), "Condividi questa schermata" (menu di condivisione o download) e "Scarica tutte" come PNG verticali 1080×1920 con gli stessi dati; collegamento dal profilo giocatore (`?utente=`).
- Test: 230 backend verdi (9 nuovi in `wrapped.test.js`: dati insufficienti, fuori stagione, riepilogo, momenti, rivalità con soglia, premi e traguardi, progressione, classifiche, permessi). Verificato nel browser anche il PNG esportato.
- Non verificato: condivisione nativa su telefoni reali (nel browser di prova si usa il download).

### M16 — Revisione, sicurezza e test (✅)
- **Sicurezza backend:** `express-rate-limit` (600 richieste al minuto per IP sulle API; 20 accessi **falliti** e 20 registrazioni ogni 15 minuti; `/health` esclusa; configurabile con `RATE_LIMIT_*` e `TRUST_PROXY`), middleware `rejectOperatorKeys` che rifiuta con 400 ogni chiave con `$` o `.` in corpo, query e parametri, verifica di helmet, CORS e token. 10 test in `security.test.js` (il limite si prova con un'app creata ad hoc; nei test e nei test end-to-end è disattivato).
- **Test frontend (Vitest + Testing Library):** 37 test su utilità di calendario, navigazione (nessun collegamento morto), schermate del BONWRAPPED, componenti (variazione di posizione, stemma, maglie, feed) e pagine con API simulate (classifiche, Hall of Fame, terzo tempo, BONWRAPPED, calendario, club) in stato di caricamento, errore, vuoto e con dati.
- **End-to-end:** nuova `v2.spec.js` con due utenti (dichiarazione e conferma di un pagamento, premi, ricorrenza ed esportazione `.ics`, stemma e SVG rifiutato, classifiche, Hall of Fame, terzo tempo, BONWRAPPED); `a11y.spec.js` esteso da 13 a 26 schermate (spogliatoio, convocazioni, BONCARD, MATCHDAY, partita con premi, rivalità, Hall of Fame, calendario, club, cassa, terzo tempo, BONWRAPPED), in tema scuro e chiaro e a 390 px; scenario condiviso in `support/scenario.js`; `screenshots.spec.js` a richiesta (`SCREENSHOTS=1`) con 23 schermate a 390, 768, 1280 e 1920 px in `docs/screenshots/v2` (JPEG) e controllo dell'overflow.
- **Problemi trovati e corretti dalla revisione:** testi di spiegazione accanto a caselle e interruttori che facevano scorrere la pagina in orizzontale a 768 e 1280 px; griglia del calendario senza la struttura ARIA di righe (`aria-required-parent`); contrasto delle edizioni bloccate della BONCARD (usavano `opacity`); elenco dei vincitori dei premi dentro un elemento `role=status` (perdeva la semantica di lista); contrasto del testo arancio nel tema chiaro (4,39 → 4,87:1); barre `.progress` invisibili fuori dalle classifiche; `window.prompt` della cassa sostituito da una finestra accessibile con motivo obbligatorio.
- Esito: 240 test backend (di cui 10 di sicurezza) e 37 frontend verdi; 19 end-to-end: nella suite completa 16 verdi, mentre i 3 di accessibilità hanno segnalato i problemi elencati sopra e, dopo le correzioni, sono stati rieseguiti da soli e sono tutti verdi (4 minuti). Non è stata rifatta un'ultima esecuzione unica di tutti e 19 dopo le correzioni.
- Non verificato: lettori di schermo reali; Safari e Firefox (i test girano su Chromium); schermate su telefoni fisici.

### M17 — Documentazione e consegna (✅)
- README riscritto per la V2, `AVVIO.txt`, `docs/GUIDA_UTILIZZO.md` (percorsi 12-21), `docs/ARCHITETTURA.md` (modelli finali, sicurezza), `docs/DECISIONI.md` (29-47), nuovi `docs/API.md` e `docs/TEST.md`, questa roadmap.
- Seed non distruttivo esteso: motto e maglie del club, premi attivi, una ricorrenza del giovedì, disponibilità e registro della cassa dalle quote già segnate (ogni passo idempotente: la seconda esecuzione non crea nulla).
- Il testo del prompt originale (`PROMPT_V2.md`) non è nel repository, su richiesta.
