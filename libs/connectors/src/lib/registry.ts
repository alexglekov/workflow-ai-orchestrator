import { Connector } from './types';
import { mailConnector } from './mail/mail.connector';
import { telegramConnector } from './telegram/telegram.connector';
import { oneCConnector } from './onec/onec.connector';
import { excelConnector } from './excel/excel.connector';
import { webConnector } from './web/web.connector';

export class ConnectorRegistry {
  private readonly connectors = new Map<string, Connector>();

  constructor(connectors: Connector[]) {
    for (const connector of connectors) {
      this.connectors.set(connector.id, connector);
    }
  }

  get = (id: string): Connector | undefined => this.connectors.get(id);

  list = (): Connector[] => [...this.connectors.values()];
}

export const createDefaultRegistry = (): ConnectorRegistry =>
  new ConnectorRegistry([
    mailConnector,
    telegramConnector,
    oneCConnector,
    excelConnector,
    webConnector,
  ]);
