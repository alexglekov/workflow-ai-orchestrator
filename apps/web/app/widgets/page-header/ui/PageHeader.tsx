export const PageHeader = ({
  title,
  description,
  actions,
  compact,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  compact?: boolean;
}) => (
  <header className={compact ? 'page-header compact' : 'page-header'}>
    <div>
      <h1>{title}</h1>
      {description ? <p>{description}</p> : null}
    </div>
    {actions}
  </header>
);
