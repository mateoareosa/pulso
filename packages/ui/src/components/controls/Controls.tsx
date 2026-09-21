import React from 'react';

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', className = '', ...props },
  ref
) {
  return <button ref={ref} className={`pulso-button pulso-button--${variant} pulso-button--${size} ${className}`} {...props} />;
});

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className = '', ...props }, ref
) { return <input ref={ref} className={`pulso-input ${className}`} {...props} />; });

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className = '', ...props }, ref
) { return <select ref={ref} className={`pulso-select ${className}`} {...props} />; });

export const Panel: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className = '', ...props }) => (
  <div className={`pulso-panel ${className}`} {...props} />
);
