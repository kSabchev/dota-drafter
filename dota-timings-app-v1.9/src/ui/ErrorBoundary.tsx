import React from "react";

type State = { hasError: boolean; error?: any };
export default class ErrorBoundary extends React.Component<
  React.PropsWithChildren,
  State
> {
  state: State = { hasError: false };
  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }
  componentDidCatch(err: any, info: any) {
    console.error("[ErrorBoundary]", err, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            border: "1px solid #803",
            color: "#f88",
            padding: 12,
            borderRadius: 8,
          }}
        >
          Something went wrong. Check console for details.
        </div>
      );
    }
    return this.props.children;
  }
}
