/* GymBro - view: autenticazione (login / registrazione email+password).
 *
 * Modale costruito su openModal() di ui.js. Nessun OAuth: solo email+password.
 * Tutte le stringhe sono in italiano. Gli helper signIn/signUp arrivano da
 * supabase.js e restituiscono il { data, error } di supabase: qui decidiamo
 * come mostrare l'errore (riga inline + toast) tenendo il modale aperto in
 * caso di errore e chiudendolo solo in caso di successo.
 */
import { el, openModal, toast } from '../ui.js';
import { signIn, signUp } from '../supabase.js';

/** Apre il modale di accesso/registrazione. */
export function openAuthModal() {
  let mode = 'login'; // 'login' | 'signup'

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
  const toggle = el('button', {
    class: 'btn btn-ghost btn-block',
    style: 'margin-top:4px;',
  });

  const emailField = el('div', { class: 'field' }, [el('label', { text: 'Email' }), emailInput]);
  const passField = el('div', { class: 'field' }, [el('label', { text: 'Password' }), passInput]);

  const body = el('div', {}, [intro, emailField, passField, errorLine, toggle]);

  // actions[1] è l'azione primaria: ne aggiorniamo l'etichetta col toggle.
  const m = openModal('Accesso', body, [
    { label: 'Annulla', class: 'btn-ghost', onClick: (close) => close() },
    { label: 'Accedi', class: 'btn-primary', onClick: (close) => submit(close) },
  ]);

  // Riferimento al bottone primario nel DOM del modale per aggiornarne il testo.
  const primaryBtn = m.body.parentElement.querySelector('.modal-actions .btn-primary');

  const applyMode = () => {
    showError('');
    if (mode === 'login') {
      intro.textContent = 'Accedi per sincronizzare i tuoi dati sul cloud e usarli su più dispositivi.';
      if (primaryBtn) primaryBtn.textContent = 'Accedi';
      toggle.textContent = 'Non hai un account? Registrati';
      passInput.setAttribute('autocomplete', 'current-password');
    } else {
      intro.textContent = 'Crea un account per salvare i tuoi dati sul cloud. Resta tutto utilizzabile anche senza account.';
      if (primaryBtn) primaryBtn.textContent = 'Registrati';
      toggle.textContent = 'Hai già un account? Accedi';
      passInput.setAttribute('autocomplete', 'new-password');
    }
  };

  toggle.addEventListener('click', () => {
    mode = mode === 'login' ? 'signup' : 'login';
    applyMode();
  });

  async function submit(close) {
    const email = emailInput.value.trim();
    const password = passInput.value;
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
