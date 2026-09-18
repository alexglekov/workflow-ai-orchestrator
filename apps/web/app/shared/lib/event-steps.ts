export type EventTriggerType = 'telegram' | 'mail';

export const isEventTrigger = (type: string): type is EventTriggerType =>
  type === 'telegram' || type === 'mail';

export const isLiveTrigger = (trigger: {
  type: string;
  enabled?: boolean;
}): boolean =>
  Boolean(trigger.enabled) &&
  (trigger.type === 'schedule' || isEventTrigger(trigger.type));

export const isPipelineTrigger = (trigger: { type: string }): boolean =>
  trigger.type === 'schedule' ||
  isEventTrigger(trigger.type) ||
  trigger.type === 'webhook';

export const eventTriggerTypesFromSteps = (
  steps: Array<{ connectorId: string; action: string }>,
): EventTriggerType[] => {
  const types = new Set<EventTriggerType>();

  for (const step of steps) {
    if (step.connectorId === 'telegram' && step.action === 'get_updates') {
      types.add('telegram');
    }

    if (step.connectorId === 'mail' && step.action === 'fetch_new') {
      types.add('mail');
    }
  }

  return [...types];
};
