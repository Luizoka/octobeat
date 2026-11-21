import { useState } from "react";

/**
 * Celular em pé: pede para girar. Na partida é obrigatório (fica pausada); nos
 * menus é uma recomendação forte, com uma saída discreta para seguir em pé.
 *
 * Um site não consegue girar a tela sozinho: o botão tenta tela cheia + travar
 * na horizontal onde o navegador permite (Chrome no Android). No iPhone isso
 * não existe, então o aviso explica como virar o aparelho.
 */
export function RotateOverlay({ inGame, onRotate, onExit, onDismiss }) {
  const [failed, setFailed] = useState(false);

  async function rotate() {
    const result = await onRotate?.();
    if (!result?.locked) setFailed(true);
  }

  return (
    <div className="rotate-overlay" role="alertdialog" aria-modal="true" aria-labelledby="rotate-title">
      <div className="rotate-phone" aria-hidden="true"><span /></div>
      <h2 id="rotate-title">{inGame ? "Gire o celular para jogar" : "Melhor na horizontal"}</h2>
      <p>Com o celular deitado as 8 colunas ficam maiores e bem mais fáceis de tocar — é o jeito certo de jogar o OctoBeat.</p>
      {onRotate && (
        <button className="play-button rotate-button" type="button" onClick={rotate}>↻ Girar para a horizontal</button>
      )}
      <p className="rotate-hint">
        {failed || !onRotate
          ? "Vire o celular de lado. Se a tela não girar, ligue a rotação automática (no iPhone: Central de Controle → cadeado de rotação)."
          : "Abre em tela cheia e trava a tela deitada."}
      </p>
      {inGame
        ? <button className="back-button" type="button" onClick={onExit}>← Sair da fase</button>
        : <button className="rotate-skip" type="button" onClick={onDismiss}>Continuar na vertical mesmo assim</button>}
    </div>
  );
}
