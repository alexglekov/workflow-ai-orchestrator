import { useEffect, useState } from 'react';
import { useAtom } from 'jotai';
import { connectionsAtom, fetchConnections } from '~/entities/connection';
import { catalogAtom, fetchCatalog } from '~/entities/connector';
import { ConnectorCard } from '~/features/manage-connection';
import { CONNECTOR_GROUPS, connectorKind } from '~/shared/lib/connector-visuals';
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
        {catalog.length === 0 ? (
          <p className="muted">
            Каталог пуст. Проверьте, что API запущен, и обновите страницу.
          </p>
        ) : (
          CONNECTOR_GROUPS.map((group, index) => {
            const items = catalog.filter(
              (connector) => connectorKind(connector.id) === group.kind,
            );

            if (items.length === 0) {
              return null;
            }

            return (
              <section
                key={group.kind}
                className={`workflow-history${index === 0 ? ' is-first' : ''}`}
              >
                <div className="workflow-history-head">
                  <div>
                    <h2 className="workflow-history-title">{group.title}</h2>
                    <p className="workflow-history-note">{group.hint}</p>
                  </div>
                </div>
                <div className="card-grid">
                  {items.map((connector) => (
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
              </section>
            );
          })
        )}
      </div>
    </div>
  );
};
