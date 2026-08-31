import { useEffect, useState } from 'react';

const STATUSES = [
  'Разбираю задачу…',
  'Подбираю коннекторы…',
  'Собираю последовательность шагов…',
];

export const BuildingOverlay = ({
  prompt,
  onCancel,
}: {
  prompt: string;
  onCancel: () => void;
}) => {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % STATUSES.length);
    }, 1400);

    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="builder-overlay">
      <div className="builder-head">
        <span className="brand">
          <span className="brand-mark">G</span>
          Workflow Creator
        </span>
        <button type="button" className="btn ghost" onClick={onCancel}>
          Выйти
        </button>
      </div>
      <div className="builder-chat">
        <p>
          Привет! Опишите задачу — я соберу цепочку коннекторов и подготовлю
          workflow к запуску.
        </p>
        <div className="user-bubble">{prompt}</div>
        <div className="thinking">
          <span className="thinking-dot" />
          {STATUSES[index]}
        </div>
      </div>
      <div className="composer-bar">
        <div className="composer-inner">Собираю ответ…</div>
      </div>
    </div>
  );
};
