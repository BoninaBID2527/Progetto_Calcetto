# API di BONMATCH

Prefisso `/api`. Autenticazione con `Authorization: Bearer <token>` (JWT restituito da registrazione e accesso, revocato dal logout). Tutti i controlli sui permessi sono sul server.

**Errori.** Sempre nella forma `{ "error": { "code", "message", "fields"? } }`, messaggi in italiano:

| Codice HTTP | `code` | Quando |
|---|---|---|
| 400 | `BAD_REQUEST`, `BAD_JSON` | richiesta malformata, id non valido, chiavi `$` o `.` nel corpo, nella query o nei parametri |
| 401 | `UNAUTHORIZED` | token assente, scaduto o revocato |
| 403 | `FORBIDDEN` | non fai parte del gruppo, o manca il ruolo richiesto |
| 404 | `NOT_FOUND` | risorsa inesistente |
| 409 | `CONFLICT` | stato incompatibile: già iscritto, partita chiusa, doppio voto, voce già confermata |
| 413 | `PAYLOAD_TOO_LARGE` | corpo o file oltre il limite |
| 422 | `VALIDATION_ERROR` | dati non validi, con `fields` per campo |
| 429 | `RATE_LIMITED` | troppe richieste (vedi sotto) |

**Limiti di frequenza** (per IP, configurabili con `RATE_LIMIT_*`): 600 richieste al minuto su tutte le API; accesso: 20 tentativi **falliti** ogni 15 minuti (quelli riusciti non contano); registrazione: 20 ogni 15 minuti. `/api/health` è esclusa. Le risposte portano le intestazioni `RateLimit-*`.

**Convenzioni.** Gli importi sono in centesimi (`*Cents`). Le date sono ISO 8601 in UTC; i giorni "di calendario" sono `AAAA-MM-GG` nel fuso del gruppo (`settings.timezone`, default `Europe/Rome`). I permessi indicati: **membro** = appartiene al gruppo; **admin** = admin del gruppo; **organizzatore** = chi ha creato la partita (o admin).

La collection [`postman/BONMATCH.postman_collection.json`](../postman/BONMATCH.postman_collection.json) percorre le API della V1; le rotte nuove sono documentate qui e coperte dai test Jest (vedi [TEST.md](TEST.md)).

---

## Account e sistema

| Metodo e percorso | Descrizione |
|---|---|
| `GET /health`, `GET /config` | stato; configurazione condivisa (nome, campi, premi, default) |
| `POST /auth/register`, `POST /auth/login` | `{ token, user }` |
| `POST /auth/logout` | revoca il token (204) |
| `GET /auth/me`, `PATCH /users/me` | profilo; foto, ruolo, piede, preferenze (soprannomi, animazioni, notifiche anche a pezzi) |
| `GET /notifications?limit=&unreadOnly=`, `POST /notifications/:id/read`, `POST /notifications/read-all` | notifiche in-app e contatore dei non lette |
| `GET /push/config`, `POST /push/subscriptions`, `DELETE /push/subscriptions`, `POST /push/test` | Web Push: chiave pubblica VAPID, sottoscrizione (solo `https`, massimo 10 per utente), prova |

## Gruppi, club e impostazioni

| Metodo e percorso | Permessi | Descrizione |
|---|---|---|
| `GET /groups`, `POST /groups` | utente | miei gruppi (con non letti), nuovo gruppo |
| `GET /groups/invite/:code`, `POST /groups/join` | utente | anteprima dell'invito, ingresso |
| `GET /groups/:id` | membro | riepilogo: identità del club (stemma, motto, colori, maglie), impostazioni |
| `PATCH /groups/:id` | admin | nome, descrizione, emoji, colore, `motto`, `secondaryColor`, `kits`, `settings` |
| `POST /groups/:id/invite-code` | admin | rigenera il codice |
| `GET /groups/:id/members`, `PATCH …/members/:userId`, `DELETE …/members/:userId` | membro / admin / admin o sé stesso | elenco, ruolo, rimozione o uscita |
| `GET /groups/:id/dashboard` | membro | home: prossima partita, votazioni da fare, statistiche personali, posizioni, feed |
| `GET /groups/:id/activity?before=&limit=` | membro | feed attività (eventi reali) |
| `GET /groups/:id/club` | membro | identità completa (con copertina) e statistiche complessive |
| `PUT /groups/:id/club/crest`, `PUT …/club/cover` | admin | caricamento `multipart/form-data` (campo `file`), PNG/JPEG/WebP verificati dai primi byte, massimo 128 KB (stemma) e 700 KB (copertina), SVG e altro rifiutati (422), oltre il limite 413 |
| `DELETE /groups/:id/club/crest`, `DELETE …/club/cover` | admin | rimozione |
| `GET /groups/:id/prize-stats` | membro | contatore dei premi del terzo tempo |

