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
  { kind: "phase", label: "Typing: from 3 characters, after 250 ms" },
  {
    kind: "message",
    from: "browser",
    to: "baselayer",
    label: "GET /autocomplete/businesses?q=howard+concrete+pum",
    detail:
      "X-Autocomplete-Session · credentials: omit · never via your backend",
  },
  {
    kind: "message",
    from: "baselayer",
    to: "browser",
    label: "200 { found: 9, suggestions: [ … ] }",
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

/** Text that stays legible where it crosses a lifeline. */
const halo = (fill: string) => ({
  stroke: fill,
  strokeWidth: 7,
  strokeLinejoin: "round" as const,
  paintOrder: "stroke" as const,
});

function laneFill(x: number): string {
  const index = Math.min(2, Math.floor(x / LANE_WIDTH));
  return LANES[index]!.fill;
}

export function RequestFlow() {
  let y = HEADER + 10;
  const rows = STEPS.map(step => {
    const top = y;
    y += ROW[step.kind];
    return { step, top };
  });
  const height = y + 20;

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
          <line
            x1={CENTER[lane.lane]}
            y1={HEADER}
            x2={CENTER[lane.lane]}
            y2={height - 12}
            stroke="#b9c8e6"
            strokeDasharray="3 5"
          />
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
                  style={halo(LANES[0]!.fill)}
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
            const fill = laneFill(mid);
            return (
              <g key={index}>
                <text
                  x={mid}
                  y={lineY - 10}
                  textAnchor="middle"
                  fontFamily="var(--mono)"
                  fontSize={12.5}
                  fill={step.reply ? "#3d4a6b" : INK}
                  style={halo(fill)}
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
                    style={halo(fill)}
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
