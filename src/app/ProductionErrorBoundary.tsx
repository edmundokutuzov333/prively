import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = { children: ReactNode };
type State = { failed: boolean };

async function reportClientError(error: Error, info: ErrorInfo) {
  try {
    const base = 'https://gaonupelgtpfthouyobh.supabase.co/functions/v1/client-error';
    const message = error.message.replace(/\s+/g, ' ').trim().slice(0, 1000);
    const stackExcerpt = String(error.stack ?? info.componentStack ?? '').slice(0, 1200);
    const fingerprint = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(message + '|' + window.location.pathname),
    ).then((bytes) =>
      Array.from(new Uint8Array(bytes), (value) => value.toString(16).padStart(2, '0')).join('').slice(0, 64),
    );
    await fetch(base, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify({
        fingerprint,
        path: window.location.pathname,
        message,
        stackExcerpt,
        buildId: import.meta.env.VITE_BUILD_ID ?? 'unknown',
      }),
    });
  } catch {
    // Telemetry must never mask the original UI failure.
  }
}

export class ProductionErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    void reportClientError(error, info);
  }

  private reload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.failed) return this.props.children;

    return (
      <main className="flex min-h-screen items-center justify-center bg-ink-950 px-5 py-16">
        <section className="w-full max-w-xl ficha bg-ink-900 p-6 md:p-8" role="alert">
          <p className="text-xs tracking-[0.16em] text-bone-500">Erro de aplicação</p>
          <h1 className="mt-3 font-display text-4xl text-bone-50">Esta área não conseguiu carregar.</h1>
          <p className="mt-4 text-sm leading-6 text-bone-300">
            Actualiza a página. Se o problema continuar, a ocorrência fica registada para análise técnica.
          </p>
          <button
            type="button"
            onClick={this.reload}
            className="mt-6 min-h-11 rounded-control bg-crimson-500 px-4 text-sm font-semibold text-white"
          >
            Actualizar página
          </button>
        </section>
      </main>
    );
  }
}
