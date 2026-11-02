import { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import Icon from '../Icon';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

/** Focus intrappolato, Esc per chiudere e ritorno del focus all'elemento di partenza. */
function useDialogBehaviour(ref, onClose) {
  useEffect(() => {
    const previous = document.activeElement;
    const node = ref.current;
    (node?.querySelector('[data-autofocus]') || node?.querySelector('input, select, textarea, button:not([data-close])'))?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key !== 'Tab' || !node) return;
      const items = [...node.querySelectorAll(FOCUSABLE)];
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      previous?.focus?.();
    };
  }, [ref, onClose]);
}

function Dialog({ title, onClose, children, kind, footer, role = 'dialog', describedBy }) {
  const ref = useRef(null);
  const titleId = useId();
  const reduce = useReducedMotion();
  useDialogBehaviour(ref, onClose);
  const sheet = kind === 'sheet';
  return (
    <motion.div
      className={`modal-backdrop ${sheet ? 'is-sheet' : ''}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.18 }}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        className={`modal ${sheet ? 'sheet' : ''}`}
        role={role}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={describedBy}
        ref={ref}
        initial={reduce ? false : sheet ? { y: 40, opacity: 0 } : { y: 16, opacity: 0, scale: 0.98 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        transition={{ duration: 0.24, ease: [0.2, 0.7, 0.2, 1] }}
      >
        {sheet && <span className="sheet-handle" aria-hidden="true" />}
        <div className="modal-head">
          <h2 id={titleId} className="modal-title">
            {title}
          </h2>
          <button type="button" className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Chiudi" data-close>
            <Icon name="x" />
          </button>
        </div>
        {children}
        {footer && <div className="modal-foot">{footer}</div>}
      </motion.div>
    </motion.div>
  );
}

export function Modal(props) {
  return <Dialog {...props} />;
}

/** Pannello che sale dal basso su mobile; su desktop diventa una finestra centrata. */
export function BottomSheet(props) {
  return <Dialog {...props} kind="sheet" />;
}

const ConfirmContext = createContext(null);

/** Fornisce `useConfirm()`: una conferma accessibile al posto di window.confirm. */
export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null);
  const confirm = useCallback(
    (options) => new Promise((resolve) => setState({ ...options, resolve })),
    []
  );
  const close = (value) => {
    state?.resolve(value);
    setState(null);
  };
  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {state && (
        <Dialog
          title={state.title}
          role="alertdialog"
          describedBy="confirm-message"
          onClose={() => close(false)}
          footer={
            <div className="btn-row">
              <button type="button" className={`btn ${state.danger ? 'btn-danger-solid' : 'btn-primary'}`} onClick={() => close(true)} data-autofocus>
                {state.confirmLabel || 'Conferma'}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => close(false)}>
                {state.cancelLabel || 'Annulla'}
              </button>
            </div>
          }
        >
          <p id="confirm-message" className="muted">
            {state.message}
          </p>
        </Dialog>
      )}
    </ConfirmContext.Provider>
  );
}

export const useConfirm = () => useContext(ConfirmContext);
