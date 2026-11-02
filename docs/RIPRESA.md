# Ripresa del lavoro su BONMATCH V2

Questo file serve a riprendere il lavoro in una nuova chat **esattamente da dove si è interrotto**. Va letto insieme a:

- `docs/PROMPT_V2.md`: il prompt originale della V2 (requisiti completi di tutte le fasi).
- `docs/ROADMAP_V2.md`: avanzamento delle milestone e registro di cosa è stato fatto in ognuna.
- `docs/ARCHITETTURA.md`: modelli, contratti API e algoritmi decisi.
- `docs/DECISIONI.md`: le scelte prese davanti alle ambiguità.

## Dove siamo

- Milestone completate e committate: **M0-M14**.
- Prossima: **M15** (BONWRAPPED).
- Stato dei test: **221 test backend verdi**; e2e ultima esecuzione completa in M5 (da rieseguire in M16).

## Milestone successive (il testo completo dei requisiti, `PROMPT_V2.md`, è stato rimosso dal repository su richiesta: se serve, va riconsegnato dall'utente)

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
