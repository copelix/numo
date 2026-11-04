import { App } from "../app/app.js";
import { CONFIG } from "../config.js";
import { Demo } from "../core/demo.js";
import { Finance } from "../core/finance.js";
import { createInitialState, Schema } from "../core/schema.js";
import { Store } from "../core/store.js";
import { Forms } from "../forms/index.js";
import { Storage } from "../lib/storage.js";
import { $$, asArray } from "../lib/utils.js";
import { Cloud } from "./cloud.js";
import { Modal } from "../ui/modal.js";
import { Toast } from "../ui/toast.js";

/* =========================================================================
   8. GUARDADO EN TU CUENTA DE CLAUDE (capacidad "db" de la página)
   Cada persona escribe en data/users/<su id>/, que es privado: nadie más
   lo lee, ni siquiera el dueño de la página.
   Documentos: "core" (ajustes, suscripciones, metas…) y uno por mes de
   gastos ("exp-AAAA-MM") y de ingresos ("inc-AAAA-MM"), así ninguno se
   acerca al límite de tamaño.
   "core" se escribe último: su updatedAt marca que el guardado terminó.
   ========================================================================= */
export const Sync = {
  mode: "connecting", // connecting | cloud | local
  status: "idle", // idle | pending | syncing | synced | error
  message: "",
  db: null,
  uid: null,
  provider: null, // "claude" | "numo"
  downloads: null,
  loaded: false, // no se sube nada hasta haber leído la cuenta
  everWrote: false, // si la primera escritura se rechaza, esta persona no puede guardar en la nube
  written: new Map(), // id del documento -> JSON guardado
  timer: null,
  running: false,
  again: false,
  unsubscribe: null,

  /** Pide las capacidades a Claude. Devuelve true si hay guardado en la cuenta. */
  async connect() {
    if (Cloud.enabled) {
      Cloud.restore();
      if (!Cloud.signedIn) return false;
      this.attachNumo();
      return true;
    }
    if (typeof window.claude?.use !== "function") return false;
    try {
      const [db, user, downloads] = await Promise.all([claude.use("db"), claude.use("user"), claude.use("downloads")]);
      this.downloads = downloads;
      const uid = user ? await user.id() : null;
      if (!db || !uid) return false;
      this.db = db;
      this.uid = uid;
      this.provider = "claude";
      return true;
    } catch (error) {
      console.warn("No se pudo conectar con la cuenta", error);
      return false;
    }
  },

  ref(id) {
    return this.db.doc(`data/users/${this.uid}/${id}`);
  },

  attachNumo() {
    this.db = Cloud.db();
    this.uid = `numo:${Cloud.session.user.id}`;
    this.provider = "numo";
  },

  /** Recién entró a su cuenta de Numo: decide qué datos quedan y empieza a sincronizar. */
  async signedIn() {
    this.attachNumo();
    this.mode = "connecting";
    this.loaded = false;
    App.render();
    let remote = null;
    try {
      remote = await this.load();
    } catch {
      /* start() vuelve a intentar y muestra el error */
    }
    let cache = { uid: null, state: Store.state };
    if (remote && Store.hasUserData()) {
      const choice = await Modal.choose({
        title: "¿Con qué datos seguís?",
        message:
          "Tu cuenta ya tiene datos guardados, y en este dispositivo también hay. Elegí cuáles conservar: los otros se reemplazan.",
        options: [
          { value: "device", label: "Los de este dispositivo" },
          { value: "cloud", label: "Los de mi cuenta", variant: "primary" },
        ],
      });
      if (choice === "device") {
        Store.state.meta.updatedAt = Date.now();
        cache = { uid: this.uid, state: Store.state };
      }
    }
    await this.start(cache);
    Toast.show(`Listo: tus datos se guardan en tu cuenta (${Cloud.email}).`);
  },

  /** Cierra la sesión: los datos quedan en la cuenta y se borran de este dispositivo. */
  async signOut() {
    if (this.status === "pending") await this.push();
    this.unsubscribe?.();
    this.unsubscribe = null;
    clearTimeout(this.timer);
    await Cloud.signOut();
    this.db = null;
    this.uid = null;
    this.provider = null;
    this.loaded = false;
    this.written.clear();
    Store.state = this.freshState();
    Storage.remove(CONFIG.cacheKey);
    this.startLocal(null);
  },

  /** Parte el estado en documentos: "core" + uno por mes de gastos. */
  split(state) {
    const months = new Map();
    for (const e of state.expenses) {
      const key = e.date.slice(0, 7);
      if (!months.has(key)) months.set(key, []);
      months.get(key).push(e);
    }
    const incomeMonths = new Map();
    for (const i of state.incomes) {
      const key = i.date.slice(0, 7);
      if (!incomeMonths.has(key)) incomeMonths.set(key, []);
      incomeMonths.get(key).push(i);
    }
    const { expenses, incomes, ...core } = state;
    const docs = new Map();
    for (const [key, items] of months) docs.set(`exp-${key}`, { items });
    for (const [key, items] of incomeMonths) docs.set(`inc-${key}`, { items });
    docs.set("core", { ...core, months: [...months.keys()].sort(), incomeMonths: [...incomeMonths.keys()].sort() });
    return docs;
  },

  /** Recuerda lo que hay en la cuenta para escribir solo lo que cambió. */
  markClean(state) {
    this.written.clear();
    for (const [id, body] of this.split(state)) this.written.set(id, JSON.stringify(body));
  },

  async load() {
    const core = await this.ref("core").get();
    if (!core.exists) return null;
    const { months, incomeMonths, ...rest } = core.data();
    const readMonths = async (prefix, list) => {
      const keys = asArray(list).filter(k => /^\d{4}-\d{2}$/.test(k));
      const snaps = await Promise.all(keys.map(k => this.ref(`${prefix}-${k}`).get()));
      return snaps.flatMap(snap => (snap.exists ? asArray(snap.data().items) : []));
    };
    const [expenses, incomes] = await Promise.all([readMonths("exp", months), readMonths("inc", incomeMonths)]);
    return { ...rest, expenses, incomes };
  },

  /** Primera conexión: decide qué datos quedan y empieza a escuchar cambios de otros dispositivos. */
  async start(cache) {
    this.mode = "cloud";
    this.setStatus("syncing");
    let remote;
    try {
      remote = await this.load();
    } catch (error) {
      if (error?.code === "auth" && this.provider === "numo") {
        if (!Store.state) Store.state = this.freshState();
        this.sessionLost();
        return;
      }
      this.setStatus("error", this.describe(error));
      if (!Store.state) Store.state = this.freshState();
      App.render();
      setTimeout(() => this.retryStart(cache), 8000);
      return;
    }

    const local = Store.state;
    const localIsMine = cache?.uid === this.uid;
    const localHasOwnData = local && !cache?.uid && Store.hasUserData();
    let needsPush = false;

    if (remote) {
      const remoteState = Schema.normalize(remote);
      if (local && localIsMine && local.meta.updatedAt > remoteState.meta.updatedAt) {
        this.markClean(remoteState); // cambios hechos sin conexión: ganan los de este dispositivo
        needsPush = true;
      } else {
        Store.state = remoteState;
        this.markClean(remoteState);
      }
    } else {
      if (!(local && (localIsMine || localHasOwnData))) Store.state = this.freshState();
      needsPush = true;
    }

    this.loaded = true;
    if (Finance.settle() || needsPush) Store.save({ render: false });
    else {
      Store.persist();
      this.setStatus("synced");
    }
    App.render();
    this.watch();
  },

  retryStart(cache) {
    if (this.loaded) return;
    if (navigator.onLine === false) {
      setTimeout(() => this.retryStart(cache), 8000);
      return;
    }
    this.start(cache);
  },

  freshState() {
    const state = createInitialState();
    Demo.add(state);
    return state;
  },

  /** Sin cuenta (abierta fuera de Claude): todo queda en este navegador. */
  startLocal(cache) {
    this.mode = "local";
    if (!Store.state) Store.state = cache ? Schema.normalize(cache.state) : this.freshState();
    if (!Finance.settle()) Store.persist();
    else Store.save({ render: false });
    this.setStatus("idle");
    App.render();
    if (!Storage.available)
      Toast.show("Estás en una vista previa: podés probar todo, pero los datos no se guardan al cerrar.", {
        duration: 7000,
      });
  },

  schedulePush() {
    if (this.mode !== "cloud" || !this.loaded) return;
    clearTimeout(this.timer);
    this.setStatus("pending");
    this.timer = setTimeout(() => this.push(), 800);
  },

  /** Sube solo los documentos que cambiaron, de a uno; "core" al final. */
  async push() {
    clearTimeout(this.timer);
    if (this.mode !== "cloud" || !this.loaded) return;
    if (this.running) {
      this.again = true;
      return;
    }
    this.running = true;
    this.setStatus("syncing");
    try {
      do {
        this.again = false;
        const docs = this.split(Store.state);
        for (const id of this.written.keys()) if (!docs.has(id)) docs.set(id, null); // meses que quedaron vacíos
        const order = [...docs.keys()].filter(id => id !== "core").concat("core");
        for (const id of order) {
          const body = docs.get(id);
          if (body === null) {
            await this.ref(id).delete();
            this.written.delete(id);
            continue;
          }
          const json = JSON.stringify(body);
          if (this.written.get(id) === json) continue;
          await this.ref(id).set(body);
          this.everWrote = true;
          this.written.set(id, json);
        }
      } while (this.again);
      this.setStatus("synced");
    } catch (error) {
      // Quien abre una página compartida sin permiso de escritura recibe "invalid_argument"
      // en su primera escritura: sigue funcionando, guardando en su navegador.
      if (error?.code === "invalid_argument" && !this.everWrote) {
        this.fallbackToLocal();
        return;
      }
      if (error?.code === "auth" && this.provider === "numo") {
        this.sessionLost();
        return;
      }
      this.setStatus("error", this.describe(error));
      if (error?.code === "unavailable") setTimeout(() => this.push(), 4000 + Math.random() * 2000);
    } finally {
      this.running = false;
    }
  },

  /** La sesión venció o se cerró en otro lado: sigue andando en este navegador y pide entrar de nuevo. */
  sessionLost() {
    Cloud.keep(null);
    this.provider = null;
    this.fallbackToLocal();
    Toast.show("Tu sesión se cerró. Entrá de nuevo para seguir guardando en tu cuenta.", {
      actionLabel: "Entrar",
      onAction: () => Forms.auth("login"),
      duration: 9000,
    });
  },

  fallbackToLocal() {
    this.mode = "local";
    this.loaded = false;
    clearTimeout(this.timer);
    this.unsubscribe?.();
    this.unsubscribe = null;
    Store.persist();
    this.setStatus("idle");
    App.render();
  },

  /** Escucha "core": si otro dispositivo guardó algo más nuevo, lo trae. */
  watch() {
    this.unsubscribe?.();
    this.unsubscribe = this.ref("core").onSnapshot(
      snap => {
        if (!snap.exists || snap.metadata.hasPendingWrites || this.running) return;
        const at = Number(snap.data()?.meta?.updatedAt) || 0;
        if (at > Store.state.meta.updatedAt) this.pullRemote();
      },
      error => {
        if (error.code === "auth" && this.provider === "numo") {
          this.sessionLost();
          return;
        }
        if (error.code === "unavailable" && this.provider !== "numo") setTimeout(() => this.watch(), 5000);
      },
    );
  },

  async pullRemote() {
    try {
      const remote = await this.load();
      if (!remote || (Number(remote.meta?.updatedAt) || 0) <= Store.state.meta.updatedAt || this.running) return;
      Store.state = Schema.normalize(remote);
      this.markClean(Store.state);
      Store.persist();
      App.render();
      this.setStatus("synced");
    } catch {
      /* se reintenta con el próximo aviso de cambios */
    }
  },

  describe(error) {
    switch (error?.code) {
      case "quota_exceeded":
        return "se llenó el espacio de guardado. Exportá un respaldo y borrá gastos viejos.";
      case "unavailable":
        return "sin conexión por ahora, se reintenta solo.";
      case "revoked":
        return "se perdió el acceso a esta página. Volvé a abrirla.";
      case "auth":
        return "tu sesión venció. Entrá de nuevo.";
      default:
        return navigator.onLine === false ? "sin conexión a internet." : "error al guardar.";
    }
  },

  setStatus(status, message = "") {
    this.status = status;
    this.message = message;
    $$("[data-sync-status]").forEach(el => {
      el.textContent = this.statusLabel();
    });
  },

  statusLabel() {
    if (this.mode === "connecting") return "Conectando con tu cuenta…";
    if (this.mode === "local")
      return Storage.available ? "Guardado solo en este navegador" : "Vista previa: los datos no se guardan";
    const where = this.provider === "numo" ? "Guardado en tu cuenta de Numo" : "Guardado en tu cuenta de Claude";
    switch (this.status) {
      case "pending":
        return "Cambios por guardar…";
      case "syncing":
        return "Guardando…";
      case "error":
        return `No se pudo guardar: ${this.message}`;
      default:
        return where;
    }
  },
};