`settings` (solo admin): `organizers` (`tutti`/`admin`), `minMatchesForRanking`, `loserPaysFirstRound`, `cashbox`, `timezone` (fuso IANA valido), `season { mode, startMonth }`, `awards { portiere, difensore, bomber, sorpresa, ironico { enabled, label } }`, `extraPrizeOptions`.

## Soprannomi e rivalità

| Metodo e percorso | Descrizione |
|---|---|
| `GET /groups/:id/nicknames?userId=`, `POST /groups/:id/nicknames` | storico, nuova proposta |
| `POST …/nicknames/:nid/reject`, `POST …/replace`, `DELETE …/:nid` | rifiuta o sostituisce (destinatario), rimuove (admin) |
| `GET /groups/:id/rivalries`, `POST /groups/:id/rivalries` | rivalità naturali (almeno 3 scontri) e dichiarate; nuova proposta |
| `GET /groups/:id/rivalries/:userId?with=` | schermata VS |
| `POST /rivalries/:rid/accept`, `POST /rivalries/:rid/decline`, `DELETE /rivalries/:rid` | risposta dello sfidato, chiusura |

## Partite e BONCALL

| Metodo e percorso | Permessi | Descrizione |
|---|---|---|
| `GET /groups/:id/matches?scope=prossime\|passate\|tutte`, `POST /groups/:id/matches` | membro (creare: come da impostazione) | elenco, nuova partita |
| `GET /matches/:mid`, `PATCH /matches/:mid` | membro / organizzatore | dettaglio, modifica (una partita ricorrente modificata a mano si "stacca" dalla serie) |
| `POST /matches/:mid/status` | organizzatore | `chiusa`, `aperta`, `annullata`, `archiviata` |
| `PUT /matches/:mid/response` | membro | `ci_sono`, `forse`, `non_ci_sono`; iscrizione atomica con lista d'attesa |
| `GET /matches/:mid/matchday` | membro | locandina, convocati, valore medio, rivalità in campo |
| `GET /groups/:id/polls`, `POST /groups/:id/polls` | membro | convocazioni BONCALL |
| `GET /polls/:pid`, `PUT /polls/:pid/response`, `POST /polls/:pid/convert`, `POST /polls/:pid/cancel` | membro / autore o admin | risposta, conversione idempotente in partita, annullamento |

## Squadre, risultato, votazioni

| Metodo e percorso | Permessi | Descrizione |
|---|---|---|
| `POST /matches/:mid/teams/balance`, `PUT /matches/:mid/teams` | organizzatore | Bilancia (overall, ruoli, portieri, casualità controllata), squadre a mano |
| `PUT /matches/:mid/result` | organizzatore | risultato e marcatori; apre le votazioni (48 ore) e fissa i premi attivi |
| `GET /matches/:mid/voting` | membro | stato visto dall'utente: totali e proprio voto, mai chi ha votato cosa |
| `POST /matches/:mid/mvp-vote`, `POST /matches/:mid/ratings`, `POST /matches/:mid/prize-vote` | giocatori della partita | MVP (mai a sé stessi, un voto), voti 1-10 con abilità facoltative VEL/TIR/PAS/DRI/DIF/FIS, terzo tempo |
| `POST /matches/:mid/voting/close` | organizzatore | chiude le votazioni in anticipo |
| `GET /matches/:mid/report` | membro | pagella della serata (anche in testo) |
| `GET /matches/:mid/awards` | membro | premi della partita: modalità, voti totali, vincitori (a votazione chiusa) |
| `POST /matches/:mid/awards/:key/vote` | giocatori | voto anonimo (`portiere`, `difensore`, `sorpresa`, `ironico`); 409 se automatico o assegnato |
| `POST /matches/:mid/awards/:key/assign` | organizzatore | assegnazione esplicita (1-3 giocatori); il bomber non si assegna |

## Giocatori: BONCARD, BONRATING, traguardi

| Metodo e percorso | Descrizione |
|---|---|
| `GET /groups/:id/players/:userId/card?scope=gruppo\|carriera` | BONCARD con overall, attributi, edizioni e requisiti; la carriera solo per sé |
| `GET /groups/:id/players/:userId/progression` | andamento, forma, record, confronto tra stagioni |
| `GET /groups/:id/players/:userId/achievements` | tutti i traguardi con stato e avanzamento reale |

## Classifiche, stagioni, Hall of Fame, riepiloghi

