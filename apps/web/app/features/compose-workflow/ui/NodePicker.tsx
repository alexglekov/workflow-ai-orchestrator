import type { ConnectorCatalog } from '~/entities/connector';
import {
  CONNECTOR_GROUPS,
  connectorKind,
} from '~/shared/lib/connector-visuals';
import { ConnectorMark } from '~/shared/ui/ConnectorMark';
import { Icon } from '~/shared/ui/Icon';

export const NodePicker = ({
  catalog,
  onClose,
  onPick,
}: {
  catalog: ConnectorCatalog[];
  onClose: () => void;
  onPick: (connector: ConnectorCatalog) => void;
}) => (
  <div className="node-picker" onClick={onClose}>
    <div
      className="node-picker-sheet"
      onClick={(event) => event.stopPropagation()}
    >
      <div className="panel-head">
        <strong>Добавить шаг</strong>
        <button type="button" className="icon-btn" onClick={onClose}>
          <Icon name="close" size={16} />
        </button>
      </div>
      <div className="node-picker-list">
        {catalog.length === 0 ? (
          <p className="muted">Коннекторы не загрузились. Обновите страницу.</p>
        ) : (
          CONNECTOR_GROUPS.map((group) => {
            const items = catalog.filter(
              (item) => connectorKind(item.id) === group.kind,
            );

            if (items.length === 0) {
              return null;
            }

            return (
              <div key={group.kind} className="picker-group">
                <div className="picker-group-head">
                  <strong>{group.title}</strong>
                  <span>{group.hint}</span>
                </div>
                {items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="node-pick"
                    onClick={() => onPick(item)}
                  >
                    <ConnectorMark id={item.id} size={40} />
                    <span className="node-copy">
                      <strong>{item.name}</strong>
                      <span>{item.description}</span>
                    </span>
                    <span className={`chip kind-${group.kind}`}>{group.chip}</span>
                    <span className="muted">
                      <Icon name="chevron" size={16} />
                    </span>
                  </button>
                ))}
              </div>
            );
          })
        )}
      </div>
    </div>
  </div>
);
