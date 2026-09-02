import { useT } from "../i18n";

interface NumberFieldProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
}

/** A number with its steppers on either side of it. */
export function NumberField({
  value,
  min,
  max,
  step = 1,
  onChange,
}: NumberFieldProps) {
  const t = useT();
  const clamp = (next: number) => Math.min(Math.max(Math.round(next), min), max);

  return (
    <div className="number-field">
      <button
        type="button"
        onClick={() => onChange(clamp(value - step))}
        disabled={value <= min}
        title={t("number.decrease")}
      >
        −
      </button>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (Number.isFinite(next)) onChange(clamp(next));
        }}
      />
      <button
        type="button"
        onClick={() => onChange(clamp(value + step))}
        disabled={value >= max}
        title={t("number.increase")}
      >
        +
      </button>
    </div>
  );
}
