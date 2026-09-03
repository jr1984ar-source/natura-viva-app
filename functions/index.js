const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onRequest, onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");
const { bienvenidaHTML, bienvenidaTexto } = require("./email-bienvenida");

admin.initializeApp();

// ============================================================
// SEGURIDAD — helpers compartidos
// ============================================================

// Email con formato válido (validación servidor: el cliente puede mandar cualquier cosa)
const _EMAIL_RE = /^[^\s@,;]+@[^\s@,;]+\.[a-zA-Z]{2,}$/;
function _esEmailValido(e) { return typeof e === "string" && e.length <= 254 && _EMAIL_RE.test(e.trim()); }
// Un email pegado con coma ("a@b.com,") pasaba el filtro viejo y Resend tumbaba
// el envio ENTERO con un 422: no lo recibia nadie, ni el bcc. Partimos por
// comas/puntoycoma/espacios y nos quedamos solo con los que son validos.
function _limpiaEmails(lista, max) {
  return (Array.isArray(lista) ? lista : [])
    .flatMap(e => String(e == null ? "" : e).split(/[,;\s]+/))
    .map(e => e.trim()).filter(Boolean)
    .filter(_esEmailValido)
    .filter((v, i, a) => a.indexOf(v) === i)
    .slice(0, max);
}

// Rate limit por clave (uid, adminUid...) con ventana deslizante simple en RTDB.
// Devuelve true si la petición puede pasar. rl/* está denegado a clientes en las reglas.
async function _rateLimit(clave, max, ventanaMs, failClosed) {
  try {
    const ref = admin.database().ref(`rl/${String(clave).replace(/[.#$\[\]\/]/g, "_")}`);
    const now = Date.now();
    const tx = await ref.transaction((v) => {
      if (!v || typeof v.t0 !== "number" || (now - v.t0) > ventanaMs) return { t0: now, n: 1 };
      if (v.n >= max) return; // aborta la transacción -> limitado
      return { t0: v.t0, n: v.n + 1 };
    });
    return !!tx.committed;
  } catch (e) {
    // Si el limitador falla: por defecto no bloqueamos al usuario legítimo
    // (límites de coste). Pero en las funciones abusables (relay de email) se
    // pasa failClosed=true: ante un fallo, mejor denegar que abrir el relay.
    console.warn("rateLimit warn:", e && e.message);
    return !failClosed;
  }
}

// ¿Es el DUEÑO de la cuenta (no un empleado suyo)? Para las zonas de dinero:
// facturación, contabilidad, compras y ajustes son solo del admin. Se exige
// además que no sea una cuenta interna de empleado (@nv.local), por si alguna
// vez un uid de empleado acabara colado en team_uids.
function _esDuenoCuenta(auth, adminUid) {
  if (!auth || !adminUid || typeof adminUid !== "string") return false;
  const email = (auth.token && auth.token.email) || "";
  if (email.endsWith("@nv.local")) return false;
  return auth.uid === adminUid;
}

// ¿El uid es el admin o un empleado de su equipo? (autorización de datos)
async function _accesoAdmin(uid, adminUid) {
  if (!uid || !adminUid || typeof adminUid !== "string") return false;
  if (uid === adminUid) return true;
  try {
    const snap = await admin.database().ref(`users/${adminUid}/team_uids/${uid}`).get();
    return snap.val() === true;
  } catch (e) { return false; }
}

// Sanea un id para usarlo en rutas de Storage (sin /, .., etc.)
function _idSeguro(s, fallback) {
  const v = String(s == null ? "" : s).replace(/[^A-Za-z0-9_-]+/g, "-").slice(0, 80);
  return v || fallback;
}

// Bloquea peticiones de red peligrosas dentro de Puppeteer (el HTML lo manda el
// cliente): metadata de GCP, IPs privadas y esquemas no cifrados.
async function _blindarPagina(page) {
  await page.setRequestInterception(true);
  page.on("request", (r) => {
    const u = r.url();
    if (/^(data|about|blob):/i.test(u)) { r.continue(); return; }
    try {
      const url = new URL(u);
      const h = url.hostname;
      if (url.protocol !== "https:" ||
          h === "metadata.google.internal" || h === "localhost" ||
          /^169\.254\./.test(h) || /^127\./.test(h) || /^0\./.test(h) ||
          /^10\./.test(h) || /^192\.168\./.test(h) ||
          /^172\.(1[6-9]|2\d|3[01])\./.test(h)) { r.abort(); return; }
      r.continue();
    } catch (e) { r.abort(); }
  });
}

// ============================================================
// Función existente: checkReminders (recordatorios FCM cada minuto)
// ============================================================
// URL de la Realtime Database (para la consulta shallow por REST).
const _DB_URL = "https://natura-viva-ddc86-default-rtdb.europe-west1.firebasedatabase.app";

// Lista SOLO las claves (uids) de /users SIN descargar los datos de cada usuario
// (consulta shallow por REST). Devuelve null si no se pudo, para que el llamador
// use el camino de respaldo. Esto evita bajarse toda la base de datos cada minuto.
async function _listarUidsShallow() {
  try {
    const cred = admin.app().options.credential;
    const tok = cred && (await cred.getAccessToken());
    const accessToken = tok && (tok.access_token || tok.accessToken || tok);
    if (!accessToken || typeof accessToken !== "string") return null;
    const resp = await fetch(`${_DB_URL}/users.json?shallow=true&access_token=${accessToken}`);
    if (!resp.ok) return null;
    const obj = await resp.json();
    return obj && typeof obj === "object" ? Object.keys(obj) : [];
  } catch (e) {
    console.warn("shallow uids warn:", e && e.message);
    return null;
  }
}

// Construye y envía UN aviso push (misma lógica de siempre). Limpia el token si es inválido.
async function _enviarRecordatorioPush(db, userId, r, token) {
  const title = r.title || "Natura Viva";
  const body = r.body || "";
  const message = {
    token,
    // Solo data — el SW construye la notificación.
    // Si se incluye "notification" iOS la muestra dos veces (x2 duplicado).
    data: { title: title, body: body, tag: `reminder-${r.id || Date.now()}` },
    // La app es una PWA, asi que el token es de Web Push: FCM aplica ESTE
    // bloque. El bloque "apns" de abajo solo vale para apps iOS NATIVAS y aqui
    // se ignora entero, por eso no servia de nada. Sin cabecera Urgency el push
    // sale como "normal" y el servicio de push puede retrasarlo para no
    // despertar el movil (RFC 8030): de ahi que los avisos llegaran tarde.
    // TTL 1 dia: si el movil esta apagado, el aviso se entrega al encenderlo
    // dentro de ese plazo en vez de perderse o llegar una semana despues.
    webpush: {
      headers: { Urgency: "high", TTL: "86400" },
    },
    apns: {
      payload: { aps: { "content-available": 1, sound: "default", badge: 1 } },
      headers: { "apns-priority": "10", "apns-push-type": "background" },
    },
    android: {
      priority: "high",
      data: { title, body, tag: `reminder-${r.id || Date.now()}` },
    },
  };
  try {
    await admin.messaging().send(message);
    console.log(`✓ Enviado a ${userId}: ${title}`);
  } catch (err) {
    console.error(`✗ Error:`, err.message);
    if (err.code === "messaging/invalid-registration-token" ||
        err.code === "messaging/registration-token-not-registered") {
      await db.ref(`users/${userId}/fcm_token`).remove();
    }
  }
}

