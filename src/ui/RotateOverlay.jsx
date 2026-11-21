/**
 * Cobre a tela de jogo enquanto o celular está em pé. A partida fica pausada
 * (ou esperando para começar) até o aparelho ser girado.
 *
 * Um site não consegue girar a tela sozinho: o botão de tela cheia só aparece
 * onde o navegador permite tentar bloquear em paisagem (Chrome no Android).
 */
export function RotateOverlay({ onFullscreen, onExit }) {
  return (
    <div className="rotate-overlay" role="alertdialog" aria-modal="true" aria-labelledby="rotate-title">
      <div className="rotate-phone" aria-hidden="true"><span /></div>
      <h2 id="rotate-title">Gire o celular para jogar</h2>
      <p>O OctoBeat usa 8 colunas e precisa do celular na horizontal.</p>
      {onFullscreen && <button className="play-button" type="button" onClick={onFullscreen}>⛶ Tela cheia na horizontal</button>}
      <p className="rotate-hint">Se a tela não girar, confira se a rotação automática está ligada.</p>
      <button className="back-button" type="button" onClick={onExit}>← Sair da fase</button>
    </div>
  );
}
