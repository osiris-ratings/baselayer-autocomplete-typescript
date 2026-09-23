import { useEffect, useState } from "react";

/**
 * Which of `ids` the reader is in: the last section whose top has scrolled
 * past `offset` pixels (the sticky header plus a little), or the first when
 * none has. At the bottom of the page the last section wins, since a short
 * one there may never reach the line. Recomputed on scroll, resize and hash
 * change, at most once a frame, so a click on a menu item and the smooth
 * scroll it starts both move the highlight.
 */
export function useScrollSpy(
  ids: readonly string[],
  offset = 120,
): string | null {
  const key = ids.join("|");
  const [active, setActive] = useState<string | null>(ids[0] ?? null);

  useEffect(() => {
    const list = key === "" ? [] : key.split("|");
    if (list.length === 0) {
      return;
    }
    let frame = 0;
    const update = () => {
      frame = 0;
      let current = list[0]!;
      for (const id of list) {
        const element = document.getElementById(id);
        if (element !== null && element.getBoundingClientRect().top <= offset) {
          current = id;
        }
      }
      const bottom =
        window.innerHeight + window.scrollY >=
        document.documentElement.scrollHeight - 2;
      if (bottom && window.scrollY > 0) {
        current = list[list.length - 1]!;
      }
      setActive(current);
    };
    const schedule = () => {
      if (frame === 0) frame = window.requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    window.addEventListener("hashchange", schedule);
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("hashchange", schedule);
      if (frame !== 0) window.cancelAnimationFrame(frame);
    };
  }, [key, offset]);

  return active;
}
