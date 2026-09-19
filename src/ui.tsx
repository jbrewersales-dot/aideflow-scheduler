import type { ReactNode } from 'react';

export function Banner({
  kind,
  title,
  children,
}: {
  kind: 'ok' | 'warn' | 'bad';
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className={`banner banner-${kind}`} role="status">
      <h3>{title}</h3>
      {children}
    </div>
  );
}

export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="modal-back" role="presentation" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="page-head">
          <h2>{title}</h2>
          <button type="button" className="btn btn-ghost btn-small" onClick={onClose}>
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="field">
      {label}
      {hint ? <span className="hint">{hint}</span> : null}
      {children}
    </label>
  );
}

export function ChipSelect({
  options,
  value,
  onToggle,
  danger,
}: {
  options: string[];
  value: string[];
  onToggle: (next: string[]) => void;
  danger?: boolean;
}) {
  return (
    <div className="chips">
      {options.map((opt) => {
        const on = value.includes(opt);
        return (
          <button
            type="button"
            key={opt}
            className={`chip${on ? ' on' : ''}${danger ? ' chip-danger' : ''}`}
            aria-pressed={on}
            onClick={() => onToggle(on ? value.filter((v) => v !== opt) : [...value, opt])}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}

export function TagEditor({
  values,
  onChange,
  placeholder,
}: {
  values: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
}) {
  return (
    <div>
      <div className="chips" style={{ marginBottom: 8 }}>
        {values.map((tag) => (
          <button type="button" key={tag} className="chip on" onClick={() => onChange(values.filter((t) => t !== tag))}>
            {tag} ×
          </button>
        ))}
      </div>
      <input
        type="text"
        placeholder={placeholder}
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return;
          e.preventDefault();
          const next = e.currentTarget.value.trim();
          if (!next || values.includes(next)) return;
          onChange([...values, next]);
          e.currentTarget.value = '';
        }}
      />
    </div>
  );
}
