import { useAtom } from 'jotai';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toastsAtom, type ToastItem } from '~/shared/model/ui';
import { Icon } from '~/shared/ui/Icon';

const canHoverPause = () =>
  typeof window !== 'undefined' &&
  window.matchMedia('(hover: hover) and (pointer: fine)').matches;

const ToastCard = ({
  item,
  onDismiss,
}: {
  item: ToastItem;
  onDismiss: (id: string) => void;
}) => {
  const remainingRef = useRef(item.duration);
  const startedRef = useRef(0);
  const timerRef = useRef(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    startedRef.current = Date.now();
    timerRef.current = window.setTimeout(
      () => onDismiss(item.id),
      remainingRef.current,
    );

    return () => window.clearTimeout(timerRef.current);
  }, [item.id, onDismiss]);

  return (
    <div
      className={`toast is-${item.tone}${paused ? ' is-paused' : ''}`}
      role="status"
      onMouseEnter={() => {
        if (!canHoverPause() || paused) {
          return;
        }

        window.clearTimeout(timerRef.current);
        remainingRef.current = Math.max(
          0,
          remainingRef.current - (Date.now() - startedRef.current),
        );
        setPaused(true);
      }}
      onMouseLeave={() => {
        if (!paused) {
          return;
        }

        startedRef.current = Date.now();
        timerRef.current = window.setTimeout(
          () => onDismiss(item.id),
          remainingRef.current,
        );
        setPaused(false);
      }}
    >
      <span className="toast-icon" aria-hidden>
        <Icon name={item.tone === 'ok' ? 'check' : 'alert'} size={16} />
      </span>
      <p className="toast-message">{item.message}</p>
      <button
        type="button"
        className="toast-close"
        aria-label="Закрыть"
        onClick={() => onDismiss(item.id)}
      >
        <Icon name="close" size={16} />
      </button>
      <span className="toast-timer-track" aria-hidden>
        <span
          className="toast-timer"
          style={{ animationDuration: `${item.duration}ms` }}
        />
      </span>
    </div>
  );
};

export const ToastHost = () => {
  const [toasts, setToasts] = useAtom(toastsAtom);
  const dismiss = useCallback(
    (id: string) => {
      setToasts((current) => current.filter((item) => item.id !== id));
    },
    [setToasts],
  );

  if (!toasts.length) {
    return null;
  }

  return (
    <div className="toast-host" aria-live="polite" aria-relevant="additions">
      {toasts.map((item) => (
        <ToastCard key={item.id} item={item} onDismiss={dismiss} />
      ))}
    </div>
  );
};
