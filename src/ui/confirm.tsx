import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Confirmação no estilo do jogo, no lugar do `confirm()` do navegador.
 * Uso: `if (await askConfirm({ title, body, confirmLabel })) { ... }`.
 * O `<ConfirmHost />` fica uma vez na raiz do app.
 */
export interface ConfirmOptions {
  title: string;
  body: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  /** Ação destrutiva (apagar, vender): botão em vermelho. */
  danger?: boolean;
}

type Request = ConfirmOptions & { resolve: (ok: boolean) => void };
let show: ((r: Request) => void) | null = null;

export function askConfirm(opts: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    if (!show) { resolve(false); return; }
    show({ ...opts, resolve });
  });
}

export function ConfirmHost() {
  const [req, setReq] = useState<Request | null>(null);
  const okRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    show = (r) => setReq((prev) => { prev?.resolve(false); return r; });
    return () => { show = null; };
  }, []);

  const close = (ok: boolean) => {
    req?.resolve(ok);
    setReq(null);
  };

  useEffect(() => {
    if (!req) return;
    okRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(false); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  if (!req) return null;
  return (
    <div className="overlay confirm-overlay" onClick={() => close(false)}>
      <div className="window confirm-window" role="alertdialog" aria-modal="true" aria-label={req.title} onClick={(e) => e.stopPropagation()}>
        <header className={`window-title ${req.danger ? 'danger' : ''}`}><span>{req.title}</span></header>
        <div className="window-body">
          <div className="confirm-body">{req.body}</div>
          <div className="confirm-actions">
            <button className="btn ghost" onClick={() => close(false)}>{req.cancelLabel ?? 'Cancelar'}</button>
            <button ref={okRef} className={`btn ${req.danger ? 'danger' : 'primary'}`} onClick={() => close(true)}>{req.confirmLabel}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
