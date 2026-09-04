import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useAtom } from 'jotai';
import {
  triggerKindLabel,
  triggerLaunchLabel,
  type WorkflowTrigger,
} from '~/entities/trigger';
import {
  clearWorkflows,
  deleteWorkflow,
  fetchWorkflows,
  workflowsAtom,
  type Workflow,
} from '~/entities/workflow';
import { CreateWorkflowButton } from '~/features/create-workflow';
import { errorAtom } from '~/shared/model/ui';
import { Banner } from '~/shared/ui/Banner';
import { Icon } from '~/shared/ui/Icon';

const PAGE_SIZE = 8;

const workflowTriggers = (workflow: Workflow): WorkflowTrigger[] =>
  workflow.triggers ?? [];

const isLive = (workflow: Workflow) => workflowTriggers(workflow).length > 0;

const preview = (name: string, prompt: string, empty: boolean) => {
  const text = prompt.trim();

  if (!text || text === name.trim()) {
    return empty ? 'Черновик' : null;
  }

  return text;
};

const lastFiredLabel = (triggers: WorkflowTrigger[]) => {
  const stamps = triggers
    .map((item) => item.lastFiredAt)
    .filter((item): item is string => Boolean(item))
    .map((item) => new Date(item).getTime())
    .filter((item) => Number.isFinite(item));

  if (!stamps.length) {
    return 'ещё не запускался';
  }

  return `последний запуск ${new Date(Math.max(...stamps)).toLocaleString(
    'ru-RU',
    { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' },
  )}`;
};

const WorkflowRow = ({
  workflow,
  busy,
  live,
  onRemove,
}: {
  workflow: Workflow;
  busy: boolean;
  live: boolean;
  onRemove: (id: string) => void;
}) => {
  const empty = workflow.steps.length === 0;
  const triggers = workflowTriggers(workflow);
  const subtitle = live
    ? lastFiredLabel(triggers)
    : preview(workflow.name, workflow.prompt, empty);

  return (
    <li className="workflow-row">
      <Link to={`/workflows/${workflow.id}`} className="workflow-card">
        <span
          className={`workflow-mark${live ? ' live' : empty ? '' : ' ready'}`}
        >
          <Icon
            name={live ? 'clock' : empty ? 'spark' : 'blocks'}
            size={16}
          />
        </span>
        <span className="workflow-card-body">
          <strong>{workflow.name}</strong>
          {live ? (
            <span className="launch-chips">
              {triggers.map((trigger) => (
                <span
                  key={trigger.id}
                  className={`launch-chip${trigger.enabled ? '' : ' off'}`}
                >
                  {triggerKindLabel(trigger.type)}
                  {' · '}
                  {trigger.enabled
                    ? triggerLaunchLabel(trigger)
                    : 'выключен'}
                </span>
              ))}
            </span>
          ) : null}
          {subtitle ? <p>{subtitle}</p> : null}
        </span>
        <span className="workflow-count" title="Шаги">
          {workflow.steps.length}
        </span>
      </Link>
      <button
        type="button"
        className="workflow-delete"
        aria-label="Удалить"
        disabled={busy}
        onClick={() => onRemove(workflow.id)}
      >
        <Icon name="trash" size={15} />
      </button>
    </li>
  );
};

export const WorkflowsPage = () => {
  const [workflows, setWorkflows] = useAtom(workflowsAtom);
  const [error, setError] = useAtom(errorAtom);
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        setWorkflows(await fetchWorkflows());
        setError(null);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Не удалось загрузить workflows',
        );
      }
    })();
  }, [setError, setWorkflows]);

  const live = workflows.filter(isLive);
  const drafts = workflows.filter((item) => !isLive(item));
  const pages = Math.max(1, Math.ceil(drafts.length / PAGE_SIZE));
  const safePage = Math.min(page, pages - 1);
  const visibleDrafts = drafts.slice(
    safePage * PAGE_SIZE,
    safePage * PAGE_SIZE + PAGE_SIZE,
  );

  const removeOne = async (id: string) => {
    setBusy(true);
    setError(null);

    try {
      await deleteWorkflow(id);
      const next = workflows.filter((item) => item.id !== id);
      setWorkflows(next);
      const nextDrafts = next.filter((item) => !isLive(item));
      const nextPages = Math.max(1, Math.ceil(nextDrafts.length / PAGE_SIZE));
      setPage((current) => Math.min(current, nextPages - 1));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Не удалось удалить workflow',
      );
    } finally {
      setBusy(false);
    }
  };

  const removeAll = async () => {
    if (
      !window.confirm(
        'Удалить все workflow, включая пайплайны с триггерами?',
      )
    ) {
      return;
    }

    setBusy(true);
    setError(null);

    try {
      await clearWorkflows();
      setWorkflows([]);
      setPage(0);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Не удалось очистить историю',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="canvas-page list-page">
      <div className="list-shell">
        <h1 className="list-title">Workflows</h1>
        {error ? <Banner>{error}</Banner> : null}
        <section className="workflow-create-section">
          <CreateWorkflowButton />
        </section>
        <section className="workflow-history">
          <div className="workflow-history-head">
            <div>
              <h2 className="workflow-history-title">Пайплайны</h2>
              <p className="workflow-history-note">
                Не разовые: стартуют по расписанию, почте, Telegram или webhook
              </p>
            </div>
          </div>
          {live.length === 0 ? (
            <p className="muted">
              Пока нет. Откройте workflow и добавьте триггер в левой колонке.
            </p>
          ) : (
            <ul className="workflow-list">
              {live.map((workflow) => (
                <WorkflowRow
                  key={workflow.id}
                  workflow={workflow}
                  busy={busy}
                  live
                  onRemove={(id) => void removeOne(id)}
                />
              ))}
            </ul>
          )}
        </section>
        <section className="workflow-history">
          <div className="workflow-history-head">
            <h2 className="workflow-history-title">Разовые и черновики</h2>
            {workflows.length ? (
              <button
                type="button"
                className="history-clear"
                onClick={() => void removeAll()}
                disabled={busy}
              >
                Очистить
              </button>
            ) : null}
          </div>
          {drafts.length === 0 ? (
            <p className="muted">Нет workflow без триггера</p>
          ) : (
            <>
              <ul className="workflow-list">
                {visibleDrafts.map((workflow) => (
                  <WorkflowRow
                    key={workflow.id}
                    workflow={workflow}
                    busy={busy}
                    live={false}
                    onRemove={(id) => void removeOne(id)}
                  />
                ))}
              </ul>
              {pages > 1 ? (
                <div className="pager">
                  <button
                    type="button"
                    className="pager-btn"
                    disabled={safePage === 0}
                    onClick={() => setPage(safePage - 1)}
                    aria-label="Предыдущая страница"
                  >
                    <span className="pager-prev">
                      <Icon name="chevron" size={14} />
                    </span>
                  </button>
                  {Array.from({ length: pages }, (_, index) => (
                    <button
                      key={index}
                      type="button"
                      className={`pager-btn${index === safePage ? ' active' : ''}`}
                      onClick={() => setPage(index)}
                    >
                      {index + 1}
                    </button>
                  ))}
                  <button
                    type="button"
                    className="pager-btn"
                    disabled={safePage >= pages - 1}
                    onClick={() => setPage(safePage + 1)}
                    aria-label="Следующая страница"
                  >
                    <Icon name="chevron" size={14} />
                  </button>
                </div>
              ) : null}
            </>
          )}
        </section>
      </div>
    </div>
  );
};
