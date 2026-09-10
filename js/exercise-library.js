/* GymBro - libreria statica di esercizi suggeriti.
 * Questa lista NON viene salvata nel database: serve solo come suggerimento nel
 * selettore. Un esercizio entra nel catalogo reale (e quindi nei grafici e nella
 * lista globale) SOLO quando lo scegli e lo inserisci in una scheda.
 * Tag in italiano, coerenti con i gruppi muscolari.
 */
export const EXERCISE_LIBRARY = [
  // ---- Petto ----
  { name: 'Chest press', tags: ['petto', 'tricipiti'] },
  { name: 'Panca piana bilanciere', tags: ['petto', 'tricipiti'] },
  { name: 'Panca inclinata manubri', tags: ['petto', 'spalle'] },
  { name: 'Croci ai cavi', tags: ['petto'] },
  { name: 'Croci con manubri', tags: ['petto'] },
  { name: 'Piegamenti (push-up)', tags: ['petto', 'tricipiti', 'core'] },
  { name: 'Pectoral machine (peck deck)', tags: ['petto'] },
  { name: 'Dip alle parallele', tags: ['petto', 'tricipiti'] },

  // ---- Schiena ----
  { name: 'Lat machine', tags: ['schiena', 'dorsali', 'bicipiti'] },
  { name: 'Trazioni alla sbarra', tags: ['schiena', 'dorsali', 'bicipiti'] },
  { name: 'Rematore bilanciere', tags: ['schiena', 'dorsali'] },
  { name: 'Rematore manubrio', tags: ['schiena', 'dorsali'] },
  { name: 'Pulley (rematore ai cavi)', tags: ['schiena', 'dorsali'] },
  { name: 'Pull-over ai cavi', tags: ['schiena', 'dorsali'] },
  { name: 'Stacco da terra', tags: ['schiena', 'gambe', 'glutei'] },
  { name: 'Iperestensioni (lombari)', tags: ['schiena', 'lombari', 'glutei'] },

  // ---- Gambe ----
  { name: 'Squat bilanciere', tags: ['gambe', 'quadricipiti', 'glutei'] },
  { name: 'Leg press', tags: ['gambe', 'quadricipiti', 'glutei'] },
  { name: 'Leg extension', tags: ['gambe', 'quadricipiti'] },
  { name: 'Leg curl', tags: ['gambe', 'femorali'] },
  { name: 'Affondi con manubri', tags: ['gambe', 'quadricipiti', 'glutei'] },
  { name: 'Hack squat', tags: ['gambe', 'quadricipiti'] },
  { name: 'Stacco rumeno', tags: ['gambe', 'femorali', 'glutei'] },
  { name: 'Calf machine (polpacci)', tags: ['gambe', 'polpacci'] },
  { name: 'Adductor machine', tags: ['gambe', 'adduttori'] },
  { name: 'Abductor machine', tags: ['gambe', 'glutei'] },

  // ---- Glutei ----
  { name: 'Hip thrust', tags: ['glutei', 'femorali', 'gambe'] },
  { name: 'Glute machine (slancio)', tags: ['glutei', 'gambe'] },
  { name: 'Ponte per glutei', tags: ['glutei', 'core', 'gambe'] },

  // ---- Spalle ----
  { name: 'Shoulder press manubri', tags: ['spalle', 'deltoidi', 'tricipiti'] },
  { name: 'Lento avanti bilanciere', tags: ['spalle', 'deltoidi', 'tricipiti'] },
  { name: 'Alzate laterali', tags: ['spalle', 'deltoidi'] },
  { name: 'Alzate frontali', tags: ['spalle', 'deltoidi'] },
  { name: 'Alzate posteriori (reverse fly)', tags: ['spalle', 'deltoidi', 'schiena'] },
  { name: 'Tirate al mento', tags: ['spalle', 'deltoidi', 'trapezi'] },
  { name: 'Scrollate (shrug)', tags: ['spalle', 'trapezi'] },

  // ---- Bicipiti ----
  { name: 'Curl con bilanciere', tags: ['bicipiti'] },
  { name: 'Curl con manubri', tags: ['bicipiti'] },
  { name: 'Curl a martello', tags: ['bicipiti', 'avambracci'] },
  { name: 'Curl ai cavi', tags: ['bicipiti'] },
  { name: 'Curl alla panca Scott', tags: ['bicipiti'] },

  // ---- Tricipiti ----
  { name: 'Push down ai cavi', tags: ['tricipiti'] },
  { name: 'French press', tags: ['tricipiti'] },
  { name: 'Estensioni sopra la testa', tags: ['tricipiti'] },
  { name: 'Dip su panca', tags: ['tricipiti'] },

  // ---- Core / Addominali ----
  { name: 'Plank', tags: ['core', 'addominali'] },
  { name: 'Plank con peso', tags: ['core', 'addominali'] },
  { name: 'Crunch', tags: ['addominali', 'core'] },
  { name: 'Crunch ai cavi', tags: ['addominali', 'core'] },
  { name: 'Russian twist', tags: ['addominali', 'core', 'obliqui'] },
  { name: 'Leg raise (alzate gambe)', tags: ['addominali', 'core'] },
  { name: 'Ab wheel (ruota addominale)', tags: ['addominali', 'core'] },
];
