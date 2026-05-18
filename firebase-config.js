/* ===== Configuración de Firebase =====
 *
 * Para activar la sincronización entre móviles:
 * 1. Crea un proyecto en https://console.firebase.google.com
 * 2. Activa Realtime Database (modo bloqueado)
 * 3. En reglas pega:
 *    {
 *      "rules": {
 *        ".read": "true",
 *        ".write": "true"
 *      }
 *    }
 * 4. Registra una app web y copia el firebaseConfig
 * 5. Pega tu config aquí abajo y sube el archivo
 */

const FIREBASE_CONFIG = {
  // REEMPLAZA ESTOS VALORES con los de tu proyecto:
  apiKey: "REEMPLAZAR_API_KEY",
  authDomain: "REEMPLAZAR.firebaseapp.com",
  databaseURL: "https://REEMPLAZAR-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "REEMPLAZAR",
  storageBucket: "REEMPLAZAR.appspot.com",
  messagingSenderId: "REEMPLAZAR",
  appId: "REEMPLAZAR"
};

// Si la API key sigue siendo "REEMPLAZAR_API_KEY", se ejecuta en modo local sin sync
window.FIREBASE_ENABLED = !FIREBASE_CONFIG.apiKey.startsWith("REEMPLAZAR");
window.FIREBASE_CONFIG = FIREBASE_CONFIG;
