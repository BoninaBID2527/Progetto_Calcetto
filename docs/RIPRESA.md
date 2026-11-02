# Ripresa del lavoro su BONMATCH V2

Questo file serve a riprendere il lavoro in una nuova chat **esattamente da dove si è interrotto**. Va letto insieme a:

- `docs/PROMPT_V2.md`: il prompt originale della V2 (requisiti completi di tutte le fasi).
- `docs/ROADMAP_V2.md`: avanzamento delle milestone e registro di cosa è stato fatto in ognuna.
- `docs/ARCHITETTURA.md`: modelli, contratti API e algoritmi decisi.
- `docs/DECISIONI.md`: le scelte prese davanti alle ambiguità.

## Dove siamo

- Milestone completate e committate: **M0-M8** (audit, architettura, design system NIGHT LEAGUE, dashboard, BONCALL, PWA e Web Push, BONCARD/BONRATING, MATCHDAY, rivalità).
- Milestone in corso: **M9 — Stagioni, nuove classifiche, Hall of Fame**, iniziata e salvata nel commit "wip(stagioni)".
- Da fare dopo: M10-M17 (vedi sotto).
- Stato dei test al momento dell'interruzione: **151 test backend verdi**, **13 test end-to-end verdi** (ultima esecuzione completa in M5; dopo M5 sono stati eseguiti i test backend e controlli visivi, non di nuovo l'intera suite e2e).

## M9: cosa è già fatto (nel commit wip)

