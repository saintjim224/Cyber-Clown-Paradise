import type { ButtonHTMLAttributes, ReactNode } from "react";

type PixelButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  children: ReactNode;
};

export function PixelButton({ variant = "secondary", className = "", children, ...props }: PixelButtonProps) {
  return (
    <button className={`pixel-button pixel-button--${variant} ${className}`.trim()} {...props}>
      {children}
    </button>
  );
}
