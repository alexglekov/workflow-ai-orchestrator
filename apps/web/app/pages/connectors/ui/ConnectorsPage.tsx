import { useEffect, useState } from 'react';
import { useAtom } from 'jotai';
import { connectionsAtom, fetchConnections } from '~/entities/connection';
import { catalogAtom, fetchCatalog } from '~/entities/connector';
import { ConnectorCard } from '~/features/manage-connection';
import { errorAtom } from '~/shared/model/ui';
import { Banner } from '~/shared/ui/Banner';

export const ConnectorsPage = () => {
  const [catalog, setCatalog] = useAtom(catalogAtom);
  const [connections, setConnections] = useAtom(connectionsAtom);
  const [error, setError] = useAtom(errorAtom);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const reload = async () => {
    try {
      const [nextCatalog, nextConnections] = await Promise.all([
        fetchCatalog(),
        fetchConnections(),
      ]);

      setCatalog(nextCatalog);
      setConnections(nextConnections);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка загрузки');
    }
  };

  useEffect(() => {
    void reload();
  }, []);

  return (
    <div className="canvas-page list-page">
      <div className="list-shell">
        <h1 className="list-title">Коннекторы</h1>
        {error ? <Banner>{error}</Banner> : null}
        <div className="card-grid">
            {catalog.map((connector) => (
              <ConnectorCard
                key={connector.id}
                connector={connector}
                connections={connections.filter(
                  (item) => item.connectorId === connector.id,
                )}
                expanded={activeId === connector.id}
                busy={busyId === connector.id}
                onToggle={() =>
                  setActiveId((current) =>
                    current === connector.id ? null : connector.id,
                  )
                }
                onBusy={(value) => setBusyId(value ? connector.id : null)}
                onRefresh={reload}
              />
            ))}
          </div>
      </div>
    </div>
  );
};