// Procesa los recordatorios de UN usuario. getToken() lee el fcm_token de forma
// perezosa: solo si hay algún aviso que realmente toca enviar.
async function _procesarRecordatorios(db, userId, userReminders, now, getToken, promises) {
  if (!userReminders) return;
  // Los avisos cuelgan del nodo del ADMIN, pero el token FCM de cada usuario
  // cuelga de SU propio uid. Si un empleado programa un aviso, r.uid es el suyo
  // y hay que enviarlo a su movil, no al del admin. Cacheado por uid para no
  // releer el mismo token en cada aviso.
  const _tokensPorUid = {};
  const _tokenDe = async (uid) => {
    if (!(uid in _tokensPorUid)) {
      const s = await db.ref(`users/${uid}/fcm_token`).once("value");
      const o = s.val();
      _tokensPorUid[uid] = o && o.token ? o.token : null;
    }
    return _tokensPorUid[uid];
  };
  for (const [key, r] of Object.entries(userReminders)) {
    if (!r || !r.fireAt || r.fired || r.fireAt > now) continue;
    const p = (async () => {
      // Marcar como fired PRIMERO para evitar duplicados
      await db.ref(`users/${userId}/reminders/${key}/fired`).set(true);
      // Avisos guardados antes de este cambio no llevan uid: van al admin,
      // que es el comportamiento de siempre.
      const destinoUid = (typeof r.uid === "string" && r.uid) ? r.uid : userId;
      const token = destinoUid === userId ? await getToken() : await _tokenDe(destinoUid);
      if (!token) {
        console.warn(`Sin token FCM para ${destinoUid} — aviso ${key} descartado`);
        return;
      }
      await _enviarRecordatorioPush(db, destinoUid, r, token);
    })();
    promises.push(p);
  }
}

exports.checkReminders = onSchedule(
  { schedule: "every 1 minutes", region: "europe-west1", maxInstances: 1 },
  async (event) => {
  const db = admin.database();
  const now = Date.now();
  try {
    // Los avisos se guardan en users/{uid}/reminders/{key} y el token en users/{uid}/fcm_token.
    // ANTES: se descargaba TODO /users (facturas, fotos...) cada minuto → ~24 GB/día.
    // AHORA: se listan solo los uids (shallow) y se lee SOLO el nodo reminders de cada uno.
    const promises = [];
    const uids = await _listarUidsShallow();

    if (uids) {
      // Camino barato: por cada usuario, leer solo sus reminders (nodo diminuto).
      for (const userId of uids) {
        const remSnap = await db.ref(`users/${userId}/reminders`).once("value");
        const userReminders = remSnap.val();
        if (!userReminders) continue;
        // Token perezoso: solo se lee si hay un aviso que enviar.
        let _tokenCache;
        const getToken = async () => {
          if (_tokenCache === undefined) {
            const tSnap = await db.ref(`users/${userId}/fcm_token`).once("value");
            const tObj = tSnap.val();
            _tokenCache = tObj && tObj.token ? tObj.token : null;
          }
          return _tokenCache;
        };
        await _procesarRecordatorios(db, userId, userReminders, now, getToken, promises);
      }
    } else {
      // Respaldo (si el shallow fallara): comportamiento antiguo, para no romper los avisos.
      console.warn("checkReminders: shallow no disponible, usando lectura completa (respaldo)");
      const snapshot = await db.ref("users").once("value");
      const allUsers = snapshot.val() || {};
      for (const [userId, userData] of Object.entries(allUsers)) {
        if (!userData || !userData.reminders) continue;
        const tObj = userData.fcm_token;
        const _t = tObj && tObj.token ? tObj.token : null;
        await _procesarRecordatorios(db, userId, userData.reminders, now, async () => _t, promises);
      }
    }

    await Promise.all(promises);
    return null;
  } catch (err) {
    console.error("Error:", err);
    return null;
  }
});

// ============================================================
// Función nueva: identifyPlant (identificación de plantas vía Gemini)
// ============================================================
// La API key se guarda como "secret" de Firebase, NUNCA en el código.
// Para configurarla: firebase functions:secrets:set GEMINI_API_KEY
const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");

const PLANT_PROMPT = `Eres un experto botánico y agrónomo. Analiza la imagen y devuelve SOLO un JSON válido (sin markdown, sin \`\`\`, sin texto antes o después) con esta estructura exacta:

{
  "esPlanta": true|false,
  "nombreComun": "string",
  "nombreCientifico": "string",
  "familia": "string",
  "sol": "string descriptivo breve",
  "riego": "string descriptivo breve",
  "poda": "string descriptivo breve",
  "suelo": "string descriptivo breve",
  "epoca": "string descriptivo breve",
  "caracteristicas": "string con 1-2 frases sobre la planta",
  "diagnostico": "string con problemas detectados en la foto (manchas, deficiencias, plagas, enfermedades) o 'Apariencia saludable' si está bien",
  "recomendaciones": "string con acciones concretas a tomar"
}

Si la imagen NO contiene una planta claramente identificable, devuelve:
{
  "esPlanta": false,
  "mensaje": "No se detecta una planta en la imagen"
}

Responde en ESPAÑOL. Sé conciso pero útil. Adapta los consejos al clima de Mallorca (mediterráneo).`;

exports.identifyPlant = onRequest(
  {
    secrets: [GEMINI_API_KEY],
    region: "europe-west1",
    timeoutSeconds: 60,
    memory: "512MiB",
    maxInstances: 5,
    cors: true,
  },
  async (req, res) => {
    // Solo POST
    if (req.method === "OPTIONS") {
      res.set("Access-Control-Allow-Origin", "*");
      res.set("Access-Control-Allow-Methods", "POST");
      res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
      res.status(204).send("");
      return;
    }
    if (req.method !== "POST") {
      res.status(405).json({ error: "Solo POST permitido" });
      return;
    }

    // Auth real: ID token de Firebase (Authorization: Bearer <token>).
    // Antes se usaba un token compartido que iba hardcodeado en el frontend
    // — cualquiera podía copiarlo y quemar la cuota de Gemini.
    let uid;
    try {
      const m = (req.get("Authorization") || "").match(/^Bearer (.+)$/);
      if (!m) { res.status(401).json({ error: "No autorizado" }); return; }
      uid = (await admin.auth().verifyIdToken(m[1])).uid;
    } catch (e) {
      res.status(401).json({ error: "Sesión no válida" });
      return;
    }

    // Rate limit: 20 identificaciones / hora por usuario
    if (!(await _rateLimit(`plant_${uid}`, 20, 3600000))) {
      res.status(429).json({ error: "Demasiadas identificaciones. Prueba en un rato." });
      return;
    }

    try {
      const data = req.body;
      if (!data || !data.imageBase64) {
        res.status(400).json({ error: "Falta imageBase64" });
        return;
      }
      if (typeof data.imageBase64 !== "string" || data.imageBase64.length < 100) {
        res.status(400).json({ error: "imageBase64 no válida" });
        return;
      }
      // Limitar tamaño (~5MB en base64)
      if (data.imageBase64.length > 7000000) {
        res.status(413).json({ error: "Imagen demasiado grande (máx 5MB)" });
        return;
      }

      const mimeType = data.mimeType || "image/jpeg";
      const apiKey = GEMINI_API_KEY.value();

      if (!apiKey) {
        res.status(500).json({ error: "API key no configurada" });
        return;
      }

      // Llamada a Gemini 2.5 Flash (estable, multimodal, producción)
      // Imagen primero, texto después — orden recomendado para vision
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
      const body = {
        contents: [{
          parts: [
            { inline_data: { mime_type: mimeType, data: data.imageBase64 } },
            { text: PLANT_PROMPT },
          ],
        }],
        generationConfig: {
          temperature: 0.4,
          topP: 0.95,
          topK: 40,
          maxOutputTokens: 4096,
          // Gemini 2.5 trae "thinking" activado por defecto y sus tokens de
          // razonamiento consumen maxOutputTokens, dejando la respuesta VACÍA.
          // thinkingBudget: 0 lo desactiva (no hace falta para esta tarea).
          thinkingConfig: { thinkingBudget: 0 },
        },
      };

      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!resp.ok) {
        const errText = await resp.text();
        console.error("Gemini error:", resp.status, errText);
        res.status(500).json({ error: `Error de Gemini ${resp.status}`, detail: errText.slice(0, 500) });
        return;
      }

      const result = await resp.json();
      const text = result?.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!text) {
        console.error("Respuesta vacía:", JSON.stringify(result));
        res.status(500).json({ error: "Respuesta vacía de Gemini" });
        return;
      }

      // Limpiar posibles markdown wrappers y extraer JSON robustamente
      let cleanText = text.trim();
      // Quitar bloques de código markdown
      cleanText = cleanText.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
      // Buscar el primer { y el último } para extraer el JSON aunque haya texto extra
      const firstBrace = cleanText.indexOf('{');
      const lastBrace = cleanText.lastIndexOf('}');
      if (firstBrace >= 0 && lastBrace > firstBrace) {
        cleanText = cleanText.substring(firstBrace, lastBrace + 1);
      }

      let parsed;
      try {
        parsed = JSON.parse(cleanText);
      } catch (parseErr) {
        console.error("JSON inválido de Gemini. Texto original:", text);
        console.error("Texto limpiado:", cleanText);
        res.status(500).json({
          error: "Respuesta no válida de Gemini",
          detail: cleanText.slice(0, 300)
        });
        return;
      }

      res.status(200).json({ ok: true, data: parsed });
    } catch (err) {
      console.error("Error en identifyPlant:", err);
      res.status(500).json({ error: err.message || "Error desconocido" });
    }
  }
);

