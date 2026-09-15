import { Icon } from '~/shared/ui/Icon';

export const PromptForm = ({
  prompt,
  loading,
  placeholder,
  onPromptChange,
  onSubmit,
}: {
  prompt: string;
  loading: boolean;
  placeholder?: string;
  onPromptChange: (value: string) => void;
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
          'Найдите заявки в почте, извлеките данные, создайте запись в 1С и напишите клиенту в Telegram'
        }
      />
      <div className="prompt-toolbar">
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
