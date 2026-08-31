export const Banner = ({
  children,
  tone = 'error',
}: {
  children: React.ReactNode;
  tone?: 'error';
}) => <div className={`banner ${tone}`}>{children}</div>;