// ============================================================
// Función nueva: setPlan (cambiar plan + validez de una cuenta)
// La VERDAD del plan vive en plans/<uid>, que SOLO esta función
// (admin SDK) puede escribir. El cliente únicamente lee. Inviolable.
// La llama el super-admin (botón manual) y, en el futuro, el
// webhook de Stripe tras un pago confirmado.
// ============================================================
const SUPER_ADMIN_UID = "HaiM2tV9KjShHbY9GRUBaqeGGYh2";
const PLANES_VALIDOS = ["free", "autonomo", "empresa", "pro"];

exports.setPlan = onCall({ region: "europe-west1", maxInstances: 2 }, async (request) => {
  const callerUid = request.auth && request.auth.uid;
  if (!callerUid || callerUid !== SUPER_ADMIN_UID) {
    throw new HttpsError("permission-denied", "Solo el administrador puede cambiar planes.");
  }

  const data = request.data || {};
  const email = (data.email || "").trim();
  const plan = data.plan;
  const meses = parseInt(data.meses, 10);

  if (!email) throw new HttpsError("invalid-argument", "Falta el email.");
  if (!PLANES_VALIDOS.includes(plan)) throw new HttpsError("invalid-argument", "Plan no válido.");

  let userRecord;
  try {
    userRecord = await admin.auth().getUserByEmail(email);
  } catch (e) {
    throw new HttpsError("not-found", "No hay ninguna cuenta con ese email.");
  }
  const targetUid = userRecord.uid;

  // Días de validez: free = 14 días de prueba; de pago = meses × 30.
  const dias = (plan === "free") ? 14 : (isNaN(meses) || meses < 1 ? 1 : meses) * 30;
  const now = Date.now();
  const validUntil = now + dias * 86400000;

  await admin.database().ref(`plans/${targetUid}`).set({
    plan,
    validUntil,
    updatedAt: now,
    source: "manual",
    by: callerUid,
  });

  return { ok: true, email, uid: targetUid, plan, dias, validUntil };
});

// ============================================================
// STRIPE: checkout + webhook (suscripciones de los planes)
// ============================================================
// Claves como SECRETOS (nunca en el código):
//   firebase functions:secrets:set STRIPE_SECRET           (sk_test_... / sk_live_...)
//   firebase functions:secrets:set STRIPE_WEBHOOK_SECRET   (whsec_..., tras crear el webhook)
const STRIPE_SECRET = defineSecret("STRIPE_SECRET");
const STRIPE_WEBHOOK_SECRET = defineSecret("STRIPE_WEBHOOK_SECRET");
// Resend lo usan dos sitios: el email de bienvenida (dentro del webhook de
// Stripe) y el envío de facturas. Se declara aquí arriba para que el webhook,
// que se define antes, pueda incluirlo en su lista de secretos.
const RESEND_API_KEY = defineSecret("RESEND_API_KEY");

// --- Tabla de precios (MODO PRUEBA) -------------------------------------
// Al pasar a producción, sustituye estos price_... por los del modo real
// (Stripe genera IDs distintos). Es el ÚNICO sitio que hay que tocar.
const PRECIOS = {
  autonomo: { month: "price_1TnkXSRrKOND7hrrCORLW3cC", year: "price_1TnkbFRrKOND7hrrsctwiS0B" },
  empresa:  { month: "price_1TnkcBRrKOND7hrrNsOEBgG7", year: "price_1TnkcbRrKOND7hrrNg9WdxMO" },
  pro:      { month: "price_1Tnkd7RrKOND7hrrLuKKU44W", year: "price_1TnkdPRrKOND7hrrWQjTfV3C" },
};

// Mapa inverso precio -> plan. Permite deducir el plan a partir de lo que se pagó.
const PRECIO_A_PLAN = {};
for (const _p of Object.keys(PRECIOS)) {
  for (const _iv of Object.keys(PRECIOS[_p])) {
    PRECIO_A_PLAN[PRECIOS[_p][_iv]] = _p;
  }
}

// Deduce el plan a partir del precio de la suscripción. Infalible: cada precio
// pertenece a un único plan. Devuelve "" si no reconoce el precio.
function planDesdePrecio(sub) {
  try {
    const items = (sub && sub.items && sub.items.data) || [];
    for (const it of items) {
      const pid = it && it.price && it.price.id;
      if (pid && PRECIO_A_PLAN[pid]) return PRECIO_A_PLAN[pid];
    }
  } catch (e) {}
  return "";
}

// Fin del periodo en milisegundos. Compatible con la API nueva de Stripe
// (2026-xx), donde current_period_end puede venir en los items en lugar de
// en la suscripción.
function finDePeriodoMs(sub) {
  let end = (sub && sub.current_period_end) || 0;
  if (!end) {
    try {
      const items = (sub && sub.items && sub.items.data) || [];
      for (const it of items) {
        if (it && it.current_period_end) { end = it.current_period_end; break; }
      }
    } catch (e) {}
  }
  return end * 1000;
}

const LANDING_URL = "https://appnaturaviva.com";

// --- crearCheckout: la landing lo llama para iniciar el pago -------------
// El cliente YA está registrado (Firebase Auth), así que su uid sale del
// token verificado, no del cliente. Devolvemos la URL de Stripe Checkout.
// onRequest + cors:true (igual que identifyPlant, que sí funciona desde un
// dominio externo). La landing manda el ID token de Firebase en la cabecera
// Authorization: Bearer <token>, y aquí lo verificamos para sacar el uid.
exports.crearCheckout = onRequest(
  { region: "europe-west1", secrets: [STRIPE_SECRET], cors: true, maxInstances: 5 },
  async (req, res) => {
    if (req.method === "OPTIONS") {
      res.set("Access-Control-Allow-Origin", "*");
      res.set("Access-Control-Allow-Methods", "POST");
      res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
      res.status(204).send("");
      return;
    }
    if (req.method !== "POST") {
      res.status(405).json({ error: "Solo POST permitido" });
      return;
    }

    // Verificar el ID token de Firebase (Authorization: Bearer <idToken>).
    let uid, email;
    try {
      const authH = req.get("Authorization") || "";
      const m = authH.match(/^Bearer (.+)$/);
      if (!m) { res.status(401).json({ error: "No autenticado" }); return; }
      const decoded = await admin.auth().verifyIdToken(m[1]);
      uid = decoded.uid;
      email = decoded.email;
    } catch (e) {
      console.warn("[Stripe] crearCheckout token inválido:", e && e.message);
      res.status(401).json({ error: "Sesión no válida. Regístrate de nuevo." });
      return;
    }

    // Rate limit: 10 intentos de checkout / hora por usuario
    if (!(await _rateLimit(`checkout_${uid}`, 10, 3600000))) {
      res.status(429).json({ error: "Demasiados intentos. Prueba en un rato." });
      return;
    }

    const data = req.body || {};
    const plan = data.plan;
    const interval = data.interval === "year" ? "year" : "month";
    if (!PRECIOS[plan]) { res.status(400).json({ error: "Plan no válido" }); return; }
    const price = PRECIOS[plan][interval];
    if (!price) { res.status(400).json({ error: "Periodo no válido" }); return; }

    // Datos opcionales de las "2 preguntas" del embudo.
    const propiedades = (data.propiedades || "").toString().slice(0, 20);
    const empleados = (data.empleados || "").toString().slice(0, 20);

    const stripe = require("stripe")(STRIPE_SECRET.value().trim());

    try {
      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        line_items: [{ price, quantity: 1 }],
        customer_email: email || undefined,
        client_reference_id: uid,
        // metadata en la sesión Y en la suscripción: así el webhook conoce el
        // uid/plan tanto en el pago inicial como en renovaciones y bajas.
        metadata: { uid, plan, interval, propiedades, empleados },
        subscription_data: { metadata: { uid, plan, interval } },
        allow_promotion_codes: true,
        success_url: `${LANDING_URL}/gracias.html?sid={CHECKOUT_SESSION_ID}`,
        cancel_url: `${LANDING_URL}/?pago=cancelado`,
      });
      res.json({ url: session.url });
    } catch (err) {
      console.error("[Stripe] crearCheckout:", err.type, err.code, err.statusCode, err.message);
      res.status(500).json({ error: "No se pudo iniciar el pago" });
    }
  }
);

