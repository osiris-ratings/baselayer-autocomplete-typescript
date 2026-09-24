// The overview's specimen, playing: the real component, fed made-up rows (see
// ./reel), with a pointer that clicks into the field, types a business name it
// never finishes, and picks the first row; then the canvas pans away to the
// left as the pointer fades, and the next name starts. It is decoration: a
// screen reader gets the sentence under it, nothing in it takes focus, it can
// be paused, and with reduced motion it holds still on the first name's answer.

import { BusinessAutocompleteView } from "@baselayer/autocomplete/react";
import "@baselayer/autocomplete/react/styles.css";
import { useEffect, useRef, useState, type CSSProperties } from "react";

import { useInView, usePrefersStill, waiter } from "./motion";
import { REEL, answerFor } from "./reel";

/** Where the pointer is, and how long it takes to get there. */
interface Pointer {
  x: number;
  y: number;
  ms: number;
  pressed: boolean;
}

interface Frame {
  company: number;
  typed: string;
  focused: boolean;
  /** A keystroke just landed: the caret holds rather than blinks. */
  typing: boolean;
  open: boolean;
  /**
   * The pointer is on the first row. Drawn by the reel, not by the combobox:
   * downshift ignores a hover that follows a touch, and would keep it past a
   * pause.
   */
  hover: boolean;
  /** Picked: the canvas swipes away to the left, and the pointer fades. */
  leaving: boolean;
}

const FIRST: Frame = {
  company: 0,
  typed: "",
  focused: false,
  typing: false,
  open: false,
  hover: false,
  leaving: false,
};

/** The first name's whole answer: for reduced motion, a pause, or off screen. */
const STILL: Frame = {
  ...FIRST,
  typed: REEL[0]!.query,
  open: true,
};

