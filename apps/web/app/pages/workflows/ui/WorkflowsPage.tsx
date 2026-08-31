import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useAtom } from 'jotai';
import {
  clearWorkflows,
  deleteWorkflow,
  fetchWorkflows,
  workflowsAtom,
} from '~/entities/workflow';
import { CreateWorkflowButton } from '~/features/create-workflow';
import { errorAtom } from '~/shared/model/ui';
import { Banner } from '~/shared/ui/Banner';
import { Icon } from '~/shared/ui/Icon';

const PAGE_SIZE = 8;

const preview = (name: string, prompt: string, empty: boolean) => {
  const text = prompt.trim();

  if (!text || text === name.trim()) {
    return empty ? 'Черновик' : null;
  }

  return text;
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

  const pages = Math.max(1, Math.ceil(workflows.length / PAGE_SIZE));
  const safePage = Math.min(page, pages - 1);
  const visible = workflows.slice(
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
      const nextPages = Math.max(1, Math.ceil(next.length / PAGE_SIZE));
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
    if (!window.confirm('Очистить всю историю workflow?')) {
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
    <div className="canvas-page">
      <div className="page workflows-page">
        <h1 className="workflows-title">Workflows</h1>
        {error ? <Banner>{error}</Banner> : null}
        <section className="workflow-create-section">
          <CreateWorkflowButton />
        </section>
        <section className="workflow-history">
          <div className="workflow-history-head">
            <h2 className="workflow-history-title">История</h2>
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
          {workflows.length === 0 ? (
            <p className="muted">Пока нет сохранённых workflow</p>
          ) : (
            <>
              <ul className="workflow-list">
                {visible.map((workflow) => {
                  const empty = workflow.steps.length === 0;
                  const subtitle = preview(
                    workflow.name,
                    workflow.prompt,
                    empty,
                  );

                  return (
                    <li key={workflow.id} className="workflow-row">
                      <Link
                        to={`/workflows/${workflow.id}`}
                        className="workflow-card"
                      >
                        <span
                          className={`workflow-mark ${empty ? '' : 'ready'}`}
                        >
                          <Icon name={empty ? 'spark' : 'blocks'} size={16} />
                        </span>
                        <span className="workflow-card-body">
                          <strong>{workflow.name}</strong>
                          {subtitle ? <p>{subtitle}</p> : null}
                        </span>
                        <span className="workflow-count" title="Коннекторы">
                          {workflow.steps.length}
                        </span>
                      </Link>
                      <button
                        type="button"
                        className="workflow-delete"
                        aria-label="Удалить"
                        disabled={busy}
                        onClick={() => void removeOne(workflow.id)}
                      >
                        <Icon name="trash" size={15} />
                      </button>
                    </li>
                  );
                })}
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
