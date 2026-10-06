# GymBro · Setup Supabase (login + sync cloud)

Guida passo-passo per configurare Supabase come backup online + multi-utente.
Questa parte si fa **a mano sulla dashboard di Supabase** (e sulla Google Cloud
Console per il login Google). Il codice dell'app arriva dopo, in un secondo
momento.

Modello scelto:
- **Local-first**: IndexedDB resta la fonte di verità locale, l'app funziona
  offline come adesso. Supabase è la copia remota che si sincronizza.
- **Auth**: email+password e Google.
- **Sync**: ad ogni modifica (con debounce) + all'avvio + tasto manuale.
- **Conflitti**: last-write-wins sul campo `updated_at`.

URL dell'app in produzione: `https://stranu.github.io/GymBro/`

---

## 0. Concetti di sicurezza (leggere una volta)

- La **anon key** è una chiave *public*: è giusto che stia nel codice frontend,
  anche se la repo è pubblica. La sicurezza NON dipende dal nasconderla.
- La sicurezza dipende da **RLS (Row Level Security)**: con le policy attive,
  ogni utente legge/scrive solo le righe con `user_id = auth.uid()`.
- La chiave `service_role` **non va mai** nel frontend. Nell'app non la useremo
  proprio (non c'è backend).
- Piano free: il progetto va in **pausa dopo ~1 settimana di inattività totale**.
  Al primo accesso successivo si risveglia in qualche secondo. Per uso personale
  è irrilevante.

---

## 1. Creare il progetto Supabase

1. Vai su https://supabase.com → **New project**.
2. Scegli un nome (es. `gymbro`), una password per il DB (salvala nel tuo
   password manager, serve solo per accessi diretti al Postgres), e una region
   vicina (es. `West EU (Ireland)`).
3. Attendi il provisioning (~2 min).

Dalla sezione **Project Settings → API** annota:
- **Project URL** (es. `https://xxxxxxxx.supabase.co`)
- **anon public key** (una stringa lunga che inizia con `eyJ...`)

Questi due valori andranno nel codice dell'app (modulo `js/supabase.js`).

---

## 2. Creare le tabelle + RLS (SQL)

Apri **SQL Editor → New query**, incolla tutto il blocco seguente e premi **Run**.
Crea le 3 tabelle che rispecchiano gli store di IndexedDB, con `user_id`,
`updated_at`, e `deleted` (soft-delete, serve per propagare le cancellazioni in
sync). Attiva RLS e le policy "solo le proprie righe".

```sql
-- ============================================================
-- GymBro schema
-- ============================================================

-- WORKOUTS (schede)
create table if not exists public.workouts (
  id          text primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  name        text,
  note        text,
  defaults    jsonb,
  days        jsonb,
  archived    boolean default false,
  created_at  timestamptz,
  updated_at  timestamptz not null default now(),
  deleted     boolean not null default false
);

-- EXERCISES (catalogo esercizi)
create table if not exists public.exercises (
  id          text primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  name        text,
  name_lower  text,
  tags        jsonb,
  created_at  timestamptz,
  updated_at  timestamptz not null default now(),
  deleted     boolean not null default false
);

-- WEIGHT LOG (storico pesi)
create table if not exists public.weight_log (
  id           text primary key,
  user_id      uuid not null references auth.users (id) on delete cascade,
  exercise_id  text,
  date         text,
  value        double precision,
  note         text,
  workout_id   text,
  updated_at   timestamptz not null default now(),
  deleted      boolean not null default false
);

-- Indici utili per il pull incrementale (per utente, ordinato per updated_at)
create index if not exists workouts_user_updated   on public.workouts   (user_id, updated_at);
create index if not exists exercises_user_updated   on public.exercises  (user_id, updated_at);
create index if not exists weight_log_user_updated  on public.weight_log (user_id, updated_at);

-- ============================================================
-- Row Level Security
-- ============================================================
alter table public.workouts   enable row level security;
alter table public.exercises  enable row level security;
alter table public.weight_log enable row level security;

-- WORKOUTS policies
create policy "workouts_select_own" on public.workouts
  for select using (auth.uid() = user_id);
create policy "workouts_insert_own" on public.workouts
  for insert with check (auth.uid() = user_id);
create policy "workouts_update_own" on public.workouts
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "workouts_delete_own" on public.workouts
  for delete using (auth.uid() = user_id);

-- EXERCISES policies
create policy "exercises_select_own" on public.exercises
  for select using (auth.uid() = user_id);
create policy "exercises_insert_own" on public.exercises
  for insert with check (auth.uid() = user_id);
create policy "exercises_update_own" on public.exercises
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "exercises_delete_own" on public.exercises
  for delete using (auth.uid() = user_id);

-- WEIGHT_LOG policies
create policy "weight_log_select_own" on public.weight_log
  for select using (auth.uid() = user_id);
create policy "weight_log_insert_own" on public.weight_log
  for insert with check (auth.uid() = user_id);
create policy "weight_log_update_own" on public.weight_log
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "weight_log_delete_own" on public.weight_log
  for delete using (auth.uid() = user_id);
```

### Verifica rapida RLS
Dopo il Run, vai in **Authentication → Policies** (o **Database → Policies**):
devi vedere 4 policy per ciascuna delle 3 tabelle, e l'indicatore RLS su
"Enabled". Se una tabella mostra RLS disabilitato, i suoi dati sarebbero
accessibili male: non proseguire finché non è attivo su tutte e tre.

Nota: nel codice useremo `upsert` (insert-or-update) sulla PK `id`. Teniamo gli
stessi `id` generati localmente (`id-xxxx`), così la riga locale e quella remota
hanno la stessa chiave e il sync è un semplice upsert.

---

## 3. Abilitare Auth: email + password

1. **Authentication → Providers → Email**: assicurati sia **Enabled**.
2. Decidi sulla **conferma email**:
   - Per i test iniziali puoi disattivare "Confirm email" (**Authentication →
     Providers → Email → Confirm email = off**) così entri subito.
   - Per l'uso con altri utenti è più pulito tenerla attiva.
3. **Authentication → URL Configuration**:
   - **Site URL**: `https://stranu.github.io/GymBro/`
   - **Redirect URLs** (aggiungi tutte quelle che userai):
     - `https://stranu.github.io/GymBro/`
     - `http://localhost:5173/` (o la porta che usi per i test locali)
     - `http://localhost:8080/`
   Questi URL servono perché dopo la conferma email / login OAuth l'utente venga
   riportato all'app. Senza, il redirect viene rifiutato.

---

## 4. Abilitare Auth: Google

Il login Google richiede un passaggio sulla **Google Cloud Console** (gratis),
poi incolli le credenziali in Supabase.

### 4a. Google Cloud Console
1. Vai su https://console.cloud.google.com → crea (o seleziona) un progetto.
2. **APIs & Services → OAuth consent screen**:
   - User type: **External** → Create.
   - Compila nome app ("GymBro"), email di supporto, email developer.
   - Scopes: lascia i default (email, profile, openid). Salva.
   - In **Test users** aggiungi la tua email (finché l'app è in "Testing" solo
     gli utenti di test possono loggarsi; va benissimo per ora).
3. **APIs & Services → Credentials → Create Credentials → OAuth client ID**:
   - Application type: **Web application**.
   - **Authorized JavaScript origins**:
     - `https://stranu.github.io`
     - `http://localhost:5173` (porta dei test locali)
   - **Authorized redirect URIs** → qui va l'URL di callback DI SUPABASE, che
     trovi al passo 4b. Formato:
     `https://<PROJECT_REF>.supabase.co/auth/v1/callback`
   - Create. Copia **Client ID** e **Client Secret**.

### 4b. Supabase
1. **Authentication → Providers → Google**: Enable.
2. Incolla **Client ID** e **Client Secret**.
3. In quella stessa schermata Supabase mostra il **Callback URL**
   (`https://<PROJECT_REF>.supabase.co/auth/v1/callback`): copialo e verifica che
   sia esattamente quello messo tra gli "Authorized redirect URIs" al punto 4a.
   Se non combaciano, il login Google fallisce con `redirect_uri_mismatch`.
4. Salva.

> Nota: finché il consent screen Google è in modalità "Testing", solo le email
> aggiunte come "Test users" possono entrare con Google. Per aprirlo a chiunque
> dovrai pubblicare l'app Google (processo a parte); per te e pochi amici i
> "Test users" bastano.

---

## 5. Cosa serve al codice (riepilogo da passare allo sviluppo)

Quando passiamo al codice dell'app serviranno:
- **Project URL** (passo 1)
- **anon public key** (passo 1)

Finiranno in un nuovo file `js/supabase.js`. Essendo valori public va bene
committarli nella repo pubblica.

---

## 6. Checklist finale prima del codice

- [ ] Progetto Supabase creato, URL + anon key annotati
- [ ] SQL eseguito senza errori
- [ ] RLS "Enabled" + 4 policy su `workouts`, `exercises`, `weight_log`
- [ ] Provider Email abilitato, Site URL + Redirect URLs impostati
- [ ] Provider Google abilitato con Client ID/Secret, callback combacia
- [ ] (consigliato) ti sei registrato una volta via email per avere un account
      di test

Quando questa checklist è completa, fammelo sapere con URL e anon key e
procedo con l'implementazione: client Supabase, schermata di login, sync engine
(dirty flag + debounce + pull all'avvio + soft-delete + last-write-wins),
migrazione iniziale dei dati locali al primo login, e UI account/sync nelle
Impostazioni.
