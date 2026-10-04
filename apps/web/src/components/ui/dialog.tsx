'use client';
import { useEffect, useId, useRef } from 'react';
import type { ReactNode, RefObject } from 'react';
import { Button, IconButton } from './button';
import { Icon } from './icon';

export function Dialog({
  open,
  onClose,
  title,
  description,
  returnFocusRef,
  id,
  variant = 'dialog',
  closeOnBackdrop = false,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  returnFocusRef?: RefObject<HTMLElement | null>;
  id?: string;
  variant?: 'dialog' | 'drawer';
  closeOnBackdrop?: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const backdropPress = useRef(false);
  const titleId = useId();
  const descriptionId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!open || !dialog) return;
    // Safari does not focus a button on pointer click. Callers can supply that trigger.
    const trigger = returnFocusRef?.current ?? document.activeElement;
    dialog.showModal();
    // Prefer the safe/cancel action for confirmations rather than the destructive action.
    dialog.querySelector<HTMLElement>('[data-dialog-initial-focus]')?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
      if (trigger instanceof HTMLElement && trigger.isConnected)
        trigger.focus();
    };
  }, [open, returnFocusRef]);
  return (
    <dialog
      ref={ref}
      id={id}
      className={`ui-dialog${variant === 'drawer' ? ' ui-dialog--drawer' : ''}`}
      onPointerDown={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        backdropPress.current =
          event.target === event.currentTarget &&
          (event.clientX < rect.left ||
            event.clientX > rect.right ||
            event.clientY < rect.top ||
            event.clientY > rect.bottom);
      }}
      onClick={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        if (
          closeOnBackdrop &&
          backdropPress.current &&
          event.target === event.currentTarget &&
          (event.clientX < rect.left ||
            event.clientX > rect.right ||
            event.clientY < rect.top ||
            event.clientY > rect.bottom)
        )
          onClose();
        backdropPress.current = false;
      }}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClose={() => {
        if (open && !ref.current?.open) onClose();
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Tab') return;
        const items = Array.from(
          event.currentTarget.querySelectorAll<HTMLElement>(
            'button, a[href], input, select, textarea, [tabindex]',
          ),
        ).filter(
          (item) =>
            !item.matches(':disabled') &&
            item.tabIndex >= 0 &&
            item.getClientRects().length > 0,
        );
        const first = items[0];
        const last = items.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }}
    >
      <div className="ui-dialog-heading">
        <h2 id={titleId}>{title}</h2>
        <IconButton label="Закрыть" onClick={onClose}>
          <Icon name="close" />
        </IconButton>
      </div>
      {description && (
        <p id={descriptionId} className="ui-metadata">
          {description}
        </p>
      )}
      {children}
    </dialog>
  );
}

export function ConfirmationDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  returnFocusRef,
  confirmLabel = 'Подтвердить',
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: string;
  returnFocusRef?: RefObject<HTMLElement | null>;
  confirmLabel?: string;
}) {
  return (
    <Dialog {...{ open, onClose, title, description, returnFocusRef }}>
      <div className="ui-dialog-actions">
        <Button variant="outline" data-dialog-initial-focus onClick={onClose}>
          Отмена
        </Button>
        <Button variant="danger" onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </Dialog>
  );
}
