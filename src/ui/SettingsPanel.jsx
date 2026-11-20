import { useEffect } from "react";
import { DEFAULT_SETTINGS } from "../settings/settings.js";

function Toggle({ label, hint, checked, onChange, disabled }) {
  return (
    <label className={`setting-row ${disabled ? "is-disabled" : ""}`}>
      <span><b>{label}</b>{hint && <small>{hint}</small>}</span>
      <input className="switch" type="checkbox" role="switch" checked={checked} onChange={(event) => onChange(event.target.checked)} disabled={disabled} />
    </label>
  );
}

function Range({ label, hint, value, min, max, step, format, onChange, disabled }) {
  return (
    <label className={`setting-row ${disabled ? "is-disabled" : ""}`}>
      <span><b>{label}</b>{hint && <small>{hint}</small>}</span>
      <span className="range-field">
        <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} disabled={disabled} />
        <output>{format(value)}</output>
      </span>
    </label>
  );
}

function Choice({ label, hint, value, options, onChange }) {
  return (
    <div className="setting-row">
      <span><b>{label}</b>{hint && <small>{hint}</small>}</span>
      <div className="segmented small" role="radiogroup" aria-label={label}>
        {options.map(([id, text]) => (
          <button key={id} type="button" role="radio" aria-checked={value === id} className={value === id ? "is-selected" : ""} onClick={() => onChange(id)}>{text}</button>
        ))}
      </div>
    </div>
  );
}

const percent = (value) => `${Math.round(value * 100)}%`;

export function SettingsPanel({ settings, onChange, onClose }) {
  useEffect(() => {
    const onKey = (event) => { if (event.key === "Escape") { event.stopPropagation(); onClose(); } };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  const set = (key) => (value) => onChange({ [key]: value });
  const reduced = settings.reducedMotion;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Configurações" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="settings-panel">
        <header>
          <h2>Configurações</h2>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Fechar" autoFocus>✕</button>
        </header>

        <section>
          <h3>Jogo</h3>
          <Choice label="Contagem antes de começar" value={String(settings.leadInSeconds)} onChange={(value) => onChange({ leadInSeconds: Number(value) })}
            options={[["0", "Sem"], ["1", "1s"], ["2", "2s"], ["3", "3s"], ["4", "4s"]]} />
          <Choice label="Teclas" hint="Uma mão redistribui as notas em 4 teclas." value={settings.handMode} onChange={set("handMode")}
            options={[["both", "Duas mãos"], ["left", "ASDF"], ["right", "JKLÇ"]]} />
        </section>

        <section>
          <h3>Áudio</h3>
          <Range label="Volume da música" value={settings.masterVolume} min={0} max={1} step={0.05} format={percent} onChange={set("masterVolume")} />
          <Toggle label="Sons de acerto" hint="Clique curto a cada acerto e erro." checked={settings.hitSounds} onChange={set("hitSounds")} />
          <Range label="Volume dos acertos" value={settings.hitSoundVolume} min={0} max={1} step={0.05} format={percent} onChange={set("hitSoundVolume")} disabled={!settings.hitSounds} />
        </section>

        <section>
          <h3>Efeitos</h3>
          <Choice label="Partículas" value={settings.particles} onChange={set("particles")}
            options={[["off", "Desligado"], ["low", "Pouco"], ["medium", "Médio"], ["high", "Muito"]]} />
          <Toggle label="Tremer ao errar" checked={settings.shake} onChange={set("shake")} disabled={reduced} />
          <Range label="Força do tremor" value={settings.shakeIntensity} min={0.25} max={2} step={0.25} format={(value) => `${value}×`} onChange={set("shakeIntensity")} disabled={reduced || !settings.shake} />
          <Toggle label="Flash vermelho ao errar" checked={settings.missFlash} onChange={set("missFlash")} />
          <Toggle label="Modo Fever" hint="Pista brilhando com combo 50+ (o multiplicador de pontos continua)." checked={settings.feverEffects} onChange={set("feverEffects")} />
          <Toggle label="Texto de julgamento" hint="PERFEITO!, BOM, ERRO… na linha de acerto." checked={settings.judgementText} onChange={set("judgementText")} />
          <Toggle label="Feixe de luz nas teclas" checked={settings.laneBeams} onChange={set("laneBeams")} />
          <Toggle label="Fogo nas notas longas" hint="Holds longos pegam fogo, tremem e explodem no final." checked={settings.holdFire} onChange={set("holdFire")} />
          <Toggle label="Reduzir movimento" hint="Desliga o tremor e reduz partículas e animações." checked={settings.reducedMotion} onChange={set("reducedMotion")} />
        </section>

        <footer>
          <button className="menu-button" type="button" onClick={() => onChange({ ...DEFAULT_SETTINGS, reducedMotion: settings.reducedMotion })}>Restaurar padrões</button>
          <button className="play-button" type="button" onClick={onClose}>Pronto</button>
        </footer>
      </div>
    </div>
  );
}
