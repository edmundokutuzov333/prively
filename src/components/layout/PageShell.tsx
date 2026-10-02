import type { ReactNode } from "react";

export type PageState = "loading" | "empty" | "error" | "offline" | "forbidden" | "success";

export type PageShellProps = {
  title: string;
  description?: string;
  state?: PageState;
  emptyState?: { message: string; action?: ReactNode };
  children?: ReactNode;
};

export function PageShell({ title, description, state = "empty", emptyState, children }: PageShellProps) {
  return (
    <main aria-labelledby="page-title" className="mx-auto w-full max-w-5xl">
      <header className="mb-8 max-w-3xl">
        <h1 id="page-title" className="font-display text-4xl tracking-tight text-bone-50 md:text-5xl">{title}</h1>
        {description ? <p className="mt-3 text-sm leading-6 text-bone-300 md:text-base">{description}</p> : null}
      </header>
      {emptyState ? (
        <section aria-live="polite" data-testid="page-shell-empty" data-page-state={state} className="ficha relative overflow-hidden bg-ink-900/70 p-6 md:p-8">
          <div className="ficha-corner" aria-hidden="true" />
          <p className="max-w-2xl text-sm leading-6 text-bone-300">{emptyState.message}</p>
          {emptyState.action ? <div className="mt-5">{emptyState.action}</div> : null}
        </section>
      ) : children}
    </main>
  );
}

export default PageShell;