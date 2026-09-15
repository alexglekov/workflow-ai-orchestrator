import { useEffect } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { fetchRun } from '~/entities/run';

export const RunPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  useEffect(() => {
    if (!id) {
      return;
    }

    void fetchRun(id)
      .then((run) =>
        navigate(`/workflows/${run.workflowId}?run=${run.id}`, {
          replace: true,
        }),
      )
      .catch(() => navigate('/workflows', { replace: true }));
  }, [id, navigate]);

  return (
    <div className="canvas-page run-page">
      <header className="canvas-chrome">
        <Link to="/workflows" className="icon-btn" aria-label="К списку">
          ←
        </Link>
        <h1>Run</h1>
      </header>
      <p className="muted">Открываю запуск в чате…</p>
    </div>
  );
};
