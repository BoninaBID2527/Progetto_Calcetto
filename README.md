# BONMATCH

Web app per **organizzare le partite di calcetto tra amici**. Gli utenti creano gruppi e dentro ogni gruppo scelgono campo, data e ora, raccolgono le iscrizioni con lista d'attesa automatica, fanno squadre equilibrate, inseriscono il risultato, votano l'MVP e il "terzo tempo" (birra, pizza o panino). Partita dopo partita l'app costruisce le classifiche del gruppo. Chat e aggiornamenti sono in tempo reale.

Il nome è in un'unica costante: `appName` in [`shared/app.config.json`](shared/app.config.json), letto sia dal backend sia dal frontend. Nello stesso file ci sono i quattro campi (Cambiano, Santena, Moncalieri, Villastellone), le opzioni del premio, le reazioni della chat e i valori di default. Per aggiungere un campo basta aggiungere una riga a quella lista (il simbolo si sceglie tra `campanile`, `asparago`, `castello`, `stella`, `pallone`).

![Scheda partita su desktop](docs/screenshots/votazione-1280.jpg)

## Cosa fa

- **Account:** registrazione, accesso, logout reale (il token viene revocato sul server), profilo con foto (o iniziali colorate), ruolo preferito e piede.
- **Gruppi:** creazione con nome, descrizione, emoji e colore; ingresso con codice di 6 caratteri o link `/entra/CODICE`; l'admin rigenera il codice, rimuove membri e nomina altri admin. Un utente può stare in più gruppi.
- **Soprannomi:** ogni membro può darne uno a un altro; il destinatario può rifiutarlo o sostituirlo, l'admin può rimuoverlo; lo storico conserva chi ha proposto cosa. Ognuno sceglie se vedere i soprannomi accanto al nome o al posto del nome.
- **Partite:** campo scelto da schede grafiche, data, ora, durata, costo, posti (10 di default), note. Stati `aperta → chiusa → giocata → archiviata` più `annullata`. Iscrizione "Ci sono / Forse / Non ci sono" con lista d'attesa: chi si ritira lascia il posto al primo in lista, che entra da solo e riceve una notifica. Quota a testa e pagamenti.
- **Squadre:** a mano o con il pulsante **Bilancia** (media dei voti ricevuti, 5 per i nuovi, con un po' di casualità), visualizzate su un campo visto dall'alto con animazione di estrazione.
- **Dopo la partita:** risultato e marcatori, votazione MVP (un voto, mai a sé stessi, 48 ore o finché votano tutti, parità condivisa), voti 1-10 anonimi, sondaggio del terzo tempo con premiazione animata e regola facoltativa "chi perde offre il primo giro", pagella della serata condivisibile come immagine o testo.
- **Classifiche:** I più forti, MVP, I più vincenti, Il club di chi non vince mai, I più presenti, Bomber; filtri mese, stagione, sempre; podio e dettagli con barre.
- **Chat:** tempo reale, nomi o soprannomi, cronologia a pagine, nuovi messaggi non letti, reazioni rapide, messaggi di sistema.
- **Notifiche in-app:** nuova partita, promozione dalla lista d'attesa, partita chiusa o annullata, risultato, votazione aperta, soprannome ricevuto, promemoria il giorno prima.

## Requisiti

- **Node.js 20 o più recente** (consigliato 22) con npm.
- **MongoDB 6 o 7**: il modo più semplice è Docker Desktop con il `docker-compose.yml` incluso (avvia solo MongoDB).
- Un browser recente. Per i test end-to-end serve Chromium di Playwright (`npx playwright install chromium`).

## Avvio rapido su Windows PowerShell

Servono tre finestre di PowerShell, tutte aperte nella cartella del progetto.

**Finestra 1: MongoDB con Docker**

```powershell
docker compose up -d
```

**Finestra 2: backend** (API su http://localhost:4000/api)

```powershell
cd backend
Copy-Item .env.example .env
npm install
npm run seed
npm run dev
```

**Finestra 3: frontend** (http://localhost:5173)

```powershell
cd frontend
npm install
npm run dev
```

Apri http://localhost:5173 e accedi con `marco@calcetto.test` / `calcetto2026`. Tutti gli account di prova sono elencati più sotto.

> **Senza Docker?** Per una prova veloce puoi usare l'emulatore di sviluppo al posto di MongoDB: nella finestra 1 esegui `cd backend` e poi `npm run db:lite`. I dati restano solo in memoria e si perdono alla chiusura; non è adatto all'uso reale (vedi [docs/DECISIONI.md](docs/DECISIONI.md)).

Su macOS e Linux i comandi sono gli stessi, con `cp .env.example .env` al posto di `Copy-Item`.

## Account di esempio

Il comando `npm run seed` (nella cartella `backend`) crea i dati **solo se mancano**: non cancella mai nulla e rifiuta di partire con `NODE_ENV=production`. Password di tutti gli account: **`calcetto2026`**.

| Email | Nome | Soprannome | Ruolo | Note |
|---|---|---|---|---|
| marco@calcetto.test | Marco Rossi | Il Sindaco | centrocampista | **admin** di "Calcetto del giovedì", membro di "Amici del lunedì" |
| luca@calcetto.test | Luca Bianchi | Cesarini | attaccante | admin di entrambi i gruppi |
| andrea@calcetto.test | Andrea Ferrero | La Saracinesca | portiere | |
| davide@calcetto.test | Davide Gallo | Il Muro | difensore | |
| simone@calcetto.test | Simone Rinaldi | Turbo | attaccante | anche nel gruppo del lunedì |
| matteo@calcetto.test | Matteo Bruno | Piedi Buoni | centrocampista | anche nel gruppo del lunedì |
| stefano@calcetto.test | Stefano Costa | Il Professore | difensore | |
| paolo@calcetto.test | Paolo Ghigo | Gattone | portiere | in lista d'attesa per la partita di Santena |
| federico@calcetto.test | Federico Marino | Bomber | attaccante | anche nel gruppo del lunedì |
| alessandro@calcetto.test | Alessandro Greco | (nessuno) | centrocampista | in lista d'attesa in entrambi i gruppi |

Il seed crea anche 2 gruppi, 11 partite giocate sui quattro campi (con risultati, marcatori, voti, MVP e premi; l'ultima ha le votazioni ancora aperte), 3 partite future (due al completo con lista d'attesa), messaggi di chat con reazioni, soprannomi con storico e qualche notifica. I percorsi di prova guidati sono in [docs/GUIDA_UTILIZZO.md](docs/GUIDA_UTILIZZO.md).

## Variabili d'ambiente

Backend (`backend/.env`, parti da `backend/.env.example`):

| Variabile | Default | Significato |
|---|---|---|
| `NODE_ENV` | `development` | `production` richiede `JWT_SECRET` e blocca il seed |
| `PORT` | `4000` | porta delle API |
| `MONGODB_URI` | `mongodb://127.0.0.1:27017/bonmatch` | database dell'app |
| `MONGODB_URI_TEST` | `mongodb://127.0.0.1:27017/bonmatch_test` | database usato **solo** dai test (il nome deve contenere "test") |
| `JWT_SECRET` | segreto di sviluppo | stringa lunga e casuale, obbligatoria in produzione |
| `JWT_EXPIRES_IN` | `7d` | durata dei token |
| `CLIENT_ORIGIN` | `http://localhost:5173` | origini ammesse da CORS e Socket.IO (separate da virgola) |
| `SCHEDULER_ENABLED` | `true` | promemoria, chiusura automatica, fine votazioni |
| `SCHEDULER_INTERVAL_MS` | `60000` | ogni quanto gira il programma periodico |

Frontend (`frontend/.env`, facoltativo): `VITE_BACKEND_URL` (default `http://localhost:4000`), usato dal proxy di Vite per `/api` e `/socket.io`.

## Struttura

```
backend/            API Express, Socket.IO, Mongoose
  src/config/       variabili d'ambiente e configurazione condivisa
  src/models/       modelli Mongoose
  src/routes/       rotte REST
  src/validators/   schemi zod (messaggi in italiano)
  src/middleware/   autenticazione, accesso a gruppi e partite, errori
  src/controllers/  strato sottile tra rotte e servizi
  src/services/     logica: partite, squadre, votazioni, classifiche, chat, notifiche
  src/socket/       autenticazione e stanze Socket.IO
  src/jobs/         programma periodico
  src/scripts/      seed
  dev/mongo-lite/   emulatore MongoDB per sviluppo e test (non per l'uso reale)
  tests/            test Jest + Supertest
frontend/           React + Vite, CSS con design token
  src/styles/       token, base, componenti, layout, pagine
  src/components/   componenti (icone, logo, campo, podio, pannelli della partita)
  src/pages/        schermate
  src/context/      autenticazione, tempo reale, dati dell'app, toast, tema
  public/brand/     logo in versione chiara e scura
shared/             app.config.json: nome, campi, premi, default
e2e/                test Playwright + axe-core
postman/            collection con test sui codici HTTP
docs/               piano, decisioni, guida d'uso, screenshot
```

## Modelli

| Modello | Contenuto |
|---|---|
| `User` | nome, email unica, hash bcrypt, foto, ruolo, piede, preferenza soprannomi |
| `RevokedToken` | identificativo dei token chiusi con il logout (si cancellano da soli alla scadenza) |
| `Group` | nome, descrizione, emoji, colore, codice invito unico, membri con ruolo e ultima lettura della chat, impostazioni |
| `Nickname` | gruppo, destinatario, proponente, testo, stato (attivo, sostituito, rifiutato, rimosso) |
| `Match` | gruppo, organizzatore, campo, data, durata, costo, posti, posti liberi, stato, iscritti, squadre, risultato, votazione, sondaggio premio |
| `MvpVote`, `Rating`, `PrizeVote` | voti anonimi; indici unici impediscono il doppio voto |
| `Message` | gruppo, autore (vuoto per i messaggi di sistema), testo, reazioni |
| `Notification` | destinatario, tipo, titolo, testo, link, letta |

**Iscrizione atomica.** Il campo `freeSlots` è il contatore dei posti liberi. Un posto si prende con un solo `findOneAndUpdate` che richiede `freeSlots > 0` (e che nessuno sia in lista d'attesa) e lo decrementa nella stessa operazione: due richieste contemporanee per l'ultimo posto non possono riuscire entrambe. Chi si ritira incrementa il contatore e il primo in lista entra con un'altra operazione atomica condizionata. I test lo verificano con richieste in parallelo.

## Permessi

Tutti i controlli sono sul server. Chi non è nel gruppo riceve **403** su tutto ciò che riguarda il gruppo, le sue partite e la sua chat.

| Azione | Visitatore | Utente | Membro | Organizzatore della partita | Admin del gruppo |
|---|:-:|:-:|:-:|:-:|:-:|
| Landing, accesso, registrazione | ✓ | ✓ | ✓ | ✓ | ✓ |
| Creare gruppi, entrare con codice o link | | ✓ | ✓ | ✓ | ✓ |
| Vedere partite, classifiche, chat, membri | | | ✓ | ✓ | ✓ |
| Iscriversi, votare, scrivere in chat, dare soprannomi | | | ✓ | ✓ | ✓ |
| Creare partite | | | ✓ se il gruppo lo consente | ✓ | ✓ |
| Modificare la partita, cambiarne lo stato, fare le squadre, inserire il risultato, chiudere le votazioni, segnare i pagamenti altrui | | | | ✓ | ✓ |
| Gestire membri, codice invito, impostazioni, rimuovere soprannomi | | | | | ✓ |

Il destinatario di un soprannome è l'unico che può rifiutarlo o sostituirlo. Le email non compaiono mai nelle risposte destinate a chi non è nel gruppo (le API delle partite, della chat e delle classifiche non le includono mai; solo l'elenco membri le mostra agli altri membri).

## API

Prefisso `/api`. Autenticazione con `Authorization: Bearer <token>`. Gli errori hanno sempre la forma `{ "error": { "code", "message", "fields"? } }` con codici 400 (richiesta malformata o id non valido), 401, 403, 404, 409 (conflitto: già iscritto, partita chiusa, doppio voto…), 422 (validazione, con un messaggio per campo) e 500.

| Metodo e percorso | Descrizione |
|---|---|
| `GET /health`, `GET /config` | stato e configurazione condivisa |
| `POST /auth/register`, `POST /auth/login` | restituiscono `{ token, user }` |
| `POST /auth/logout` | revoca il token (204) |
| `GET /auth/me`, `PATCH /users/me` | profilo |
| `GET /groups`, `POST /groups` | miei gruppi (con non letti), nuovo gruppo |
| `GET /groups/invite/:code`, `POST /groups/join` | anteprima dell'invito, ingresso |
| `GET /groups/:id`, `PATCH /groups/:id` | dettaglio, modifica e impostazioni (admin) |
| `POST /groups/:id/invite-code` | rigenera il codice (admin) |
| `GET /groups/:id/members`, `PATCH /groups/:id/members/:userId`, `DELETE /groups/:id/members/:userId` | membri, ruolo (admin), rimozione o uscita |
| `GET /groups/:id/prize-stats` | contatore dei premi |
| `GET /groups/:id/nicknames?userId=`, `POST /groups/:id/nicknames` | storico, nuovo soprannome |
| `POST /groups/:id/nicknames/:nid/reject`, `POST …/replace`, `DELETE …/:nid` | rifiuta, sostituisci (destinatario), rimuovi (admin) |
| `GET /groups/:id/matches?scope=prossime\|passate\|tutte`, `POST /groups/:id/matches` | elenco, nuova partita |
| `GET /matches/:mid`, `PATCH /matches/:mid` | dettaglio, modifica |
| `POST /matches/:mid/status` | `chiusa`, `aperta`, `annullata`, `archiviata` |
| `PUT /matches/:mid/response` | `ci_sono`, `forse`, `non_ci_sono`; restituisce l'esito (`ci_sono` o `attesa`) e chi è entrato dalla lista |
| `PATCH /matches/:mid/participants/:userId/payment` | pagato o da pagare |
| `POST /matches/:mid/teams/balance`, `PUT /matches/:mid/teams` | Bilancia, squadre a mano |
| `PUT /matches/:mid/result` | risultato e marcatori (apre le votazioni) |
| `GET /matches/:mid/voting` | stato delle votazioni visto dall'utente (solo totali e il proprio voto) |
| `POST /matches/:mid/mvp-vote`, `POST /matches/:mid/ratings`, `POST /matches/:mid/prize-vote` | voti |
| `POST /matches/:mid/voting/close` | chiude le votazioni in anticipo |
| `GET /matches/:mid/report` | pagella della serata (anche in testo) |
| `GET /groups/:id/rankings?period=mese\|stagione\|sempre` | le sei classifiche |
| `GET /groups/:id/messages?before=&after=&limit=`, `POST /groups/:id/messages` | chat a pagine, nuovo messaggio |
| `POST /groups/:id/messages/:msgId/reactions`, `POST /groups/:id/messages/read` | reazione (aggiungi o togli), segna come letti |
| `GET /notifications`, `POST /notifications/:nid/read`, `POST /notifications/read-all` | notifiche |

La collection [postman/BONMATCH.postman_collection.json](postman/BONMATCH.postman_collection.json) percorre le API in ordine con un test sul codice HTTP di ogni risposta.

## Tempo reale

- Ogni azione passa dalle API REST. Solo **dopo** il salvataggio il servizio `realtime` trasmette l'evento: il server resta la fonte di verità.
- Il client Socket.IO si autentica con lo stesso JWT (`auth.token`). Alla connessione entra nella stanza personale `user:<id>` e nelle stanze `group:<id>` dei suoi gruppi; quando entra o esce da un gruppo le stanze si aggiornano subito. Al logout i socket aperti con quel token vengono chiusi.
- Eventi: `match:created`, `match:updated` (presenti e lista d'attesa dal vivo), `voting:updated`, `chat:message`, `chat:reaction`, `group:updated`, `group:removed`, `notification:new`.
- In alto c'è l'indicatore "In diretta / Riconnessione / Non in linea". La riconnessione è automatica; quando torna la connessione ogni schermata ricarica i propri dati e la chat chiede i messaggi successivi all'ultimo ricevuto (`?after=`).
- Un programma periodico (ogni minuto) invia i promemoria il giorno prima a chi non ha risposto, chiude le iscrizioni all'orario d'inizio e chiude le votazioni scadute. Le votazioni scadute si chiudono anche quando qualcuno apre la partita.

## Come sono calcolate le classifiche

Contano solo le partite giocate (stato `giocata` o `archiviata`) con risultato, nel periodo scelto: `mese` (mese di calendario), `stagione` (dal 1° settembre), `sempre`. Per comparire serve il numero minimo di partite del gruppo (default 3, si cambia nelle impostazioni). A parità di valore la posizione è condivisa.

| Classifica | Calcolo |
|---|---|
| I più forti | media dei voti 1-10 ricevuti + 2 × (MVP vinti ÷ partite giocate); senza voti si parte da 5. A parità conta chi ha più MVP |
| MVP | volte eletto MVP (un MVP condiviso vale uno a testa); compare chi ne ha almeno uno |
| I più vincenti | partite vinte ÷ partite giocate (vince la squadra con più gol) |
| Il club di chi non vince mai | percentuale di vittorie più bassa con almeno 5 partite; a pari merito sale chi ha perso più partite di un solo gol |
| I più presenti | partite giocate ÷ partite giocate dal gruppo da quando la persona è entrata |
| Bomber | gol segnati, solo nelle partite con marcatori inseriti |

Il calcolo è una funzione pura (`backend/src/services/rankingService.js`) coperta da test sui casi limite.

## Test

```powershell
cd backend
npm test
```

101 test Jest + Supertest su un **database di prova separato**: autenticazione e revoca, permessi 401/403, gruppi, soprannomi, iscrizione con lista d'attesa e richieste concorrenti, algoritmo Bilancia, risultato, MVP (niente voto a sé stessi, un voto solo, parità, scadenza), premio, ogni classifica con casi limite, chat, notifiche, Socket.IO e programma periodico. Se MongoDB su `MONGODB_URI_TEST` non risponde, i test avviano l'emulatore mongo-lite e lo scrivono nel terminale.

```powershell
cd e2e
npm install
npx playwright install chromium
npm test
```

9 test Playwright: avviano da soli un database di prova, il backend (porta 4100) e il frontend (porta 5174). Coprono due utenti contemporanei (iscrizione dal vivo, lista d'attesa che scorre, chat con reazioni, voto MVP e premio), registrazione, logout e invito via link, **axe-core** (WCAG 2.1 AA) su 13 schermate in tema scuro e chiaro e l'assenza di scorrimento orizzontale a 390 px. Per usare un MongoDB vero: `$env:E2E_MONGODB_URI="mongodb://127.0.0.1:27017/bonmatch_e2e_test"`.

Postman: importa la collection e avviala in ordine, oppure `npx newman run postman/BONMATCH.postman_collection.json` con il backend acceso.

## Design

Concept "spogliatoio moderno": verde notte `#0B1F1A`, verde prato elettrico `#2EE59D` per le azioni, arancio tramonto e giallo cartellino per premi e podio, rosso cartellino per gli avvisi. Tema chiaro curato con le varianti di colore scurite per il contrasto. Titoli e numeri in Barlow Condensed, testo in Inter, entrambi caricati in locale con `@fontsource` (licenza SIL Open Font License). Icone, logo, simboli dei campi e illustrazioni del terzo tempo sono SVG disegnati a mano. Le animazioni durano 150-250 ms e si disattivano con `prefers-reduced-motion`. Gli screenshot a 390, 768, 1280 e 1920 px sono in [docs/screenshots](docs/screenshots).

## Limiti noti

- **Verifiche su MongoDB reale:** nell'ambiente in cui il progetto è stato sviluppato MongoDB non era installabile, quindi test, seed, end-to-end e Postman sono stati eseguiti sull'emulatore mongo-lite. Il codice usa solo Mongoose standard, ma il comportamento su un MongoDB vero va confermato eseguendo `npm test` con Docker acceso.
- Le notifiche sono solo in-app (niente email o push).
- Niente recupero password né verifica dell'email.
- Nessun limite al numero di richieste (rate limiting) sulle rotte di accesso.
- La foto profilo è salvata nel database come immagine ridotta (data URL di circa 20-60 KB), non in uno storage di file.
- Chi viene rimosso da un gruppo resta tra gli iscritti delle partite già aperte: per ora non c'è un comando per toglierlo da lì.
- I messaggi della chat non si modificano né si cancellano.
- Il programma periodico gira nel processo del backend: con più istanze del server le operazioni restano atomiche, ma ogni istanza lo esegue.
- Le classifiche si calcolano a ogni richiesta: vanno benissimo per gruppi di amici (centinaia di partite), non per migliaia di gruppi enormi.
- Date e orari sono mostrati nel fuso `Europe/Rome` (configurabile in `shared/app.config.json`).

Le scelte fatte davanti alle ambiguità del progetto sono in [docs/DECISIONI.md](docs/DECISIONI.md).
