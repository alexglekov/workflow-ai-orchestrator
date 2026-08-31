import { useEffect } from 'react';
import { Link, useParams } from 'react-router';
import { useAtom } from 'jotai';
import { fetchRun, runAtom } from '~/entities/run';
import { errorAtom } from '~/shared/model/ui';
import { connectorVisual } from '~/shared/lib/connector-visuals';
import { runStatusLabel, stepStatusLabel } from '~/shared/lib/status';
import { Banner } from '~/shared/ui/Banner';
import { Icon } from '~/shared/ui/Icon';
import { StatusBadge } from '~/shared/ui/StatusBadge';

export const RunPage = () => {
  const { id } = useParams();
  const [run, setRun] = useAtom(runAtom);
  const [error, setError] = useAtom(errorAtom);

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

        if (next.status === 'running' || next.status === 'pending') {
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
    <div className="canvas-page">
      <div className="canvas-chrome">
        <Link
          to={`/workflows/${run.workflowId}`}
          className="icon-btn"
          aria-label="К workflow"
        >
          <Icon name="home" size={16} />
        </Link>
        <h1>Run</h1>
        <StatusBadge status={run.status} label={runStatusLabel(run.status)} />
      </div>
      {error ? <Banner>{error}</Banner> : null}
      <div className="canvas-board">
        <div className="flow">
          {run.steps.map((step, index) => {
            const visual = connectorVisual(step.connectorId);

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
                  {step.output != null ? (
                    <pre className="code-block">
                      {JSON.stringify(step.output, null, 2)}
                    </pre>
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
