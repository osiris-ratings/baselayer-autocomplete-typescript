// Where each piece runs and which hop carries what. Numbers match the list
// under the figure. Drawn at 1120 x 500 and scaled; below that width the
// figure scrolls sideways rather than shrinking its text away.

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

export function ArchitectureDiagram() {
  return (
    <svg
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
        @baselayer/autocomplete/react
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
      <text x={64} y={178} fontFamily="var(--sans)" fontSize={14} fill={INK}>
        howard concrete pum
      </text>
      <line
        x1={204}
        y1={165}
        x2={204}
        y2={183}
        stroke={INK}
        strokeWidth={1.25}
      />
      <rect
        x={52}
        y={194}
        width={236}
        height={78}
        rx={3}
        fill="#ffffff"
        stroke="#dce5f5"
      />
      <text
        x={64}
        y={214}
        fontFamily="var(--sans)"
        fontSize={11}
        fontWeight={600}
        fill={INK}
      >
        HOWARD CONCRETE PUMPING CO., INC.
      </text>
      <line
        x1={64}
        y1={217}
        x2={201}
        y2={217}
        stroke="#38a169"
        strokeWidth={1.5}
      />
      <text x={64} y={230} fontFamily="var(--sans)" fontSize={10} fill={MUTED}>
        2327 Hill Church Houston Rd, Canonsburg, PA
      </text>
      <text
        x={64}
        y={250}
        fontFamily="var(--sans)"
        fontSize={11}
        fontWeight={600}
        fill={INK}
      >
        HOWARD CONCRETE PUMPING, INC.
      </text>
      <line
        x1={64}
        y1={253}
        x2={201}
        y2={253}
        stroke="#38a169"
        strokeWidth={1.5}
      />
      <text x={64} y={266} fontFamily="var(--sans)" fontSize={10} fill={MUTED}>
        2327 Hill Church Houston Rd, Canonsburg, PA
      </text>
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
      <rect x={52} y={420} width={92} height={30} rx={2} fill={BLUE} />
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
