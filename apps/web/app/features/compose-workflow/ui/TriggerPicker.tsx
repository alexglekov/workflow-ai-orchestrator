import { useState } from 'react';
import { Icon } from '~/shared/ui/Icon';
import {
  defaultMinutesFor,
  type TriggerType,
} from '~/entities/trigger';
import { TriggerTiming } from './TriggerTiming';

const OPTIONS: Array<{
  type: TriggerType;
  title: string;
  hint: string;
  icon: 'clock' | 'target' | 'link';
  tone: 'green' | 'blue';
}> = [
  {
    type: 'schedule',
    title: 'Расписание',
    hint: 'Интервал или время дня',
    icon: 'clock',
    tone: 'green',
  },
  {
    type: 'mail',
    title: 'Новые письма',
    hint: 'Опрос IMAP по интервалу',
    icon: 'target',
    tone: 'blue',
  },
  {
    type: 'webhook',
    title: 'Webhook',
    hint: 'Запуск по HTTP POST',
    icon: 'link',
    tone: 'green',
  },
];

export const TriggerPicker = ({
  initialType = 'schedule',
  onClose,
  onPick,
}: {
  initialType?: TriggerType;
  onClose: () => void;
  onPick: (type: TriggerType, everyMinutes?: number, at?: string) => void;
}) => {
  const [type, setType] = useState<TriggerType>(initialType);
  const [everyMinutes, setEveryMinutes] = useState(defaultMinutesFor(initialType));
  const [at, setAt] = useState('');

  return (
    <div
      className="node-picker"
      role="dialog"
      aria-label="Выбор триггера"
      onClick={onClose}
    >
      <div
        className="dialog-sheet trigger-picker-sheet"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="dialog-head">
          <div>
            <h2>Триггер</h2>
            <p className="muted">Workflow запустится сам, без кнопки Run</p>
          </div>
          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            aria-label="Закрыть"
          >
            <Icon name="close" size={16} />
          </button>
        </div>
        <div className="trigger-option-list">
          {OPTIONS.map((item) => (
            <button
              key={item.type}
              type="button"
              className={`trigger-option${type === item.type ? ' active' : ''}`}
              onClick={() => {
                setType(item.type);
                if (item.type !== 'webhook') {
                  setEveryMinutes(defaultMinutesFor(item.type));
                  setAt('');
                }
              }}
            >
              <span className={`pick-icon ${item.tone}`}>
                <Icon name={item.icon} size={18} />
              </span>
              <span className="node-pick-copy">
                <strong>{item.title}</strong>
                <span>{item.hint}</span>
              </span>
            </button>
          ))}
        </div>
        {type === 'webhook' ? (
          <p className="muted">После создания появится URL для POST.</p>
        ) : (
          <TriggerTiming
            everyMinutes={everyMinutes}
            at={at}
            onChange={(next) => {
              setEveryMinutes(next.everyMinutes);
              setAt(next.at);
            }}
          />
        )}
        <div className="dialog-actions">
          <button type="button" className="btn ghost" onClick={onClose}>
            Отмена
          </button>
          <button
            type="button"
            className="btn"
            onClick={() =>
              onPick(
                type,
                type === 'webhook' ? undefined : everyMinutes,
                type === 'webhook' ? undefined : at || undefined,
              )
            }
          >
            Добавить
          </button>
        </div>
      </div>
    </div>
  );
};
