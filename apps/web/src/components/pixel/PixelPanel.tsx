import type { ReactNode } from "react";

type PixelPanelProps = {
  title?: string;
  kicker?: string;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
};

export function PixelPanel({ title, kicker, action, className = "", children }: PixelPanelProps) {
  return (
    <section className={`pixel-panel ${className}`.trim()}>
      {(title || kicker || action) ? (
        <div className="pixel-panel__header">
          <div>
            {kicker ? <span className="pixel-kicker">{kicker}</span> : null}
            {title ? <h2>{title}</h2> : null}
          </div>
          {action ? <div className="pixel-panel__action">{action}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}
