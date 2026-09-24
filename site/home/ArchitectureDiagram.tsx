// Where each piece runs and which hop carries what. Numbers match the list
// under the figure. Drawn at 1120 x 500 and scaled; below that width the
// figure scrolls sideways rather than shrinking its text away.
//
// On the page it plays (see usePlay): requests travel the hops as blobs, in
// the order they happen, and the field types made-up business names whose
// keystrokes go straight to Baselayer. Rendered on the server, as the README's
// file is, and whenever it holds still, it is the drawing alone.

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";

import type { HighlightPart } from "@baselayer-sdk/autocomplete";

import { useInView, usePrefersStill, waiter } from "./motion";
import { REEL, answerFor } from "./reel";

const BLUE = "#384ce3";
const INK = "#1c1b1c";
const MUTED = "#676b76";
const LINE = "#cfd9ee";
const RETURN = "#7b8db3";

function Badge({ x, y, n }: { x: number; y: number; n: number }) {
  return (
    <g>
      <circle cx={x} cy={y} r={13} fill={BLUE} />
      <text
        x={x}
        y={y + 4.5}
        textAnchor="middle"
        fontFamily="var(--mono)"
        fontSize={12.5}
        fill="#ffffff"
      >
        {n}
      </text>
    </g>
  );
}

function Arrow({
  x1,
  x2,
  y,
  dashed = false,
}: {
  x1: number;
  x2: number;
  y: number;
  dashed?: boolean;
}) {
  return (
    <line
      x1={x1}
      y1={y}
      x2={x2}
      y2={y}
      stroke={dashed ? RETURN : BLUE}
      strokeWidth={dashed ? 1.5 : 1.75}
      strokeDasharray={dashed ? "5 5" : undefined}
      markerEnd={dashed ? "url(#arch-head-return)" : "url(#arch-head)"}
    />
  );
}

function Zone({
  x,
  title,
  host,
  fill,
}: {
  x: number;
  title: string;
  host: string;
  fill: string;
}) {
  return (
    <g>
      <rect
        x={x + 0.5}
        y={0.5}
        width={339}
        height={499}
        rx={2}
        fill={fill}
        stroke="#dce5f5"
      />
      <line x1={x} y1={46} x2={x + 340} y2={46} stroke="#dce5f5" />
      <text
        x={x + 20}
        y={29}
        fontFamily="var(--mono)"
        fontSize={12.5}
        letterSpacing="0.08em"
        fill={INK}
      >
        {title}
      </text>
      <text
        x={x + 320}
        y={29}
        textAnchor="end"
        fontFamily="var(--mono)"
        fontSize={11.5}
        fill={MUTED}
      >
        {host}
      </text>
    </g>
  );
}

function Box({
  x,
  y,
  h,
  title,
  lines,
  tag,
  w = 300,
}: {
  x: number;
  y: number;
  h: number;
  title: string;
  lines: string[];
  tag?: string;
  w?: number;
}) {
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={2}
        fill="#ffffff"
        stroke={LINE}
      />
      <text
        x={x + 16}
        y={y + 26}
        fontFamily="var(--mono)"
        fontSize={13}
        fill={INK}
      >
        {title}
      </text>
      {lines.map((line, i) => (
        <text
          key={line}
          x={x + 16}
          y={y + 48 + i * 18}
          fontFamily="var(--sans)"
          fontSize={13}
          fill={MUTED}
        >
          {line}
        </text>
      ))}
      {tag !== undefined && (
        <text
          x={x + 16}
          y={y + h - 14}
          fontFamily="var(--mono)"
          fontSize={10.5}
          letterSpacing="0.06em"
          fill={BLUE}
        >
          {tag}
        </text>
      )}
    </g>
  );
}

/** A hop's two lines, as drawn: the request, and the answer (dashed). */
const HOPS = {
  1: {
    there: { y: 146, from: 304, to: 408 },
    back: { y: 178, from: 408, to: 306 },
  },
  2: {
    there: { y: 146, from: 712, to: 798 },
    back: { y: 178, from: 798, to: 714 },
  },
  3: {
    there: { y: 284, from: 304, to: 798 },
    back: { y: 304, from: 798, to: 306 },
  },
  4: { there: { y: 420, from: 304, to: 408 }, back: null },
  5: {
    there: { y: 420, from: 712, to: 798 },
    back: { y: 448, from: 798, to: 714 },
  },
} as const;

type Hop = keyof typeof HOPS;

interface Travel {
  id: number;
  y: number;
  from: number;
  to: number;
  ms: number;
  back: boolean;
}

