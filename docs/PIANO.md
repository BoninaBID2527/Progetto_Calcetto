# Piano di lavoro di BONMATCH

Il documento fissa l'architettura prima di scrivere il codice. Le scelte ambigue sono motivate in [DECISIONI.md](DECISIONI.md).

## Architettura

```
frontend (React + Vite)  ──REST /api──▶  backend (Express)  ──Mongoose──▶  MongoDB
          ▲                                   │
          └──────────── Socket.IO ◀───────────┘   (il server trasmette ciò che è già stato salvato)
```

- **Il server è la fonte di verità.** Ogni azione passa da una rotta REST. Dopo il salvataggio, un servizio di eventi (`services/realtime.js`) la trasmette alle stanze Socket.IO interessate (`group:<id>`, `user:<id>`).
- **Configurazione condivisa:** `shared/app.config.json` contiene il nome dell'app, i quattro campi, le opzioni del premio, le reazioni, i ruoli e i valori di default. Backend e frontend leggono lo stesso file, quindi un campo nuovo si aggiunge cambiando solo quella lista.
- **Backend a strati:** `routes` → `validators` (zod) → `controllers` → `services` → `models`. Gli errori passano tutti da `middleware/errorHandler.js`.

## Modelli

| Modello | Campi principali |
|---|---|
| `User` | name, email (unica), passwordHash, avatarUrl, preferredRole, foot, settings.nicknameMode |
| `RevokedToken` | jti, expiresAt (indice TTL): serve per il logout reale |
| `Group` | name, description, emoji, color, inviteCode (unico), members[{user, role, joinedAt, lastReadAt}], settings{organizers, minMatchesForRanking, loserPaysFirstRound, extraPrizeOptions} |
| `Nickname` | group, target, proposer, text, status (attivo, sostituito, rifiutato, rimosso), decidedBy |
| `Match` | group, organizer, field, startsAt, durationMinutes, costCents, slots, freeSlots, notes, status, participants[{user, response, paid}], teams, result, voting, prizePoll, reminderSentAt |
| `MvpVote` | match, voter, mvp (indice unico match + voter) |
| `Rating` | match, rater, ratee, score 1-10 (indice unico match + rater + ratee) |
| `PrizeVote` | match, voter, option (indice unico match + voter) |
| `Message` | group, author, kind (utente, sistema), text, reactions[{emoji, users}] |
| `Notification` | user, type, title, body, link, readAt |

`freeSlots` è il contatore che rende atomica l'iscrizione: un posto si prende con un solo `findOneAndUpdate` che richiede `freeSlots > 0` e lo decrementa nella stessa operazione.

## Endpoint (prefisso `/api`)

| Area | Endpoint |
|---|---|
| Sistema | `GET /health`, `GET /config` |
| Account | `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`, `PATCH /users/me` |
| Gruppi | `GET/POST /groups`, `GET /groups/invite/:code`, `POST /groups/join`, `GET/PATCH /groups/:id`, `POST /groups/:id/invite-code`, `GET /groups/:id/members`, `PATCH/DELETE /groups/:id/members/:userId`, `GET /groups/:id/prize-stats` |
| Soprannomi | `GET/POST /groups/:id/nicknames`, `POST /groups/:id/nicknames/:nid/reject`, `POST /groups/:id/nicknames/:nid/replace`, `DELETE /groups/:id/nicknames/:nid` |
| Partite | `GET/POST /groups/:id/matches`, `GET/PATCH /matches/:mid`, `POST /matches/:mid/status`, `PUT /matches/:mid/response`, `PATCH /matches/:mid/participants/:userId/payment` |
| Squadre | `POST /matches/:mid/teams/balance`, `PUT /matches/:mid/teams` |
| Dopo partita | `PUT /matches/:mid/result`, `GET /matches/:mid/voting`, `POST /matches/:mid/mvp-vote`, `POST /matches/:mid/ratings`, `POST /matches/:mid/prize-vote`, `POST /matches/:mid/voting/close`, `GET /matches/:mid/report` |
| Classifiche | `GET /groups/:id/rankings?period=mese\|stagione\|sempre` |
| Chat | `GET/POST /groups/:id/messages`, `POST /groups/:id/messages/:msgId/reactions`, `POST /groups/:id/messages/read` |
| Notifiche | `GET /notifications`, `POST /notifications/:nid/read`, `POST /notifications/read-all` |

## Eventi Socket.IO (dal server al client)

`match:created`, `match:updated`, `match:deleted`, `voting:updated`, `chat:message`, `chat:reaction`, `group:updated`, `notification:new`. Il client, quando si riconnette, ricarica le viste aperte e chiede i messaggi successivi all'ultimo ricevuto.

## Schermate

Landing, accesso, registrazione · elenco gruppi (crea o entra con codice) · gruppo con schede Partite, Classifiche, Chat, Membri · nuova partita con scelta grafica del campo · scheda partita (iscrizione, quote, squadre su campo, risultato, votazioni, premiazione, pagella) · notifiche · profilo · ingresso tramite link `/entra/:codice`.

## Fasi

1. Analisi e piano (questo file).
2. Backend: utenti, gruppi, soprannomi, partite con iscrizione atomica e lista d'attesa, con i test.
3. Squadre, risultato, MVP, terzo tempo e classifiche, con i test.
4. Chat, notifiche e Socket.IO, con i test.
5. Design system e schermate del frontend.
6. Seed, test end-to-end, accessibilità e screenshot responsive.
7. Documentazione e consegna.