// --- Helper: activa/actualiza el plan en plans/<uid> --------------------
async function activarPlan(uid, plan, validUntilMs, extra) {
  if (!uid || !PLANES_VALIDOS.includes(plan)) {
    console.warn("[Stripe] activarPlan datos inválidos:", uid, plan);
    return;
  }
  const payload = Object.assign({
    plan,
    validUntil: validUntilMs,
    updatedAt: Date.now(),
    source: "stripe",
  }, extra || {});
  await admin.database().ref(`plans/${uid}`).set(payload);
  console.log(`[Stripe] Plan ${plan} activado para ${uid} hasta ${new Date(validUntilMs).toISOString()}`);
  // Bienvenida: solo la primera vez y solo si el plan queda de verdad vigente.
  // 🔴 activarPlan() se usa TAMBIÉN para cortar el acceso (impago, baja), que
  // pasa validUntil = ahora: ahí no hay nada que celebrar. Nunca debe tumbar
  // la activación del plan, por eso va con su propio try.
  if (validUntilMs > Date.now() + 60000) {
    try { await enviarBienvenida(uid, plan); }
    catch (e) { console.error("[Bienvenida] fallo no bloqueante:", e && e.message); }
  }
}

// --- Email de bienvenida al contratar ----------------------------------
// 🔴 activarPlan() se llama también en CADA renovación mensual
// ('invoice.paid'), y hace .set() sobre plans/<uid>, así que la marca de
// "ya enviado" no puede vivir ahí: se borraría y el cliente recibiría la
// bienvenida todos los meses. Va en su propio nodo, con transacción para
// que dos eventos simultáneos de Stripe no manden dos copias.
async function enviarBienvenida(uid, plan) {
  const key = String(uid).replace(/[.#$\[\]\/]/g, "_");
  const ref = admin.database().ref(`mail_bienvenida/${key}`);

  // Reserva el envío. Si ya había algo, otro ya lo mandó: nos vamos.
  const tx = await ref.transaction((v) => (v ? undefined : { ts: Date.now(), plan }));
  if (!tx.committed) return;

  try {
    const u = await admin.auth().getUser(uid);
    const to = u && u.email;
    if (!_esEmailValido(to)) {
      console.warn("[Bienvenida] sin email válido para", uid);
      await ref.set({ ts: Date.now(), plan, error: "sin-email" });
      return;
    }
    // displayName suele venir vacío; nos quedamos solo con el nombre de pila.
    const nombre = String((u && u.displayName) || "").trim().split(/\s+/)[0] || "";

    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + RESEND_API_KEY.value().trim(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Natura Viva <hola@send.appnaturaviva.com>",
        to: [to],
        reply_to: "hola@send.appnaturaviva.com",
        subject: "Ya está: tu cuenta de Natura Viva está lista",
        html: bienvenidaHTML({ nombre, plan }),
        text: bienvenidaTexto({ nombre, plan }),
      }),
    });
    const jr = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      // Liberamos la reserva: así el siguiente evento de Stripe lo reintenta.
      await ref.remove();
      console.error("[Bienvenida] Resend error:", resp.status, jr);
      return;
    }
    await ref.set({ ts: Date.now(), plan, to, id: (jr && jr.id) || null });
    console.log("[Bienvenida] enviada a", to, "plan", plan);
  } catch (e) {
    await ref.remove().catch(() => {});
    throw e;
  }
}

// ¿La suscripción está realmente pagada y viva? Estados de Stripe:
// 'incomplete' (el primer cargo no ha cuajado), 'past_due' / 'unpaid' (falló
// una renovación), 'active' / 'trialing' (bien). Con métodos de aviso diferido
// (adeudo SEPA, muy habitual en España) Stripe manda el evento de "compra
// completada" ANTES de saber si el dinero llega, así que hay que mirarlo.
function _subVigente(sub) {
  return !!sub && (sub.status === "active" || sub.status === "trialing");
}

// Evita procesar dos veces el mismo evento (Stripe reintenta ante cualquier
// error o timeout). Devuelve true si es la PRIMERA vez que se ve este id.
async function _eventoNuevo(eventId) {
  if (!eventId) return true;
  try {
    const ref = admin.database().ref(`stripe_events/${String(eventId).replace(/[.#$\[\]\/]/g, "_")}`);
    const tx = await ref.transaction((v) => (v ? undefined : { ts: Date.now() }));
    return !!tx.committed;
  } catch (e) {
    // Ante un fallo del registro, seguimos: activarPlan es idempotente.
    console.warn("[Stripe] _eventoNuevo:", e && e.message);
    return true;
  }
}

