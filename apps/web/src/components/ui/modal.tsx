'use client';

import { useEffect, type ReactNode } from 'react';

// A minimal, dependency-free modal. Hand-rolled in the same spirit as the rest
// of the app's Tailwind UI. Closes on Escape or a backdrop click, locks body
// scroll while open, and is labelled for assistive tech via aria-modal + a
// title. Not a full focus-trap — good enough for the small forms it hosts.
interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

export function Modal({ open, onClose, title, children }: ModalProps) {
  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/40 p-4"
      onMouseDown={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-6 shadow-xl"
        // Stop backdrop clicks that originate inside the panel from closing it.
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-neutral-950">{title}</h2>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}
