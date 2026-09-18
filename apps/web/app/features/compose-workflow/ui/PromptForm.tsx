import type { AgentProviderInfo } from '~/entities/agent';
import { Icon } from '~/shared/ui/Icon';

export const PromptForm = ({
  prompt,
  loading,
  providers = [],
  providerId,
  placeholder,
  onPromptChange,
  onProviderChange,
  onSubmit,
}: {
  prompt: string;
  loading: boolean;
  providers?: AgentProviderInfo[];
  providerId: string;
  placeholder?: string;
  onPromptChange: (value: string) => void;
  onProviderChange: (id: string) => void;
  onSubmit: () => void;
}) => (
  <div className="prompt-shell">
    <div className="prompt-card">
      <textarea
        value={prompt}
        onChange={(event) => onPromptChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();

            if (!loading && prompt.trim()) {
              onSubmit();
            }
          }
        }}
        placeholder={
          placeholder ||
          'Напишите задачу — сделаю сам: найти, сравнить, прислать в Telegram'
        }
      />
      <div className="prompt-toolbar">
        <select
          className="agent-select"
          value={providerId}
          onChange={(event) => onProviderChange(event.target.value)}
          aria-label="Модель"
        >
          {providers.map((item) => (
            <option
              key={item.id}
              value={item.id}
              disabled={!item.available}
            >
              {item.name}
            </option>
          ))}
        </select>
        <div className="row-actions">
          <button
            type="button"
            className="send-btn"
            onClick={onSubmit}
            disabled={loading || !prompt.trim()}
            aria-label="Отправить"
          >
            <Icon name="send" size={16} />
          </button>
        </div>
      </div>
    </div>
  </div>
);
