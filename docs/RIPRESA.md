# Ripresa del lavoro su BONMATCH V2

Tutte le milestone **M0-M17** della roadmap sono completate e committate (vedi `docs/ROADMAP_V2.md`, con il registro di ognuna).

Se si riprende il lavoro per nuove funzioni:

- leggere `docs/ARCHITETTURA.md` (modelli e principi), `docs/API.md` (rotte), `docs/DECISIONI.md` (scelte), `docs/TEST.md` (come si prova);
- test: `cd backend && npm test` (240), `cd frontend && npm test` (37), `cd e2e && npm test` (19, più gli screenshot a richiesta con `SCREENSHOTS=1`);
- ambiente cloud senza MongoDB: i test e il seed usano l'emulatore `backend/dev/mongo-lite` (ogni nuova query deve restare negli operatori supportati o l'emulatore va esteso con un test in `backend/tests/mongoLite.test.js`);
- avvio manuale per le verifiche visive: `cd backend && node dev/mongo-lite/cli.js --port 27017` (in background), poi `npm run seed` e `node src/server.js`; `cd frontend && npx vite --port 5173`; accesso con `marco@calcetto.test` / `calcetto2026`;
- convenzioni: testi solo in italiano, Conventional Commits, nessun segreto nel repository, nessuna funzione presentata come pronta se non verificata, registro della roadmap aggiornato a fine milestone;
- il push su GitHub si fa solo con l'autorizzazione dell'utente.

Limiti dichiarati e cose da verificare su dispositivi reali: README, sezione "Limiti noti" (push reali, condivisione nativa delle immagini, MongoDB vero, Safari e Firefox).
