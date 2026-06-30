import s from "./board-editor.module.css";

/** ラベル付きの数値ステッパー（巡目/本場/供託など）。min/max でクランプする。 */
export function Stepper({
  label,
  unit,
  value,
  min,
  max,
  set,
}: {
  label: string;
  unit: string;
  value: number;
  min: number;
  max: number;
  set: (v: number) => void;
}) {
  return (
    <div className={s.steprow}>
      <span className={s.stlabel}>{label}</span>
      <div className={s.stepper}>
        <button aria-label={`${label}を減らす`} onClick={() => set(Math.max(min, value - 1))}>
          −
        </button>
        <span className={s.val}>
          {value}
          <span className={s.u}>{unit}</span>
        </span>
        <button aria-label={`${label}を増やす`} onClick={() => set(Math.min(max, value + 1))}>
          ＋
        </button>
      </div>
    </div>
  );
}
