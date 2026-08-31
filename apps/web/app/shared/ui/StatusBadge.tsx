export const StatusBadge = ({
  status,
  label,
}: {
  status: string;
  label: string;
}) => <span className={`status status-${status}`}>{label}</span>;