// --- webhookStripe: Stripe nos avisa de pagos/renovaciones/bajas --------
exports.webhookStripe = onRequest(
  { region: "europe-west1", secrets: [STRIPE_SECRET, STRIPE_WEBHOOK_SECRET, RESEND_API_KEY], maxInstances: 5 },
  async (req, res) => {
    const stripe = require("stripe")(STRIPE_SECRET.value().trim());
    let event;
    try {
      // La firma exige el cuerpo CRUDO (req.rawBody lo da Firebase).
      const sig = req.get("stripe-signature");
      event = stripe.webhooks.constructEvent(req.rawBody, sig, STRIPE_WEBHOOK_SECRET.value().trim());
    } catch (err) {
      console.error("[Stripe] Firma inválida:", err.message);
      res.status(400).send(`Webhook Error: ${err.message}`);
      return;
    }

    // Un evento del modo PRUEBA no puede tocar planes reales (ni al revés).
    const _esperadoLive = String(STRIPE_SECRET.value() || "").trim().startsWith("sk_live_");
    if (!!event.livemode !== _esperadoLive) {
      console.warn("[Stripe] Evento descartado por modo (livemode=", event.livemode, "esperado=", _esperadoLive, ")");
      res.json({ received: true, ignorado: "modo" });
      return;
    }
    // Reproceso del mismo evento: se responde OK y no se toca nada.
    if (!(await _eventoNuevo(event.id))) {
      res.json({ received: true, duplicado: true });
      return;
    }

    try {
      switch (event.type) {
        // Pago inicial. Identificamos al usuario y el plan de forma robusta,
        // sin depender de un único formato:
        //   uid  -> client_reference_id (parte antes de "--") o metadata.
        //   plan -> tras "--", o metadata de la sesión, o DEDUCIDO DEL PRECIO.
        case "checkout.session.completed": {
          const session = event.data.object;
          const subId = session.subscription;
          if (!subId) break; // pagos que no son de suscripción: ignorar

          const cref = session.client_reference_id || "";
          const sep = cref.indexOf("--");
          let uid = sep > 0 ? cref.slice(0, sep) : cref;
          let plan = sep > 0 ? cref.slice(sep + 2) : "";

          if (!PLANES_VALIDOS.includes(plan)) {
            const sm = session.metadata || {};
            if (PLANES_VALIDOS.includes(sm.plan)) plan = sm.plan;
          }

          const sub = await stripe.subscriptions.retrieve(subId);

          // Si seguimos sin plan fiable, lo deducimos del precio pagado.
          if (!PLANES_VALIDOS.includes(plan)) plan = planDesdePrecio(sub);
          // Respaldo de uid desde la metadata de la suscripción.
          if (!uid) { const sm2 = sub.metadata || {}; if (sm2.uid) uid = sm2.uid; }

          if (!uid || !PLANES_VALIDOS.includes(plan)) {
            console.warn("[Stripe] checkout: no pude determinar uid/plan. cref=", cref, "planDetectado=", plan);
            break;
          }

          // 🔴 NO activar sin cobro confirmado. Con adeudo SEPA y demás métodos
          // de aviso diferido, este evento llega igual con el pago en el aire:
          // antes se daba el plan completo y el cliente lo disfrutaba semanas
          // aunque el recibo acabara devuelto. Cuando el dinero entre de
          // verdad, Stripe manda 'invoice.paid' y ahí sí se activa.
          if (session.payment_status !== "paid" || !_subVigente(sub)) {
            console.warn("[Stripe] checkout SIN activar (pago no confirmado): uid=", uid,
              "payment_status=", session.payment_status, "sub.status=", sub && sub.status);
            // Sellamos igualmente uid/plan para que la factura futura sepa a quién activar.
            try { await stripe.subscriptions.update(subId, { metadata: { uid, plan } }); } catch (e) {}
            break;
          }

          const validUntil = finDePeriodoMs(sub);
          await activarPlan(uid, plan, validUntil, {
            stripeCustomerId: sub.customer,
            stripeSubscriptionId: sub.id,
            status: sub.status,
          });
          // Sellamos uid/plan en la suscripción para renovaciones y bajas futuras.
          try { await stripe.subscriptions.update(subId, { metadata: { uid, plan } }); } catch (e) {}
          break;
        }
        // Renovación: la suscripción ya lleva metadata sellada -> extendemos.
        case "invoice.paid": {
          const obj = event.data.object;
          const subId = obj.subscription;
          if (!subId) break;
          const sub = await stripe.subscriptions.retrieve(subId);
          const md = sub.metadata || {};
          const uid = md.uid || "";
          const plan = PLANES_VALIDOS.includes(md.plan) ? md.plan : planDesdePrecio(sub);
          if ((sub.status === "active" || sub.status === "trialing") && uid && PLANES_VALIDOS.includes(plan)) {
            const validUntil = finDePeriodoMs(sub);
            await activarPlan(uid, plan, validUntil, {
              stripeCustomerId: sub.customer,
              stripeSubscriptionId: sub.id,
              status: sub.status,
            });
          }
          break;
        }
        // Recibo devuelto o impagado: se corta el acceso ya, sin esperar a que
        // Stripe dé la suscripción por muerta (puede tardar semanas reintentando).
        case "invoice.payment_failed": {
          const obj = event.data.object;
          const subId = obj.subscription;
          if (!subId) break;
          const sub = await stripe.subscriptions.retrieve(subId);
          const md = sub.metadata || {};
          const uid = md.uid || "";
          const plan = PLANES_VALIDOS.includes(md.plan) ? md.plan : planDesdePrecio(sub);
          if (uid && PLANES_VALIDOS.includes(plan) && !_subVigente(sub)) {
            await activarPlan(uid, plan, Date.now(), {
              stripeCustomerId: sub.customer,
              stripeSubscriptionId: sub.id,
              status: sub.status,
            });
            console.warn("[Stripe] Pago fallido: acceso cortado para", uid, "sub.status=", sub.status);
          }
          break;
        }
        // Cambio de estado de la suscripción (pausa, impago, reactivación):
        // la validez se ajusta a lo que diga Stripe en ese momento.
        case "customer.subscription.updated": {
          const sub = event.data.object;
          const md = sub.metadata || {};
          const uid = md.uid || "";
          const plan = PLANES_VALIDOS.includes(md.plan) ? md.plan : planDesdePrecio(sub);
          if (!uid || !PLANES_VALIDOS.includes(plan)) break;
          await activarPlan(uid, plan, _subVigente(sub) ? finDePeriodoMs(sub) : Date.now(), {
            stripeCustomerId: sub.customer,
            stripeSubscriptionId: sub.id,
            status: sub.status,
          });
          break;
        }
        // Baja: la suscripción terminó -> marcamos el plan como caducado.
        case "customer.subscription.deleted": {
          const sub = event.data.object;
          const md = sub.metadata || {};
          const uid = md.uid || "";
          const plan = PLANES_VALIDOS.includes(md.plan) ? md.plan : planDesdePrecio(sub);
          if (uid && PLANES_VALIDOS.includes(plan)) {
            await activarPlan(uid, plan, Date.now(), {
              stripeSubscriptionId: sub.id,
              status: "canceled",
            });
          }
          break;
        }
        default:
          break; // otros eventos: no hacemos nada
      }
      res.json({ received: true });
    } catch (err) {
      console.error("[Stripe] Error procesando webhook:", err);
      // 500 hace que Stripe reintente (bueno ante fallos transitorios).
      res.status(500).send("Error interno");
    }
  }
);

// ============================================================
// generarFacturaPDF: renderiza el HTML de impresión (idéntico al de la app)
// a PDF con Puppeteer y lo guarda en Firebase Storage. Devuelve URL de descarga.
// ============================================================
const { getStorage } = require("firebase-admin/storage");
const _crypto = require("crypto");