- `backend/src/models/Season.js`: stagioni personalizzate `{ group, name, startsAt, endsAt }`.
- `Group.settings.season { mode: annuale|trimestrale|mensile|personalizzata, startMonth: 1-12 }` con default `annuale`, mese 9 (stesso comportamento della V1); validatore in `groupValidators.updateGroup.settings.season`; `groupService.update` lo salva e `summary` lo restituisce.
- `groupValidators.createSeason` (nome, inizio, fine, fine dopo l'inizio).
- `backend/src/services/seasonService.js` riscritto: `seasonAt`, `previousSeason` (sincrone, come prima), più `list(group)` (tutte le stagioni dalla prima partita a oggi, più recente prima, con `current` e `closed`), `byKey(group, key)` (stagione + precedente), `current(group)`, `previous(group)` (asincrone, gestiscono la modalità personalizzata), `create` (rifiuta sovrapposizioni con 422), `remove`.

## M9: cosa resta, in ordine

1. **`playerService.js`**: oggi usa `seasonService.seasonAt(group)` e `previousSeason(group)` in modo sincrono, che in modalità "personalizzata" restituiscono `null` e farebbero cadere `card()` (`season.label`). Sostituire con `await seasonService.current(group)` / `await seasonService.previous(group)`, gestire `season === null` (etichetta "Fuori stagione") e, in `progression`, raggruppare le righe con le stagioni personalizzate caricate una volta sola.
2. **`rankingService.js`**: lasciare identiche le 6 classifiche esistenti e aggiungerne 6 in `DEFINITIONS`, ognuna con requisito esplicito e stato "non disponibile" se nessuno lo soddisfa:
   - `forma`: media degli ultimi 5 voti di partita (almeno 3 partite valutate);
   - `media_gol`: gol ÷ partite con marcatori inseriti (almeno il minimo partite *con marcatori*);
   - `difensore`: attributo DIF bayesiano (stessa formula di `playerRating`), almeno 3 valutazioni DIF;
   - `portiere`: voto generale bayesiano dei giocatori con ruolo portiere, almeno 3 voti;
   - `rendimento`: voto medio nel periodo, almeno 3 voti;
   - `crescita`: voto medio del periodo meno quello della stagione precedente (almeno 3 voti in entrambe).
   `computeRankings` deve ricevere anche i ruoli (`roles: { userId: ruolo }`) e le medie precedenti (`previousAvg`), con default vuoti per non rompere chi la chiama già (`playerService.editionsFor`).
   `groupRankings(group, { period, season }, now)`: con `season` usa `seasonService.byKey`; con `period: 'stagione'` usa la stagione corrente configurata del gruppo (non più il 1° settembre fisso); calcola le posizioni della stagione precedente e aggiunge a ogni voce `previousPosition`. Restituisce anche `season` e `previous` (`{ key, label }`). Aggiornare le chiamate: `postMatchController.rankings` (validatore `rankings` con `season` facoltativo) e `dashboardService` (`groupRankings(group, { period: 'stagione' })`).
   In `tests/rankings.test.js` il test "nessuna partita" controlla l'elenco esatto delle 6 chiavi: estendere l'elenco con le 6 nuove (non togliere test).
3. **Hall of Fame**: `services/hallOfFameService.js` + `GET /groups/:id/hall-of-fame`: vincitori di ogni stagione chiusa (I più forti, MVP, Bomber, I più vincenti), record assoluti (più gol in una partita, vittoria più larga, serie di vittorie più lunga, più presenze, più MVP, capocannoniere di sempre, miglior voto medio con minimo partite), giocatori più premiati. Tutto dai dati reali via `statsEngine`.
4. **Stagioni via API**: `GET /groups/:id/seasons`, `POST /groups/:id/seasons` (admin, solo in modalità personalizzata), `DELETE /groups/:id/seasons/:sid` (admin).
5. **Test backend** per stagioni (modalità, sovrapposizioni, permessi), nuove classifiche (requisiti, parità, non disponibili), confronto con la stagione precedente, Hall of Fame.
6. **Frontend**: in `GroupRankings.jsx` sostituire il selettore del periodo con una scelta "Sempre / Questo mese / stagione corrente / stagioni passate" (da `GET /seasons`), frecce di variazione rispetto alla stagione precedente, schede per le 12 classifiche con il motivo quando una non è disponibile; nuova pagina **Hall of Fame** (`/gruppi/:id/hall-of-fame`, voce in `layouts/navigation.js`); nelle impostazioni admin di `GroupMembers.jsx` modalità di stagione, mese di inizio e gestione delle stagioni personalizzate.
7. Aggiornare `docs/ROADMAP_V2.md` (riga M9 ✅ e registro), commit `feat: stagioni, nuove classifiche e Hall of Fame`.

## Milestone successive (dettagli in `docs/PROMPT_V2.md`, fasi 9-19)

- **M10** Premi partita (miglior portiere, difensore, bomber della serata automatico dai marcatori, sorpresa, premio ironico; attivabili dall'admin; votazione o assegnazione dell'organizzatore) e achievement idempotenti (prima partita, 10/25/50 presenze, primo gol, 10/25 gol, primo MVP, 5 MVP, serie di vittorie, fedeltà) con premiazioni animate. Modelli previsti in ARCHITETTURA: `AwardVote`, `Achievement`, `Match.awards`, `Match.awardWinners` (il motore statistico legge già `awardWinners`).
- **M11** Club: stemma e copertina caricati con `multer` (tipo verificato dai primi byte, PNG/JPEG/WebP, niente SVG, limiti di dimensione, salvati come data URL), colore secondario, motto, maglie chiara/scura, statistiche del gruppo, fallback grafici.
- **M12** Calendario mese/settimana, convocazioni aperte, partite ricorrenti (`MatchSeries`, occorrenze idempotenti con indice unico `{series, occurrenceKey}`, modificabili o annullabili singolarmente), disponibilità, esportazione `.ics`, fuso Europe/Rome con ora legale (usare l'helper "ora italiana" già scritto in `backend/src/scripts/seed.js`, funzione `at`).
- **M13** Cassa: `LedgerEntry` dichiarato/verificato/annullato con storico, saldo dei membri, cassa comune facoltativa, spese e rimborsi; `participants[].payment` (`da_pagare|dichiarato|verificato`) con `paid` derivato per compatibilità; migrazione in `npm run migrate`.
- **M14** Terzo tempo evoluto: scadenza visibile, storico, statistiche stagionali, premiazione; "chi perde offre" resta facoltativo e senza obblighi economici.
- **M15** BONWRAPPED: riepilogo stagionale a schermate condivisibili (PNG), solo dati reali, messaggio se i dati non bastano.
- **M16** Revisione di tutte le schermate, rate limiting (`express-rate-limit` su accesso e API), middleware contro chiavi `$`/`.` nei corpi, test frontend (Vitest + Testing Library), e2e completi (BONCALL a due utenti c'è già), axe su tutte le nuove schermate in tema scuro e chiaro, screenshot a 390/768/1280/1920.
- **M17** Documentazione: README, AVVIO.txt, ROADMAP_V2, DECISIONI, ARCHITETTURA, `docs/API.md`, `docs/TEST.md`, GUIDA_UTILIZZO; ZIP pulito.

## Ambiente e comandi (importante)

- Nell'ambiente cloud usato finora **MongoDB non è disponibile** (download bloccati, Docker senza immagini): test, seed ed e2e girano sull'emulatore `backend/dev/mongo-lite`. Ogni nuova query deve restare negli operatori supportati (vedi `engine.js`; se ne serve uno nuovo, aggiungerlo con un test in `backend/tests/mongoLite.test.js`, come fatto per `$type`). Su un PC con Docker i test usano MongoDB vero automaticamente.
- Mongoose rende `createdAt` immutabile: nei test, per spostarlo, aggiornare direttamente `Model.collection`.
- Avvio per le verifiche visive (Linux, dalla cartella del progetto):
  - `cd backend && node dev/mongo-lite/cli.js --port 27017` (in background), poi `npm run seed` e `node src/server.js`;
  - `cd frontend && npx vite --port 5173`;
  - screenshot con uno script Playwright (`require('playwright')` funziona senza installare nulla), login come `marco@calcetto.test` / `calcetto2026` impostando `localStorage['bonmatch.token']`.
- Test: `cd backend && npx jest` (oggi 151 verdi); `cd e2e && npx playwright test` (avvia da solo database, backend su 4100 e frontend su 5174).
- Convenzioni: testi solo in italiano; Conventional Commits a ogni milestone; nessun segreto nel repository; nessuna funzione presentata come pronta se non verificata; aggiornare il registro della roadmap a fine milestone; per le push dichiarare che la consegna reale non è stata verificata (nessun servizio push raggiungibile).
- Il push su GitHub va fatto solo con l'autorizzazione dell'utente. Branch di lavoro: `claude/sleepy-thompson-v6fsnd`.