/** What the field types, and whose rows answer it (see ./reel). */
const NAMES = [
  { name: "copperline electric", company: 2 },
  { name: "harbor concrete", company: 0 },
  { name: "bluestem bakery", company: 1 },
];

interface Scene {
  company: number;
  typed: string;
  /** A keystroke just landed: the caret holds rather than blinks. */
  typing: boolean;
  /** The stem whose answer the rows show; none until the first comes back. */
  shown: string;
  picked: boolean;
  pressed: boolean;
}

/** A request, or an answer, crossing its line. */
function Blob({ travel }: { travel: Travel }) {
  const [x, setX] = useState<number>(travel.from);
  useEffect(() => {
    // Drawn at its start first, then sent: two frames, so the start paints.
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => setX(travel.to));
    });
    return () => cancelAnimationFrame(frame);
  }, [travel.to]);
  return (
    <circle
      r={travel.back ? 3.5 : 4.5}
      fill={travel.back ? RETURN : BLUE}
      style={{
        transform: `translate(${x}px, ${travel.y}px)`,
        transition: `transform ${travel.ms}ms cubic-bezier(0.45, 0, 0.55, 1)`,
      }}
    />
  );
}

/**
 * The diagram's play: a session minted through your backend, a name typed a
 * letter at a time with its keystrokes going straight to Baselayer and rows
 * coming back, then the pick submitted through your backend to a search.
 * Null while it holds still.
 */
function usePlay(
  target: RefObject<SVGSVGElement | null>,
  paused: boolean,
): { scene: Scene | null; travels: Travel[] } {
  const still = usePrefersStill();
  const inView = useInView(target, 0.4);
  const playing = inView && !still && !paused;
  const [scene, setScene] = useState<Scene | null>(null);
  const [travels, setTravels] = useState<Travel[]>([]);
  const next = useRef(0);

  useEffect(() => {
    if (!playing) {
      setScene(null);
      setTravels([]);
      return;
    }
    const run = new AbortController();
    const wait = waiter(run.signal);
    let id = 0;
    const cross = async (hop: Hop, back: boolean) => {
      const line = back ? HOPS[hop].back : HOPS[hop].there;
      if (line === null) return;
      const ms = Math.min(
        760,
        Math.max(280, Math.abs(line.to - line.from) / 0.65),
      );
      const travel = { id: ++id, ...line, ms, back };
      setTravels(all => [...all, travel]);
      try {
        await wait(ms);
      } finally {
        setTravels(all => all.filter(t => t.id !== travel.id));
      }
    };
    const update = (change: Partial<Scene>) =>
      setScene(now => (now === null ? now : { ...now, ...change }));

    const play = async () => {
      for (;;) {
        const index = next.current;
        const { name, company } = NAMES[index]!;
        setScene({
          company,
          typed: "",
          typing: false,
          shown: "",
          picked: false,
          pressed: false,
        });
        await wait(700);

        // The field gets focus: a session, minted through your backend.
        await cross(1, false);
        await cross(2, false);
        await wait(140);
        await cross(2, true);
        await cross(1, true);
        await wait(300);

        // Keystrokes go straight to Baselayer; rows come back. One request in
        // the air at a time, as the SDK debounces them, and the whole name
        // asked last.
        let asking: Promise<void> | null = null;
        let asked = "";
        const ask = (stem: string) => {
          asked = stem;
          asking = (async () => {
            await cross(3, false);
            await cross(3, true);
            update({ shown: stem });
            asking = null;
          })();
          asking.catch(() => undefined);
        };
        for (let n = 1; n <= name.length; n++) {
          update({ typed: name.slice(0, n), typing: true });
          if (n >= 3 && asking === null) ask(name.slice(0, n));
          await wait(80 + Math.random() * 90);
        }
        update({ typing: false });
        while (asking !== null) await asking;
        if (asked !== name) {
          ask(name);
          while (asking !== null) await asking;
        }
        await wait(700);

        // Picked, and submitted: the token rides your form to your backend,
        // which adds it to its search.
        update({ picked: true });
        await wait(800);
        update({ pressed: true });
        await wait(180);
        update({ pressed: false });
        await cross(4, false);
        await cross(5, false);
        await wait(140);
        await cross(5, true);
        await wait(1600);
        next.current = (index + 1) % NAMES.length;
      }
    };
    play().catch(() => undefined);
    return () => run.abort();
  }, [playing]);

  return { scene, travels };
}

/** Where a row's name must end, inside the rows' box. */
const NAME_END = 280;

