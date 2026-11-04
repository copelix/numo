import { MovementsForms } from "./movements.js";
import { SubscriptionForms } from "./subscription.js";
import { InstallmentForms } from "./installment.js";
import { SharedForms } from "./shared.js";
import { AuthForms } from "./auth.js";
import { PlanningForms } from "./planning.js";

/* =========================================================================
   12. FORMULARIOS
   ========================================================================= */
export const Forms = {
  ...MovementsForms,
  ...SubscriptionForms,
  ...InstallmentForms,
  ...SharedForms,
  ...AuthForms,
  ...PlanningForms,
};