exports.generarFacturaPDF = onCall(
  { region: "europe-west1", memory: "1GiB", timeoutSeconds: 120, cpu: 1, maxInstances: 3 },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Login requerido");
    const d = request.data || {};
    const html = d.html;
    const adminUid = d.adminUid;
    const tipo = (d.tipo === "factura") ? "factura" : "resumen";
    if (!html || !adminUid || !d.docId) throw new HttpsError("invalid-argument", "Faltan datos (html/adminUid/docId)");

    // AUTORIZACIÓN: SOLO el dueño de la cuenta. Antes valía cualquiera del
    // equipo (_accesoAdmin), y un empleado sin permisos de facturación podía
    // sobrescribir los PDFs ya enviados: la ruta es predecible
    // (facturas/<adminUid>/factura-F<numero>.pdf) y al regenerar el fichero
    // cambia su token, así que el enlace que ya tenía el cliente moría.
    if (!_esDuenoCuenta(request.auth, adminUid)) {
      throw new HttpsError("permission-denied", "Solo el administrador puede generar facturas y resúmenes.");
    }
    if (typeof html !== "string" || html.length > 2000000) {
      throw new HttpsError("invalid-argument", "HTML demasiado grande");
    }
    if (!(await _rateLimit(`pdf_${adminUid}`, 60, 3600000))) {
      throw new HttpsError("resource-exhausted", "Demasiados PDF generados. Prueba en un rato.");
    }
    const docId = _idSeguro(d.docId, "doc");

    const chromium = require("@sparticuz/chromium");
    const puppeteer = require("puppeteer-core");

    let browser;
    try {
      browser = await puppeteer.launch({
        args: chromium.args,
        defaultViewport: chromium.defaultViewport,
        executablePath: await chromium.executablePath(),
        headless: chromium.headless,
      });
      const page = await browser.newPage();
      await _blindarPagina(page);
      await page.setContent(html, { waitUntil: "networkidle0", timeout: 60000 });
      const pdfBuffer = Buffer.from(await page.pdf({
        format: "A4",
        printBackground: true,
        preferCSSPageSize: false,
        margin: { top: "0mm", right: "0mm", bottom: "0mm", left: "0mm" },
      }));
      await browser.close();
      browser = null;

      const safeName = String(d.filename || (tipo + "-" + docId)).replace(/[\/\\?%*:|"<>]+/g, "-").slice(0, 120);
      const path = `facturas/${adminUid}/${tipo}-${docId}.pdf`;
      const token = _crypto.randomUUID();
      const bucket = getStorage().bucket();
      const file = bucket.file(path);
      await file.save(pdfBuffer, {
        resumable: false,
        metadata: {
          contentType: "application/pdf",
          contentDisposition: `attachment; filename="${safeName}.pdf"`,
          metadata: { firebaseStorageDownloadTokens: token },
        },
      });
      const url = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;
      return { ok: true, url, path, filename: safeName + ".pdf" };
    } catch (e) {
      console.error("generarFacturaPDF error:", e);
      if (browser) { try { await browser.close(); } catch (_) {} }
      throw new HttpsError("internal", (e && e.message) || "Error generando PDF");
    }
  }
);

// ============================================================
// enviarFacturaEmail: genera el PDF y lo envía por email (Resend) al cliente,
// con la plantilla (asunto/cuerpo ya con variables sustituidas) y el PDF adjunto.
// ============================================================
// (RESEND_API_KEY se declara arriba, junto a los demás secretos: el webhook
//  de Stripe lo necesita para el email de bienvenida y se define antes.)

function _escHtml(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

// 🔴 El tipo del logo NUNCA sale del dato que manda el cliente. Antes se
// guardaba el contentType tal cual: bastaba con mandar un SVG con <script>
// dentro para dejar contenido ejecutable colgado de un dominio de Google
// (firebasestorage.googleapis.com) — un señuelo perfecto para phishing.
// Solo se admiten mapas de bits, y el tipo se deduce de esta tabla.
const _LOGO_TIPOS = { "image/png": "png", "image/jpeg": "jpg", "image/jpg": "jpg", "image/webp": "webp", "image/gif": "gif" };
const _LOGO_MAX_BYTES = 512 * 1024;

// Decodifica un data-URI de imagen y valida tipo y tamaño.
// Devuelve { buf, ct, ext } o null si no pasa el filtro.
function _logoValidado(dataUri) {
  if (!dataUri || typeof dataUri !== "string") return null;
  const m = dataUri.match(/^data:([a-z0-9\/+.\-]+);base64,(.+)$/i);
  if (!m) return null;
  const ct = m[1].toLowerCase();
  const ext = _LOGO_TIPOS[ct];
  if (!ext) { console.warn("[Logo] Tipo rechazado:", ct); return null; }
  let buf;
  try { buf = Buffer.from(m[2], "base64"); } catch (e) { return null; }
  if (!buf.length || buf.length > _LOGO_MAX_BYTES) { console.warn("[Logo] Tamaño rechazado:", buf.length); return null; }
  return { buf, ct, ext };
}

async function _uploadLogo(adminUid, logoBase64) {
  const v = _logoValidado(logoBase64);
  if (!v) return null;
  try {
    const path = `assets/${adminUid}/logo-email.${v.ext}`;
    const token = _crypto.randomUUID();
    const bucket = getStorage().bucket();
    await bucket.file(path).save(v.buf, { resumable: false, metadata: { contentType: v.ct, metadata: { firebaseStorageDownloadTokens: token } } });
    return `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;
  } catch (e) { console.warn("uploadLogo warn:", e && e.message); return null; }
}

function _buildEmailHtml(opts) {
  const messageText = opts.messageText || "";
  const f = opts.firma || {};
  const logoUrl = opts.logoUrl || null;
  const msgHtml = _escHtml(messageText).replace(/\n/g, "<br>");
  const rows = [];
  if (f.email) rows.push('<div style="margin:2px 0">' + _escHtml(f.email) + '</div>');
  if (f.tel) rows.push('<div style="margin:2px 0">' + _escHtml(f.tel) + '</div>');
  if (f.direccion) rows.push('<div style="margin:2px 0">' + _escHtml(f.direccion) + '</div>');
  const logoImg = logoUrl ? ('<img src="' + logoUrl + '" alt="" style="max-width:150px;max-height:70px;display:block;margin-bottom:8px;border:0">') : '';
  const nombre = f.nombre ? ('<div style="font-size:14px;font-weight:bold;color:#1b1b1b;margin-bottom:5px">' + _escHtml(f.nombre) + '</div>') : '';
  const firmaBlock = (logoImg || nombre || rows.length)
    ? ('<div style="border-top:1px solid #eceeec;padding:20px 30px;background:#fafbfa">' + logoImg + nombre + '<div style="font-size:12.5px;color:#556055;line-height:1.7">' + rows.join('') + '</div></div>')
    : '';
  return '<!DOCTYPE html><html><body style="margin:0;padding:16px 0;background:#f2f2f0">' +
    '<div style="max-width:600px;margin:0 auto;background:#ffffff;font-family:Arial,Helvetica,sans-serif;border-radius:10px;overflow:hidden">' +
    '<div style="height:6px;background:#1a6b3f;line-height:6px;font-size:0">&nbsp;</div>' +
    '<div style="padding:26px 30px;font-size:15px;color:#333333;line-height:1.6">' + msgHtml + '</div>' +
    firmaBlock +
    '<div style="padding:12px 30px;background:#1a6b3f;text-align:center;font-size:11px;color:#cfe3d6">Enviado con App Natura Viva</div>' +
    '</div></body></html>';
}

async function _htmlToPdf(html) {
  const chromium = require("@sparticuz/chromium");
  const puppeteer = require("puppeteer-core");
  let browser;
  try {
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });
    const page = await browser.newPage();
    await _blindarPagina(page);
    await page.setContent(html, { waitUntil: "networkidle0", timeout: 60000 });
    const pdf = await page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: false, margin: { top: "0mm", right: "0mm", bottom: "0mm", left: "0mm" } });
    await browser.close(); browser = null;
    // puppeteer >= 23 devuelve Uint8Array, no Buffer. Sin este Buffer.from(),
    // .toString("base64") ignora el argumento y devuelve "37,80,68,..." (bytes
    // separados por comas), y el PDF adjunto en el email llega corrupto.
    return Buffer.from(pdf);
  } finally { if (browser) { try { await browser.close(); } catch (_) {} } }
}

exports.enviarFacturaEmail = onCall(
  { region: "europe-west1", memory: "1GiB", timeoutSeconds: 120, cpu: 1, maxInstances: 3, secrets: [RESEND_API_KEY] },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Login requerido");
    const d = request.data || {};
    const pdfHtml = d.pdfHtml || d.html;
    const adminUid = d.adminUid;
    const tipo = (d.tipo === "factura") ? "factura" : "resumen";
    if (!pdfHtml || !adminUid || !d.docId) throw new HttpsError("invalid-argument", "Faltan datos (html/adminUid/docId)");

    // AUTORIZACIÓN: SOLO el dueño de la cuenta. Antes valía cualquiera del
    // equipo, así que un empleado podía mandar una factura falsa (con otro
    // IBAN) a los clientes de su jefe, saliendo del dominio verificado que
    // comparten todas las cuentas.
    if (!_esDuenoCuenta(request.auth, adminUid)) {
      throw new HttpsError("permission-denied", "Solo el administrador puede enviar facturas.");
    }
    if (typeof pdfHtml !== "string" || pdfHtml.length > 2000000) {
      throw new HttpsError("invalid-argument", "HTML demasiado grande");
    }

    // Destinatarios: solo emails con formato válido
    const to = _limpiaEmails(d.to, 10);
    if (!to.length) throw new HttpsError("invalid-argument", "Sin destinatarios válidos");

    // Rate limit: 30 emails / hora por cuenta (anti-spam desde nuestro dominio).
    // failClosed=true: si el limitador falla, denegamos (no abrir el relay de email).
    if (!(await _rateLimit(`mail_${adminUid}`, 30, 3600000, true))) {
      throw new HttpsError("resource-exhausted", "Demasiados emails enviados. Prueba en un rato.");
    }
    const docId = _idSeguro(d.docId, "doc");

    const bucket = getStorage().bucket();

    let pdfBuffer;
    try { pdfBuffer = await _htmlToPdf(pdfHtml); }
    catch (e) { console.error("enviarFacturaEmail pdf error:", e); throw new HttpsError("internal", "Error generando PDF: " + (e.message || "")); }

    const safeName = String(d.filename || (tipo + "-" + docId)).replace(/\.pdf$/i, "").replace(/[\/\\?%*:|"<>]+/g, "-").slice(0, 120) || (tipo + "-" + docId);

    // Copia del PDF en Storage (no bloquea el envío)
    let url = null;
    try {
      const path = `facturas/${adminUid}/${tipo}-${docId}.pdf`;
      const token = _crypto.randomUUID();
      await bucket.file(path).save(pdfBuffer, { resumable: false, metadata: { contentType: "application/pdf", contentDisposition: `attachment; filename="${safeName}.pdf"`, metadata: { firebaseStorageDownloadTokens: token } } });
      url = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;
    } catch (e) { console.warn("enviarFacturaEmail storage warn:", e && e.message); }

    // Logo -> Storage (los emails no muestran base64)
    let logoUrl = "";
    try {
      // Mismo filtro que _uploadLogo: tipo de la lista blanca y máximo 512 KB.
      const v = _logoValidado(d.logoB64 || d.logoBase64);
      if (v) {
        const lpath = `logos/${adminUid}.${v.ext}`;
        const ltok = _crypto.randomUUID();
        await bucket.file(lpath).save(v.buf, { resumable: false, metadata: { contentType: v.ct, metadata: { firebaseStorageDownloadTokens: ltok } } });
        logoUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(lpath)}?alt=media&token=${ltok}`;
      }
    } catch (e) { console.warn("enviarFacturaEmail logo warn:", e && e.message); }

    // Construir el HTML del email (mensaje + firma + logo)
    const esc = (x) => String(x == null ? "" : x).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const mensaje = String(d.mensaje || d.text || "");
    const msgHtml = esc(mensaje).replace(new RegExp(String.fromCharCode(10), "g"), "<br>");
    const f = d.firma || {};
    const _fdir = f.dir || f.direccion;
    const rows = [];
    if (f.email) rows.push('<div style="margin:3px 0">' + esc(f.email) + '</div>');
    if (f.tel)   rows.push('<div style="margin:3px 0">' + esc(f.tel) + '</div>');
    if (_fdir)   rows.push('<div style="margin:3px 0">' + esc(_fdir) + '</div>');
    const _lsc = Math.max(0.4, Math.min(1.3, parseFloat(d.logoScale) || 1));
    const _lw = Math.round(180 * _lsc), _lh = Math.round(95 * _lsc);
    const _lmx = Math.round((parseFloat(d.logoX) || 0) * 1.3), _lmy = Math.round((parseFloat(d.logoY) || 0) * 1.3);
    const logoHtml = logoUrl ? ('<img src="' + logoUrl + '" alt="" style="max-width:' + _lw + 'px;max-height:' + _lh + 'px;display:block;margin:' + _lmy + 'px 0 0 ' + _lmx + 'px;border:0">') : "";
    const nombreHtml = f.nombre ? ('<div style="font-size:15px;font-weight:bold;color:#1b1b1b;margin-bottom:6px">' + esc(f.nombre) + '</div>') : "";
    const _logoSpacer = logoHtml ? '<div style="height:25px;line-height:25px;font-size:0;mso-line-height-rule:exactly">&nbsp;</div>' : '';
    const firmaBlock = (logoHtml || nombreHtml || rows.length)
      ? ('<div style="border-top:1px solid #e6ebe6;padding:26px 40px 30px">' + logoHtml + _logoSpacer + nombreHtml + '<div style="font-size:13px;color:#556055;line-height:1.7">' + rows.join('') + '</div></div>')
      : "";
    const emailHtml =
      '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width"></head>' +
      '<body style="margin:0;padding:20px 0;background:#eef0ee">' +
        '<div style="max-width:640px;margin:0 auto;background:#ffffff;font-family:Arial,Helvetica,sans-serif;border:1px solid #e2e6e2">' +
          '<div style="height:5px;background:#1a6b3f;line-height:5px;font-size:0">&nbsp;</div>' +
          '<div style="padding:34px 40px 24px;font-size:15px;color:#333333;line-height:1.7;min-height:170px">' + msgHtml + '</div>' +
          firmaBlock +
          '<div style="padding:14px 40px 20px;text-align:center;font-size:11px;color:#8a978e;letter-spacing:.2px">Generado con: App Natura Viva — Software Gestión de jardinería.</div>' +
        '</div>' +
      '</body></html>';

    const fromNombre = String(d.enviadoPor || d.fromName || "Natura Viva").split("<").join("").split(">").join("").split(String.fromCharCode(13)).join(" ").split(String.fromCharCode(10)).join(" ").trim().slice(0, 60) || "Natura Viva";
    const emailBody = {
      from: fromNombre + " <facturas@send.appnaturaviva.com>",
      to: to,
      subject: String(d.subject || "Factura").slice(0, 200),
      html: emailHtml,
      text: mensaje || "Adjuntamos la factura.",
      attachments: [{ filename: safeName + ".pdf", content: pdfBuffer.toString("base64") }],
    };
    const _rep = d.responderA || d.replyTo; if (_esEmailValido(_rep)) emailBody.reply_to = String(_rep).trim();
    const _bcc = _limpiaEmails(d.bcc, 5); if (_bcc.length) emailBody.bcc = _bcc;

    let resp, jr;
    try {
      resp = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Authorization": "Bearer " + RESEND_API_KEY.value().trim(), "Content-Type": "application/json" },
        body: JSON.stringify(emailBody),
      });
      jr = await resp.json().catch(() => ({}));
    } catch (e) { console.error("enviarFacturaEmail resend fetch error:", e); throw new HttpsError("internal", "Error de red al enviar"); }
    if (!resp.ok) { console.error("enviarFacturaEmail resend error:", resp.status, jr); throw new HttpsError("internal", "Resend: " + ((jr && jr.message) ? jr.message : ("HTTP " + resp.status))); }

    return { ok: true, id: (jr && jr.id) || null, url: url, logoUrl: logoUrl, to: to };
  }
);

