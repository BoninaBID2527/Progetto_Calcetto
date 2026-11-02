# Architettura di BONMATCH V2

## Principi

1. **Il server è la fonte di verità.** Ogni azione passa da una rotta REST autorizzata; solo dopo il salvataggio partono, in quest'ordine: attività del feed, notifiche (in-app e push filtrate dalle preferenze), evento Socket.IO.
2. **Atomicità.** Ogni posto, voto o conversione si decide con una sola operazione condizionata (`findOneAndUpdate` con filtro) o con un indice unico. Le ripetizioni sono innocue (idempotenza).
3. **Un solo motore statistico.** `services/statsEngine.js` trasforma le partite giocate in righe "giocatore × partita". Classifiche, BONCARD, BONRATING, rivalità, Hall of Fame e BONWRAPPED leggono da lì.
4. **Dati reali o niente.** Ogni valore calcolato espone il numero di campioni; sotto la soglia minima il valore è "provvisorio" o "non disponibile", mai inventato.
5. **Compatibilità.** I campi nuovi hanno default; nessun documento esistente va riscritto per funzionare.

```
React (Vite, PWA) ──REST──▶ Express ──▶ servizi di dominio ──▶ Mongoose ──▶ MongoDB
     ▲   ▲                                   │
     │   └──── Socket.IO (solo trasmissione) ◀┤
     └──────── Web Push (service worker) ◀────┘ pushService (web-push, VAPID)
```

## Modelli

### Esistenti, estesi

| Modello | Campi nuovi |
|---|---|
| `User` | `notificationPrefs { push: Boolean, categories { boncall, partite, promemoria, risultati, social }, quietHours { enabled, start: "23:00", end: "08:00" }, maxPushPerHour: 6 }`, `settings.motion: "auto" \| "ridotto"` |
| `Group` | `motto`, `secondaryColor`, `crestUrl`, `coverUrl`, `kits { light, dark }`, `settings.season { mode: "annuale" \| "trimestrale" \| "mensile" \| "personalizzata", startMonth: 9 }`, `settings.awards { portiere, difensore, bomber, sorpresa, ironico { enabled, label } }`, `settings.cashbox: Boolean` |
| `Match` | `fromPoll` (indice unico parziale), `series`, `occurrenceKey` (indice unico `{series, occurrenceKey}`), `awards [{ key, label, mode }]`, `awardWinners [{ key, users }]`, `participants[].payment: "da_pagare" \| "dichiarato" \| "verificato"` (il vecchio `paid` resta, derivato) |
| `Rating` | `attributes { vel, tir, pas, dri, dif, fis }` facoltativi, ognuno 1-10 |
| `Notification` | `category`, `dedupeKey` (unico per utente quando presente), `pushedAt`, `pushStatus` |

### Nuovi

| Modello | Campi |
|---|---|
| `Poll` (BONCALL) | `group, author, mode: "fissa" \| "opzioni", field, startsAt, options [{ key, startsAt, field }], playersNeeded, durationMinutes, costCents, notes, deadline, responses [{ user, response: "ci_sono" \| "attesa" \| "forse" \| "non_ci_sono", options [key], respondedAt, waitlistedAt }], freeSlots, status: "aperta" \| "completa" \| "scaduta" \| "convertita" \| "annullata", match, chosenOption, alerts { reminder, missing2, missing1, deadline, completed }` |
| `PushSubscription` | `user, endpoint (unico), keys { p256dh, auth }, userAgent, lastSuccessAt, failureCount` |
| `Activity` | `group, type, actor, target, match, poll, data, createdAt` |
| `Season` | `group, name, startsAt, endsAt` (solo per la modalità "personalizzata") |
| `AwardVote` | `match, voter, award, nominee` (unico `{match, voter, award}`) |
| `Achievement` | `user, group, key, match, unlockedAt` (unico `{user, group, key}`) |
| `Rivalry` | `group, users [a, b], createdBy, status: "proposta" \| "attiva" \| "rifiutata"` |
| `MatchSeries` | `group, organizer, field, weekday, time "HH:MM", durationMinutes, slots, costCents, notes, startDate, endDate, active` |
| `LedgerEntry` | `group, kind: "quota" \| "versamento" \| "spesa" \| "rimborso", match, member, amountCents, status: "dichiarato" \| "verificato" \| "annullato", note, createdBy, verifiedBy, verifiedAt, history [{ at, by, action }]` |

