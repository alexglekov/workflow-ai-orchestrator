import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router';
import { useAtom } from 'jotai';
import {
  createWorkflow,
  fetchWorkflows,
  workflowsAtom,
  type Workflow,
} from '~/entities/workflow';
import { Button } from '~/shared/ui/Button';
import { Icon } from '~/shared/ui/Icon';
import { useToast } from '~/shared/model/ui';

const preview = (workflow: Workflow) => {
  const text = workflow.prompt.trim();

  if (!text || text === workflow.name.trim()) {
    return workflow.steps.length ? null : 'Черновик';
  }

  return text;
};

export const ChatHistoryDrawer = ({
  open,
  current,
  onClose,
  onLeave,
}: {
  open: boolean;
  current?: Workflow | null;
  onClose: () => void;
  onLeave?: () => void | Promise<void>;
}) => {
  const navigate = useNavigate();
  const [workflows, setWorkflows] = useAtom(workflowsAtom);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const toast = useToast();
  const currentId = current?.id;

  useEffect(() => {
    if (!open) {
      return;
    }

    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.body.classList.add('chat-history-open');
    setLoading(true);

    void fetchWorkflows()
      .then((next) => setWorkflows(next))
      .catch((err) => {
        toast(
          err instanceof Error ? err.message : 'Не удалось загрузить чаты',
          'error',
        );
      })
      .finally(() => setLoading(false));

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', onKey);

    return () => {
      document.body.style.overflow = previous;
      document.body.classList.remove('chat-history-open');
      window.removeEventListener('keydown', onKey);
    };
  }, [open, setWorkflows]);

  const create = async () => {
    if (busy) {
      return;
    }

    setBusy(true);

    try {
      await onLeave?.();
      const created = await createWorkflow({
        name: 'Новый workflow',
        prompt: '',
      });
      setWorkflows((current) => [created, ...current.filter((item) => item.id !== created.id)]);
      onClose();
      navigate(`/workflows/${created.id}`);
    } catch (err) {
      toast(
        err instanceof Error ? err.message : 'Не удалось создать чат',
        'error',
      );
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return null;
  }

  const items = [
    ...(current && !workflows.some((item) => item.id === current.id)
      ? [current]
      : []),
    ...workflows,
  ].sort(
    (left, right) =>
      new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
  );

  return createPortal(
    <div className="chat-drawer-root">
      <button
        type="button"
        className="chat-drawer-backdrop"
        aria-label="Закрыть историю чатов"
        onClick={onClose}
      />
      <aside className="chat-drawer" role="dialog" aria-modal="true" aria-label="История чатов">
        <div className="chat-drawer-head">
          <strong>Чаты</strong>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Закрыть">
            <Icon name="close" size={16} />
          </button>
        </div>
        <div className="chat-drawer-create">
          <Button type="button" loading={busy} onClick={() => void create()}>
            Новый чат
          </Button>
        </div>
        {items.length ? (
          <ul className="chat-drawer-list">
            {items.map((workflow) => {
              const subtitle = preview(workflow);
              const current = workflow.id === currentId;

              return (
                <li key={workflow.id}>
                  <Link
                    to={`/workflows/${workflow.id}`}
                    className={`chat-drawer-item${current ? ' is-current' : ''}`}
                    aria-current={current ? 'page' : undefined}
                    onClick={(event) => {
                      if (current) {
                        event.preventDefault();
                        onClose();
                        return;
                      }

                      void onLeave?.();
                      onClose();
                    }}
                  >
                    <strong>{workflow.name || 'Новый workflow'}</strong>
                    {subtitle ? <span>{subtitle}</span> : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="muted chat-drawer-empty">
            {loading ? 'Загружаю…' : 'Пока нет других чатов'}
          </p>
        )}
      </aside>
    </div>,
    document.body,
  );
};
