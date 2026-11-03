# Test di BONMATCH

Quattro livelli, tutti su dati di prova isolati. Nell'ambiente di sviluppo del progetto MongoDB non era disponibile: i test usano MongoDB se risponde su `MONGODB_URI_TEST` e altrimenti l'emulatore `backend/dev/mongo-lite` (scrivendolo nel terminale). **Il comportamento su un MongoDB reale va confermato con Docker acceso** (`docker compose up -d` e poi `npm test`).

## 1. Backend (Jest + Supertest)

```powershell
cd backend
npm install
npm test
```

Un database separato per ogni worker, svuotato prima e dopo ogni file. File principali:

| File | Cosa verifica |
|---|---|
| `auth`, `groups`, `nicknames` | registrazione, login, revoca del token, permessi 401/403, gruppi, soprannomi |
| `matches`, `teams`, `voting` | iscrizione atomica e concorrenza sull'ultimo posto, lista d'attesa, quote, Bilancia, risultato, MVP (parità, scadenza), terzo tempo |
| `boncall`, `scheduler` | convocazioni, conversione idempotente, deduplica, promemoria, programma periodico |
| `push`, `chat`, `realtime`, `dashboard` | Web Push (trasporto simulato), chat, Socket.IO autenticato, home |
| `boncard`, `rivalry`, `matchday` | algoritmo dell'overall, edizioni, rivalità, locandina |
| `rankings`, `seasons` | le 12 classifiche con requisiti, parità e "non disponibile"; stagioni, sovrapposizioni, confronto con la precedente, Hall of Fame |
| `awards` | premi di partita (bomber, voto, assegnazione, chiusura atomica) e achievement idempotenti, anche in parallelo |
| `club` | upload sicuro (primi byte, SVG rifiutato, limiti), permessi, statistiche |
| `calendar` | ora legale, ricorrenze idempotenti, modifica singola, fine serie, calendario, disponibilità, `.ics` |
| `cashbox` | quote dichiarate/verificate, concorrenza, saldi, cassa comune, annullamenti con storico, migrazione V1 |
| `thirdHalf`, `wrapped` | storico e statistiche anonime, BONWRAPPED con dati insufficienti, soglie e sezioni omesse |
| `security` | chiavi `$`/`.` rifiutate, rate limiting, intestazioni, CORS |
| `mongoLite` | l'emulatore stesso (operatori supportati) |

Esecuzione di un solo file: `npx jest tests/cashbox`.

## 2. Frontend (Vitest + Testing Library)

```powershell
cd frontend
npm install
npm test
```

Test in `frontend/src/__tests__/`, con `jsdom` e le API simulate: utilità di calendario e formato, navigazione (nessun collegamento morto), schermate del BONWRAPPED, componenti (variazione di posizione, stemma con fallback, maglie, feed) e pagine (classifiche, Hall of Fame, terzo tempo, BONWRAPPED, calendario, club) in stato di caricamento, errore, vuoto e con dati.

## 3. End-to-end (Playwright + axe-core)

```powershell
cd e2e
npm install
npx playwright install chromium
npm test
```

Playwright avvia da solo database di prova, backend (porta 4100) e frontend (porta 5174), con rate limiting disattivato. Per usare un MongoDB vero: `$env:E2E_MONGODB_URI="mongodb://127.0.0.1:27017/bonmatch_e2e_test"`.

| Specifica | Cosa copre |
|---|---|
| `auth` | registrazione con errori accanto ai campi, logout, invito via link |
| `boncall` | convocazione da interfaccia fino alla partita confermata |
| `live` | **due utenti**: iscrizione e lista d'attesa dal vivo, chat con reazioni, voto MVP e terzo tempo |
| `pwa` | manifest, service worker, offline, API mai in cache, push solo con un clic |
| `v2` | **due utenti**: dichiarazione e conferma di un pagamento, premi della serata, ricorrenza e `.ics`, stemma del club e SVG rifiutato, classifiche, Hall of Fame, terzo tempo, BONWRAPPED |
| `a11y` | axe-core (WCAG 2.1 AA) su tutte le schermate principali in tema scuro e chiaro e assenza di scorrimento orizzontale a 390 px |
| `screenshots` | a richiesta (`SCREENSHOTS=1`): immagini a 390, 768, 1280 e 1920 px in `docs/screenshots/v2`, con controllo dell'overflow |

## 4. Collection Postman

`postman/BONMATCH.postman_collection.json` percorre le API della V1 con un test sul codice HTTP di ogni risposta (`npx newman run postman/BONMATCH.postman_collection.json` con il backend acceso). Le rotte della V2 sono coperte da Jest e dai test end-to-end.

## Cosa non è verificabile qui

- **Consegna reale delle notifiche push**: serve un telefono o un browser con servizio push raggiungibile e le chiavi VAPID (`npm run vapid`). I test usano un trasporto simulato.
- **Condivisione nativa delle immagini** (BONCARD, locandina, BONWRAPPED) su telefoni: nel browser di prova si usa il download.
- **MongoDB reale**: vedi sopra.
- **Installazione della PWA su iOS**: da provare su un dispositivo con il sito servito in HTTPS.
