import type { TriggerType, WorkflowTrigger } from '~/entities/trigger';
import {
  timingLabel,
  triggerAt,
  triggerMinutes,
  triggerTimezone,
} from '~/entities/trigger';
import { Icon } from '~/shared/ui/Icon';
import { TriggerTiming } from './TriggerTiming';

const label = (type: string) => {
  if (type === 'webhook') {
    return 'Webhook';
  }

  if (type === 'mail') {
    return 'Новые письма';
  }

  if (type === 'telegram') {
    return 'Telegram';
  }

  return 'Расписание';
};

export const TriggerPanel = ({
  triggers,
  onOpenPicker,
  onToggle,
  onRemove,
  onTiming,
}: {
  triggers: WorkflowTrigger[];
  onOpenPicker: (type?: TriggerType) => void;
  onToggle: (id: string, enabled: boolean) => void;
  onRemove: (id: string) => void;
  onTiming: (
    id: string,
    everyMinutes: number,
    at: string,
    timezone: string,
  ) => void;
}) => (
  <aside className="rail-panel">
    <div className="rail-head">
      <h2>Триггеры</h2>
      <p>Запуск по событию, без кнопки Run</p>
    </div>
    {triggers.length === 0 ? (
      <p className="rail-empty">
        Сейчас только ручной запуск. Добавьте триггер — пайплайн появится на
        главной в списке постоянных.
      </p>
    ) : (
      <ul className="trigger-list">
        {triggers.map((trigger) => (
          <li key={trigger.id} className="trigger-card">
            <div className="trigger-card-head">
              <span className="trigger-icon" aria-hidden>
                <Icon
                  name={
                    trigger.type === 'webhook'
                      ? 'link'
                      : trigger.type === 'mail'
                        ? 'target'
                        : trigger.type === 'telegram'
                          ? 'send'
                          : 'clock'
                  }
                  size={15}
                />
              </span>
              <div className="trigger-copy">
                <strong>{label(trigger.type)}</strong>
                <span>
                  {trigger.type === 'webhook'
                    ? 'HTTP POST'
                    : trigger.type === 'telegram' && trigger.webhookUrl
                      ? 'Webhook бота / опрос'
                      : timingLabel(
                          triggerMinutes(trigger),
                          triggerAt(trigger),
                          triggerTimezone(trigger),
                        )}
                </span>
              </div>
              <button
                type="button"
                className={`switch${trigger.enabled ? ' on' : ''}`}
                aria-label={trigger.enabled ? 'Выключить' : 'Включить'}
                aria-pressed={trigger.enabled}
                onClick={() => onToggle(trigger.id, !trigger.enabled)}
              />
              <button
                type="button"
                className="icon-quiet"
                aria-label="Удалить триггер"
                onClick={() => onRemove(trigger.id)}
              >
                <Icon name="trash" size={14} />
              </button>
            </div>
            {trigger.webhookUrl &&
            (trigger.type === 'webhook' || trigger.type === 'telegram') ? (
              <code className="trigger-url">{trigger.webhookUrl}</code>
            ) : null}
            {trigger.type === 'webhook' ? null : (
              <div className="trigger-card-timing">
                <TriggerTiming
                  everyMinutes={triggerMinutes(trigger)}
                  at={triggerAt(trigger)}
                  timezone={triggerTimezone(trigger)}
                  onChange={(next) =>
                    onTiming(
                      trigger.id,
                      next.everyMinutes,
                      next.at,
                      next.timezone,
                    )
                  }
                />
              </div>
            )}
          </li>
        ))}
      </ul>
    )}
    <div className="rail-actions">
      <button
        type="button"
        className="rail-add"
        onClick={() => onOpenPicker('schedule')}
      >
        <Icon name="clock" size={14} />
        Расписание
      </button>
      <button
        type="button"
        className="rail-add"
        onClick={() => onOpenPicker('mail')}
      >
        <Icon name="target" size={14} />
        Почта
      </button>
      <button
        type="button"
        className="rail-add"
        onClick={() => onOpenPicker('telegram')}
      >
        <Icon name="send" size={14} />
        Telegram
      </button>
      <button
        type="button"
        className="rail-add"
        onClick={() => onOpenPicker('webhook')}
      >
        <Icon name="link" size={14} />
        Webhook
      </button>
    </div>
  </aside>
);
