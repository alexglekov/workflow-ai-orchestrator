import { useState, type CSSProperties } from 'react';
import type { Connection } from '~/entities/connection';
import type { ConnectorCatalog } from '~/entities/connector';
import type { WorkflowStep } from '~/entities/workflow';
import { connectorVisual } from '~/shared/lib/connector-visuals';
import { Icon } from '~/shared/ui/Icon';

export const StepsEditor = ({
  steps,
  catalog,
  connections,
  onChange,
  onRemove,
}: {
  steps: WorkflowStep[];
  catalog: ConnectorCatalog[];
  connections: Connection[];
  onChange: (index: number, patch: Partial<WorkflowStep>) => void;
  onRemove: (index: number) => void;
}) => {
  const [open, setOpen] = useState<number | null>(null);

  if (steps.length === 0) {
    return null;
  }

  return (
    <div className="pipeline">
      {steps.map((step, index) => {
        const connector = catalog.find((item) => item.id === step.connectorId);
        const actions = connector?.actions ?? [];
        const action = actions.find((item) => item.id === step.action);
        const availableConnections = connections.filter(
          (item) => item.connectorId === step.connectorId,
        );
        const visual = connectorVisual(step.connectorId);
        const expanded = open === index;
        const needsAccount = availableConnections.length === 0;
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
