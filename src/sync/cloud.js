import { Storage } from "../lib/storage.js";

/* =========================================================================
   8b. CUENTA DE NUMO EN LA WEB (Supabase)
   Solo en la versión publicada fuera de Claude y con config.js completo.
   Se habla directo con la API (sin librerías). Cada fila de "numo_docs"
   tiene dueño, y las reglas de la base (RLS) hacen que cada persona lea
   y escriba solo las suyas. Expone la misma forma que la base de Claude
   (doc(ruta).get/set/delete/onSnapshot) para reusar todo Sync.
   ========================================================================= */
export const Cloud = {
  SESSION_KEY: "numo:session",
  session: null,
  refreshing: null,

  get config() {
    const c = window.NUMO_CONFIG;
    const url = String(c?.supabaseUrl ?? "").replace(/\/+$/, "");
    const okUrl = /^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url) || /^http:\/\/localhost:\d+$/.test(url);
    return okUrl && typeof c.supabaseKey === "string" && c.supabaseKey.length > 20 ? { url, key: c.supabaseKey } : null;
  },
  /** Hay cuentas de Numo: estamos fuera de Claude y la app tiene su base configurada. */
  get enabled() {
    return typeof window.claude?.use !== "function" && Boolean(this.config);
  },
  get signedIn() {
    return Boolean(this.session?.refresh_token && this.session?.user?.id);
  },
  get email() {
    return this.session?.user?.email ?? "";
  },

  restore() {
    const saved = Storage.read(this.SESSION_KEY);
    this.session = saved?.refresh_token && saved?.user?.id ? saved : null;
  },

  keep(data) {
    if (!data) {
      this.session = null;
      Storage.remove(this.SESSION_KEY);
      return;
    }
    const expiresAt = Number(data.expires_at) || Math.floor(Date.now() / 1000) + (Number(data.expires_in) || 3600);
    this.session = {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: expiresAt,
      user: { id: data.user?.id ?? this.session?.user?.id, email: data.user?.email ?? this.session?.user?.email ?? "" },
    };
    Storage.write(this.SESSION_KEY, this.session);
  },

  async request(path, { method = "GET", body, auth = true, headers = {} } = {}) {
    const { url, key } = this.config;
    const h = { apikey: key, "Content-Type": "application/json", ...headers };
    if (auth) h.Authorization = `Bearer ${await this.token()}`;
    let response;
    try {
      response = await fetch(url + path, {
        method,
        headers: h,
        body: body === undefined ? undefined : JSON.stringify(body),
        cache: "no-store",
      });
    } catch {
      throw Object.assign(new Error("Sin conexión"), { code: "unavailable" });
    }
    const text = await response.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }
    if (!response.ok) {
      const code =
        response.status === 401
          ? "auth"
          : response.status === 429 || response.status >= 500
            ? "unavailable"
            : response.status === 413
              ? "quota_exceeded"
              : "rejected";
      throw Object.assign(
        new Error(data?.msg || data?.message || data?.error_description || `Error ${response.status}`),
        { code, status: response.status, reason: data?.error_code || data?.code || data?.error || "" },
      );
    }
    return data;
  },

  /** Token vigente; lo renueva un minuto antes de que venza. */
  async token() {
    if (!this.signedIn) throw Object.assign(new Error("Sin sesión"), { code: "auth" });
    if (Date.now() / 1000 > this.session.expires_at - 60) await this.refresh();
    return this.session.access_token;
  },

  refresh() {
    this.refreshing ??= this.request("/auth/v1/token?grant_type=refresh_token", {
      method: "POST",
      auth: false,
      body: { refresh_token: this.session.refresh_token },
    })
      .then(data => this.keep(data))
      .catch(error => {
        if (error.code !== "unavailable") {
          error.code = "auth";
        }
        throw error;
      })
      .finally(() => {
        this.refreshing = null;
      });
    return this.refreshing;
  },

  async signUp(email, password) {
    const data = await this.request("/auth/v1/signup", { method: "POST", auth: false, body: { email, password } });
    if (!data?.access_token)
      throw Object.assign(new Error("Falta confirmar el mail"), { code: "rejected", reason: "email_not_confirmed" });
    this.keep(data);
  },

  async signIn(email, password) {
    this.keep(
      await this.request("/auth/v1/token?grant_type=password", {
        method: "POST",
        auth: false,
        body: { email, password },
      }),
    );
  },

  async signOut() {
    try {
      await this.request("/auth/v1/logout", { method: "POST" });
    } catch {
      /* igual se cierra en este dispositivo */
    }
    this.keep(null);
  },

  /** Borra la cuenta y todas sus filas (función delete_my_account de la base). */
  async deleteAccount() {
    await this.request("/rest/v1/rpc/delete_my_account", { method: "POST", body: {} });
    this.keep(null);
  },

  /** Traduce los errores de entrar o crear la cuenta a algo que se entienda. */
  authMessage(error) {
    const reason = String(error?.reason ?? "");
    if (error?.code === "unavailable" && error?.status === 429)
      return "Demasiados intentos seguidos. Esperá unos minutos y probá de nuevo.";
    if (error?.code === "unavailable") return "No hay conexión con el servidor. Revisá internet y probá de nuevo.";
    if (reason === "invalid_credentials" || /invalid login/i.test(error?.message))
      return "El mail o la contraseña no coinciden.";
    if (reason === "user_already_exists" || /already registered/i.test(error?.message))
      return "Ese mail ya tiene cuenta. Tocá “Ya tengo cuenta” para entrar.";
    if (reason === "weak_password")
      return "La contraseña es muy débil: usá al menos 8 caracteres, mezclando letras y números.";
    if (reason === "email_address_invalid" || reason === "validation_failed")
      return "Revisá que el mail esté bien escrito.";
    if (reason === "email_not_confirmed")
      return "La cuenta necesita confirmar el mail, y eso todavía no está activado en Numo.";
    if (reason === "signup_disabled") return "Por ahora no se pueden crear cuentas nuevas.";
    return "No se pudo. Probá de nuevo en un rato.";
  },

  /** Igual que la base de Claude: doc(ruta) con get, set, delete y onSnapshot. */
  db() {
    const uidFilter = () => `user_id=eq.${encodeURIComponent(this.session.user.id)}`;
    return {
      doc: path => {
        const id = path.split("/").pop();
        const where = () => `${uidFilter()}&doc=eq.${encodeURIComponent(id)}`;
        const get = async (select = "data") => {
          const rows = await this.request(`/rest/v1/numo_docs?select=${select}&${where()}`);
          const row = Array.isArray(rows) ? rows[0] : null;
          return {
            id,
            exists: Boolean(row),
            data: () => (select === "data" ? row?.data : row),
            metadata: { fromCache: false, hasPendingWrites: false },
          };
        };
        return {
          get: () => get(),
          set: data =>
            this.request("/rest/v1/numo_docs?on_conflict=user_id,doc", {
              method: "POST",
              headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
              body: { user_id: this.session.user.id, doc: id, data, updated_at: new Date().toISOString() },
            }),
          delete: () =>
            this.request(`/rest/v1/numo_docs?${where()}`, { method: "DELETE", headers: { Prefer: "return=minimal" } }),
          /** Sin conexión permanente: mira cada 20 s (solo con la app a la vista) y al volver a abrirla. */
          onSnapshot: (next, fail) => {
            let stopped = false;
            const check = async () => {
              if (stopped || document.visibilityState !== "visible") return;
              try {
                next(await get("meta:data->meta"));
              } catch (error) {
                fail?.(error);
              }
            };
            const timer = setInterval(check, 20000);
            const onVisible = () => {
              if (document.visibilityState === "visible") check();
            };
            document.addEventListener("visibilitychange", onVisible);
            addEventListener("focus", onVisible);
            return () => {
              stopped = true;
              clearInterval(timer);
              document.removeEventListener("visibilitychange", onVisible);
              removeEventListener("focus", onVisible);
            };
          },
        };
      },
    };
  },
};
