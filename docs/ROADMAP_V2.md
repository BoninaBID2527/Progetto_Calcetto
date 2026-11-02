# BONMATCH V2 — NIGHT LEAGUE: roadmap

Documento vivo: lo aggiorno alla fine di ogni milestone. Se il lavoro si interrompe, si riprende dalla prima milestone non marcata ✅ nella tabella "Avanzamento".

## Avanzamento

| # | Milestone | Stato |
|---|---|---|
| M0 | Audit del repository e roadmap | ✅ |
| M1 | Architettura dei nuovi modelli e contratti API (docs/ARCHITETTURA.md) | ✅ |
| M2 | Design system NIGHT LEAGUE: token, font, Lucide, Motion, componenti, shell responsive | ✅ |
| M3 | Dashboard "Spogliatoio" con hero MATCHDAY, azioni rapide, feed attività; restyling gruppi e partite | ✅ |
| M4 | BONCALL: convocazioni, risposte atomiche, conversione idempotente, promemoria, notifiche in-app | ⏳ |
| M5 | PWA e Web Push (service worker, VAPID, subscription, preferenze, fasce silenziose) | ⏳ |
| M6 | BONCARD e BONRATING (attributi, overall, edizioni, progressione, esportazione PNG) | ⏳ |
| M7 | MATCHDAY e formazioni, Bilancia migliorato, locandina esportabile | ⏳ |
| M8 | Rivalità | ⏳ |
| M9 | Stagioni, nuove classifiche, Hall of Fame | ⏳ |
| M10 | Premi partita e achievement | ⏳ |
| M11 | Club personalizzati (stemma, colori, maglie, copertina) | ⏳ |
| M12 | Calendario intelligente e partite ricorrenti | ⏳ |
| M13 | Cassa del gruppo (registro dichiarato/verificato) | ⏳ |
| M14 | Terzo tempo evoluto | ⏳ |
| M15 | BONWRAPPED | ⏳ |
| M16 | Revisione schermate, test e2e, accessibilità, responsive | ⏳ |
| M17 | Documentazione e consegna | ⏳ |

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
