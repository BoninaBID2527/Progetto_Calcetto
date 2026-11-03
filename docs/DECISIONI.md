# Decisioni prese

Il prompt chiede di non fermarsi davanti alle ambiguità ma di scegliere la soluzione più semplice e annotarla. Questo è l'elenco.

## Ambiente e strumenti

1. **Emulatore MongoDB per lo sviluppo (`backend/dev/mongo-lite`).** Nell'ambiente cloud in cui il progetto è stato scritto non c'era MongoDB, Docker non poteva scaricare immagini e i binari di `mongod` non erano scaricabili. Per eseguire davvero test, seed e test end-to-end ho scritto un piccolo server che parla il protocollo di MongoDB e tiene i dati in memoria. Supporta solo le operazioni usate da questa app. **Non è un sostituto di MongoDB:** l'app usa Mongoose standard e in uso normale si collega a MongoDB (Docker o installazione locale). I test usano MongoDB se è raggiungibile e passano all'emulatore solo se non lo è, scrivendolo chiaramente nel terminale.
2. **`bcryptjs` al posto di `bcrypt`.** Stesso algoritmo e stesso formato di hash, ma in JavaScript puro: niente compilazione nativa né download di binari, che su Windows sono una fonte frequente di problemi.
3. **Backend in CommonJS.** Jest con i moduli ES è ancora sperimentale; CommonJS evita configurazioni fragili.
4. **Configurazione condivisa in JSON (`shared/app.config.json`).** È l'unico punto in cui stanno il nome dell'app, i campi, le opzioni del premio e i default. Il JSON si importa sia da Node sia da Vite senza passaggi di build.

## Regole di gioco

5. **Chi crea le partite.** "Admin o chi ha il permesso del gruppo" è stato tradotto in un'impostazione del gruppo: `organizers = "tutti"` (default, adatto a un gruppo di amici) oppure `organizers = "admin"`.
6. **Stati della partita.** `aperta` accetta iscrizioni. L'organizzatore la porta a `chiusa` quando vuole (anche il programma automatico la chiude all'orario d'inizio). Il risultato si inserisce su una partita `chiusa` e la porta a `giocata`. `archiviata` si imposta a mano quando le votazioni sono concluse. `annullata` è possibile da `aperta` o `chiusa`. Si può riaprire una partita `chiusa` solo se l'orario d'inizio è nel futuro.
7. **"Partite giocate" nelle classifiche** comprende anche quelle `archiviate`: l'archiviazione chiude solo il dopo partita, la partita resta giocata.
8. **Chi ha giocato.** Fanno fede le squadre salvate. Il risultato richiede quindi squadre già fatte (422 altrimenti).
9. **"Forse"** non occupa posti. **"Ci sono"** occupa un posto oppure manda in lista d'attesa. Passare da "Ci sono" a un'altra risposta libera il posto e il primo in lista entra da solo.
10. **Quota a testa:** costo totale diviso per i presenti ("Ci sono"), arrotondato al centesimo superiore. Ognuno segna il proprio pagamento; l'organizzatore e gli admin possono correggere quello di tutti.
11. **Votazioni.** Votano MVP, voti 1-10 e premio solo i giocatori presenti nelle squadre. Le votazioni si chiudono dopo 48 ore, quando hanno votato tutti oppure quando l'organizzatore le chiude. I voti 1-10 si possono modificare finché la votazione è aperta; il voto MVP no (uno solo, 409 al secondo tentativo).
12. **Premio in parità:** tutte le opzioni in parità vincono e il contatore le conta tutte. Con "chi perde offre il primo giro" attivo, la pagella indica la squadra sconfitta; in caso di pareggio "si fa alla romana".
13. **Soprannomi.** Un soprannome proposto è subito visibile. Il destinatario può rifiutarlo o sostituirlo con uno scelto da lui; un admin può rimuoverlo. Per ogni persona e gruppo c'è al massimo un soprannome attivo e lo storico conserva tutti i precedenti con chi li ha proposti. La preferenza "accanto al nome" o "al posto del nome" è di chi guarda e vale in tutta l'app.

## Classifiche

