import React from 'react';

interface BrandLogoProps {
  className?: string;
  style?: React.CSSProperties;
}

/**
 * A reusable branding component that mimics a Lucide icon
 * for easy replacement of existing dollar sign icons.
 */
export function BrandLogo({ className, style }: BrandLogoProps) {
  return (
    <img 
      src="./logo.jpeg" 
      alt="Brand Logo" 
      className={`${className} object-contain rounded-none`}
      style={{
        ...style,
        display: 'inline-block',
        verticalAlign: 'middle'
      }}
    />
  );
}