/**
 * A row's name, in its highlight parts, cut to `room` characters: the parts
 * kept whole while they fit, the one that overflows cut short with an
 * ellipsis, and the rest dropped.
 */
function fit(parts: HighlightPart[], room = Infinity): HighlightPart[] {
  const kept: HighlightPart[] = [];
  for (const part of parts) {
    if (part.text.length <= room) {
      kept.push(part);
      room -= part.text.length;
      continue;
    }
    kept.push({ ...part, text: `${part.text.slice(0, room - 1).trimEnd()}…` });
    break;
  }
  return kept;
}

/** The field's text, the caret after it, and the rows answering it. */
function PlayingField({ scene }: { scene: Scene }) {
  const field = useRef<SVGTextElement>(null);
  const labels = useRef<(SVGTextElement | null)[]>([]);
  const [caret, setCaret] = useState(66);
  const [marks, setMarks] = useState<{ row: number; x1: number; x2: number }[]>(
    [],
  );
  // How many characters of a name its box holds, where the whole does not
  // fit: measured as drawn, since glyph widths vary.
  const [rooms, setRooms] = useState<Record<string, number>>({});
  const rows = useMemo(
    () =>
      scene.shown === ""
        ? []
        : answerFor(REEL[scene.company]!, scene.shown).rows.slice(0, 2),
    [scene.company, scene.shown],
  );

  // Where the caret and the marks go, and how much of a name fits, depend on
  // the text's drawn width.
  useLayoutEffect(() => {
    const cut: Record<string, number> = {};
    rows.forEach((row, i) => {
      const label = labels.current[i];
      if (
        label === null ||
        label === undefined ||
        rooms[row.token] !== undefined
      )
        return;
      const box = label.getBBox();
      if (box.x + box.width <= NAME_END) return;
      const characters = label.textContent?.length ?? 0;
      cut[row.token] = Math.floor(
        (characters * (NAME_END - box.x)) / box.width,
      );
    });
    if (Object.keys(cut).length > 0) setRooms(now => ({ ...now, ...cut }));
    const width = field.current?.getComputedTextLength() ?? 0;
    setCaret(64 + width + (scene.typed === "" ? 2 : 3));
    setMarks(
      labels.current.flatMap((label, row) =>
        label === null
          ? []
          : [
              ...label.querySelectorAll<SVGTSpanElement>("tspan[data-mark]"),
            ].map(part => {
              const x1 = part.getStartPositionOfChar(0).x;
              return { row, x1, x2: x1 + part.getComputedTextLength() };
            }),
      ),
    );
  }, [scene.typed, rows, rooms]);

  return (
    <g>
      <text
        ref={field}
        x={64}
        y={178}
        fontFamily="var(--sans)"
        fontSize={14}
        fill={INK}
      >
        {scene.typed}
      </text>
      <line
        className="diagram-caret"
        data-typing={scene.typing ? "true" : undefined}
        x1={caret}
        y1={165}
        x2={caret}
        y2={183}
        stroke={INK}
        strokeWidth={1.25}
      />
      {scene.picked && rows.length > 0 && (
        <rect x={56} y={200} width={228} height={34} rx={2} fill="#eef2fd" />
      )}
      {rows.map((row, i) => (
        <g key={row.token}>
          <text
            ref={element => {
              labels.current[i] = element;
            }}
            x={64}
            y={214 + i * 36}
            fontFamily="var(--sans)"
            fontSize={11}
            fontWeight={600}
            fill={INK}
          >
            {fit(row.highlight, rooms[row.token]).map((part, j) => (
              <tspan key={j} data-mark={part.matched ? "true" : undefined}>
                {part.text}
              </tspan>
            ))}
          </text>
          <text
            x={64}
            y={230 + i * 36}
            fontFamily="var(--sans)"
            fontSize={10}
            fill={MUTED}
          >
            {row.related.addresses.items[0]?.label ?? ""}
          </text>
        </g>
      ))}
      {marks.map(mark => (
        <line
          key={`${mark.row}-${mark.x1}`}
          x1={mark.x1}
          y1={217 + mark.row * 36}
          x2={Math.min(mark.x2, 282)}
          y2={217 + mark.row * 36}
          stroke="#38a169"
          strokeWidth={1.5}
        />
      ))}
    </g>
  );
}

