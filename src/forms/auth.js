import { Forms } from "./index.js";
import { html } from "../lib/html.js";
import { $ } from "../lib/utils.js";
import { Cloud } from "../sync/cloud.js";
import { Sync } from "../sync/sync.js";
import { Field } from "../ui/fields.js";
import { Modal } from "../ui/modal.js";

export const AuthForms = {
  /** Crear cuenta o entrar (solo en la web con cuentas de Numo). */
  auth(mode = "signup") {
    if (!Cloud.enabled) return;
    const signup = mode === "signup";
    Modal.open({
      title: signup ? "Crear tu cuenta" : "Entrar a tu cuenta",
      description: signup ? "Gratis. Tus datos quedan guardados y los ves en todos tus dispositivos. Solo vos podés verlos." : "Con el mail y la contraseña de tu cuenta de Numo.",
      submitLabel: signup ? "Crear cuenta" : "Entrar",
      body: html`<div class="form-grid">
        ${Field.input({ label: "Mail", name: "email", type: "email", required: true, autocomplete: "email", inputmode: "email", autocapitalize: "off", spellcheck: "false", maxlength: 254, full: true })}
        ${Field.input({ label: "Contraseña", name: "password", type: "password", required: true, minlength: 8, maxlength: 72, autocomplete: signup ? "new-password" : "current-password", full: true,
          hint: signup ? "Al menos 8 caracteres. Anotala en un lugar seguro: por ahora no se puede recuperar por mail." : "" })}
        <p class="form-error field--full" role="alert" data-auth-error></p>
        <p class="auth-switch field--full">${signup ? "¿Ya tenés cuenta? " : "¿Todavía no tenés? "}<button type="button" class="link-btn" data-auth-switch>${signup ? "Ya tengo cuenta" : "Crear una"}</button></p>
      </div>`,
      focus: 'input[name="email"]',
      onReady: form => {
        $("[data-auth-switch]", form).addEventListener("click", () => Forms.auth(signup ? "login" : "signup"));
      },
      onSubmit: (data, form) => {
        const button = $('button[type="submit"]', form.closest("dialog"));
        const error = $("[data-auth-error]", form);
        if (button.disabled) return false;
        button.disabled = true;
        button.textContent = signup ? "Creando…" : "Entrando…";
        error.textContent = "";
        const email = data.email.trim().toLowerCase();
        (signup ? Cloud.signUp(email, data.password) : Cloud.signIn(email, data.password))
          .then(() => { Modal.close("submit"); return Sync.signedIn(); })
          .catch(err => {
            if (!form.isConnected) return;
            error.textContent = Cloud.authMessage(err);
            button.disabled = false;
            button.textContent = signup ? "Crear cuenta" : "Entrar";
          });
        return false;
      },
    });
  },
};
