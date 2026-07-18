"use client";

import { useId } from "react";
import s from "./infotip.module.css";

interface Props {
  /** Plain-language explanation shown on hover/focus. */
  text: string;
  /** Which edge of the trigger the bubble aligns to (avoids clipping near borders). */
  align?: "left" | "center" | "right";
}

/**
 * A small "?" affordance that reveals a plain-language explanation on hover and on
 * keyboard focus. Built for non-experts: every piece of jargon in the UI can carry
 * one without cluttering the dense instrument layout, since the text only appears on
 * demand. Accessible — the trigger is a real button and the bubble is wired via
 * aria-describedby.
 */
export function InfoTip({ text, align = "left" }: Readonly<Props>) {
  const id = useId();
  return (
    <span className={s.wrap}>
      <button
        type="button"
        className={s.trigger}
        aria-label="Ajuda"
        aria-describedby={id}
        onClick={(e) => e.preventDefault()}
      >
        ?
      </button>
      <span role="tooltip" id={id} className={`${s.bubble} ${s[align]}`}>
        {text}
      </span>
    </span>
  );
}
