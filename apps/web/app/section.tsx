import type { ReactNode } from "react";

/** A numbered form section: "01 Bid month". */
export function Section({
  id,
  step,
  title,
  hint,
  children,
}: {
  id: string;
  step?: string;
  title: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="section" aria-labelledby={id}>
      <div className={step ? "section-head" : "section-head plain"}>
        {step && <span className="step">{step}</span>}
        <h2 id={id}>{title}</h2>
        {hint && <p className="hint">{hint}</p>}
      </div>
      {children}
    </section>
  );
}
