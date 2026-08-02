import { Component } from 'react'
import { getSafeErrorMessage, logAppError, normalizeAppError } from '../services/appErrorService.js'

function goHome() {
  if (typeof window === 'undefined') return

  window.location.hash = '#hem'
  window.scrollTo?.({ behavior: 'smooth', top: 0 })
}

class AppErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = {
      error: null,
      resetCount: 0,
    }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, errorInfo) {
    logAppError(error, {
      area: this.props.area || 'app',
      componentStack: errorInfo?.componentStack || '',
    })
  }

  componentDidUpdate(previousProps) {
    if (previousProps.resetKey !== this.props.resetKey && this.state.error) {
      this.reset()
    }
  }

  reset = () => {
    this.setState((current) => ({
      error: null,
      resetCount: current.resetCount + 1,
    }))
  }

  reload = () => {
    if (typeof window !== 'undefined') {
      window.location.reload()
    }
  }

  goHome = () => {
    this.reset()
    goHome()
    this.props.onGoHome?.()
  }

  render() {
    if (!this.state.error) {
      return this.props.children
    }

    const title = this.props.title || 'Något gick fel'
    const normalized = normalizeAppError(this.state.error, { area: this.props.area || 'render' })
    const message = getSafeErrorMessage(this.state.error, { area: this.props.area || 'render' })

    return (
      <section className="panel app-error-boundary" role="alert" aria-live="assertive">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Viktkollen</p>
            <h2>{title}</h2>
          </div>
        </div>
        <p className="settings-note">{message}</p>
        <p className="estimate-note">Fel-id: {normalized.technicalCode}</p>
        {import.meta.env.DEV && normalized.diagnosticMessage && (
          <p className="estimate-note">Utvecklingsdetalj: {normalized.diagnosticMessage}</p>
        )}
        <div className="button-row">
          <button type="button" onClick={this.reset}>
            Försök igen
          </button>
          <button className="secondary-button" type="button" onClick={this.reload}>
            Ladda om appen
          </button>
          <button className="secondary-button" type="button" onClick={this.goHome}>
            Gå till startsidan
          </button>
        </div>
      </section>
    )
  }
}

export default AppErrorBoundary
