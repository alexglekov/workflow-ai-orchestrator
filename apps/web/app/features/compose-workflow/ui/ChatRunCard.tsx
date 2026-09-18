import type { Run } from '~/entities/run';
import { humanizeOutput } from '~/shared/lib/humanize';
import { isActiveRun, runStatusLabel } from '~/shared/lib/status';
import { StatusBadge } from '~/shared/ui/StatusBadge';

const preview = (value: unknown) => {
  const text = humanizeOutput(value);

  return text.length > 600 ? `${text.slice(0, 600)}…` : text;
};

const checkClass = (status: string) => {
  if (status === 'success') {
    return 'run-check is-ok';
  }

  if (status === 'error' || status === 'cancelled') {
    return 'run-check is-err';
  }

  if (status === 'running' || status === 'pending') {
    return 'run-check is-run';
  }

  return 'run-check';
};

const checkMark = (status: string) => {
  if (status === 'success') {
    return '✓';
  }

  if (status === 'error' || status === 'cancelled') {
    return '!';
  }

  return '';
};

export const ChatRunCard = ({
  run,
  onCancel,
  onRetry,
}: {
  run: Run;
  onCancel?: () => void;
  onRetry?: () => void;
}) => {
  const stopping = Boolean(
    run.cancelRequested &&
      (run.status === 'running' || run.status === 'pending'),
  );
  const active = isActiveRun(run);
  const head =
    stopping
      ? 'Останавливаю'
      : active
        ? 'Делаю'
        : run.status === 'success'
          ? 'Готово'
          : run.status === 'cancelled'
            ? 'Остановлено'
            : run.status === 'error'
              ? 'Не вышло'
              : 'Запуск';

  return (
    <div className="chat-run-card">
      <div className="chat-run-head">
        <strong>{head}</strong>
        <StatusBadge
          status={stopping ? 'cancelled' : run.status}
          label={runStatusLabel(run.status, run.cancelRequested)}
        />
      </div>
      <ul className="chat-run-steps">
        {run.steps.map((step) => {
          const output = preview(step.output);

          return (
            <li
              key={step.id}
              className={
                step.status === 'running' || step.status === 'pending'
                  ? 'is-active'
                  : undefined
              }
            >
              <span className={checkClass(step.status)} aria-hidden>
                {checkMark(step.status)}
              </span>
              <span className="chat-run-copy">
                <strong>{step.title}</strong>
                {step.error ? (
                  <small className="chat-run-error">{step.error}</small>
                ) : output ? (
                  <small>{output}</small>
                ) : null}
              </span>
            </li>
          );
        })}
      </ul>
      {active && onCancel ? (
        <button type="button" className="btn ghost" onClick={onCancel}>
          Остановить
        </button>
      ) : null}
      {(run.status === 'error' || run.status === 'cancelled') && onRetry ? (
        <button type="button" className="btn ghost" onClick={onRetry}>
          Повторить
        </button>
      ) : null}
    </div>
  );
};
