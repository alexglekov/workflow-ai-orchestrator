import { useState, type CSSProperties } from 'react';
import type { Connection } from '~/entities/connection';
import type { ConnectorCatalog } from '~/entities/connector';
import {
  triggerKindLabel,
  triggerLaunchLabel,
  type WorkflowTrigger,
} from '~/entities/trigger';
import type { WorkflowStep } from '~/entities/workflow';
import { connectorNeedsAccount, connectorVisual } from '~/shared/lib/connector-visuals';
import { Icon } from '~/shared/ui/Icon';

const triggerVisual = (type: string) => {
  if (type === 'telegram') {
    return { bg: '#e3f2fd', color: '#1565c0', icon: 'send' as const };
  }

  if (type === 'mail') {
    return { bg: '#fde8e8', color: '#c62828', icon: 'target' as const };
  }

  if (type === 'webhook') {
    return { bg: '#ede7f6', color: '#5e35b1', icon: 'link' as const };
  }

  return { bg: '#e8f5e9', color: '#2e7d32', icon: 'clock' as const };
};

export const StepsEditor = ({
  steps,
  triggers = [],
  catalog,
  connections,
  onChange,
  onRemove,
}: {
  steps: WorkflowStep[];
  triggers?: WorkflowTrigger[];
  catalog: ConnectorCatalog[];
  connections: Connection[];
  onChange: (index: number, patch: Partial<WorkflowStep>) => void;
  onRemove: (index: number) => void;
}) => {
  const [open, setOpen] = useState<number | null>(null);

  if (steps.length === 0 && triggers.length === 0) {
    return null;
  }

  return (
    <div className="pipeline">
      {triggers.map((trigger, index) => {
        const visual = triggerVisual(trigger.type);
        const last = steps.length === 0 && index === triggers.length - 1;

        return (
          <div className="pipeline-step is-trigger" key={trigger.id}>
            <div className="pipeline-axis">
              <span
                className="pipeline-node"
                style={
                  {
                    background: visual.bg,
                    color: visual.color,
                    '--node-accent': visual.color,
                  } as CSSProperties
                }
              >
                <Icon name={visual.icon} size={15} />
              </span>
              {last ? null : <span className="pipeline-wire" />}
            </div>
            <div className="pipeline-body">
              <div className="pipeline-chip">
                <div className="pipeline-main">
                  <strong>Старт · {triggerKindLabel(trigger.type)}</strong>
                  <span>
                    {trigger.enabled
                      ? triggerLaunchLabel(trigger)
                      : 'выключен'}
                  </span>
                </div>
                {trigger.enabled ? null : (
                  <span className="chip">пауза</span>
                )}
              </div>
            </div>
          </div>
        );
      })}
      {steps.map((step, index) => {
        const connector = catalog.find((item) => item.id === step.connectorId);
        const actions = connector?.actions ?? [];
        const action = actions.find((item) => item.id === step.action);
        const availableConnections = connections.filter(
          (item) => item.connectorId === step.connectorId,
        );
        const visual = connectorVisual(step.connectorId);
        const expanded = open === index;
        const needsAccount =
          connectorNeedsAccount(step.connectorId) &&
          availableConnections.length === 0;
        const last = index === steps.length - 1;

        return (
          <div
            className={`pipeline-step${expanded ? ' open' : ''}`}
            key={index}
          >
            <div className="pipeline-axis">
              <span
                className="pipeline-node"
                style={
                  {
                    background: visual.bg,
                    color: visual.color,
                    '--node-accent': visual.color,
                  } as CSSProperties
                }
              >
                {visual.letter}
              </span>
              {last ? null : <span className="pipeline-wire" />}
            </div>
            <div className="pipeline-body">
              <div className="pipeline-chip">
                <button
                  type="button"
                  className="pipeline-main"
                  onClick={() => setOpen(expanded ? null : index)}
                >
                  <strong>{connector?.name || step.connectorId}</strong>
                  <span>{action?.name || step.title}</span>
                </button>
                {needsAccount ? (
                  <span className="chip warn">Нет аккаунта</span>
                ) : null}
                {step.iterate ? <span className="chip mcp">for each</span> : null}
                <button
                  type="button"
                  className="node-delete"
                  aria-label="Удалить шаг"
                  onClick={() => {
                    onRemove(index);
                    setOpen((current) => {
                      if (current === null) {
                        return current;
                      }

                      if (current === index) {
                        return null;
                      }

                      return current > index ? current - 1 : current;
                    });
                  }}
                >
                  <Icon name="trash" size={14} />
                </button>
              </div>
              {expanded ? (
                <div className="pipeline-editor stack">
                  <label>
                    Название
                    <input
                      value={step.title}
                      onChange={(event) =>
                        onChange(index, { title: event.target.value })
                      }
                    />
                  </label>
                  <div className="two-col">
                    <label>
                      Коннектор
                      <select
                        value={step.connectorId}
                        onChange={(event) => {
                          const nextConnector = catalog.find(
                            (item) => item.id === event.target.value,
                          );

                          onChange(index, {
                            connectorId: event.target.value,
                            action: nextConnector?.actions[0]?.id || '',
                            connectionId: null,
                          });
                        }}
                      >
                        {catalog.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Действие
                      <select
                        value={step.action}
                        onChange={(event) =>
                          onChange(index, { action: event.target.value })
                        }
                      >
                        {actions.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  {availableConnections.length ? (
                    <label>
                      Аккаунт
                      <select
                        value={step.connectionId || ''}
                        onChange={(event) =>
                          onChange(index, {
                            connectionId: event.target.value || null,
                          })
                        }
                      >
                        <option value="">Первый подходящий</option>
                        {availableConnections.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : needsAccount ? (
                    <p className="muted">
                      Нет подключённого аккаунта для этого сервиса.
                    </p>
                  ) : null}
                  <label className="iterate-row">
                    <input
                      type="checkbox"
                      checked={Boolean(step.iterate)}
                      onChange={(event) =>
                        onChange(index, { iterate: event.target.checked })
                      }
                    />
                    Для каждого элемента списка (письмо, строка)
                  </label>
                  <p className="muted">
                    Плейсхолдеры: {'{{previous}}'}, {'{{item.subject}}'},{' '}
                    {'{{input.field}}'}, {'{{steps.1.field}}'}. skipIfEmpty:
                    true — пропустить шаг, если список пуст. when —
                    {' "{{previous.label}} = intervene"'}. timeoutMs — лимит
                    шага в миллисекундах.
                  </p>
                  <label>
                    Параметры (JSON)
                    <textarea
                      rows={3}
                      value={JSON.stringify(step.params ?? {}, null, 2)}
                      onChange={(event) => {
                        try {
                          onChange(index, {
                            params: JSON.parse(event.target.value) as Record<
                              string,
                              unknown
                            >,
                          });
                        } catch {
                          return;
                        }
                      }}
                    />
                  </label>
                </div>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
};
