export const RunInputDialog = ({
  value,
  onChange,
  onCancel,
  onRun,
}: {
  value: string;
  onChange: (value: string) => void;
  onCancel: () => void;
  onRun: () => void;
}) => (
  <div className="node-picker" role="dialog" aria-label="Вход запуска" onClick={onCancel}>
    <div className="dialog-sheet" onClick={(event) => event.stopPropagation()}>
      <div className="dialog-head">
        <div>
          <h2>Запуск</h2>
          <p className="muted">JSON доступен в шагах как {'{{input.field}}'}</p>
        </div>
        <button type="button" className="icon-btn" onClick={onCancel} aria-label="Закрыть">
          ×
        </button>
      </div>
      <label className="dialog-field">
        Input
        <textarea
          rows={8}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          spellCheck={false}
        />
      </label>
      <div className="dialog-actions">
        <button type="button" className="btn ghost" onClick={onCancel}>
          Отмена
        </button>
        <button type="button" className="btn" onClick={onRun}>
          Запустить
        </button>
      </div>
    </div>
  </div>
);
