import type { TriggerType, WorkflowTrigger } from '~/entities/trigger';
import {
  timingLabel,
  triggerAt,
  triggerMinutes,
  triggerTimezone,
} from '~/entities/trigger';
import { isEventTrigger } from '~/shared/lib/event-steps';
import { Icon } from '~/shared/ui/Icon';
import { TriggerTiming } from './TriggerTiming';

const eventLabel = (type: string) => {
  if (type === 'mail') {
    return 'Новые письма';
  }

  return 'Входящее сообщение Telegram';
};

const eventHint = (type: string, trigger: WorkflowTrigger) => {
  if (type === 'telegram') {
    return trigger.enabled ? 'Запуск при входящем сообщении' : 'выключено';
  }

  return trigger.enabled
    ? timingLabel(
        triggerMinutes(trigger),
        triggerAt(trigger),
        triggerTimezone(trigger),
      )
    : 'выключено';
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
}) => {
  const events = triggers.filter((item) => isEventTrigger(item.type));
  const clocks = triggers.filter((item) => !isEventTrigger(item.type));

  return (
    <aside className="rail-panel">
      <section className="rail-section">
        <div className="rail-head">
          <h2>События</h2>
          <p>Из шагов чата: входящие письма и Telegram</p>
        </div>
        {events.length === 0 ? (
          <p className="rail-empty">
            Появятся сами, если в сценарии есть «получить входящее» или «новые
            письма». Это не расписание и не webhook.
          </p>
        ) : (
          <ul className="trigger-list">
            {events.map((trigger) => (
              <li key={trigger.id} className="trigger-card">
                <div className="trigger-card-head">
                  <span className="trigger-icon" aria-hidden>
                    <Icon
                      name={trigger.type === 'mail' ? 'target' : 'send'}
                      size={15}
                    />
                  </span>
                  <div className="trigger-copy">
                    <strong>{eventLabel(trigger.type)}</strong>
                    <span>{eventHint(trigger.type, trigger)}</span>
                  </div>
                  <button
                    type="button"
                    className={`switch${trigger.enabled ? ' on' : ''}`}
                    aria-label={trigger.enabled ? 'Выключить' : 'Включить'}
                    aria-pressed={trigger.enabled}
                    onClick={() => onToggle(trigger.id, !trigger.enabled)}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="rail-section">
        <div className="rail-head">
          <h2>Триггеры</h2>
          <p>Запуск по времени или HTTP, без кнопки Run</p>
        </div>
        {clocks.length === 0 ? (
          <p className="rail-empty">
            Сейчас только ручной запуск и события из шагов.
          </p>
        ) : (
          <ul className="trigger-list">
            {clocks.map((trigger) => (
              <li key={trigger.id} className="trigger-card">
                <div className="trigger-card-head">
                  <span className="trigger-icon" aria-hidden>
                    <Icon
                      name={trigger.type === 'webhook' ? 'link' : 'clock'}
                      size={15}
                    />
                  </span>
                  <div className="trigger-copy">
                    <strong>
                      {trigger.type === 'webhook' ? 'Webhook' : 'Расписание'}
                    </strong>
                    <span>
                      {trigger.type === 'webhook'
                        ? 'HTTP POST'
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
                {trigger.webhookUrl && trigger.type === 'webhook' ? (
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
            onClick={() => onOpenPicker('webhook')}
          >
            <Icon name="link" size={14} />
            Webhook
          </button>
        </div>
      </section>
    </aside>
  );
};