// ============================================================
// ÍNDICES DE EMPLEADOS — consultas que ANTES hacía el cliente
// ============================================================
// `username_index` y `employee_index` eran legibles por cualquier usuario
// autenticado: se podía descargar la lista de usuarios de TODAS las cuentas.
// Ahora las reglas los cierran a lectura y estas tres funciones hacen la
// consulta puntual en el servidor, devolviendo SOLO lo justo.

// IP del llamante (para limitar la fuerza bruta sin sesión).
function _ipLlamante(request) {
  const r = request && request.rawRequest;
  if (!r) return "desconocida";
  const xff = r.headers && (r.headers["x-forwarded-for"] || r.headers["X-Forwarded-For"]);
  const ip = (typeof xff === "string" ? xff.split(",")[0] : null) || r.ip || "desconocida";
  return String(ip).trim();
}

// Normaliza igual que el cliente: minúsculas y solo letras/números.
function _normUsuario(s) {
  return String(s == null ? "" : s).toLowerCase().trim().replace(/[^a-z0-9]/g, "").slice(0, 40);
}

// 1) LOGIN DE EMPLEADO (sin sesión todavía): usuario -> orgSlug.
// Es el único punto que puede llamarse sin auth, así que va limitado por IP.
// Devuelve solo el slug (nunca el adminUid ni el perfil) y el mismo error
// genérico tanto si el usuario no existe como si se ha pasado del límite.
exports.resolverUsuarioEmpleado = onCall(
  { region: "europe-west1", maxInstances: 5 },
  async (request) => {
    const usuario = _normUsuario((request.data || {}).usuario);
    if (!usuario) throw new HttpsError("invalid-argument", "Usuario vacío.");

    // 40 consultas/hora por IP: de sobra para un login normal (y para una
    // cuadrilla entera detrás del mismo router), inservible para enumerar.
    // failClosed=false: si el limitador se cae, NO dejamos a nadie sin entrar.
    if (!(await _rateLimit(`idx_${_ipLlamante(request)}`, 40, 3600000))) {
      throw new HttpsError("resource-exhausted", "Demasiados intentos. Prueba en un rato.");
    }

    let slug = null;
    try {
      const snap = await admin.database().ref(`username_index/${usuario}`).get();
      const v = snap.val();
      slug = (v && v.slug) || null;
    } catch (e) {
      console.error("resolverUsuarioEmpleado:", e && e.message);
      throw new HttpsError("internal", "No se pudo verificar el usuario.");
    }
    if (!slug) throw new HttpsError("not-found", "Usuario o contraseña incorrectos.");
    return { ok: true, slug };
  }
);

