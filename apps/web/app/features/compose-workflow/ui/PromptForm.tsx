import type { AgentProviderInfo, ComposerMode } from '~/entities/agent';
import { Icon } from '~/shared/ui/Icon';

export const PromptForm = ({
  mode,
  prompt,
  loading,
  providers,
  providerId,
  placeholder,
  onModeChange,
  onPromptChange,
  onProviderChange,
  onSubmit,
}: {
  mode: ComposerMode;
  prompt: string;
  loading: boolean;
  providers: AgentProviderInfo[];
  providerId: string;
  placeholder?: string;
  onModeChange: (mode: ComposerMode) => void;
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
          (mode === 'ask'
            ? 'Спросите, как устроены коннекторы или как лучше описать задачу'
            : 'Найдите заявки в почте, извлеките данные, создайте запись в 1С и напишите клиенту в Telegram')
        }
      />
      <div className="prompt-toolbar">
        <div className="row-actions">
          <div className="mode-toggle">
            <button
              type="button"
              className={mode === 'build' ? 'active' : ''}
              onClick={() => onModeChange('build')}
            >
              Build
            </button>
            <button
              type="button"
              className={mode === 'ask' ? 'active' : ''}
              onClick={() => onModeChange('ask')}
            >
              Ask
            </button>
          </div>
          <select
            className="agent-select"
            value={providerId}
            onChange={(event) => onProviderChange(event.target.value)}
            aria-label="Агент"
          >
            {providers.map((item) => (
              <option
                key={item.id}
                value={item.id}
                disabled={!item.available && item.id !== 'orchestrator'}
              >
                {item.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="send-btn"
            onClick={onSubmit}
            disabled={loading || !prompt.trim()}
            aria-label={mode === 'ask' ? 'Спросить агента' : 'Собрать workflow'}
          >
            <Icon name="send" size={16} />
          </button>
        </div>
      </div>
    </div>
  </div>
);
