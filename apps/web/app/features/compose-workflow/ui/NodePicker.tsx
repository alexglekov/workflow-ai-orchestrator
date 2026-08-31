import type { ConnectorCatalog } from '~/entities/connector';
import { connectorVisual } from '~/shared/lib/connector-visuals';
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
        <strong>Добавить коннектор</strong>
        <button type="button" className="icon-btn" onClick={onClose}>
          <Icon name="close" size={16} />
        </button>
      </div>
      <div className="node-picker-list">
        {catalog.map((item) => {
          const visual = connectorVisual(item.id);

          return (
            <button
              key={item.id}
              type="button"
              className="node-pick"
              onClick={() => onPick(item)}
            >
              <span
                className="node-icon"
                style={{ background: visual.bg, color: visual.color }}
              >
                {visual.letter}
              </span>
              <span className="node-copy">
                <strong>{item.name}</strong>
                <span>{item.description}</span>
              </span>
              <span className="chip mcp">MCP</span>
              <span className="muted">
                <Icon name="chevron" size={16} />
              </span>
            </button>
          );
        })}
      </div>
    </div>
  </div>
);
