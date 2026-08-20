import type { ReactNode } from 'react';

export function Modal({ title, subtitle, children, onClose, footer }: { title: string; subtitle?: string; children: ReactNode; onClose: () => void; footer?: ReactNode }) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-card">
        <div className="modal-head"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button className="icon-button" type="button" onClick={onClose} aria-label="Tutup">×</button></div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}
