export const SIDE_EFFECT_ACTIONS = new Set([
  'telegram.send_message',
  'telegram.send_voice',
  'mail.send',
  'onec.create_record',
  'onec.update',
  'excel.append_row',
  'memory.set',
]);

export const isSideEffect = (connectorId: string, action: string): boolean =>
  SIDE_EFFECT_ACTIONS.has(`${connectorId}.${action}`);
