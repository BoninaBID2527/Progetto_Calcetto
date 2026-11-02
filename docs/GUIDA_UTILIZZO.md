# Guida all'uso di BONMATCH

Questa guida presuppone che MongoDB, backend e frontend siano avviati e che tu abbia eseguito `npm run seed` (vedi il [README](../README.md)). L'app è su http://localhost:5173.

## Account di prova

Password di tutti: **`calcetto2026`**

| Email | Chi è | Perché è utile |
|---|---|---|
| `marco@calcetto.test` | Marco Rossi «Il Sindaco», **admin** di "Calcetto del giovedì" | vede tutto: gestione partite, membri, impostazioni |
| `luca@calcetto.test` | Luca Bianchi «Cesarini», admin di entrambi i gruppi | organizza la partita di Moncalieri |
| `paolo@calcetto.test` | Paolo Ghigo «Gattone», portiere | 1° in lista d'attesa per Santena |
| `alessandro@calcetto.test` | Alessandro Greco, senza soprannome | in lista d'attesa in entrambi i gruppi |
| `stefano@calcetto.test` | Stefano Costa «Il Professore» | non fa parte di "Amici del lunedì": utile per provare i permessi |
| `andrea@`, `davide@`, `simone@`, `matteo@`, `federico@calcetto.test` | altri membri | per riempire squadre e votazioni |

Cosa trovi dopo il seed:

- **Calcetto del giovedì** (10 membri): 9 partite giocate sui quattro campi, l'ultima con le votazioni ancora aperte; una partita a **Santena** fra 2 giorni al completo (8/8) con Paolo e Alessandro in lista d'attesa; una a **Moncalieri** fra 6 giorni con 5 presenti su 10.
- **Amici del lunedì** (6 membri): 2 partite giocate e una a **Villastellone** fra 4 giorni, 4/4 con Alessandro e Marco in lista d'attesa.

Per i percorsi con due persone apri una seconda finestra **in incognito** (o un altro browser) e accedi lì con il secondo account.

## Percorsi di prova

### 1. La lista d'attesa che scorre (due utenti)

1. Finestra A: accedi come **Marco**. Finestra B (incognito): accedi come **Paolo**.
2. In entrambe apri *Partite* e poi la partita di **Santena**. Paolo vede "In lista d'attesa · 1°".
3. Nella finestra di Marco premi **Non ci sono**.
4. Senza ricaricare, nella finestra di Paolo: arriva la notifica "Sei dentro…", il suo stato diventa **Ci sei** e il contatore resta 8/8. Alessandro sale al 1° posto della lista.
5. Apri la **Chat** del gruppo: c'è il messaggio di sistema "Paolo Ghigo entra dalla lista d'attesa…".

### 2. Rispondere a una partita

1. Come **Marco** apri la partita di **Moncalieri** (5/10).
2. Premi **Ci sono**: la barra passa a 6/10 e compari tra i presenti con la quota a testa aggiornata.
3. Prova **Forse** e **Non ci sono**: "Forse" non occupa un posto, e passando da "Ci sono" a un'altra risposta il posto si libera.
4. Dalla scheda delle partite del gruppo il pulsante **Ci sono** funziona anche senza aprire la partita.

### 3. Squadre con "Bilancia"

1. Come **Marco** (admin) apri la partita di **Moncalieri** o di **Santena**.
2. Nella scheda **Squadre** premi **Bilancia**: i giocatori vengono "estratti" e disposti sul campo visto dall'alto, con la forza delle due squadre.
3. Premi **Rigenera** per un'altra combinazione equilibrata, oppure **A mano** per spostare i giocatori e rinominare le squadre.

### 4. Dal fischio finale alla pagella

1. Come **Marco**, nella partita di **Santena** premi **Chiudi iscrizioni** (pannello "Fischietto dell'organizzatore"), poi **Bilancia**.
2. Nel pannello **Risultato** imposta i gol delle due squadre e, se vuoi, i marcatori con + e −. Salva.
3. La partita diventa *Giocata*: i giocatori ricevono le notifiche "Finale…" e "Vota l'MVP…" e si aprono le votazioni.

### 5. Votare MVP, pagelle e terzo tempo

