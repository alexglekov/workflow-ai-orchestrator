import { http } from '~/shared/api/http';
import type { ConnectorCatalog } from '../model/types';

export const fetchCatalog = () => http<ConnectorCatalog[]>('/connectors');
