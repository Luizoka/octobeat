import { useEffect, useId, useRef } from "react";

export function AccountDialog({ title, className, onClose, children }) {
  const dialogRef = useRef(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog.showModal();
    dialog.querySelector("[data-initial-focus]")?.focus();
    return () => dialog.close();
  }, []);

  return (
    <dialog ref={dialogRef} className="modal-backdrop account-dialog" role="dialog" aria-modal="true"
      aria-labelledby={titleId} onCancel={(event) => { event.preventDefault(); onClose(); }}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className={`settings-panel ${className}`}>
        <header>
          <h2 id={titleId}>{title}</h2>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Fechar">✕</button>
        </header>
        {children}
      </div>
    </dialog>
  );
}