14. **Periodi.** `mese` è il mese di calendario in corso, `stagione` va dal 1° settembre al 31 agosto (come le stagioni sportive), `sempre` non ha limiti.
15. **I più forti:** media dei voti ricevuti + 2 × (MVP vinti ÷ partite giocate). Chi non ha ancora voti parte da 5, lo stesso valore usato dal pulsante Bilancia.
16. **I più presenti:** partite giocate ÷ partite giocate dal gruppo da quando la persona è entrata nel gruppo.
17. **Minimo partite:** vale per tutte le classifiche (default 3, si cambia nelle impostazioni del gruppo). Per "I più sfortunati" il minimo è almeno 5.
18. **Parità:** a parità di valore la posizione è condivisa (1, 1, 3). L'ordine all'interno della parità segue un criterio secondario dichiarato nella nota della classifica.
19. **Calcolo in JavaScript** invece che con pipeline di aggregazione: i gruppi di calcetto hanno al massimo qualche centinaio di partite e il codice resta leggibile e testabile come funzione pura (`services/rankingService.js`).

## Interfaccia

20. **Foto profilo:** l'immagine scelta viene ridimensionata nel browser a 256 px e salvata come data URL (massimo circa 150 KB). Si evita così un sistema di upload di file. Senza foto si vedono le iniziali su un colore ricavato dal nome.
21. **Gruppo attivo:** la navigazione principale (Partite, Classifiche, Chat, Gruppo) si riferisce al gruppo scelto, che viene ricordato nel browser.
22. **Voti 1-10 "ai compagni"** sono intesi come voti agli altri giocatori della partita, di entrambe le squadre: servono a valutare chiunque per il pulsante Bilancia.
23. **Messaggi di sistema** con il nome reale e frasi neutre ("ci sarà", "entra dalla lista d'attesa") per non dover indovinare il genere di nessuno.
24. **Uscita e sessione scaduta.** Dopo "Esci" si torna alla landing; se invece il token scade o viene revocato altrove, si va alla pagina di accesso e dopo il login si torna dove si era.
25. **L'ultimo membro può lasciare il gruppo**, che resta vuoto ma non viene cancellato (niente cancellazioni automatiche di dati).

## Accessibilità e test

26. **Arancio del testo nel tema scuro:** l'accento `#FF8A3D` resta per sfondi e pulsanti, ma come colore del testo (soprannomi) uso `#FFA062`. axe-core aveva misurato 4,48:1 sulle righe evidenziate, sotto la soglia AA di 4,5:1.
27. **Test end-to-end isolati:** Playwright avvia un proprio database (mongo-lite in memoria, oppure il MongoDB indicato in `E2E_MONGODB_URI`, che deve avere "test" nel nome), il backend sulla porta 4100 e il frontend sulla 5174. Così non toccano mai i dati di sviluppo.
28. **Seed con date relative:** le partite sono generate rispetto al giorno in cui si lancia il seed, alle 21:00 ora italiana, così ci sono sempre partite future e una votazione ancora aperta.

## V2 — NIGHT LEAGUE

