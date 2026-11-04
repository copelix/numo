import { Money } from "./money.js";
import { Store } from "./store.js";
import { Dates } from "../lib/dates.js";
import { html } from "../lib/html.js";
import { $ } from "../lib/utils.js";
import { Modal } from "../ui/modal.js";
import { Toast } from "../ui/toast.js";

/* =========================================================================
   6c. GASTOS COMPARTIDOS: quién puso cuánto y quién le paga a quién
   ========================================================================= */
export const Shared = {
  find(id) { return Store.state.shared.find(x => x.id === id) ?? null; },
  total(ev) { return ev.items.reduce((t, it) => t + it.amount, 0); },
  /** Por persona: lo que puso, lo que le toca y la diferencia (positivo: le deben). */
  balances(ev) {
    const rows = ev.people.map(name => ({ name, paid: 0, share: 0, balance: 0 }));
    for (const it of ev.items) {
      rows[it.paidBy].paid += it.amount;
      const part = it.amount / it.among.length;
      for (const i of it.among) rows[i].share += part;
    }
    for (const r of rows) r.balance = r.paid - r.share;
    return rows;
  },
  /** La menor cantidad de transferencias para quedar a mano. */
  transfers(ev) {
    const cents = n => Math.round(n * 100);
    const debtors = [], creditors = [];
    this.balances(ev).forEach((r, i) => {
      const c = cents(r.balance);
      if (c < -50) debtors.push({ i, left: -c });
      else if (c > 50) creditors.push({ i, left: c });
    });
    debtors.sort((a, b) => b.left - a.left);
    creditors.sort((a, b) => b.left - a.left);
    const out = [];
    let d = 0, c = 0;
    while (d < debtors.length && c < creditors.length) {
      const amount = Math.min(debtors[d].left, creditors[c].left);
      if (amount > 50) out.push({ from: debtors[d].i, to: creditors[c].i, amount: amount / 100 });
      debtors[d].left -= amount;
      creditors[c].left -= amount;
      if (debtors[d].left <= 50) d++;
      if (creditors[c].left <= 50) c++;
    }
    return out;
  },
  myBalance(ev) { return this.balances(ev)[0].balance; },
  summary(ev) {
    const f = n => Money.format(n, ev.currency);
    const lines = [`${ev.name} · ${Dates.formatShort(ev.date)}`, `Total: ${f(this.total(ev))} entre ${ev.people.length} personas`, ""];
    for (const it of ev.items) {
      const among = it.among.length === ev.people.length ? "" : ` (entre ${it.among.map(i => ev.people[i]).join(", ")})`;
      lines.push(`• ${it.description}: ${f(it.amount)}, pagó ${ev.people[it.paidBy]}${among}`);
    }
    const transfers = this.transfers(ev);
    lines.push("", transfers.length ? "Para quedar a mano:" : "Estamos a mano.");
    for (const t of transfers) lines.push(`→ ${ev.people[t.from]} le pasa ${f(t.amount)} a ${ev.people[t.to]}`);
    lines.push("", "Hecho con Numo");
    return lines.join("\n");
  },
  /** Compartir el resumen: menú del celular si se puede; si no, copiar; si no, mostrarlo para copiar a mano. */
  async share(id) {
    const ev = this.find(id);
    if (!ev) return;
    const text = this.summary(ev);
    try {
      if (navigator.share && matchMedia("(pointer: coarse)").matches) { await navigator.share({ text }); return; }
    } catch (error) {
      if (error?.name === "AbortError") return;
    }
    try {
      await navigator.clipboard.writeText(text);
      Toast.show("Copiamos el resumen: pegalo en el grupo de WhatsApp.");
      return;
    } catch (error) { /* sin portapapeles: se muestra para copiar a mano */ }
    Modal.open({
      title: "Resumen para compartir",
      description: "Copialo y pegalo en el grupo.",
      body: html`<textarea class="input" rows="12" readonly id="share-text" style="width:100%;font-family:var(--mono);font-size:13px">${text}</textarea>`,
      actions: [{ value: "cancel", label: "Listo", variant: "primary" }],
      onReady: form => { const t = $("#share-text", form); t.focus(); t.select(); },
    });
  },
};
