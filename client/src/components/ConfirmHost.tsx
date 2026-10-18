import { createPortal } from "react-dom";
import { useEffect, useState } from "react";
import { useFocusTrap } from "@/hooks/use-focus-trap";
import { subscribeConfirm, type ConfirmRequest } from "@/lib/confirm-dialog";
import { t } from "@/lib/i18n";

/** Dialogul comun pentru confirmări și mesaje. „Anulează” e butonul evidențiat. */
export function ConfirmHost() {
  const [queue, setQueue] = useState<ConfirmRequest[]>([]);
  useEffect(() => subscribeConfirm((request) => setQueue((current) => [...current, request])), []);
  const current = queue[0];
  const answer = (value: boolean) => {
    if (!current) return;
    current.resolve(value);
    setQueue((items) => items.slice(1));
  };
  if (!current) return null;
  return <ConfirmDialog key={current.id} request={current} onAnswer={answer} />;
}

function ConfirmDialog({ request, onAnswer }: { request: ConfirmRequest; onAnswer: (value: boolean) => void }) {
  const dialogRef = useFocusTrap<HTMLElement>(() => onAnswer(false));
  const titleId = `bf-confirm-title-${request.id}`;
  // Pe body: dialogul trebuie să stea și peste ecranele pe tot ecranul (Bonuri, editorul bonului).
  return createPortal(
    <div className="bf-modal-backdrop bf-confirm-backdrop" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget) onAnswer(false); }}>
      <section ref={dialogRef} tabIndex={-1} className="bf-confirm" role={request.notice ? "alertdialog" : "dialog"} aria-modal="true" aria-labelledby={titleId} aria-describedby={`${titleId}-text`}>
        <h2 id={titleId}>{request.title || (request.notice ? t("De știut") : t("Ești sigur?"))}</h2>
        <p id={`${titleId}-text`}>{request.message}</p>
        <footer>
          {request.notice ? (
            <button type="button" className="bf-primary" autoFocus onClick={() => onAnswer(true)}>{t("Am înțeles")}</button>
          ) : (
            <>
              <button type="button" className="bf-primary" autoFocus onClick={() => onAnswer(false)}>{t("Anulează")}</button>
              <button type="button" className={request.danger ? "bf-confirm-danger" : "bf-secondary"} onClick={() => onAnswer(true)}>{request.confirmLabel || t("Da")}</button>
            </>
          )}
        </footer>
      </section>
    </div>, document.body,
  );
}