29. **Stagioni come finestre temporali.** Cambiare modalità (annuale, trimestrale, mensile, personalizzata) non sposta né cancella nulla: la stagione è solo un filtro sulle partite. Il default resta quello della V1 (annuale da settembre). In modalità personalizzata, fuori da ogni stagione creata l'app mostra "Fuori stagione" invece di inventarne una.
30. **Classifiche nuove con requisito esplicito.** Ognuna dichiara cosa serve per comparire (ad esempio almeno 3 voti DIF) e, se nessuno lo soddisfa, mostra "non disponibile" con il motivo invece di una classifica vuota. Le sei storiche non sono cambiate; la home continua a mostrare quelle.
31. **Crescita = voto medio del periodo meno quello della stagione precedente**, con almeno 3 voti in entrambe; senza stagione precedente la classifica non è disponibile.
32. **Hall of Fame solo da dati reali.** Un record senza dati è "non disponibile", mai a zero. I "più premiati" sommano MVP, premi di partita e titoli stagionali de "I più forti".
33. **Premi di partita spenti di default.** Il bomber della serata è automatico dai marcatori; gli altri si votano (anonimi, mai a sé stessi) o li assegna l'organizzatore. I premi valgono per le partite il cui risultato viene inserito **dopo** l'attivazione. L'MVP non si chiude in anticipo finché mancano voti ai premi.
34. **Achievement assegnati solo dal backend**, idempotenti per indice unico. I traguardi "arretrati" (storico) si registrano con la data reale della partita e senza notifiche; solo quelli degli ultimi 3 giorni avvisano. "Fedeltà al gruppo" = 6 mesi nel gruppo e 10 presenze.
35. **Club: immagini come data URL.** Come per la foto profilo, nessun file su disco. Il tipo si decide dai primi byte (PNG, JPEG, WebP; SVG escluso perché può contenere script), con limiti di 128 KB (stemma) e 700 KB (copertina). Non c'è un ridimensionamento lato server: l'admin carica immagini già piccole. Lo stemma viaggia con il riepilogo del gruppo, la copertina solo nella pagina del club.
36. **Ricorrenze: occorrenze reali e idempotenti.** Una serie genera vere partite (28 giorni di orizzonte) con chiave la data locale. Un'occorrenza annullata o modificata a mano non viene mai ricreata né toccata dagli aggiornamenti della serie; l'aggiornamento della serie salta anche le partite che hanno già iscritti.
37. **Fusi orari senza librerie.** L'orario locale (es. 21:00 a Roma) si converte in UTC con `Intl`, così le ricorrenze tengono l'ora legale. Il fuso è un'impostazione del gruppo (`Europe/Rome` di default) modificabile via API; l'interfaccia non ha ancora il campo.
38. **`.ics` con orari UTC e token nell'intestazione.** Evita di definire fusi dentro il file e non espone un URL pubblico di sottoscrizione: l'esportazione è un download autenticato.
39. **Cassa: un registro, non un pagamento.** Nessun denaro passa dall'app. Un pagamento dichiarato non conta finché non lo conferma chi lo riceve (organizzatore della partita o admin); chi riceve può confermare anche la propria voce, perché è lui il destinatario. Le voci si annullano, non si cancellano, e ogni passaggio resta nello storico. Il vecchio test "mi segno pagato da solo" è stato aggiornato di conseguenza (ora è una dichiarazione).
40. **Saldi privati.** Ogni membro vede il proprio saldo e la cassa comune; i saldi di tutti li vedono solo gli admin. Un membro vede nello storico le proprie voci e le spese del gruppo.
41. **Cassa comune facoltativa e fatta solo di versamenti.** Le quote pagano il campo e non entrano nel fondo, altrimenti il fondo risulterebbe sempre gonfiato dai costi non registrati. Fondo = versamenti confermati − spese pagate dalla cassa − rimborsi.
42. **Terzo tempo: solo aggregati.** Storico e statistiche non rivelano mai chi ha votato cosa. "Chi perde offre il primo giro" resta un gesto facoltativo: compare come informazione, senza importi né debiti e senza alcun legame con la cassa.
43. **BONWRAPPED: se non basta, si dice.** Servono almeno 3 partite; ogni sezione senza dati sufficienti (rivalità e intesa sotto le 3 partite insieme, progressione sotto le 4 partite valutate, gol senza marcatori) viene omessa. Le immagini esportate usano gli stessi dati dello schermo.
44. **Rate limiting per IP, solo sui tentativi falliti di accesso.** Così un gruppo che accede dalla stessa rete non si blocca da solo. Nei test e nei test end-to-end il limite è disattivato (`RATE_LIMIT_ENABLED=false`); un test dedicato lo verifica con limiti piccoli.
45. **Chiavi `$` e `.` rifiutate ovunque** (corpo, query, parametri) con 400, in aggiunta agli schemi `strict` di zod.
46. **Test frontend con Vitest + Testing Library**, con le API simulate a livello di modulo: provano stati di caricamento, errore, vuoto e contenuti principali delle nuove schermate; la verifica con dati veri e due utenti resta ai test end-to-end.
47. **Screenshot a richiesta.** `SCREENSHOTS=1 npx playwright test tests/screenshots.spec.js` genera le immagini a 390, 768, 1280 e 1920 px in `docs/screenshots/v2` e fallisce se una pagina scorre in orizzontale.
