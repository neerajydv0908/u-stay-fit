import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import { ArrowUpRight, X, Leaf, LoaderCircle } from 'lucide-react';
import { sources } from '../data';

export function Logo() {
  return (
    <Link to="/" className="logo" aria-label="U Stay Fit home">
      <span className="logo-mark">
        u<span />
      </span>
      <span>
        U Stay Fit<span className="logo-dot">.</span>
      </span>
    </Link>
  );
}
export function Reveal({ children, className = '', delay = 0 }) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduced ? false : { opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-30px' }}
      transition={{ duration: 0.65, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}
export function Citation({ id }) {
  const source = sources[id];
  return (
    <a className="citation" href={source.url} target="_blank" rel="noreferrer">
      {source.name}
      <ArrowUpRight size={13} aria-hidden="true" />
    </a>
  );
}
export function Eyebrow({ children }) {
  return (
    <span className="eyebrow">
      <span />
      {children}
    </span>
  );
}
export function Empty({ title, children }) {
  return (
    <div className="empty">
      <Leaf size={25} />
      <strong>{title}</strong>
      <p>{children}</p>
    </div>
  );
}
export function Loading() {
  return (
    <div className="loading" role="status">
      <LoaderCircle className="spin" />
      <p>Making room for your progress…</p>
    </div>
  );
}
export function ErrorMessage({ children }) {
  return children ? (
    <p className="error-message" role="alert">
      {children}
    </p>
  ) : null;
}
export function Field({ label, hint, ...props }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input {...props} />
      {hint && <small>{hint}</small>}
    </label>
  );
}
export function Modal({ open, onClose, title, children, className = '' }) {
  const ref = useRef();
  useEffect(() => {
    const dialog = ref.current;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
    if (open) {
      const previous = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = previous;
      };
    }
  }, [open]);
  return createPortal(
    <dialog
      ref={ref}
      className={`modal ${className}`}
      aria-label={title}
      onCancel={onClose}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
    >
      <div className="modal-inner">
        <div className="modal-heading">
          <h2>{title}</h2>
          <button className="icon-button" aria-label="Close dialog" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </dialog>,
    document.body,
  );
}
