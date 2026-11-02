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
