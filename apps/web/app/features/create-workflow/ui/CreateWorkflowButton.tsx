import { useNavigate } from 'react-router';
import { useState } from 'react';
import { useAtom } from 'jotai';
import { createWorkflow } from '~/entities/workflow';
import { errorAtom } from '~/shared/model/ui';
import { Icon } from '~/shared/ui/Icon';

export const CreateWorkflowButton = () => {
  const navigate = useNavigate();
  const [, setError] = useAtom(errorAtom);
  const [busy, setBusy] = useState(false);

  const create = async () => {
    if (busy) {
      return;
    }

    setBusy(true);

    try {
      const workflow = await createWorkflow({
        name: 'Новый workflow',
        prompt: '',
      });

      setError(null);
      navigate(`/workflows/${workflow.id}`);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Не удалось создать workflow',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      className="workflow-create"
      onClick={() => void create()}
      disabled={busy}
    >
      <span className="workflow-mark create">
        <Icon name="plus" size={18} />
      </span>
      <span className="workflow-card-body">
        <strong>Новый workflow</strong>
        <p>{busy ? 'Создаю…' : 'Опишите задачу текстом — соберём цепочку'}</p>
      </span>
    </button>
  );
};
