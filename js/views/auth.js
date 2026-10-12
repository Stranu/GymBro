/* GymBro - view: autenticazione (login / registrazione / recupero password).
 *
 * Modale costruito su openModal() di ui.js. Nessun OAuth: solo email+password.
 * Tutte le stringhe sono in italiano. Gli helper signIn/signUp/resetPassword
 * arrivano da supabase.js e restituiscono il { data, error } di supabase: qui
 * decidiamo come mostrare l'errore (riga inline + toast) tenendo il modale
 * aperto in caso di errore e chiudendolo solo in caso di successo.
 *
 * Tre modalità (mode):
 *  - 'login'   accesso email+password
 *  - 'signup'  registrazione email+password
 *  - 'recover' recupero password: solo email, invia il link di reset via mail.
 *    Cliccando il link l'utente torna all'app in sessione di "recovery" e può
 *    impostare una nuova password (gestione dell'evento PASSWORD_RECOVERY lato
 *    app, vedi js/app.js).
 */
import { el, openModal, toast } from '../ui.js';
import { signIn, signUp, resetPassword, updatePassword } from '../supabase.js';

/** Apre il modale di accesso/registrazione/recupero. */
export function openAuthModal() {
  let mode = 'login'; // 'login' | 'signup' | 'recover'

  const emailInput = el('input', {
    class: 'input', type: 'email', placeholder: 'tu@email.it', autocomplete: 'email',
  });
  const passInput = el('input', {
    class: 'input', type: 'password', placeholder: 'password', autocomplete: 'current-password',
  });

  const errorLine = el('p', { class: 'small', style: 'color:var(--danger); margin:6px 0 0; display:none;' });
  const showError = (msg) => {
    errorLine.textContent = msg;
    errorLine.style.display = msg ? '' : 'none';
  };

  const intro = el('p', { class: 'muted small' });

  // Campo password: in modalità 'recover' viene nascosto (serve solo l'email).
  const passField = el('div', { class: 'field' }, [el('label', { text: 'Password' }), passInput]);
  const emailField = el('div', { class: 'field' }, [el('label', { text: 'Email' }), emailInput]);

  // Link "Password dimenticata?" (visibile solo in login).
  const forgot = el('button', {
    class: 'btn btn-ghost btn-block',
    style: 'margin-top:4px; font-size:0.85rem;',
    text: 'Password dimenticata?',
  });

  // Toggle login <-> signup (nascosto in 'recover', dove usiamo "Torna indietro").
  const toggle = el('button', {
    class: 'btn btn-ghost btn-block',
    style: 'margin-top:4px;',
  });

  const body = el('div', {}, [intro, emailField, passField, errorLine, forgot, toggle]);

  // actions[1] è l'azione primaria: ne aggiorniamo l'etichetta col mode.
  const m = openModal('Accesso', body, [
    { label: 'Annulla', class: 'btn-ghost', onClick: (close) => close() },
    { label: 'Accedi', class: 'btn-primary', onClick: (close) => submit(close) },
  ]);

  // Riferimento al bottone primario nel DOM del modale per aggiornarne il testo.
  const primaryBtn = m.body.parentElement.querySelector('.modal-actions .btn-primary');

  const setText = (btn, t) => { if (btn) btn.textContent = t; };

  const applyMode = () => {
    showError('');
    if (mode === 'login') {
      intro.textContent = 'Accedi per sincronizzare i tuoi dati sul cloud e usarli su più dispositivi.';
      passField.style.display = '';
      forgot.style.display = '';
      setText(primaryBtn, 'Accedi');
      toggle.textContent = 'Non hai un account? Registrati';
      passInput.setAttribute('autocomplete', 'current-password');
    } else if (mode === 'signup') {
      intro.textContent = 'Crea un account per salvare i tuoi dati sul cloud. Resta tutto utilizzabile anche senza account.';
      passField.style.display = '';
      forgot.style.display = 'none';
      setText(primaryBtn, 'Registrati');
      toggle.textContent = 'Hai già un account? Accedi';
      passInput.setAttribute('autocomplete', 'new-password');
    } else { // recover
      intro.textContent = 'Inserisci la tua email: ti invieremo un link per reimpostare la password.';
      passField.style.display = 'none';
      forgot.style.display = 'none';
      setText(primaryBtn, 'Invia link di recupero');
      toggle.textContent = '‹ Torna all\'accesso';
    }
  };

  forgot.addEventListener('click', () => {
    mode = 'recover';
    applyMode();
    setTimeout(() => emailInput.focus(), 50);
  });

  toggle.addEventListener('click', () => {
    // In 'recover' il toggle riporta al login; altrimenti alterna login/signup.
    if (mode === 'recover') mode = 'login';
    else mode = mode === 'login' ? 'signup' : 'login';
    applyMode();
  });

  async function submit(close) {
    const email = emailInput.value.trim();
    const password = passInput.value;

    // --- Recupero password: serve solo l'email. ---
    if (mode === 'recover') {
      if (!email) {
        showError('Inserisci la tua email.');
        return;
      }
      showError('');
      try {
        const { error } = await resetPassword(email);
        if (error) {
          showError(error.message);
          toast(error.message);
          return; // modale resta aperto
        }
        // Non riveliamo se l'email esiste o meno: messaggio neutro.
        toast('Se l\'email è registrata, riceverai un link per reimpostare la password.');
        close();
      } catch (err) {
        console.error(err);
        showError('Errore di connessione. Riprova.');
        toast('Errore di connessione');
      }
      return;
    }

    // --- Login / registrazione: email + password. ---
    if (!email || !password) {
      showError('Inserisci email e password.');
      return;
    }
    showError('');
    try {
      const { error } = mode === 'login'
        ? await signIn(email, password)
        : await signUp(email, password);
      if (error) {
        showError(error.message);
        toast(error.message);
        return; // modale resta aperto
      }
      if (mode === 'signup') {
        // Se la conferma email è attiva non c'è ancora una sessione.
        toast('Registrazione effettuata. Controlla la tua email se richiesto.');
      } else {
        toast('Accesso effettuato');
      }
      close();
    } catch (err) {
      console.error(err);
      showError('Errore di connessione. Riprova.');
      toast('Errore di connessione');
    }
  }

  applyMode();
  setTimeout(() => emailInput.focus(), 50);
}

