import { INTERVAL_OPTIONS } from '~/entities/trigger';

export const TriggerTiming = ({
  everyMinutes,
  at,
  onChange,
}: {
  everyMinutes: number;
  at: string;
  onChange: (next: { everyMinutes: number; at: string }) => void;
}) => {
  const mode = at ? 'daily' : 'interval';

  const known = INTERVAL_OPTIONS.some(
    (item) => item.minutes === everyMinutes,
  );

  return (
    <div className="trigger-timing">
      <label>
        Когда запускать
        <select
          value={mode === 'daily' ? 'daily' : String(everyMinutes)}
          onChange={(event) => {
            const value = event.target.value;

            if (value === 'daily') {
              onChange({ everyMinutes: 1440, at: at || '09:00' });
              return;
            }

            onChange({ everyMinutes: Number(value), at: '' });
          }}
        >
          {INTERVAL_OPTIONS.map((item) => (
            <option key={item.minutes} value={item.minutes}>
              {item.label}
            </option>
          ))}
          {!known && mode !== 'daily' ? (
            <option value={everyMinutes}>Каждые {everyMinutes} мин</option>
          ) : null}
          <option value="daily">Раз в день в указанное время</option>
        </select>
      </label>
      {mode === 'daily' ? (
        <label>
          Время
          <input
            type="time"
            value={at || '09:00'}
            onChange={(event) =>
              onChange({
                everyMinutes: 1440,
                at: event.target.value || '09:00',
              })
            }
          />
        </label>
      ) : null}
    </div>
  );
};
