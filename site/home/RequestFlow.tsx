// The same integration as a sequence: three swim lanes, one row per message,
// laid out from the list below rather than placed by hand.

type Lane = "browser" | "backend" | "baselayer";

type Step =
  | { kind: "phase"; label: string }
  | {
      kind: "message";
      from: Lane;
      to: Lane;
      label: string;
      detail?: string;
      reply?: boolean;
    }
  | { kind: "note"; lane: Lane; label: string; detail?: string }
  | { kind: "ref"; label: string; detail: string };

const STEPS: Step[] = [
  { kind: "phase", label: "The field gets focus: prewarm" },
  {
    kind: "message",
    from: "browser",
    to: "backend",
    label: "POST /api/ac-session",
    detail: "your cookie rides along (credentials: same-origin)",
  },
  {
    kind: "message",
    from: "backend",
    to: "baselayer",
    label: "POST /autocomplete/sessions",
    detail: "X-API-Key · Origin: https://app.example.com",
  },
  {
    kind: "message",
    from: "baselayer",
    to: "backend",
    label: "201 { session_token, expires_in: 180, … }",
    detail: "bound to that Origin, with its own request budget",
    reply: true,
  },
  {
    kind: "message",
    from: "backend",
    to: "browser",
    label: "201, passed through unchanged",
    detail: "status, body and Retry-After as Baselayer sent them",
    reply: true,
  },
  { kind: "phase", label: "As someone types" },
  {
    kind: "message",
    from: "browser",
    to: "baselayer",
    label: "GET /autocomplete/businesses?q=harbor+concrete+pum",
    detail:
      "X-Autocomplete-Session · credentials: omit · never via your backend",
  },
  {
    kind: "message",
    from: "baselayer",
    to: "browser",
    label: "200 { found: 27, suggestions: [ … ] }",
    detail: "X-Autocomplete-Index · Server-Timing",
    reply: true,
  },
  {
    kind: "note",
    lane: "browser",
    label: "A newer keystroke aborts the older request",
    detail: "the rows on screen stay until the next answer lands",
  },
  { kind: "phase", label: "Past 80 % of the session's life" },
  {
    kind: "ref",
    label: "The next keystroke mints a fresh session first: the prewarm again",
    detail:
      "Nobody sees an expiry mid-word. If the refresh fails, the old session keeps serving until it expires.",
  },
  { kind: "phase", label: "Pick, then submit" },
  {
    kind: "note",
    lane: "browser",
    label: "onPick(suggestion, { businessToken })",
    detail: "the token is good for 15 minutes",
  },
  {
    kind: "message",
    from: "browser",
    to: "backend",
    label: "your form: name + business_token",
  },
  {
    kind: "message",
    from: "backend",
    to: "baselayer",
    label: "POST /searches",
    detail: "{ name, business_token } · X-API-Key",
  },
  {
    kind: "message",
    from: "baselayer",
    to: "backend",
    label: "the search, pinned to that business",
    reply: true,
  },
];

const WIDTH = 1120;
const LANE_WIDTH = WIDTH / 3;
const CENTER: Record<Lane, number> = {
  browser: LANE_WIDTH / 2,
  backend: LANE_WIDTH * 1.5,
  baselayer: LANE_WIDTH * 2.5,
};
const HEADER = 84;
const ROW: Record<Step["kind"], number> = {
  phase: 46,
  message: 64,
  note: 70,
  ref: 84,
};

const BLUE = "#384ce3";
const INK = "#1c1b1c";
const MUTED = "#676b76";
const RETURN = "#7b8db3";
const LANES: { lane: Lane; title: string; host: string; fill: string }[] = [
  {
    lane: "browser",
    title: "THE BROWSER",
    host: "your page + the SDK",
    fill: "#ffffff",
  },
  {
    lane: "backend",
    title: "YOUR BACKEND",
    host: "one small endpoint",
    fill: "#f7f9fe",
  },
  {
    lane: "baselayer",
    title: "BASELAYER",
    host: "api.baselayer.com",
    fill: "#e9f0fc",
  },
];