/**
 * Apre il modale per impostare una NUOVA password. Va aperto quando Supabase
 * emette l'evento PASSWORD_RECOVERY (l'utente è tornato dal link email ed è in
 * sessione di recovery). Chiude solo in caso di successo.
 */
export function openNewPasswordModal() {
  const passInput = el('input', {
    class: 'input', type: 'password', placeholder: 'nuova password', autocomplete: 'new-password',
  });
  const pass2Input = el('input', {
    class: 'input', type: 'password', placeholder: 'ripeti password', autocomplete: 'new-password',
  });

  const errorLine = el('p', { class: 'small', style: 'color:var(--danger); margin:6px 0 0; display:none;' });
  const showError = (msg) => {
    errorLine.textContent = msg;
    errorLine.style.display = msg ? '' : 'none';
  };

  const body = el('div', {}, [
    el('p', { class: 'muted small', text: 'Imposta la tua nuova password.' }),
    el('div', { class: 'field' }, [el('label', { text: 'Nuova password' }), passInput]),
    el('div', { class: 'field' }, [el('label', { text: 'Ripeti password' }), pass2Input]),
    errorLine,
  ]);

  const m = openModal('Nuova password', body, [
    { label: 'Annulla', class: 'btn-ghost', onClick: (close) => close() },
    { label: 'Salva password', class: 'btn-primary', onClick: (close) => submit(close) },
  ]);

  async function submit(close) {
    const p1 = passInput.value;
    const p2 = pass2Input.value;
    if (!p1 || !p2) { showError('Compila entrambi i campi.'); return; }
    if (p1.length < 6) { showError('La password deve avere almeno 6 caratteri.'); return; }
    if (p1 !== p2) { showError('Le due password non coincidono.'); return; }
    showError('');
    try {
      const { error } = await updatePassword(p1);
      if (error) { showError(error.message); toast(error.message); return; }
      toast('Password aggiornata');
      close();
    } catch (err) {
      console.error(err);
      showError('Errore di connessione. Riprova.');
      toast('Errore di connessione');
    }
  }

  setTimeout(() => passInput.focus(), 50);
}
