import type { CSSProperties } from 'react';
import type { Connection } from '~/entities/connection';
import type { ConnectorCatalog } from '~/entities/connector';
import {
  triggerKindLabel,
  triggerLaunchLabel,
  type WorkflowTrigger,
} from '~/entities/trigger';
import type { WorkflowStep } from '~/entities/workflow';
import { connectorNeedsAccount } from '~/shared/lib/connector-visuals';
import { isEventTrigger } from '~/shared/lib/event-steps';
import { ConnectorMark } from '~/shared/ui/ConnectorMark';
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
}: {
  steps: WorkflowStep[];
  triggers?: WorkflowTrigger[];
  catalog: ConnectorCatalog[];
  connections: Connection[];
}) => {
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
                  <strong>
                    {isEventTrigger(trigger.type) ? 'Событие' : 'Триггер'} ·{' '}
                    {triggerKindLabel(trigger.type)}
                  </strong>
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
        const action = connector?.actions.find((item) => item.id === step.action);
        const availableConnections = connections.filter(
          (item) => item.connectorId === step.connectorId,
        );
        const needsAccount =
          connectorNeedsAccount(step.connectorId) &&
          availableConnections.length === 0;
        const last = index === steps.length - 1;

        return (
          <div className="pipeline-step" key={step.id || index}>
            <div className="pipeline-axis">
              <ConnectorMark
                id={step.connectorId}
                size={36}
                glyph={16}
                className="pipeline-node"
              />
              {last ? null : <span className="pipeline-wire" />}
            </div>
            <div className="pipeline-body">
              <div className="pipeline-chip">
                <div className="pipeline-main">
                  <strong>{connector?.name || step.connectorId}</strong>
                  <span>{action?.name || step.title}</span>
                </div>
                {needsAccount ? (
                  <span className="chip warn">Нет аккаунта</span>
                ) : null}
                {step.iterate ? <span className="chip mcp">for each</span> : null}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
