import { useId } from "react";

export function SegmentedTabs({ label, labels, selected, onSelect, disabled, extra, panelClassName, children }) {
  const id = useId();

  function navigate(event, index) {
    const last = labels.length - 1;
    const targets = {
      ArrowLeft: index === 0 ? last : index - 1,
      ArrowRight: index === last ? 0 : index + 1,
      Home: 0,
      End: last,
    };
    const target = targets[event.key];
    if (typeof target !== "number") return;
    event.preventDefault();
    onSelect(target);
    event.currentTarget.parentElement.children[target].focus();
  }

  return (
    <>
      <div className="ranked-actions ranking-views">
        <div className="segmented small" role="tablist" aria-label={label}>
          {labels.map((name, index) => (
            <button key={name} className={selected === index ? "is-selected" : ""} type="button" role="tab"
              id={`${id}-tab-${index}`} aria-controls={`${id}-panel-${index}`}
              aria-selected={selected === index} tabIndex={selected === index ? 0 : -1}
              disabled={disabled} onClick={() => onSelect(index)} onKeyDown={(event) => navigate(event, index)}>
              {name}
            </button>
          ))}
        </div>
        {extra}
      </div>
      {labels.map((name, index) => (
        <div key={name} className={panelClassName} id={`${id}-panel-${index}`} role="tabpanel"
          aria-labelledby={`${id}-tab-${index}`} hidden={selected !== index}>
          {selected === index && children}
        </div>
      ))}
    </>
  );
}
