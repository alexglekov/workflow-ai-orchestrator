export type EventTriggerType = 'telegram' | 'mail';

export const EVENT_STEP_TRIGGERS: Array<{
  connectorId: string;
  action: string;
  triggerType: EventTriggerType;
}> = [
  { connectorId: 'telegram', action: 'get_updates', triggerType: 'telegram' },
  { connectorId: 'mail', action: 'fetch_new', triggerType: 'mail' },
];

export const isEventTriggerType = (type: string): type is EventTriggerType =>
  type === 'telegram' || type === 'mail';

export const eventTriggerTypesFromSteps = (
  steps: Array<{ connectorId: string; action: string }>,
): EventTriggerType[] => {
  const types = new Set<EventTriggerType>();

  for (const step of steps) {
    for (const item of EVENT_STEP_TRIGGERS) {
      if (
        step.connectorId === item.connectorId &&
        step.action === item.action
      ) {
        types.add(item.triggerType);
      }
    }
  }

  return [...types];
};
