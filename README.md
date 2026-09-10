# GymBro 🏋️

App personale (PWA) per gestire le schede di allenamento in palestra. Funziona offline, i dati restano solo sul tuo telefono. Nessun server, nessun account.

## Cosa fa

- **Schede** divise per giorni (G1, G2, G3…), con nota generale e default (serie × ripetizioni × recupero).
- **Esercizi** singoli o in **super serie** (due o più esercizi collegati).
- **Parametri per esercizio**: puoi lasciare i default della scheda oppure impostare serie/ripetizioni/recupero diversi per il singolo esercizio.
- **Peso nel tempo**: ogni volta che aggiorni un peso resta nello storico datato. Il campo nota libera gestisce casi come "10 per lato".
- **Catalogo esercizi riutilizzabile**: quando aggiungi un esercizio ti vengono suggeriti quelli già fatti (con filtro per tag), così non crei doppioni e lo storico continua tra una scheda e l'altra.
- **Tag** (es. `#gambe`, `#deltoidi`) sugli esercizi.
- **Grafici**:
  - *Scheda corrente*: esercizi di uno stesso tag mostrati come linee affiancate, più il conteggio esercizi per gruppo.
  - *Andamento generale*: tutto lo storico, tra tutte le schede.
- **Backup**: export/import in JSON dalla sezione "Altro".

## Come usarla

### Opzione A — provala subito sul PC
Serve un piccolo server locale (aprire il file con doppio clic non abilita moduli e service worker).

```powershell
# dalla cartella del progetto
python -m http.server 8765
```
Poi apri `http://localhost:8765` nel browser.

### Opzione B — sul telefono, sempre disponibile (consigliata)
Pubblica i file su **GitHub Pages** (gratis, nessun server da gestire):

1. Crea un repository su GitHub e carica tutti i file di questa cartella.
2. Repository → **Settings → Pages** → Source: branch `main`, cartella `/root`.
3. Dopo qualche minuto avrai un URL tipo `https://tuo-utente.github.io/gymbro/`.
4. Aprilo su Chrome Android → menu ⋮ → **Aggiungi a schermata Home**.

Da quel momento GymBro è un'icona sul telefono e funziona anche **senza rete** (utile in palestra). I dati restano sul telefono.

### Opzione C — sul Raspberry Pi
Copia la cartella e servila con qualsiasi web server (es. `python3 -m http.server 8080` o nginx). Utile se in futuro vuoi un backup centrale o la sincronizzazione tra dispositivi. Per l'uso in palestra la PWA installata funziona già offline, quindi non è necessario esporre il Raspberry su internet.

## Backup dei dati

I dati sono salvati in **IndexedDB**, solo su quel browser/dispositivo. Ogni tanto usa **Altro → Esporta backup** per salvarti un file `.json`. Per ripristinare o spostare i dati su un altro telefono: **Altro → Importa backup**.

## Struttura del progetto

```
index.html            markup + navigazione
styles.css            tema dark mobile-first
manifest.webmanifest  metadati PWA (installabilità)
sw.js                 service worker (cache offline)
icons/                icone app
js/
  app.js              entry point, registra le view
  router.js           router hash-based
  db.js               wrapper IndexedDB
  store.js            logica di dominio (schede, esercizi, pesi, tag, backup)
  ui.js               helper DOM, modali, toast
  chart.js            grafico a linee su canvas
  views/
    schede.js         lista schede
    scheda.js         editor scheda (giorni, esercizi, super serie, peso)
    picker.js         selettore esercizio riutilizzabile
    esercizi.js       catalogo + dettaglio esercizio con storico
    grafici.js        grafici per tag (scheda corrente / generale)
    impostazioni.js   backup, installazione, reset
```

## Note

- Nessuna dipendenza esterna: solo HTML, CSS e JavaScript.
- Il service worker si attiva solo quando l'app è servita via http/https (non con `file://`).