## BONCALL

- **Modalità fissa:** giorno, ora e campo decisi. Le risposte "Ci sono" usano `freeSlots` come le partite: un solo `findOneAndUpdate` condizionato, lista d'attesa FIFO, nessuno scavalca chi aspetta.
- **Modalità a opzioni:** da 2 a 5 alternative (data, ora, campo). Chi risponde "Ci sono" indica per quali alternative è disponibile. Quando un'alternativa raggiunge `playersNeeded` la convocazione diventa "completa" e quella è l'opzione proposta.
- **Stati:** `aperta → completa → convertita`, oppure `scaduta` (scadenza passata senza conversione) o `annullata`. Se dopo il completamento qualcuno si ritira, la convocazione torna "aperta" e parte l'avviso "si è liberato un posto".
- **Conversione idempotente:** `POST /polls/:id/convert` crea la partita con `fromPoll` = id della convocazione. L'indice unico su `Match.fromPoll` rende impossibile crearne due: se esiste già, si restituisce quella. Le iscrizioni passano alla partita (confermati, lista d'attesa, incerti).
- **Avvisi, ognuno al massimo una volta** grazie a `alerts` (claim atomico) e a `dedupeKey`: nuova convocazione (tutti tranne l'autore), promemoria a chi non ha risposto (a metà del tempo), mancano 2 e mancano 1, scadenza vicina (2 ore prima, all'autore), completata (all'autore), posto libero, confermata (ai partecipanti), sostituto cercato (ritiro da una partita al completo senza lista d'attesa).

## Notifiche e push

- `notificationService.notify(users, payload)` crea sempre la notifica in-app (con `dedupeKey` per evitare doppioni), la trasmette via Socket.IO e chiede a `pushService` l'invio push.
- `pushService` invia solo se: VAPID configurato, preferenza `push` attiva, categoria attiva, fuori dalle fasce silenziose (fuso `Europe/Rome`), sotto `maxPushPerHour`. Le subscription che rispondono 404/410 vengono eliminate. Il trasporto è sostituibile per i test.
- Il permesso del browser si chiede solo dopo un clic esplicito nel profilo. Su iOS le push web funzionano solo con la PWA installata nella schermata Home (iOS 16.4+); l'interfaccia lo spiega.

## BONCARD e BONRATING

**Voto generale (G)**, scala 1-10, media bayesiana dei voti ricevuti con 4 voti "fantasma" da 5: `G = (Σ voti + 4 × 5) / (n + 4)`. Un singolo voto sposta poco.

**Attributi** VEL, TIR, PAS, DRI, DIF, FIS: stessa formula con 3 voti fantasma, mostrati su scala 10-99. Con 0 voti l'attributo è "non disponibile", con meno di 3 è "provvisorio".

**Overall tecnico (T)**: media pesata per ruolo degli attributi disponibili (servono almeno 3 attributi valutati):

| Ruolo | VEL | TIR | PAS | DRI | DIF | FIS |
|---|---|---|---|---|---|---|
| portiere | 15 | 5 | 20 | 5 | 30 | 25 |
| difensore | 15 | 5 | 15 | 5 | 35 | 25 |
| centrocampista | 15 | 15 | 30 | 20 | 10 | 10 |
| attaccante | 20 | 35 | 10 | 20 | 5 | 10 |
| non indicato | pesi uguali |

**Forma (F)**: media dei voti nelle ultime 5 partite valutate meno G, limitata a ±1.

**Overall** = `round(clamp(10 × (B + 0,5 × F), 40, 99))` con `B = 0,6 × G + 0,4 × T` se T esiste, altrimenti `B = G`. È "provvisorio" sotto le 3 partite giocate o i 5 voti ricevuti. Le tre componenti (tecnica, forma, statistiche oggettive) sono esposte separatamente.

