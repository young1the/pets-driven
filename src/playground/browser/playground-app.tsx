export function PlaygroundApp() {
  return (
    <main className="playground-shell">
      <header>
        <h1>pets-driven playground</h1>
      </header>
      <canvas data-testid="world-canvas" width={960} height={540} />
    </main>
  );
}