1. Come **Marco** apri *Partite* → *Già giocate* → la più recente (stato *Giocata*): le votazioni sono aperte e 5 compagni hanno già votato.
2. **MVP:** scegli un compagno e premi **Vota MVP**. Non puoi votare te stesso e puoi votare una volta sola; dopo il voto vedi solo i totali, mai chi ha votato chi.
3. **Voti in pagella:** dai da 1 a 10 ai compagni e salva. Si possono cambiare finché la votazione è aperta.
4. **Terzo tempo:** scegli Birra, Pizza, Panino o Gelato (opzione extra del gruppo).
5. Premi **Chiudi votazioni** nel pannello dell'organizzatore: compaiono l'MVP (condiviso in caso di parità) e la **premiazione** con l'illustrazione del premio. Con la regola "chi perde offre il primo giro" attiva, la pagella indica chi paga.
6. Nella **Pagella della serata** prova **Condividi immagine** (scarica un'immagine 1080×1350) e **Condividi testo** (copia il riepilogo da incollare nel gruppo).

### 6. Classifiche

1. Apri **Classifiche**. Passa da una classifica all'altra con le schede: *I più forti*, *MVP*, *I più vincenti*, *Sfortunati* ("Il club di chi non vince mai"), *I più presenti*, *Bomber*.
2. Cambia il periodo: *Questo mese*, *Stagione*, *Sempre*.
3. Sotto il podio trovi i dettagli con le barre e la nota "Come si calcola". La tua riga è evidenziata.
4. A destra (su desktop) ci sono i leader di ogni classifica e il contatore del terzo tempo preferito.

### 7. Chat in tempo reale (due utenti)

1. Marco e Luca aprono la **Chat** di "Calcetto del giovedì" in due finestre.
2. Marco scrive un messaggio: Luca lo vede subito.
3. Luca tocca la faccina accanto al messaggio e sceglie una reazione: Marco la vede comparire.
4. Se Luca è in un'altra pagina, sulla voce **Chat** compare il numero dei messaggi non letti; riaprendo la chat c'è la riga "Nuovi messaggi".
5. Prova a spegnere la rete per qualche secondo: in alto compare "Connessione persa…"; alla riconnessione i messaggi persi arrivano da soli.

### 8. Soprannomi

1. Come **Marco** apri **Membri** e tocca **Alessandro Greco**. Assegna un soprannome, per esempio "Il Regista".
2. Accedi come **Alessandro**: c'è la notifica "Hai un nuovo soprannome". In **Membri** tocca il tuo nome: puoi **Rifiutarlo** oppure **Sostituirlo** con uno scelto da te.
3. Come **Marco** (admin) puoi **Rimuovere** il soprannome di qualcun altro.
4. Nella stessa finestra c'è lo **storico** con chi ha proposto cosa (per esempio "Mani di Burro" per Andrea, poi sostituito).
5. Nel **Profilo** scegli "Al posto del nome": in chat e in classifica vedrai «Cesarini» invece di "Luca Bianchi".

### 9. Nuova partita

1. Premi il pulsante centrale **+** (mobile) o **Nuova partita** (desktop).
2. Scegli il campo dalle schede grafiche (anche con le frecce della tastiera), poi data, ora, durata, posti e costo.
3. Prova una data già passata: l'errore compare accanto al campo.
4. Alla creazione gli altri membri ricevono la notifica "Nuova partita…".

### 10. Gruppi, inviti e permessi

1. In **Membri** → **Invita gli amici** copia il link `/entra/CODICE`.
2. Registra un nuovo account in incognito e apri il link: vedi l'anteprima del gruppo e puoi entrare.
3. Come admin premi **Rigenera**: il vecchio codice smette di funzionare.
4. **Permessi:** accedi come **Stefano**, che non fa parte di "Amici del lunedì", e apri l'indirizzo di quel gruppo (copialo dalla finestra di Marco): vedi "Spogliatoio riservato". Il server risponde 403 a qualunque richiesta su quel gruppo.
5. Come membro semplice (es. **Simone**) il pannello dell'organizzatore non compare sulle partite che non hai creato.
6. Nelle impostazioni del gruppo (admin) puoi limitare la creazione delle partite agli admin, cambiare il minimo di partite per le classifiche, attivare "chi perde offre" e aggiungere opzioni al terzo tempo.

### 11. Profilo, tema e uscita

1. Nel **Profilo** carica una foto (viene ritagliata e ridotta nel browser), scegli ruolo e piede. Senza foto restano le iniziali colorate.
2. Cambia il tema: **Scuro** o **Chiaro**.
3. **Esci da questo dispositivo**: il token viene revocato sul server, quindi anche una copia del vecchio token non funziona più.
