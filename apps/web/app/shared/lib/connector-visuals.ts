export type ConnectorKind = 'service' | 'tool' | 'action';

export const CONNECTOR_GROUPS: Array<{
  kind: ConnectorKind;
  title: string;
  hint: string;
  chip: string;
}> = [
  {
    kind: 'service',
    title: 'Сервисы',
    hint: 'Почта, мессенджеры, таблицы и CRM. Нужен аккаунт.',
    chip: 'сервис',
  },
  {
    kind: 'tool',
    title: 'Инструменты',
    hint: 'Поиск, браузер и модели. Ключ можно не задавать.',
    chip: 'инструмент',
  },
  {
    kind: 'action',
    title: 'Действия',
    hint: 'Шаги workflow без входа: память и преобразования данных.',
    chip: 'действие',
  },
];

const KIND_BY_ID: Record<string, ConnectorKind> = {
  mail: 'service',
  telegram: 'service',
  onec: 'service',
  excel: 'service',
  web: 'tool',
  browser: 'tool',
  llm: 'tool',
  transform: 'action',
  memory: 'action',
};

const VISUALS: Record<string, { letter: string; bg: string; color: string }> = {
  mail: { letter: 'M', bg: '#fde8e8', color: '#c62828' },
  telegram: { letter: 'Tg', bg: '#e3f2fd', color: '#2aabee' },
  onec: { letter: '1C', bg: '#fff3e0', color: '#ef6c00' },
  excel: { letter: 'Xl', bg: '#e8f5e9', color: '#217346' },
  web: { letter: 'W', bg: '#ede7f6', color: '#5e35b1' },
  llm: { letter: 'AI', bg: '#e0f2f1', color: '#00695c' },
  transform: { letter: 'Tx', bg: '#fff8e1', color: '#f57f17' },
  memory: { letter: 'Me', bg: '#f3e5f5', color: '#7b1fa2' },
  browser: { letter: 'Br', bg: '#eceff1', color: '#455a64' },
};

export const connectorKind = (id: string): ConnectorKind =>
  KIND_BY_ID[id] ?? 'tool';

export const connectorGroup = (kind: ConnectorKind) =>
  CONNECTOR_GROUPS.find((group) => group.kind === kind) ?? CONNECTOR_GROUPS[1];

export const connectorVisual = (id: string) =>
  VISUALS[id] ?? {
    letter: id.slice(0, 2).toUpperCase(),
    bg: '#f4f4f5',
    color: '#3f3f46',
  };

export const connectorNeedsAccount = (id: string) =>
  connectorKind(id) === 'service';
