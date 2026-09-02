import { FormEvent, useEffect, useState } from 'react';
import {
  ApiUnauthorizedError,
  clearApiKey,
  getApiKey,
  http,
  setApiKey,
} from '~/shared/api/http';
import { Banner } from '~/shared/ui/Banner';
import { Button } from '~/shared/ui/Button';

const probe = async () => {
  const status = await http<{ required: boolean }>('/auth/status');

  if (!status.required) {
    return true;
  }

  if (!getApiKey()) {
    return false;
  }

  await http('/connectors');

  return true;
};

export const ApiGate = ({ children }: { children: React.ReactNode }) => {
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void probe()
      .then((ok) => {
        if (cancelled) {
          return;
        }

        setOpen(!ok);
        setReady(true);
      })
      .catch((err) => {
        if (cancelled) {
          return;
        }

        if (err instanceof ApiUnauthorizedError) {
          clearApiKey();
          setOpen(true);
          setReady(true);
          return;
        }

        setError(
          err instanceof Error ? err.message : 'Не удалось связаться с API',
        );
        setReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setApiKey(password.trim());

    void http('/connectors')
      .then(() => {
        setOpen(false);
        setPassword('');
      })
      .catch((err) => {
        clearApiKey();
        setError(
          err instanceof ApiUnauthorizedError
            ? 'Неверный пароль'
            : err instanceof Error
              ? err.message
              : 'Не удалось войти',
        );
      })
      .finally(() => setBusy(false));
  };

  if (!ready) {
    return <p className="muted">Загрузка…</p>;
  }

  if (!open) {
    return <>{children}</>;
  }

  return (
    <div className="canvas-page">
      <form className="dialog-sheet api-gate" onSubmit={submit}>
        <div className="dialog-head">
          <h2>Пароль API</h2>
        </div>
        <p className="muted">
          В .env задан API_PASSWORD. Пароль хранится в этой вкладке, не в
          сборке фронта.
        </p>
        {error ? <Banner>{error}</Banner> : null}
        <label>
          Пароль
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        <div className="dialog-actions">
          <Button type="submit" disabled={busy || !password.trim()}>
            Войти
          </Button>
        </div>
      </form>
    </div>
  );
};
