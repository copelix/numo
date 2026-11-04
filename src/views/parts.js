import { CONFIG } from "../config.js";
import { Finance } from "../core/finance.js";
import { Money } from "../core/money.js";
import { Store } from "../core/store.js";
import { Dates } from "../lib/dates.js";
import { html } from "../lib/html.js";
import { Storage } from "../lib/storage.js";
import { capitalize } from "../lib/utils.js";
import { Backup } from "../sync/backup.js";
import { Cloud } from "../sync/cloud.js";
import { Sync } from "../sync/sync.js";
import { icon } from "../ui/icons.js";

export const PartsViews = {
  /* ---------- Piezas compartidas ---------- */
  reminderBanner() {
    const days = Store.state.settings.remindDays;
    const due = Finance.upcoming().filter(p => p.days <= days);
    if (!due.length) return "";
    return html`<div class="banner" role="status">${icon("bell")}<div>
      <strong>${due.length === 1 ? "Tenés un pago cerca" : `Tenés ${due.length} pagos cerca`}</strong>
      <p class="small">${due.map(p => `${p.name} ${Dates.relative(p.days)} (${Money.format(p.amount, p.currency)})`).join(" · ")}</p>
    </div></div>`;
  },

  /** Invita a crear la cuenta (web) o recuerda hacer una copia (solo navegador). */
  saveBanner() {
    if (Sync.mode !== "local" || !Storage.available) return "";
    if (Cloud.enabled) {
      if (Storage.read("numo:authNudge") && Date.now() - Number(Storage.read("numo:authNudge")) < 5 * 86400000) return "";
      return html`<div class="banner banner--info">${icon("cloud")}<div>
        <strong>Que no se te pierda nada</strong>
        <p class="small muted">Creá tu cuenta gratis: tus datos quedan guardados y los ves en el celular y en la compu.</p>
      </div><div class="btn-row banner__actions">
        <button type="button" class="btn btn--compact" data-action="auth-later">Después</button>
        <button type="button" class="btn btn--compact btn--primary" data-action="auth-signup">Crear cuenta</button>
      </div></div>`;
    }
    if (!Backup.due()) return "";
    return html`<div class="banner banner--info">${icon("save")}<div>
      <strong>Hacé una copia de tus datos</strong>
      <p class="small muted">Están guardados solo en este navegador. Con una copia, si cambiás de teléfono no perdés nada.</p>
    </div><div class="btn-row banner__actions">
      <button type="button" class="btn btn--compact" data-action="backup-later">Después</button>
      <button type="button" class="btn btn--compact btn--primary" data-action="export-json">Bajar copia</button>
    </div></div>`;
  },

  demoBanner() {
    if (!Store.hasDemoData()) return "";
    return html`<div class="banner banner--info">${icon("sparkle")}<div>
      <strong>Estos son datos de ejemplo</strong>
      <p class="small muted">Sirven para ver cómo funciona todo. Cuando quieras empezar con lo tuyo, borralos.</p>
    </div><button type="button" class="btn btn--compact" data-action="clear-demo">Borrar ejemplos</button></div>`;
  },

  hero() {
    const upcoming = Finance.upcoming();
    const next = upcoming[0];
    if (!next) {
      return html`<section class="hero" aria-label="Próximo pago">
        <p class="eyebrow">Próximo pago</p>
        <p class="hero__big">Nada pendiente</p>
        <p class="hero__detail">Agregá tus suscripciones para ver acá qué se viene.</p>
        <div class="hero__meta"><button type="button" class="btn btn--primary" data-action="new-subscription">Agregar suscripción</button></div>
      </section>`;
    }
    const when = next.days === 0 ? "Hoy" : next.days === 1 ? "Mañana" : `En ${next.days} días`;
    const sameDay = upcoming.filter(p => p.date === next.date).length - 1;
    return html`<section class="hero" aria-label="Próximo pago">
      <p class="eyebrow">Próximo pago</p>
      <p class="hero__big">${when}</p>
      <p class="hero__detail">${next.name} · <span class="num">${Money.format(next.amount, next.currency)}</span></p>
      <div class="hero__meta">
        <span class="badge">${capitalize(Dates.formatLong(next.date))}</span>
        ${next.paymentMethod && html`<span class="badge">${next.paymentMethod}</span>`}
        ${sameDay > 0 && html`<span class="badge">+${sameDay} ese día</span>`}
      </div>
    </section>`;
  },

  footer() {
    return html`<footer class="meta">
      <span>Numo v${CONFIG.version}</span><span aria-hidden="true">|</span>
      <span data-sync-status>${Sync.statusLabel()}</span><span aria-hidden="true">|</span>
      <span>${Money.base}</span>
    </footer>`;
  },

  accountCard() {
    if (Sync.mode === "cloud" && Sync.provider === "numo") {
      return html`<section class="card" id="cuenta">
        <header class="card__head"><h2 class="card__title">Tu cuenta de Numo</h2>${icon("cloud")}</header>
        <p>Entraste como <strong>${Cloud.email}</strong>. Tus datos se guardan en tu cuenta y se sincronizan entre todos los dispositivos donde entres.</p>
        <p class="small muted" style="margin-top:8px">Solo vos los ves. También quedan en este dispositivo, así la app abre sin internet.</p>
        <p class="small" style="margin-top:12px" data-sync-status>${Sync.statusLabel()}</p>
        <div class="btn-row section">
          <button type="button" class="btn" data-action="sync-now">Guardar ahora</button>
          <button type="button" class="btn" data-action="sign-out">Cerrar sesión</button>
        </div>
        <p class="small section"><button type="button" class="link-btn" data-action="delete-account">Borrar mi cuenta y mis datos</button></p>
      </section>`;
    }
    if (Sync.mode === "cloud") {
      return html`<section class="card" id="cuenta">
        <header class="card__head"><h2 class="card__title">Guardado en la nube</h2>${icon("cloud")}</header>
        <p>Tus datos se guardan en privado en tu cuenta de Claude y se sincronizan entre el celular y la compu.</p>
        <p class="small muted" style="margin-top:8px">Nadie más los ve. Si compartís el link, cada persona arranca con su propia app vacía.</p>
        <p class="small" style="margin-top:12px" data-sync-status>${Sync.statusLabel()}</p>
        <div class="btn-row section"><button type="button" class="btn" data-action="sync-now">Guardar ahora</button></div>
      </section>`;
    }
    if (Sync.mode === "connecting") {
      return html`<section class="card" id="cuenta">
        <header class="card__head"><h2 class="card__title">Guardado</h2></header>
        <p class="small muted" data-sync-status>${Sync.statusLabel()}</p>
      </section>`;
    }
    return html`<section class="card" id="cuenta">
      <header class="card__head"><h2 class="card__title">Guardado en este navegador</h2><span class="badge badge--soon">Sin sincronizar</span></header>
      <p>Tus datos se guardan solo en este navegador. Nadie más los ve, pero si borrás los datos del navegador o cambiás de teléfono, se pierden.</p>
      ${Cloud.enabled && html`<p class="section"><strong>Creá tu cuenta gratis</strong> y tus datos quedan guardados: no se pierden y los ves en el celular y en la compu.</p>
      <div class="btn-row section">
        <button type="button" class="btn btn--primary" data-action="auth-signup">Crear cuenta</button>
        <button type="button" class="btn" data-action="auth-login">Ya tengo cuenta</button>
      </div>`}
      <p class="small muted" style="margin-top:8px">Cada tanto hacé una copia en Más → Tus datos para tener un respaldo.</p>
    </section>`;
  },
};
