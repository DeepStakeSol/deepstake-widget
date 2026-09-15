import { Component, ErrorInfo, ReactNode } from 'react'

type WidgetFallbackProps = Readonly<{
  message: string
}>

export function WidgetFallback({ message }: WidgetFallbackProps) {
  return (
    <div className="sw-widget-error" role="alert">
      {message}
    </div>
  )
}

type WidgetErrorBoundaryProps = Readonly<{
  children: ReactNode
  mountElement: HTMLElement
}>

type WidgetErrorBoundaryState = {
  hasError: boolean
}

export class WidgetErrorBoundary extends Component<
  WidgetErrorBoundaryProps,
  WidgetErrorBoundaryState
> {
  state: WidgetErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError(): WidgetErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[DeepStake widget] render failed', this.props.mountElement, error, info)
  }

  render() {
    if (this.state.hasError) {
      return <WidgetFallback message="DeepStake widget: unable to render" />
    }

    return this.props.children
  }
}
