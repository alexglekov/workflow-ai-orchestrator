import type { Run } from '~/entities/run';
import { humanizeOutput } from '~/shared/lib/humanize';
import { runStatusLabel, stepStatusLabel } from '~/shared/lib/status';
import { ConnectorMark } from '~/shared/ui/ConnectorMark';
import { StatusBadge } from '~/shared/ui/StatusBadge';

const preview = (value: unknown) => {
  const text = humanizeOutput(value);

  return text.length > 600 ? `${text.slice(0, 600)}…` : text;
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
  const active = run.status === 'running' || run.status === 'pending';

  return (
    <div className="chat-run-card">
      <div className="chat-run-head">
        <strong>Запуск</strong>
        <StatusBadge status={run.status} label={runStatusLabel(run.status)} />
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
              <ConnectorMark id={step.connectorId} size={36} />
              <span className="chat-run-copy">
                <strong>{step.title}</strong>
                {step.error ? (
                  <small className="chat-run-error">{step.error}</small>
                ) : output ? (
                  <small>{output}</small>
                ) : null}
              </span>
              <StatusBadge
                status={step.status}
                label={stepStatusLabel(step.status)}
              />
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
