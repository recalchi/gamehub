import { Component, type ReactNode } from 'react'
import { AlertOctagon, RefreshCw } from 'lucide-react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error?: Error
  errorInfo?: string
}

/**
 * Last-resort React error boundary.
 *
 * Without this, an unhandled exception in any renderer component blanks the
 * whole window. The boundary catches the throw, logs it through our main-
 * process logger via IPC, and shows the user a recovery screen with a
 * "Recarregar" button (full window reload).
 *
 * It does NOT catch:
 *   - Errors in event handlers (those are handled by their own try/catch)
 *   - Errors in async code (Promise rejections — caught by window.unhandled)
 *   - Errors during SSR (we don't SSR)
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }): void {
    // eslint-disable-next-line no-console
    console.error('ErrorBoundary caught', error, info)
    // Pipe to the main process log so it survives the renderer reload
    void window.api?.system?.log?.('error', 'renderer', error.message, {
      stack: error.stack,
      componentStack: info.componentStack ?? undefined
    })
    this.setState({ errorInfo: info.componentStack ?? undefined })
  }

  reload = (): void => {
    location.reload()
  }

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children
    return (
      <div className="h-screen w-screen bg-ink-950 text-slate-100 flex items-center justify-center p-12">
        <div className="glass rounded-2xl p-8 max-w-2xl">
          <div className="flex items-center gap-3 mb-4">
            <AlertOctagon className="w-8 h-8 text-rose-300" />
            <h1 className="text-2xl font-display font-bold">Algo deu errado</h1>
          </div>
          <p className="text-slate-300 mb-2">
            O renderer travou. Suas configurações e biblioteca estão a salvo no disco
            ({' '}<code className="text-accent text-[11px]">%APPDATA%/gamehub</code>{' '}).
          </p>
          <p className="text-slate-400 text-sm mb-6">
            Recarregar a janela costuma resolver. Se persistir, abra Configurações → Logs
            e cole o conteúdo num issue.
          </p>

          {this.state.error && (
            <pre className="bg-ink-900 rounded-md p-3 text-[11px] text-rose-200 overflow-auto max-h-60 mb-6 font-mono">
              {this.state.error.name}: {this.state.error.message}
              {this.state.error.stack ? `\n\n${this.state.error.stack}` : ''}
              {this.state.errorInfo ? `\n\nComponent stack:\n${this.state.errorInfo}` : ''}
            </pre>
          )}

          <button
            onClick={this.reload}
            className="px-5 py-2.5 bg-accent text-ink-950 rounded-lg font-semibold flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" /> Recarregar janela
          </button>
        </div>
      </div>
    )
  }
}
