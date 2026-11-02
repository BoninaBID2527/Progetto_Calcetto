# BONMATCH V2 — NIGHT LEAGUE: requisiti (prompt originale, in forma compatta)

Obiettivo: evolvere BONMATCH (non ricrearlo) in una piattaforma privata, sociale e competitiva per il calcetto tra amici: "lo spogliatoio digitale del gruppo". Testi dell'interfaccia sempre in italiano. Non eliminare funzionalità esistenti senza motivo documentato, non sovrascrivere dati reali, mantenere compatibili account e gruppi esistenti, migliorare ciò che esiste invece di duplicarlo. Decisioni tecniche ordinarie: scegliere la soluzione più semplice e robusta e documentarla; fermarsi solo per operazioni distruttive, costi esterni, modifiche irreversibili o decisioni di prodotto bloccanti. Non fare push senza autorizzazione, non riscrivere la cronologia, Conventional Commits, un commit per milestone. A fine milestone riferire: cosa implementato, file principali, test eseguiti e passati, cosa non verificabile, milestone successiva.

## Fase 1 — Restyling NIGHT LEAGUE
Palette (token CSS): background `#090D0C`, secondario `#111915`, surface `#19251E`, elevated `#24332A`, primary lime `#C7FF36` (hover `#D8FF75`), testo `#F4F8F2` / secondario `#A7B5AC`, arancio `#FF704A`, oro `#F5D98C`, danger `#FF5757`. Lime per azioni, stati attivi, progressione; oro per premi e card speciali; non colorare tutto di verde. Tema chiaro completo con contrasto accessibile. Font locali con @fontsource: Barlow Condensed (titoli, risultati), Space Grotesk o Bricolage Grotesque (editoriale), Inter (interfaccia); scala tipografica responsive; numeri grandi e tabulari. Mobile-first (navigazione inferiore, pulsante centrale per partita o BONCALL, bottom sheet, safe area, nessun overflow orizzontale); desktop con sidebar, griglie fluide, pannelli. Design system riutilizzabile: Button, IconButton, Card, MatchCard, PlayerCard, StatCard, Modal, BottomSheet, Tabs, SegmentedControl, Avatar, Badge, ProgressBar, Skeleton, Toast, Tooltip, EmptyState, NotificationItem, LeaderboardRow, FormField, ConfirmDialog; una sola libreria di icone (Lucide); niente libreria UI pesante. Animazioni con Motion (transizioni, ingressi, contatori, podi, squadre, reveal BONCARD, countdown, premiazioni, toast), 150-300 ms per le micro, rispetto di prefers-reduced-motion, preferibilmente transform/opacity. `BrandLogo` centralizzato con varianti completa, compatta, monocromatica, chiaro/scuro; logo provvisorio sostituibile (il definitivo arriverà dopo).

