import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { X } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { cx, useIsMobile } from '../lib/util';

/** Close on Escape and trap Tab focus inside `ref` while mounted. Restores focus on unmount. */
export function useDialogBehavior(ref: RefObject<HTMLElement | null>, onClose: () => void, open: boolean): void {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const el = ref.current;
    const t = window.setTimeout(() => {
      if (!el || el.contains(document.activeElement)) return;
      const first = el.querySelector<HTMLElement>('[data-autofocus]') ?? el.querySelector<HTMLElement>('input, textarea, button:not([data-no-autofocus]), [tabindex]:not([tabindex="-1"])');
      (first ?? el).focus({ preventScroll: true });
    }, 30);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeRef.current();
      } else if (e.key === 'Tab' && el) {
        const items = Array.from(el.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), textarea, select, [tabindex]:not([tabindex="-1"])')).filter((x) => x.offsetParent !== null);
        if (!items.length) return;
        const first = items[0]!;
        const last = items[items.length - 1]!;
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    el?.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(t);
      el?.removeEventListener('keydown', onKey);
      if (prev && document.contains(prev)) prev.focus({ preventScroll: true });
    };
  }, [open, ref]);
}

export function Portal({ children }: { children: ReactNode }) {
  return createPortal(children, document.body);
}

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  icon?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
  className?: string;
  label?: string;
}
export function Modal({ open, onClose, title, icon, children, footer, width = 560, className, label }: ModalProps) {
  const ref = useRef<HTMLDivElement>(null);
  const mobile = useIsMobile();
  const reduce = useReducedMotion();
  useDialogBehavior(ref, onClose, open);
  return (
    <Portal>
      <AnimatePresence>
        {open && (
          <>
            <motion.div className="overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
            <div className="modal-wrap">
              <motion.div
                ref={ref}
                role="dialog"
                aria-modal="true"
                aria-label={label ?? (typeof title === 'string' ? title : undefined)}
                tabIndex={-1}
                className={cx('modal', className)}
                style={{ width: mobile ? '100%' : `min(${width}px, 100%)` }}
                initial={reduce ? { opacity: 0 } : mobile ? { y: '100%' } : { opacity: 0, scale: 0.96, y: 8 }}
                animate={reduce ? { opacity: 1 } : mobile ? { y: 0 } : { opacity: 1, scale: 1, y: 0 }}
                exit={reduce ? { opacity: 0 } : mobile ? { y: '100%' } : { opacity: 0, scale: 0.97, y: 6 }}
                transition={{ type: 'spring', stiffness: 520, damping: 40, mass: 0.8 }}
              >
                {mobile && <div className="sheet-grip" />}
                {title !== undefined && (
                  <div className="modal-head">
                    {icon}
                    <h2 className="grow">{title}</h2>
                    <button className="icon-btn icon-btn-sm" onClick={onClose} aria-label="Close" data-no-autofocus><X /></button>
                  </div>
                )}
                {children}
                {footer && <div className="modal-foot">{footer}</div>}
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>
    </Portal>
  );
}

interface DrawerProps { open: boolean; onClose: () => void; children: ReactNode; label: string; width?: number }
export function Drawer({ open, onClose, children, label }: DrawerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const mobile = useIsMobile();
  const reduce = useReducedMotion();
  useDialogBehavior(ref, onClose, open);
  return (
    <Portal>
      <AnimatePresence>
        {open && (
          <>
            <motion.div className="overlay" style={{ background: mobile ? undefined : 'color-mix(in srgb, var(--overlay) 55%, transparent)' }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
            <motion.aside
              ref={ref}
              role="dialog"
              aria-modal="true"
              aria-label={label}
              tabIndex={-1}
              className="drawer"
              initial={reduce ? { opacity: 0 } : mobile ? { y: '100%' } : { x: '104%' }}
              animate={reduce ? { opacity: 1 } : mobile ? { y: 0 } : { x: 0 }}
              exit={reduce ? { opacity: 0 } : mobile ? { y: '100%' } : { x: '104%' }}
              transition={{ type: 'spring', stiffness: 420, damping: 42, mass: 0.9 }}
              drag={mobile && !reduce ? 'y' : false}
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={{ top: 0, bottom: 0.6 }}
              dragListener={false}
            >
              {children}
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </Portal>
  );
}

// ─── Popover (anchored) ─────────────────────────────────────────────────────

interface PopoverProps {
  open: boolean;
  onClose: () => void;
  anchor: RefObject<HTMLElement | null>;
  children: ReactNode;
  placement?: 'bottom-start' | 'bottom-end' | 'top-start' | 'top-end';
  className?: string;
  width?: number;
  label?: string;
}
export function Popover({ open, onClose, anchor, children, placement = 'bottom-start', className, width, label }: PopoverProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; origin: string } | null>(null);
  useDialogBehavior(ref, onClose, open);

  useLayoutEffect(() => {
    if (!open) { setPos(null); return; }
    const place = () => {
      const a = anchor.current?.getBoundingClientRect();
      const el = ref.current;
      if (!a || !el) return;
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      let top = placement.startsWith('top') ? a.top - h - 6 : a.bottom + 6;
      if (top + h > vh - 8 && a.top - h - 6 > 8) top = a.top - h - 6;
      if (top < 8) top = 8;
      let left = placement.endsWith('end') ? a.right - w : a.left;
      left = Math.max(8, Math.min(left, vw - w - 8));
      setPos({ top, left, origin: `${placement.endsWith('end') ? 'right' : 'left'} ${top < a.top ? 'bottom' : 'top'}` });
    };
    place();
    const ro = new ResizeObserver(place);
    if (ref.current) ro.observe(ref.current);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => { ro.disconnect(); window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [open, anchor, placement]);

  useEffect(() => {
    if (!open) return;
    const on = (e: PointerEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t) || anchor.current?.contains(t)) return;
      onClose();
    };
    document.addEventListener('pointerdown', on, true);
    return () => document.removeEventListener('pointerdown', on, true);
  }, [open, onClose, anchor]);

  return (
    <Portal>
      <AnimatePresence>
        {open && (
          <motion.div
            ref={ref}
            role="dialog"
            aria-label={label}
            tabIndex={-1}
            className={cx('popover', className)}
            style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999, width, ['--origin' as string]: pos?.origin }}
            initial={{ opacity: 0, scale: 0.96, y: -4 }}
            animate={{ opacity: pos ? 1 : 0, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.12 } }}
            transition={{ type: 'spring', stiffness: 600, damping: 38 }}
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </Portal>
  );
}

export interface MenuItem {
  key: string;
  label: ReactNode;
  icon?: ReactNode;
  right?: ReactNode;
  checked?: boolean;
  danger?: boolean;
  onSelect: () => void;
}
/** Keyboard-navigable menu list (arrow keys + Enter). */
export function MenuList({ items, onDone }: { items: (MenuItem | 'sep' | { label: string })[]; onDone?: () => void }) {
  const [active, setActive] = useState(-1);
  const selectable = items.map((it, i) => (typeof it === 'object' && 'key' in it ? i : -1)).filter((i) => i >= 0);
  return (
    <div
      role="menu"
      onKeyDown={(e) => {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          const cur = selectable.indexOf(active);
          const next = e.key === 'ArrowDown' ? selectable[(cur + 1) % selectable.length] : selectable[(cur - 1 + selectable.length) % selectable.length];
          setActive(next ?? -1);
          (e.currentTarget.querySelector(`[data-idx="${next}"]`) as HTMLElement | null)?.focus();
        }
      }}
    >
      {items.map((it, i) => {
        if (it === 'sep') return <div key={`sep${i}`} className="menu-sep" />;
        if (!('key' in it)) return <div key={`l${i}`} className="menu-label eyebrow">{it.label}</div>;
        return (
          <button
            key={it.key}
            data-idx={i}
            role={it.checked !== undefined ? 'menuitemcheckbox' : 'menuitem'}
            aria-checked={it.checked}
            className="menu-item"
            data-active={active === i}
            style={it.danger ? { color: 'var(--danger)' } : undefined}
            onMouseEnter={() => setActive(i)}
            onClick={() => { it.onSelect(); onDone?.(); }}
          >
            {it.icon}
            <span className="grow truncate">{it.label}</span>
            {it.right && <span className="right">{it.right}</span>}
          </button>
        );
      })}
    </div>
  );
}
