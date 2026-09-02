import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useAtom } from 'jotai';
import { cancelRun, fetchRun, retryRun, runAtom } from '~/entities/run';
import { errorAtom } from '~/shared/model/ui';
import { connectorVisual } from '~/shared/lib/connector-visuals';
import { runStatusLabel, stepStatusLabel } from '~/shared/lib/status';
import { Banner } from '~/shared/ui/Banner';
import { Icon } from '~/shared/ui/Icon';
import { StatusBadge } from '~/shared/ui/StatusBadge';

const active = (status: string) =>
  status === 'running' || status === 'pending';

const pretty = (value: unknown) => {
  if (value == null) {
    return '';
  }

  if (typeof value === 'string') {
    return value;
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

export const RunPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [run, setRun] = useAtom(runAtom);
  const [error, setError] = useAtom(errorAtom);
  const [retrying, setRetrying] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    if (!id) {
      return;
    }

    let timer: number | undefined;
    let cancelled = false;

    const tick = async () => {
      try {
        const next = await fetchRun(id as string);

        if (cancelled) {
          return;
        }

        setRun(next);
        setError(null);

        if (active(next.status)) {
          timer = window.setTimeout(() => void tick(), 1000);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : 'Не удалось загрузить запуск',
          );
        }
      }
    };

    void tick();

    return () => {
      cancelled = true;

      if (timer) {
        window.clearTimeout(timer);
      }
    };
  }, [id, setRun, setError]);

  if (!run) {
    return (
      <div className="canvas-page">
        <p className="muted">Загрузка запуска…</p>
      </div>
    );
  }

  return (
    <div className="canvas-page run-page">
      <header className="canvas-chrome">
        <Link
          to={`/workflows/${run.workflowId}`}
          className="icon-btn"
          aria-label="К workflow"
        >
          <Icon name="home" size={16} />
        </Link>
        <h1>Run</h1>
        <div className="chrome-actions">
          <StatusBadge status={run.status} label={runStatusLabel(run.status)} />
          {active(run.status) ? (
            <button
              type="button"
              className="icon-btn"
              disabled={cancelling}
              aria-label="Остановить"
              onClick={() => {
                if (!id || cancelling) {
                  return;
                }

                setCancelling(true);
                void cancelRun(id)
                  .then((next) => {
                    setRun(next);
                    setCancelling(false);
                  })
                  .catch((err) => {
                    setError(
                      err instanceof Error
                        ? err.message
                        : 'Не удалось остановить',
                    );
                    setCancelling(false);
                  });
              }}
            >
              <Icon name="close" size={16} />
            </button>
          ) : null}
          {run.status === 'error' || run.status === 'cancelled' ? (
            <button
              type="button"
              className="icon-btn"
              disabled={retrying}
              aria-label="Повторить"
              onClick={() => {
                if (!id || retrying) {
                  return;
                }

                setRetrying(true);
                void retryRun(id)
                  .then((created) => navigate(`/runs/${created.id}`))
                  .catch((err) => {
                    setError(
                      err instanceof Error
                        ? err.message
                        : 'Не удалось повторить',
                    );
                    setRetrying(false);
                  });
              }}
            >
              <Icon name="refresh" size={16} />
            </button>
          ) : null}
        </div>
      </header>
      {error ? <Banner>{error}</Banner> : null}
      {run.source || run.input != null ? (
        <div className="run-meta-card">
          {run.source ? <span>Источник: {run.source}</span> : null}
          {run.input != null ? (
            <code>{JSON.stringify(run.input)}</code>
          ) : null}
        </div>
      ) : null}
      <div className="canvas-board">
        <div className="flow">
          {run.steps.map((step, index) => {
            const visual = connectorVisual(step.connectorId);
            const params = pretty(step.input);
            const output = pretty(step.output);

            return (
              <div key={step.id} style={{ width: '100%' }}>
                {index > 0 ? <div className="flow-link" /> : null}
                <article className={`flow-node status-${step.status}`}>
                  <div className="node-row">
                    <span
                      className="node-icon"
                      style={{ background: visual.bg, color: visual.color }}
                    >
                      {visual.letter}
                    </span>
                    <span className="node-copy">
                      <strong>{step.title}</strong>
                      <span>
                        {step.connectorId}.{step.action}
                      </span>
                    </span>
                    <StatusBadge
                      status={step.status}
                      label={stepStatusLabel(step.status)}
                    />
                  </div>
                  {step.error ? <Banner>{step.error}</Banner> : null}
                  {params ? (
                    <>
                      <p className="muted">Параметры</p>
                      <pre className="code-block">{params}</pre>
                    </>
                  ) : null}
                  {output ? (
                    <>
                      <p className="muted">Результат</p>
                      <pre className="code-block">{output}</pre>
                    </>
                  ) : null}
                </article>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
