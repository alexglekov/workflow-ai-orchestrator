import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost';

export const Button = ({
  variant = 'primary',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) => {
  const extra = variant === 'primary' ? '' : variant;

  return (
    <button
      className={['btn', extra, className].filter(Boolean).join(' ')}
      {...props}
    />
  );
};
