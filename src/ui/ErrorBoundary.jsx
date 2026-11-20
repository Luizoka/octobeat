import { Component } from "react";

// Se alguma tela quebrar, mostra o erro e um botão para recomeçar,
// em vez de deixar a página vazia.
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("OctoBeat quebrou:", error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="app-shell">
        <section className="results-screen">
          <div className="results-card">
            <span className="eyebrow">Ops!</span>
            <h2>Algo deu errado</h2>
            <p className="rank-text">O jogo encontrou um erro inesperado.</p>
            <code className="error-detail">{String(this.state.error?.message ?? this.state.error)}</code>
            <div className="results-actions">
              <button className="play-button" type="button" onClick={() => window.location.reload()}>↻ Voltar ao início</button>
            </div>
          </div>
        </section>
      </main>
    );
  }
}
