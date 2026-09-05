import React from 'react';

export interface IconProps extends React.SVGProps<SVGSVGElement> {
  size?: 16 | 20 | 24 | number;
  className?: string;
}

export const IconSale: React.FC<IconProps> = ({ size = 20, className = '', ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
    className={className}
    {...props}
  >
    {/* Stencil ticket with cut notches */}
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M4 3h16v6a2 2 0 0 1-2 2 2 2 0 0 1 2 2v8l-2.5-1.5L15 21l-2.5-1.5L10 21l-2.5-1.5L5 21l-1-.6V3zm3 4h10v2H7V7zm0 5h6v2H7v-2z"
    />
  </svg>
);

export const IconCash: React.FC<IconProps> = ({ size = 20, className = '', ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
    className={className}
    {...props}
  >
    {/* Industrial cash register drawer with inner circular coin notch */}
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M3 5h18v14H3V5zm2 2v6h14V7H5zm5 9h4v2h-4v-2zm-3-6a3 3 0 1 0 6 0 3 3 0 0 0-6 0z"
    />
  </svg>
);

export const IconStock: React.FC<IconProps> = ({ size = 20, className = '', ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
    className={className}
    {...props}
  >
    {/* Stencil metal shelf box */}
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M3 4h18v5H3V4zm0 6h18v10H3V10zm3 3h4v2H6v-2zm8 0h4v2h-4v-2z"
    />
  </svg>
);

export const IconAlert: React.FC<IconProps> = ({ size = 20, className = '', ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
    className={className}
    {...props}
  >
    {/* Stenciled octagonal / warning badge */}
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M8.2 2h7.6L22 8.2v7.6L15.8 22H8.2L2 15.8V8.2L8.2 2zm2.8 4h2v8h-2V6zm0 10h2v2h-2v-2z"
    />
  </svg>
);

export const IconWifi: React.FC<IconProps> = ({ size = 20, className = '', ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
    className={className}
    {...props}
  >
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M12 4c4.4 0 8.5 1.7 11.5 4.5l-2.2 2.2A13.4 13.4 0 0 0 12 7.2c-3.5 0-6.8 1.4-9.3 3.6L.5 8.5A16.4 16.4 0 0 1 12 4zm0 6c2.8 0 5.4 1.1 7.3 2.9l-2.2 2.2A7.3 7.3 0 0 0 12 13.2c-2 0-3.8.8-5.1 2l-2.2-2.3A10.3 10.3 0 0 1 12 10zm0 6a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5z"
    />
  </svg>
);

export const IconWifiOff: React.FC<IconProps> = ({ size = 20, className = '', ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
    className={className}
    {...props}
  >
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M2.8 2.2 21.8 21.2l-1.4 1.4-3.1-3.1c-1.6.9-3.4 1.5-5.3 1.5-4.4 0-8.5-1.7-11.5-4.5l2.2-2.2A13.4 13.4 0 0 0 12 16.8c1.3 0 2.5-.2 3.6-.6l-4.1-4.1c-.5.1-1 .2-1.5.2a7.3 7.3 0 0 1-5.1-2l-2.2 2.3C1.6 11.5 1.1 10.3.8 9l3.5 3.5L2.8 2.2zM12 4c4.4 0 8.5 1.7 11.5 4.5l-2.2 2.2A13.4 13.4 0 0 0 12 7.2c-1.1 0-2.2.1-3.2.4L7.1 6C8.6 4.7 10.2 4 12 4zm4.1 8.9 2.2-2.2A10.3 10.3 0 0 0 12 10c-.3 0-.6 0-.9.1l2.2 2.2c.9.2 1.8.4 2.8.6z"
    />
  </svg>
);

export const IconSync: React.FC<IconProps> = ({ size = 20, className = '', ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
    className={className}
    {...props}
  >
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M12 4V1L7 6l5 5V7a5 5 0 0 1 5 5c0 1-.3 1.9-.8 2.7l1.5 1.5A7 7 0 0 0 19 12a7 7 0 0 0-7-7zm-5 8c0-1 .3-1.9.8-2.7L6.3 7.8A7 7 0 0 0 5 12a7 7 0 0 0 7 7v3l5-5-5-5v4a5 5 0 0 1-5-5z"
    />
  </svg>
);

export const IconCheck: React.FC<IconProps> = ({ size = 20, className = '', ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
    className={className}
    {...props}
  >
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1.8 14.2L6.4 12.4l1.4-1.4 2.4 2.4 6-6 1.4 1.4-7.4 7.4z"
    />
  </svg>
);

export const IconBarcode: React.FC<IconProps> = ({ size = 20, className = '', ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
    className={className}
    {...props}
  >
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M2 5h2v14H2V5zm4 0h1v14H6V5zm3 0h3v14H9V5zm5 0h1v14h-1V5zm3 0h2v14h-2V5zm4 0h1v14h-1V5z"
    />
  </svg>
);

export const IconSearch: React.FC<IconProps> = ({ size = 20, className = '', ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
    className={className}
    {...props}
  >
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M10 2a8 8 0 0 1 6.32 12.9l5.39 5.39-1.42 1.42-5.39-5.39A8 8 0 1 1 10 2zm0 2a6 6 0 1 0 0 12 6 6 0 0 0 0-12z"
    />
  </svg>
);

export const IconDay: React.FC<IconProps> = ({ size = 20, className = '', ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
    className={className}
    {...props}
  >
    {/* Stencil sun with notched rays and center disc */}
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M11 1h2v4h-2V1zm0 18h2v4h-2v-4zM1 11h4v2H1v-2zm18 0h4v2h-4v-2zM4.93 3.51 6.34 2.1l2.83 2.83-1.41 1.41L4.93 3.51zm12.73 12.73 1.41-1.41 2.83 2.83-1.41 1.41-2.83-2.83zM2.1 17.66l1.41-1.41 2.83 2.83-1.41 1.41L2.1 17.66zm12.73-12.73 1.41-1.41 2.83 2.83-1.41 1.41-2.83-2.83zM12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zm-3 5a3 3 0 1 1 6 0 3 3 0 0 1-6 0z"
    />
  </svg>
);

export const IconNight: React.FC<IconProps> = ({ size = 20, className = '', ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
    className={className}
    {...props}
  >
    {/* Stenciled crescent moon with sharp terminal cuts */}
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M12.3 2a10 10 0 0 0 9.7 12.7 10 10 0 1 1-12.7-9.7 7.9 7.9 0 0 0 3 0zm-2.3 3.1a8 8 0 1 0 7.8 10.3 8 8 0 0 1-7.8-10.3z"
    />
  </svg>
);

export const IconPlus: React.FC<IconProps> = ({ size = 20, className = '', ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
    className={className}
    {...props}
  >
    <path fillRule="evenodd" clipRule="evenodd" d="M11 4h2v7h7v2h-7v7h-2v-7H4v-2h7V4z" />
  </svg>
);

export const IconEdit: React.FC<IconProps> = ({ size = 20, className = '', ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
    className={className}
    {...props}
  >
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"
    />
  </svg>
);

export const IconClose: React.FC<IconProps> = ({ size = 20, className = '', ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
    className={className}
    {...props}
  >
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z"
    />
  </svg>
);

export const IconHistory: React.FC<IconProps> = ({ size = 20, className = '', ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
    className={className}
    {...props}
  >
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M13 3a9 9 0 0 0-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42A8.954 8.954 0 0 0 13 21a9 9 0 0 0 0-18zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z"
    />
  </svg>
);
