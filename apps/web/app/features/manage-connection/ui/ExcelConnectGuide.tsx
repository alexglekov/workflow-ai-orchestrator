import type { ReactNode } from 'react';

export const ExcelConnectGuide = ({ children }: { children?: ReactNode }) => (
  <div className="telegram-guide">
    <div className="telegram-guide-head">
      <strong>Excel / Яндекс Таблицы</strong>
      <p className="muted">
        Подключите Яндекс Таблицу или файл .xlsx с Яндекс Диска. OAuth-токен в
        чат не пишите — только в поле ниже. Имя файла или ссылку можно сказать
        в задаче.
      </p>
    </div>
    <ol className="telegram-guide-steps">
      <li className="is-now">
        <span className="telegram-guide-mark">1</span>
        <span>
          Источник «Яндекс Диск / Яндекс Таблицы», если таблица в Диске или это
          онлайн-таблица Яндекса.
        </span>
      </li>
      <li>
        <span className="telegram-guide-mark">2</span>
        <span>
          Публичная ссылка <code>disk.yandex.ru</code> /{' '}
          <code>docs.yandex.ru</code> — если есть. Так можно читать без токена.
        </span>
      </li>
      <li>
        <span className="telegram-guide-mark">3</span>
        <span>
          OAuth-токен Яндекс Диска — для закрытых файлов и чтобы дописывать или
          обновлять строки.
        </span>
      </li>
    </ol>
    {children ? (
      <div className="telegram-guide-create">{children}</div>
    ) : null}
  </div>
);