// 2) TRAS EL LOGIN: ¿de qué admin es este empleado? Se deduce de SU PROPIO
// token (email interno "usuario+slug@nv.local"), así que no puede preguntar
// por otro. Devuelve el adminUid y su perfil.
exports.miAdminEmpleado = onCall(
  { region: "europe-west1", maxInstances: 5 },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Login requerido");
    const email = (request.auth.token && request.auth.token.email) || "";
    if (!email.endsWith("@nv.local")) {
      throw new HttpsError("failed-precondition", "Esta cuenta no es de empleado.");
    }
    const local = email.split("@")[0];
    const partes = local.split("+");
    const usuario = _normUsuario(partes[0]);
    const slug = _normUsuario(partes[1]);
    if (!usuario || !slug) throw new HttpsError("failed-precondition", "Email interno con formato inválido.");

    let adminUid = null;
    try {
      const snap = await admin.database().ref(`employee_index/${slug}__${usuario}`).get();
      const v = snap.val();
      adminUid = (v && v.adminUid) || null;
    } catch (e) {
      console.error("miAdminEmpleado:", e && e.message);
      throw new HttpsError("internal", "No se pudo resolver la cuenta.");
    }
    if (!adminUid) throw new HttpsError("not-found", "Empleado no indexado.");

    let profile = null;
    try {
      const psnap = await admin.database().ref(`users/${adminUid}/team/${usuario}`).get();
      profile = psnap.val() || null;
    } catch (e) { /* el perfil no es imprescindible para entrar */ }

    return { ok: true, adminUid, profile };
  }
);

// 3) AL CREAR UN EMPLEADO: ¿está libre ese nombre de usuario? Solo lo puede
// preguntar un admin con sesión (los empleados no crean empleados), y la
// respuesta es un sí/no, sin decir de quién es si está ocupado.
exports.usuarioEmpleadoLibre = onCall(
  { region: "europe-west1", maxInstances: 5 },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Login requerido");
    const email = (request.auth.token && request.auth.token.email) || "";
    if (email.endsWith("@nv.local")) {
      throw new HttpsError("permission-denied", "Los empleados no pueden crear empleados.");
    }
    const usuario = _normUsuario((request.data || {}).usuario);
    if (!usuario) throw new HttpsError("invalid-argument", "Usuario vacío.");

    if (!(await _rateLimit(`idxadm_${request.auth.uid}`, 100, 3600000))) {
      throw new HttpsError("resource-exhausted", "Demasiadas comprobaciones. Prueba en un rato.");
    }
    try {
      const snap = await admin.database().ref(`username_index/${usuario}`).get();
      return { ok: true, libre: !snap.exists() };
    } catch (e) {
      console.error("usuarioEmpleadoLibre:", e && e.message);
      throw new HttpsError("internal", "No se pudo comprobar el usuario.");
    }
  }
);

// ============================================================
// CONTADOR DE VISITAS DE LA WEB
// ============================================================
// Analitica propia, para no depender de nadie:
//   - Cuenta TODAS las visitas, sin muestrear (Cloudflare gratis solo mira 1 de
//     cada 10 y multiplica, y con pocas visitas eso es un numero inventado).
//   - Sin cookies y sin identificar a nadie: no hace falta banner de cookies.
//   - No se guarda la IP. Solo un contador por dia, pagina y procedencia.
//
// Estructura en la base de datos:
//   web_visitas/<AAAA-MM-DD>/total
//                           /paginas/<pagina>
//                           /origen/<de donde viene>
//                           /campana/<utm_campaign>
// ============================================================

// 🔴 256 MiB, no 128: con 128 la function se quedaba sin memoria solo con
// cargar el SDK de firebase-admin (usaba 133 MiB) y moria antes de guardar
// nada. Respondia bien pero no contaba ninguna visita.
exports.visita = onRequest(
  { region: "europe-west1", memory: "256MiB", maxInstances: 10, cors: true },
  async (req, res) => {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") { res.status(204).send(""); return; }

    // 🔴 Primero se guarda y DESPUES se responde. Al reves no funciona: en
    // Cloud Functions de 2a generacion la instancia se congela en cuanto
    // respondes, y la escritura se queda a medias sin dar ningun error.
    try {
      // 🔴 El navegador manda el cuerpo como text/plain (con application/json
      // el envio se pierde por CORS), asi que aqui llega como texto y hay que
      // interpretarlo. Se aceptan las dos formas por si acaso.
      let d = req.body || {};
      if (typeof d === "string") { try { d = JSON.parse(d); } catch (_) { d = {}; } }
      if (Buffer.isBuffer(d)) { try { d = JSON.parse(d.toString("utf8")); } catch (_) { d = {}; } }

      // Fuera los bots: ensucian el recuento y no son visitas de verdad.
      // 🔴 Sin responder no se puede salir: si haces "return" a secas, la
      // peticion se queda colgada y el navegador se come un timeout.
      const ua = String(req.get("user-agent") || "");
      const esBot = !ua || /bot|crawler|spider|crawling|preview|monitor|curl|wget|headless|lighthouse|python|axios|okhttp/i.test(ua);
      if (esBot) { res.status(204).send(""); return; }

      // Pagina: solo la ruta, sin la query (puede llevar datos personales) y
      // sin el .html, para que en el panel se lea "inicio" y no "_index_html".
      let pagina = String(d.p || "/").split("?")[0].split("#")[0]
        .replace(/\.html?$/i, "").replace(/^\/+|\/+$/g, "").slice(0, 60);
      if (!pagina || pagina === "index") pagina = "inicio";
      // La base de datos no admite estos caracteres en una clave.
      pagina = pagina.replace(/[.#$\[\]\/]/g, "-") || "inicio";

      // De donde viene: el dominio pelado, o "directo".
      let origen = "directo";
      try {
        const h = String(d.r || "");
        if (h) {
          const dom = new URL(h).hostname.replace(/^www\./, "").toLowerCase();
          if (!/appnaturaviva\.com$/.test(dom)) origen = dom.replace(/[.#$\[\]\/]/g, "-").slice(0, 40);
          else origen = null;                       // navegando dentro de la web
        }
      } catch (_) { }

      const hoy = new Date(Date.now() + 2 * 3600e3).toISOString().slice(0, 10); // Madrid
      const base = admin.database().ref(`web_visitas/${hoy}`);
      const inc = admin.database.ServerValue.increment(1);

      // Campana: el utm_campaign (o utm_source) con el que llego. Es lo unico
      // que distingue un clic de un anuncio o de un email, porque ninguno de
      // los dos manda procedencia: Instagram abre los enlaces en su navegador
      // interno y los clientes de correo tampoco la envian. Sin esto, los dos
      // acaban contados como "directo".
      let campana = String(d.c || "").toLowerCase()
        .replace(/[.#$\[\]\/]/g, "-").replace(/[^a-z0-9_-]/g, "").slice(0, 40);

      const cambios = { total: inc };
      cambios[`paginas/${pagina}`] = inc;
      if (origen) cambios[`origen/${origen}`] = inc;
      if (campana) cambios[`campana/${campana}`] = inc;
      await base.update(cambios);
    } catch (e) {
      console.warn("visita:", e && e.message);
    }
    res.status(204).send("");
  }
);