**Edizioni** (si mostra la più alta per priorità; i requisiti sono esposti dall'API):

| Edizione | Requisito |
|---|---|
| Leggenda del Gruppo | almeno 50 presenze o 10 MVP nel gruppo |
| Team of the Season | tra i primi 5 de "I più forti" nella stagione precedente conclusa |
| MVP | MVP dell'ultima partita del gruppo con votazione chiusa |
| Bomber | capocannoniere della stagione in corso con almeno 3 gol |
| In Forma | media degli ultimi 3 voti almeno 7 e almeno G + 0,5 |
| Base | sempre |

Il contesto (gruppo o carriera) è sempre dichiarato. La carriera somma tutti i gruppi ed è visibile solo al diretto interessato.

## Stagioni

Ogni gruppo sceglie la modalità: annuale (default, dal mese di inizio, 1 settembre come in V1), trimestrale, mensile o personalizzata (stagioni create dall'admin, senza sovrapposizioni). Le stagioni sono finestre temporali sulle partite: nessuna statistica viene mai cancellata o archiviata a parte.

## Endpoint nuovi (prefisso `/api`)

| Area | Endpoint |
|---|---|
| Dashboard | `GET /groups/:id/dashboard`, `GET /groups/:id/activity?before=` |
| BONCALL | `GET/POST /groups/:id/polls`, `GET /polls/:pid`, `PUT /polls/:pid/response`, `POST /polls/:pid/convert`, `POST /polls/:pid/cancel` |
| Push | `GET /push/config`, `POST /push/subscriptions`, `DELETE /push/subscriptions`, `POST /push/test` |
| Giocatori | `GET /groups/:id/players/:userId/card?scope=gruppo\|carriera`, `GET /groups/:id/players/:userId/progression`, `GET /groups/:id/players/:userId/achievements` |
| MATCHDAY | `GET /matches/:mid/matchday` |
| Rivalità | `GET /groups/:id/rivalries`, `GET /groups/:id/rivalries/:userId?with=`, `POST /groups/:id/rivalries`, `POST /rivalries/:rid/accept`, `POST /rivalries/:rid/decline` |
| Stagioni | `GET /groups/:id/seasons`, `POST /groups/:id/seasons`, `DELETE /groups/:id/seasons/:sid`, `GET /groups/:id/rankings?season=`, `GET /groups/:id/hall-of-fame` |
| Premi | `GET /matches/:mid/awards`, `POST /matches/:mid/awards/:key/vote`, `POST /matches/:mid/awards/:key/assign` |
| Club | `POST/DELETE /groups/:id/crest`, `POST/DELETE /groups/:id/cover`, `GET /groups/:id/stats` |
| Calendario | `GET /groups/:id/calendar?from=&to=`, `GET /groups/:id/calendar.ics`, `GET /matches/:mid/ics`, `GET/POST /groups/:id/series`, `PATCH/DELETE /series/:sid` |
| Cassa | `GET /groups/:id/ledger`, `POST /groups/:id/ledger`, `POST /ledger/:eid/verify`, `POST /ledger/:eid/cancel`, `PATCH /matches/:mid/participants/:userId/payment` (esteso) |
| Terzo tempo | `GET /groups/:id/third-half?season=` |
| BONWRAPPED | `GET /groups/:id/wrapped?season=&userId=` |

## Sicurezza

- Rate limiting: rotte di accesso 20 richieste ogni 15 minuti per IP, API 600 al minuto (configurabili; alti nei test).
- Difesa contro l'operator injection: il middleware `rejectMongoOperators` respinge con 400 ogni chiave che inizi con `$` o contenga `.` nel corpo e nei parametri di query.
- Upload: `multer` in memoria, dimensione massima, tipo verificato dai primi byte (PNG, JPEG, WebP; niente SVG), salvato come data URL.
- Socket.IO: il client non può inviare azioni; le stanze le decide il server.
- Subscription push: solo endpoint `https`, massimo 10 per utente, cancellazione solo delle proprie.

## Frontend

- Librerie: `lucide-react` (unica famiglia di icone, dietro il componente `Icon`), `motion` (transizioni e reveal, sempre con `useReducedMotion`), font Barlow Condensed, Space Grotesk e Inter da `@fontsource`.
- `components/ui/`: Button, IconButton, Card, Modal, BottomSheet, ConfirmDialog, Tabs, SegmentedControl, Avatar, Badge, ProgressBar, Skeleton, Tooltip, EmptyState, FormField, StatCard, NotificationItem, LeaderboardRow, CountUp, Countdown.
- `components/brand/BrandLogo`: varianti completa, compatta, monocromatica, per sfondo chiaro e scuro; il logo definitivo si sostituisce in un solo file.
- PWA: `manifest.webmanifest`, icone PNG, `sw.js` scritto a mano (rete prima per le pagine con pagina offline, cache per gli asset con hash, **mai** cache per `/api` e `/socket.io`).