export function TypeaheadReel({ paused }: { paused: boolean }) {
  const canvas = useRef<HTMLDivElement>(null);
  const still = usePrefersStill();
  const playing = useInView(canvas) && !still && !paused;
  const [frame, setFrame] = useState<Frame>(STILL);
  const [pointer, setPointer] = useState<Pointer | null>(null);
  // The name the next play starts on, so a pause resumes with the next one.
  const next = useRef(0);
  // A fresh combobox per name.
  const [take, setTake] = useState(0);

  useEffect(() => {
    if (!playing) {
      setFrame(STILL);
      setPointer(null);
      return;
    }
    const run = new AbortController();
    const { signal } = run;
    const wait = waiter(signal);
    const box = () => canvas.current!.getBoundingClientRect();
    /** A point on `selector`, as a fraction across and down it, in the canvas. */
    const on = (selector: string, across: number, down: number) => {
      const origin = box();
      const element = canvas.current!.querySelector(selector);
      if (element === null)
        return { x: origin.width / 2, y: origin.height / 2 };
      const rect = element.getBoundingClientRect();
      return {
        x: rect.left - origin.left + rect.width * across,
        y: rect.top - origin.top + rect.height * down,
      };
    };
    const move = (to: { x: number; y: number }, ms: number) =>
      setPointer(at => ({ ...to, ms, pressed: at?.pressed ?? false }));
    const press = async () => {
      setPointer(at => at && { ...at, ms: 0, pressed: true });
      await wait(170);
      setPointer(at => at && { ...at, pressed: false });
    };

    const play = async () => {
      for (;;) {
        const index = next.current;
        const company = REEL[index]!;
        setTake(n => n + 1);
        setFrame({ ...FIRST, company: index });
        const { width, height } = box();
        move({ x: width + 40, y: height * 0.75 }, 0);
        await wait(700);

        // In through the field's side, and a click: the caret starts blinking.
        move(on(".reel-field", 0.18, 0.55), 900);
        await wait(1000);
        await press();
        setFrame(f => ({ ...f, focused: true, open: true }));
        await wait(500);

        // A name typed a letter at a time, and left unfinished.
        for (let n = 1; n <= company.query.length; n++) {
          const typed = company.query.slice(0, n);
          setFrame(f => ({ ...f, typed, typing: true }));
          await wait(65 + Math.random() * 90);
        }
        setFrame(f => ({ ...f, typing: false }));
        await wait(800);

        // Down to the first row, which lights up under the pointer.
        move(on('[data-testid="business-suggestion"]', 0.32, 0.45), 750);
        await wait(820);
        setFrame(f => ({ ...f, hover: true }));
        await wait(650);

        // Picked: the field takes the row's name and the menu closes.
        await press();
        const picked = answerFor(company, company.query).rows[0]!.label;
        setFrame(f => ({
          ...f,
          typed: picked,
          open: false,
          typing: false,
          hover: false,
        }));
        await wait(500);

        // The canvas pans away to the left, slow and then faster, fading
        // over the second half with the pointer; the empty canvas holds a
        // moment, and then everything resets at once.
        setFrame(f => ({ ...f, leaving: true }));
        await wait(750 + 300);
        next.current = (index + 1) % REEL.length;
      }
    };
    play().catch(() => undefined);
    return () => run.abort();
  }, [playing]);

  const company = REEL[frame.company]!;
  const answer = answerFor(company, frame.typed);
  const picked = frame.typed.length > company.query.length;
  return (
    <>
      <div
        className="reel"
        ref={canvas}
        aria-hidden="true"
        inert
        data-hover={frame.hover ? "true" : undefined}
      >
        <div
          className="reel-stage"
          data-leaving={frame.leaving ? "true" : undefined}
        >
          <BusinessAutocompleteView
            key={take}
            id="reel"
            value={frame.typed}
            onInputChange={() => undefined}
            onSelect={() => undefined}
            suggestions={picked ? [] : answer.rows}
            found={answer.found}
            foundCapped={false}
            truncated={false}
            indexTag={null}
            roundTripMs={answer.rows.length > 0 && !picked ? 38 : null}
            isSearching={false}
            error={null}
            open={frame.open}
            label="Business name"
            renderInput={inputProps => (
              <>
                <input {...inputProps} hidden tabIndex={-1} readOnly />
                <div
                  className="bl-ac-input reel-field"
                  data-focused={frame.focused ? "true" : undefined}
                >
                  <span className="reel-text">
                    <span>{frame.typed}</span>
                  </span>
                  {frame.focused && (
                    <span
                      className="reel-caret"
                      data-typing={frame.typing ? "true" : undefined}
                    />
                  )}
                </div>
              </>
            )}
          />
        </div>
        {/* Outside the stage, so it stays where it is and fades while the
            rest swipes away. */}
        {pointer !== null && (
          <svg
            className="reel-pointer"
            viewBox="0 0 24 24"
            width={24}
            height={24}
            style={
              {
                transform: `translate(${pointer.x}px, ${pointer.y}px)`,
                "--move": `${pointer.ms}ms`,
              } as CSSProperties
            }
            data-pressed={pointer.pressed ? "true" : undefined}
            data-leaving={frame.leaving ? "true" : undefined}
          >
            <circle className="reel-press" cx="1" cy="1" r="9" />
            <path
              d="M1 1 L1 17.5 L5.4 13.4 L8.4 20.2 L11.2 19 L8.3 12.4 L14.2 12.4 Z"
              fill="#1c1b1c"
              stroke="#ffffff"
              strokeWidth={1.4}
              strokeLinejoin="round"
            />
          </svg>
        )}
      </div>
      <p className="visually-hidden">
        The typeahead, playing: a made-up business name is typed a letter at a
        time, the suggestions narrow with each one, and the first is picked.
      </p>
      {/* Every name's caption, stacked in one place so the card keeps one
          height whichever is showing. */}
      <figcaption className="reel-caption" aria-hidden="true">
        {REEL.map((each, i) => (
          <span
            key={each.query}
            data-current={i === frame.company ? "true" : undefined}
          >
            <span className="mono-label">q</span> {each.query}{" "}
            <span className="mono-label">
              → {answerFor(each, each.query).found} matches
            </span>
          </span>
        ))}
      </figcaption>
    </>
  );
}