export function ArchitectureDiagram({ paused = false }: { paused?: boolean }) {
  const svg = useRef<SVGSVGElement>(null);
  const { scene, travels } = usePlay(svg, paused);
  return (
    <svg
      ref={svg}
      viewBox="0 0 1120 500"
      role="img"
      aria-labelledby="arch-title arch-desc"
      className="diagram"
    >
      <title id="arch-title">
        How the SDK fits between your page, your backend and Baselayer
      </title>
      <desc id="arch-desc">
        The browser runs the SDK. It asks your backend&apos;s mint endpoint for
        a session; your backend mints it from Baselayer with your API key and
        the page&apos;s Origin. Keystrokes then go from the browser straight to
        Baselayer&apos;s autocomplete tier with the session in a header,
        bypassing your backend. On pick, your form carries the business token to
        your backend, which sends it with its search.
      </desc>
      <defs>
        <marker
          id="arch-head"
          viewBox="0 0 10 10"
          refX={9}
          refY={5}
          markerWidth={8}
          markerHeight={8}
          orient="auto-start-reverse"
        >
          <path d="M0 0 L10 5 L0 10 z" fill={BLUE} />
        </marker>
        <marker
          id="arch-head-return"
          viewBox="0 0 10 10"
          refX={9}
          refY={5}
          markerWidth={7}
          markerHeight={7}
          orient="auto-start-reverse"
        >
          <path d="M0 0 L10 5 L0 10 z" fill={RETURN} />
        </marker>
      </defs>

      <Zone x={0} title="THE BROWSER" host="app.example.com" fill="#ffffff" />
      <Zone x={390} title="YOUR BACKEND" host="your server" fill="#f7f9fe" />
      <Zone x={780} title="BASELAYER" host="api.baselayer.com" fill="#e9f0fc" />

      {/* Your page, with the SDK and your form on it. */}
      <rect
        x={20}
        y={62}
        width={300}
        height={422}
        rx={3}
        fill="#ffffff"
        stroke={LINE}
      />
      <line x1={20} y1={86} x2={320} y2={86} stroke={LINE} />
      {[34, 46, 58].map(cx => (
        <circle key={cx} cx={cx} cy={74} r={3.5} fill="#d6deee" />
      ))}
      <text x={72} y={78} fontFamily="var(--mono)" fontSize={10.5} fill={MUTED}>
        app.example.com/onboarding
      </text>

      <rect
        x={36}
        y={102}
        width={268}
        height={236}
        rx={2}
        fill="#f1f6fd"
        stroke={BLUE}
      />
      <text x={52} y={126} fontFamily="var(--mono)" fontSize={12.5} fill={BLUE}>
        {"<BusinessAutocomplete />"}
      </text>
      <text x={52} y={144} fontFamily="var(--sans)" fontSize={12} fill={MUTED}>
        @baselayer-sdk/autocomplete/react
      </text>
      <rect
        x={52}
        y={156}
        width={236}
        height={34}
        rx={3}
        fill="#ffffff"
        stroke={BLUE}
      />
      {scene === null && (
        <>
          <text
            x={64}
            y={178}
            fontFamily="var(--sans)"
            fontSize={14}
            fill={INK}
          >
            harbor concrete pum
          </text>
          <line
            x1={204}
            y1={165}
            x2={204}
            y2={183}
            stroke={INK}
            strokeWidth={1.25}
          />
        </>
      )}
      <rect
        x={52}
        y={194}
        width={236}
        height={78}
        rx={3}
        fill="#ffffff"
        stroke="#dce5f5"
      />
      {scene !== null && <PlayingField scene={scene} />}
      {scene === null && (
        <>
          <text
            x={64}
            y={214}
            fontFamily="var(--sans)"
            fontSize={11}
            fontWeight={600}
            fill={INK}
          >
            HARBOR CONCRETE PUMPING CO., INC.
          </text>
          <line
            x1={64}
            y1={217}
            x2={201}
            y2={217}
            stroke="#38a169"
            strokeWidth={1.5}
          />
          <text
            x={64}
            y={230}
            fontFamily="var(--sans)"
            fontSize={10}
            fill={MUTED}
          >
            1200 River Rd, Pittsburgh, PA 15212
          </text>
          <text
            x={64}
            y={250}
            fontFamily="var(--sans)"
            fontSize={11}
            fontWeight={600}
            fill={INK}
          >
            HARBOR CONCRETE SUPPLY, INC.
          </text>
          <line
            x1={64}
            y1={253}
            x2={201}
            y2={253}
            stroke="#38a169"
            strokeWidth={1.5}
          />
          <text
            x={64}
            y={266}
            fontFamily="var(--sans)"
            fontSize={10}
            fill={MUTED}
          >
            15 Ferry St, Newark, NJ 07105
          </text>
        </>
      )}
      <text
        x={52}
        y={298}
        fontFamily="var(--mono)"
        fontSize={10.5}
        letterSpacing="0.06em"
        fill={MUTED}
      >
        SESSION · REFRESH · BACKOFF
      </text>
      <text
        x={52}
        y={318}
        fontFamily="var(--mono)"
        fontSize={10.5}
        letterSpacing="0.06em"
        fill={MUTED}
      >
        EVERY REFUSAL HANDLED
      </text>

      <rect
        x={36}
        y={358}
        width={268}
        height={110}
        rx={2}
        fill="#ffffff"
        stroke={LINE}
      />
      <text x={52} y={382} fontFamily="var(--mono)" fontSize={12.5} fill={INK}>
        your form
      </text>
      <text
        x={52}
        y={402}
        fontFamily="var(--sans)"
        fontSize={12.5}
        fill={MUTED}
      >
        the name, plus the row&apos;s business_token
      </text>
      <rect
        x={52}
        y={420}
        width={92}
        height={30}
        rx={2}
        fill={scene?.pressed === true ? "#2a3cc4" : BLUE}
      />
      <text
        x={98}
        y={439}
        textAnchor="middle"
        fontFamily="var(--mono)"
        fontSize={11}
        letterSpacing="0.06em"
        fill="#ffffff"
      >
        SUBMIT
      </text>

      {/* Your backend. */}
      <Box
        x={410}
        y={112}
        h={108}
        title="POST /api/ac-session"
        lines={["Your route, behind your own login"]}
      />
      <rect
        x={426}
        y={170}
        width={268}
        height={32}
        rx={2}
        fill="#f1f6fd"
        stroke={LINE}
      />
      <g
        transform="translate(438 178)"
        stroke={BLUE}
        strokeWidth={1.5}
        fill="none"
      >
        <circle cx={5} cy={8} r={4} />
        <path d="M9 8 H18 M15 8 V11 M18 8 V12" />
      </g>
      <text
        x={464}
        y={191}
        fontFamily="var(--mono)"
        fontSize={11}
        letterSpacing="0.04em"
        fill={INK}
      >
        BASELAYER_API_KEY STAYS HERE
      </text>

      <text
        x={560}
        y={268}
        textAnchor="middle"
        fontFamily="var(--mono)"
        fontSize={10.5}
        letterSpacing="0.05em"
        fill={BLUE}
      >
        KEYSTROKES GO STRAIGHT TO BASELAYER
      </text>
      <text
        x={560}
        y={326}
        textAnchor="middle"
        fontFamily="var(--mono)"
        fontSize={10.5}
        letterSpacing="0.05em"
        fill={MUTED}
      >
        NO COOKIES · NO KEY · NOT THROUGH HERE
      </text>

      <Box
        x={410}
        y={372}
        h={96}
        title="your search handler"
        lines={["Adds the token to its search call"]}
        tag="X-API-KEY FROM YOUR SERVER"
      />

      {/* Baselayer. */}
      <Box
        x={800}
        y={112}
        h={108}
        title="POST /autocomplete/sessions"
        lines={["Mints a session bound to the", "page's Origin"]}
        tag="201 · MINUTES LONG · BUDGETED"
      />
      <Box
        x={800}
        y={248}
        h={80}
        title="GET /autocomplete/businesses"
        lines={["Rows for every keystroke"]}
      />
      <Box
        x={800}
        y={372}
        h={96}
        title="POST /searches"
        lines={["Resolves to exactly the business", "that was picked"]}
      />

      {/* The requests and answers in the air, under the lines they ride. */}
      {travels.map(travel => (
        <Blob key={travel.id} travel={travel} />
      ))}

      {/* The hops. */}
      <Arrow x1={304} x2={408} y={146} />
      <Arrow x1={408} x2={306} y={178} dashed />
      <Badge x={365} y={146} n={1} />

      <Arrow x1={712} x2={798} y={146} />
      <Arrow x1={798} x2={714} y={178} dashed />
      <Badge x={755} y={146} n={2} />

      <Arrow x1={304} x2={798} y={284} />
      <Arrow x1={798} x2={306} y={304} dashed />
      <Badge x={365} y={284} n={3} />

      <Arrow x1={304} x2={408} y={420} />
      <Badge x={365} y={420} n={4} />

      <Arrow x1={712} x2={798} y={420} />
      <Arrow x1={798} x2={714} y={448} dashed />
      <Badge x={755} y={420} n={5} />
    </svg>
  );
}