## Fase 2 — Dashboard
Home con hero MATCHDAY (campo, data/ora, countdown, confermati, avatar, posti mancanti, stato, pulsante partecipa, dettagli, lista d'attesa), quick actions autorizzate (nuova partita, cerca giocatori, gruppo, classifiche, BONCARD), feed attività da eventi reali persistiti, statistiche personali, progressione, posizione in classifica, notifiche, sondaggi aperti.

## Fase 3 — BONCALL
Convocazioni per cercare giocatori: gruppo, giorno, ora, campo, giocatori necessari, costo, note, scadenza; modalità con giorno/ora non decisi (voto tra alternative). Alla creazione: salva, notifica persistente ai destinatari (non all'autore, senza duplicati), evento Socket.IO, Web Push, contatore non letti; il link apre il sondaggio corretto. Risposte Ci sono/Forse/Non ci sono con confermati, incerti, assenti, posti, lista d'attesa, tempo rimanente, tempo reale, atomicità. Al completamento: stato, notifica all'organizzatore, conversione idempotente in partita mantenendo le iscrizioni. Promemoria: a chi non ha risposto, mancano 1-2, scadenza, completata, posto liberato, ricerca sostituti; configurabili, senza spam, con limiti di frequenza e fasce silenziose. Web Push reale: service worker, Push API, VAPID, subscription persistite e ripulite, permessi, preferenze, recupero notifiche perse, deep link, anti-duplicati; iOS solo con PWA installata; permesso chiesto solo con azione esplicita; sempre notifiche in-app come alternativa.

## Fase 4 — BONCARD
Carta giocatore: foto/avatar, nome, soprannome, ruolo, piede, overall, presenze, gol, vittorie, MVP, valutazione media, stagione; contesto gruppo o carriera dichiarato. Attributi VEL, TIR, PAS, DRI, DIF, FIS solo da valutazioni specifiche (altrimenti non disponibile o provvisorio dichiarato). Overall con algoritmo documentato e verificabile (attributi, ruolo, prestazioni recenti, valutazioni, affidabilità statistica, numero di partite), un voto non deve alterarlo troppo, separare overall tecnico, forma recente, statistiche oggettive. Edizioni: Base, In Forma, MVP, Bomber, Leggenda del Gruppo, Team of the Season, con requisiti espliciti. Esportazione PNG (anche mobile, formato verticale social).

## Fase 5 — BONRATING
Andamento valutazioni, forma ultime 5, gol per partita, % vittorie, MVP, presenze, migliori prestazioni, record, confronto stagioni; grafici responsive e accessibili; distinguere dati reali da stimati; gestire campioni piccoli e dati mancanti; niente percentuali fuorvianti.

## Fase 6 — MATCHDAY
Locandina, campo, data/ora, countdown, convocati, squadre, valore medio, giocatori in forma, rivalità, info campo, quota. Formazioni sul campo visto dall'alto adattabili a 5 contro 5 e altri numeri, con avatar, nome/soprannome, ruolo, overall. Bilancia migliorato (valutazione, ruolo, portieri, attributi, equilibrio), non sempre la stessa formazione, casualità controllata, modifiche manuali. Locandina esportabile verticale e quadrata senza dati privati.

## Fase 7 — Rivalità
Testa a testa tra membri: partite insieme e da avversari, vittorie, gol, MVP, voto medio, ultimi risultati, serie; schermata VS cinematografica; rivalità automatiche dai dati e scelte volontariamente; niente contenuti offensivi; niente classifiche ingannevoli con pochi confronti; facoltative.

## Fase 8 — Stagioni, classifiche, Hall of Fame
Stagioni configurabili (mensili, trimestrali, annuali, personalizzate) che non cancellano lo storico, con stagioni precedenti consultabili. Classifiche esistenti (più forti, MVP, più vincenti, più sfortunati, più presenti, bomber) più: migliore forma recente, migliore media gol, miglior difensore e miglior portiere (solo con valutazioni adeguate), miglior rendimento stagionale, migliore crescita; podio animato, filtri temporali, minimo partite, parità, spiegazione del calcolo, storico, confronto con la stagione precedente. Hall of Fame: vincitori stagioni, record assoluti, migliori marcatori, più premiati, serie di vittorie, record di presenze, tutto da dati reali.

## Fase 9 — Awards e achievement
Premi partita opzionali (miglior portiere, miglior difensore, bomber della serata, sorpresa, premio ironico), attivabili dall'admin, soggettivi via votazione o assegnazione esplicita dell'organizzatore, mai prestazioni inventate. Achievement assegnati dal backend, idempotenti: prima partita, 10/25/50 presenze, primo gol, 10/25 gol, primo MVP, 5 MVP, serie di vittorie, fedeltà al gruppo. Schermate di premiazione animate, eleganti e disattivabili (MVP, premi stagionali, record, achievement).

## Fase 10 — Club
Stemma, colore principale e secondario, nome, motto, descrizione, copertina, maglia chiara e scura, stagione attiva, statistiche complessive. Stemma caricato dall'admin con limiti di dimensione e tipo e validazione sicura; fallback grafici; gruppi privati per impostazione predefinita.

## Fase 11 — Calendario
Vista mensile e settimanale, prossime/passate, convocazioni aperte, eventi ricorrenti (modificabili o annullabili singolarmente), disponibilità, filtri per gruppo, esportazione calendario; fuso Europe/Rome con ora legale, configurabile.

## Fase 12 — Cassa del gruppo
Costo totale, quota, pagato/da pagare, storico pagamenti, riepilogo per partita, saldo membri, cassa comune opzionale, spese, rimborsi registrati. Registro contabile interno (nessuna transazione reale simulata), pagamenti mai segnati ricevuti senza conferma, conferma dell'organizzatore, tracciabilità, pagamenti dichiarati separati da verificati.

## Fase 13 — Terzo tempo evoluto
Birra, pizza, panino più opzioni configurabili; sondaggio, risultati in tempo reale, scadenza, storico, premio più scelto, statistiche stagionali, premiazione animata; "chi perde offre il primo giro" facoltativo e senza obblighi economici.

## Fase 14 — BONWRAPPED
Riepilogo stagionale a schermate condivisibili: partite, gol, MVP, vittorie, migliore partita, rivalità, premi, progressione, record, momenti significativi; storytelling visivo; nessuna statistica inventata, messaggio se i dati non bastano.

## Fase 15 — PWA
Manifest, icone, service worker, cache degli asset statici, pagina offline, indicatore di connessione, riconnessione con sincronizzazione dal backend, Web Push, deep link, badge. Niente cache-first per API autenticate, niente dati sensibili in cache. Socket.IO per il tempo reale, REST fonte autorevole.

## Fase 16 — Sicurezza
JWT e revoca, permessi per gruppo e organizzatore, validazione input, rate limiting, protezione da injection, upload sicuri, errori, privacy, CORS, variabili d'ambiente, protezione delle subscription push, autorizzazioni Socket.IO. Iscrizioni e liste d'attesa atomiche; nuove funzioni protette da richieste simultanee e duplicazioni.

## Fase 17 — Test
Backend (auth, permessi, gruppi, BONCALL, concorrenza, liste d'attesa, conversione, squadre, risultati, MVP, premi, statistiche, overall, stagioni, achievement, notifiche, idempotenza, pagamenti) su database isolato; frontend (navigazione, moduli, errori, loading, empty, dashboard, BONCARD, MATCHDAY, classifiche, notifiche, chat, responsive); end-to-end Playwright con almeno due utenti (sondaggio, notifica in-app, risposta, aggiornamento live, completamento, partita, iscrizione, MVP, statistiche); push reali da verificare su dispositivi compatibili o limite documentato; axe-core (contrasto AA, tastiera, focus, etichette, dialog, moduli, semantica, reduced motion); screenshot a 390, 768, 1280, 1920 px di ogni schermata principale.

## Fasi 18-20 — Qualità, documentazione, lavoro
Codice modulare e documentato, niente dipendenze inutili né duplicazioni, niente mock nelle schermate di produzione né pulsanti fittizi, niente segreti, non eliminare test esistenti. Documentare: README, AVVIO.txt, ROADMAP_V2, DECISIONI, ARCHITETTURA, API, TEST, GUIDA_UTILIZZO (nuove funzioni, modelli, endpoint, configurazione notifiche e PWA, variabili d'ambiente, algoritmo BONRATING, regole BONCARD, calcolo classifiche, permessi, comandi PowerShell, test, limiti noti). Seed non distruttivo esteso ai dati dimostrativi delle nuove funzioni.

## Ordine di esecuzione
1 audit e roadmap; 2 architettura e contratti; 3 token, componenti, shell; 4 dashboard, gruppi, partite; 5 BONCALL e notifiche in-app; 6 Web Push e PWA; 7 BONCARD e BONRATING; 8 MATCHDAY e formazioni; 9 rivalità; 10 stagioni e classifiche; 11 awards e achievement; 12 club; 13 calendario; 14 cassa; 15 terzo tempo; 16 BONWRAPPED; 17 revisione schermate; 18 e2e, accessibilità, responsive; 19 documentazione e consegna. (Nel repo le milestone sono numerate M0-M17 come in `ROADMAP_V2.md`.)

## Criteri di accettazione
Funzioni V1 ancora funzionanti; restyling coerente su tutte le schermate; nessun pulsante senza logica; BONCALL con utenti reali; notifiche in-app funzionanti; push implementate con limiti di verifica dichiarati; BONCARD con dati reali; classifiche corrette; rivalità da partite effettive; stagioni con storico; permessi applicati dalle API; UI responsive; accessibilità verificata; test automatici verdi; README sufficiente ad avviare il progetto; nessun segreto o file inutile.