/**
 * How wide a label draws, for keeping lifelines out from under it. Geist
 * Mono advances 0.6 em a glyph; Uncut Sans averages under 0.55 em, so that
 * errs wide.
 */
function textWidth(
  text: string,
  size: number,
  mono: boolean,
  tracking = 0,
): number {
  const glyphs = [...text].length;
  return (
    glyphs * size * (mono ? 0.6 : 0.55) +
    Math.max(0, glyphs - 1) * size * tracking
  );
}

interface Box {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

/** The boxes a row's labels occupy; lifelines break where they pass. */
function labelBoxes(step: Step, top: number): Box[] {
  switch (step.kind) {
    case "phase": {
      const w = textWidth(step.label, 11.5, true, 0.08);
      return [{ x0: 14, x1: 26 + w, y0: top + 20, y1: top + 40 }];
    }
    case "message": {
      const mid = (CENTER[step.from] + CENTER[step.to]) / 2;
      const lineY = top + 34;
      const boxes: Box[] = [];
      const w = textWidth(step.label, 12.5, true);
      boxes.push({
        x0: mid - w / 2 - 8,
        x1: mid + w / 2 + 8,
        y0: lineY - 26,
        y1: lineY - 4,
      });
      if (step.detail !== undefined) {
        const d = textWidth(step.detail, 12.5, false);
        boxes.push({
          x0: mid - d / 2 - 8,
          x1: mid + d / 2 + 8,
          y0: lineY + 5,
          y1: lineY + 25,
        });
      }
      return boxes;
    }
    case "note":
    case "ref":
      // Drawn as white boxes over the lifelines already.
      return [];
  }
}

/** A lifeline from `y0` to `y1`, broken wherever a label box covers `x`. */
function lifeline(
  x: number,
  y0: number,
  y1: number,
  boxes: Box[],
): [number, number][] {
  const gaps = boxes
    .filter(box => box.x0 <= x && x <= box.x1)
    .map(box => [box.y0, box.y1] as const)
    .sort((a, b) => a[0] - b[0]);
  const segments: [number, number][] = [];
  let from = y0;
  for (const [g0, g1] of gaps) {
    if (g0 > from) segments.push([from, g0]);
    from = Math.max(from, g1);
  }
  if (from < y1) segments.push([from, y1]);
  return segments;
}

export function RequestFlow() {
  let y = HEADER + 10;
  const rows = STEPS.map(step => {
    const top = y;
    y += ROW[step.kind];
    return { step, top };
  });
  const height = y + 20;
  const boxes = rows.flatMap(({ step, top }) => labelBoxes(step, top));

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${height}`}
      role="img"
      aria-labelledby="flow-title"
      className="diagram"
    >
      <title id="flow-title">
        The requests between the browser, your backend and Baselayer, from focus
        to submit
      </title>
      <defs>
        <marker
          id="flow-head"
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
          id="flow-head-return"
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

      {LANES.map((lane, i) => (
        <g key={lane.lane}>
          <rect
            x={i * LANE_WIDTH}
            y={0}
            width={LANE_WIDTH}
            height={height}
            fill={lane.fill}
          />
          <text
            x={CENTER[lane.lane]}
            y={34}
            textAnchor="middle"
            fontFamily="var(--mono)"
            fontSize={13}
            letterSpacing="0.08em"
            fill={INK}
          >
            {lane.title}
          </text>
          <text
            x={CENTER[lane.lane]}
            y={56}
            textAnchor="middle"
            fontFamily="var(--sans)"
            fontSize={13}
            fill={MUTED}
          >
            {lane.host}
          </text>
          {lifeline(CENTER[lane.lane], HEADER, height - 12, boxes).map(
            ([y0, y1]) => (
              <line
                key={y0}
                x1={CENTER[lane.lane]}
                y1={y0}
                x2={CENTER[lane.lane]}
                y2={y1}
                stroke="#b9c8e6"
                strokeDasharray="3 5"
              />
            ),
          )}
        </g>
      ))}
      <line
        x1={0}
        y1={HEADER - 12}
        x2={WIDTH}
        y2={HEADER - 12}
        stroke="#dce5f5"
      />

      {rows.map(({ step, top }, index) => {
        switch (step.kind) {
          case "phase":
            return (
              <g key={index}>
                <line
                  x1={16}
                  y1={top + 14}
                  x2={WIDTH - 16}
                  y2={top + 14}
                  stroke="#dce5f5"
                />
                <text
                  x={20}
                  y={top + 34}
                  fontFamily="var(--mono)"
                  fontSize={11.5}
                  letterSpacing="0.08em"
                  fill={BLUE}
                >
                  {step.label.toUpperCase()}
                </text>
              </g>
            );
          case "message": {
            const x1 = CENTER[step.from];
            const x2 = CENTER[step.to];
            const direction = x2 > x1 ? 1 : -1;
            const mid = (x1 + x2) / 2;
            const lineY = top + 34;
            return (
              <g key={index}>
                <text
                  x={mid}
                  y={lineY - 10}
                  textAnchor="middle"
                  fontFamily="var(--mono)"
                  fontSize={12.5}
                  fill={step.reply ? "#3d4a6b" : INK}
                >
                  {step.label}
                </text>
                <line
                  x1={x1 + direction * 4}
                  y1={lineY}
                  x2={x2 - direction * 6}
                  y2={lineY}
                  stroke={step.reply ? RETURN : BLUE}
                  strokeWidth={step.reply ? 1.5 : 1.75}
                  strokeDasharray={step.reply ? "5 5" : undefined}
                  markerEnd={
                    step.reply ? "url(#flow-head-return)" : "url(#flow-head)"
                  }
                />
                <circle
                  cx={x1}
                  cy={lineY}
                  r={3.5}
                  fill={step.reply ? RETURN : BLUE}
                />
                {step.detail !== undefined && (
                  <text
                    x={mid}
                    y={lineY + 19}
                    textAnchor="middle"
                    fontFamily="var(--sans)"
                    fontSize={12.5}
                    fill={MUTED}
                  >
                    {step.detail}
                  </text>
                )}
              </g>
            );
          }
          case "note": {
            const cx = CENTER[step.lane];
            return (
              <g key={index}>
                <rect
                  x={cx - 170}
                  y={top + 8}
                  width={340}
                  height={52}
                  rx={2}
                  fill="#ffffff"
                  stroke="#9fb8e6"
                />
                <text
                  x={cx}
                  y={top + 29}
                  textAnchor="middle"
                  fontFamily="var(--mono)"
                  fontSize={12}
                  fill={INK}
                >
                  {step.label}
                </text>
                {step.detail !== undefined && (
                  <text
                    x={cx}
                    y={top + 48}
                    textAnchor="middle"
                    fontFamily="var(--sans)"
                    fontSize={12.5}
                    fill={MUTED}
                  >
                    {step.detail}
                  </text>
                )}
              </g>
            );
          }
          case "ref":
            return (
              <g key={index}>
                <rect
                  x={40}
                  y={top + 8}
                  width={WIDTH - 80}
                  height={66}
                  rx={2}
                  fill="#ffffff"
                  stroke={BLUE}
                  strokeDasharray="6 4"
                />
                <rect x={40} y={top + 8} width={46} height={22} fill={BLUE} />
                <text
                  x={63}
                  y={top + 23}
                  textAnchor="middle"
                  fontFamily="var(--mono)"
                  fontSize={10.5}
                  letterSpacing="0.08em"
                  fill="#ffffff"
                >
                  REF
                </text>
                <text
                  x={WIDTH / 2}
                  y={top + 36}
                  textAnchor="middle"
                  fontFamily="var(--mono)"
                  fontSize={12.5}
                  fill={INK}
                >
                  {step.label}
                </text>
                <text
                  x={WIDTH / 2}
                  y={top + 58}
                  textAnchor="middle"
                  fontFamily="var(--sans)"
                  fontSize={12.5}
                  fill={MUTED}
                >
                  {step.detail}
                </text>
              </g>
            );
        }
      })}
    </svg>
  );
}