| Metodo e percorso | Permessi | Descrizione |
|---|---|---|
| `GET /groups/:id/rankings?period=mese\|stagione\|sempre` oppure `?season=<chiave>` | membro | le 12 classifiche; ogni voce ha `previousPosition`; ogni classifica ha `requirement`, `available`, `unavailableReason` |
| `GET /groups/:id/seasons` | membro | stagioni (corrente e passate, `closed`, `current`) |
| `POST /groups/:id/seasons`, `DELETE /groups/:id/seasons/:sid` | admin | stagioni personalizzate (solo in modalità `personalizzata`; sovrapposizioni 422) |
| `GET /groups/:id/hall-of-fame` | membro | vincitori delle stagioni chiuse, record assoluti, più premiati |
| `GET /groups/:id/third-half?period=&season=&limit=` | membro | terzo tempo: votazioni in corso, storico, statistiche (aggregate, anonime) |
| `GET /groups/:id/wrapped?season=corrente\|sempre\|<chiave>&user=` | membro | BONWRAPPED di un giocatore; `enough: false` con il motivo se i dati non bastano |

## Calendario e partite ricorrenti

| Metodo e percorso | Permessi | Descrizione |
|---|---|---|
| `GET /calendar?from=&to=&group=` | utente | partite e convocazioni aperte dei propri gruppi (massimo 100 giorni) |
| `GET /calendar/export.ics?group=` | utente | file iCalendar delle partite non annullate (da 30 giorni fa a 180 avanti); richiede il token nell'intestazione |
| `GET /groups/:id/series`, `POST /groups/:id/series` | membro | partite ricorrenti; creazione (genera 28 giorni di partite, idempotente) |
| `PATCH /series/:sid`, `DELETE /series/:sid?cancelFuture=` | autore o admin | modifica del modello (solo occorrenze future aperte, senza iscritti e non staccate); fine con o senza annullamento delle prossime |
| `GET /groups/:id/availability?from=&to=`, `PUT /groups/:id/availability/:date`, `DELETE …/:date` | membro | disponibilità per giorno (`disponibile`, `forse`, `non_disponibile`), non nel passato |

## Cassa

Registro interno: nessun denaro passa da BONMATCH. Un pagamento dichiarato vale solo dopo la conferma di chi lo riceve.

| Metodo e percorso | Permessi | Descrizione |
|---|---|---|
| `PATCH /matches/:mid/participants/:userId/payment` | sé stessi o organizzatore | `{ payment: "da_pagare" \| "dichiarato" \| "verificato" }`; compatibile con `{ paid }` della V1 (dichiara per chi paga, conferma per l'organizzatore). `verificato` solo per organizzatore o admin |
| `GET /matches/:mid/payments` | membro | costo, quota, confermato, dichiarato, mancante, stato di ciascuno |
| `GET /groups/:id/cashbox` | membro | saldo personale, cassa comune (se attiva), da confermare, riepilogo per partita; saldi di tutti solo per gli admin |
| `GET /groups/:id/ledger?type=&status=&userId=&before=&limit=` | membro | storico: l'admin vede tutto, un membro le proprie voci e le spese |
| `POST /groups/:id/ledger` | membro (versamento proprio) / admin | `{ type: "versamento" \| "spesa" \| "rimborso", amountCents, note?, userId?, paidFrom?, matchId? }`; i membri dichiarano, gli admin registrano voci già verificate |
| `POST /groups/:id/ledger/:eid/verify` | admin o organizzatore della partita (quote) | conferma una voce dichiarata |
| `POST /groups/:id/ledger/:eid/cancel` | admin/organizzatore, o l'autore di una dichiarazione non confermata | annulla; motivo obbligatorio per una voce già confermata; resta nello storico |

## Chat

| Metodo e percorso | Descrizione |
|---|---|
| `GET /groups/:id/messages?before=&after=&limit=`, `POST /groups/:id/messages` | chat a pagine, nuovo messaggio |
| `POST /groups/:id/messages/:mid/reactions`, `POST /groups/:id/messages/read` | reazione (aggiungi o togli), segna come letti |

## Tempo reale (Socket.IO)

Il client si autentica con lo stesso JWT (`auth.token`) ed entra nella stanza `user:<id>` e nelle stanze `group:<id>` dei propri gruppi. Gli eventi partono **dopo** il salvataggio; il REST resta la fonte di verità e alla riconnessione ogni schermata ricarica i dati.

| Evento | Quando |
|---|---|
| `match:created`, `match:updated` | partita creata o cambiata (iscritti, lista d'attesa, stato) |
| `voting:updated` | voti MVP, terzo tempo o premi |
| `chat:message`, `chat:reaction` | chat |
| `group:updated`, `group:removed` | impostazioni, club, membri |
| `notification:new` | nuova notifica personale |
| `activity:new` | nuova voce del feed |
| `poll:updated` | convocazioni BONCALL |
| `cashbox:updated` | movimenti della cassa (solo gli identificativi, mai importi) |
