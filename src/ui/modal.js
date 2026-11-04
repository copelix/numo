import { html } from "../lib/html.js";
import { $, $$, isNumberText, toNumber } from "../lib/utils.js";
import { Gestures } from "./gestures.js";

export const Modal = {
  onClose: null,
  get el() {
    return $("#modal");
  },
  get isOpen() {
    return this.el.open;
  },

  /**
   * Abre un formulario en el diálogo.
   * - onSubmit(data, form): si devuelve false, el modal no se cierra.
   * - actions: botones propios [{ value, label, variant }] en lugar de Guardar/Cancelar.
   */
  open({
    title,
    description,
    body,
    submitLabel = "Guardar",
    cancelLabel = "Cancelar",
    onSubmit,
    onDelete,
    deleteLabel = "Eliminar",
    actions,
    onClose,
    onReady,
    focus,
  }) {
    if (this.isOpen) this.close("replaced");
    const dialog = this.el;
    const footer = actions
      ? actions.map(
          a =>
            html`<button type="button" class="btn ${a.variant ? `btn--${a.variant}` : ""}" data-modal-value="${a.value}">${a.label}</button>`,
        )
      : html`
          ${onDelete && html`<button type="button" class="btn btn--danger push-left" data-modal-value="delete">${deleteLabel}</button>`}
          <button type="button" class="btn" data-modal-value="cancel">${cancelLabel}</button>
          <button type="submit" class="btn btn--primary">${submitLabel}</button>`;

    dialog.innerHTML = String(html`
      <form class="modal__form">
        <div class="modal__grab" aria-hidden="true"></div>
        <header class="modal__head">
          <h2 class="modal__title" id="modal-title">${title}</h2>
          ${description && html`<p class="small muted">${description}</p>`}
        </header>
        <div class="modal__body">${body}</div>
        <footer class="modal__foot">${footer}</footer>
      </form>`);

    const form = $("form", dialog);
    /* No dependemos del envío nativo del formulario: algunas vistas previas lo bloquean.
       Guardar se dispara desde el botón o con Enter, y la validación la hace el navegador. */
    const submit = () => {
      if (!onSubmit) return;
      for (const input of $$("input[data-number]", form)) {
        const raw = input.value.trim();
        const min = input.dataset.min !== undefined ? toNumber(input.dataset.min) : null;
        let message = "";
        if (raw && !isNumberText(raw)) message = "Escribí solo el número. Podés usar coma o punto para los decimales.";
        else if (raw && min !== null && toNumber(raw) < min)
          message = min > 0 ? "El monto tiene que ser mayor a 0." : "El número no puede ser negativo.";
        input.setCustomValidity(message);
      }
      const valid = typeof form.reportValidity === "function" ? form.reportValidity() : form.checkValidity();
      if (!valid) return;
      const data = Object.fromEntries(new FormData(form));
      if (onSubmit(data, form) !== false) this.close("submit");
    };
    form.addEventListener("submit", event => {
      event.preventDefault();
      submit();
    });
    form.addEventListener("input", event => event.target.setCustomValidity?.(""));
    $('button[type="submit"]', dialog)?.addEventListener("click", event => {
      event.preventDefault();
      submit();
    });
    form.addEventListener("keydown", event => {
      if (event.key === "Enter" && event.target.matches("input:not([type=checkbox]):not([type=color])")) {
        event.preventDefault();
        submit();
      }
    });
    for (const button of $$("[data-modal-value]", dialog)) {
      button.addEventListener("click", () => {
        const value = button.dataset.modalValue;
        this.close(value);
        if (value === "delete") onDelete?.();
      });
    }

    this.onClose = onClose ?? null;
    try {
      dialog.showModal();
    } catch {
      dialog.setAttribute("open", ""); // navegadores o marcos que no permiten showModal
      dialog.classList.add("modal--fallback");
    }
    Gestures.sheet(dialog);
    onReady?.(form);
    if (focus) $(focus, dialog)?.focus();
    else if (matchMedia("(pointer: fine)").matches)
      $(
        ".modal__body input:not([type=hidden]):not([type=radio]), .modal__body select, .modal__body textarea",
        dialog,
      )?.focus();
  },

  close(reason = "cancel") {
    const callback = this.onClose;
    this.onClose = null;
    if (this.el.open) this.el.close();
    this.el.classList.remove("modal--fallback");
    callback?.(reason);
  },

  /** Pregunta con varias opciones. Devuelve el value elegido o null si se cierra. */
  choose({ title, message, options }) {
    return new Promise(resolve => {
      this.open({
        title,
        body: html`<p>${message}</p>`,
        actions: options,
        onClose: reason => resolve(options.some(o => o.value === reason) ? reason : null),
      });
    });
  },

  async confirm({ title, message, confirmLabel = "Aceptar", danger = false }) {
    const answer = await this.choose({
      title,
      message,
      options: [
        { value: "cancel", label: "Cancelar" },
        { value: "ok", label: confirmLabel, variant: danger ? "danger" : "primary" },
      ],
    });
    return answer === "ok";
  },
};
