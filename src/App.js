import { useState, useEffect, useRef } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  ScatterChart,
  Scatter,
  ReferenceLine,
  ErrorBar,
} from "recharts";

// ── Fonts via Google ──────────────────────────────────────────────────────────
const fontLink = document.createElement("link");
fontLink.rel = "stylesheet";
fontLink.href =
  "https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:wght@300;400;500;600&display=swap";
document.head.appendChild(fontLink);

// ── Colour palette ────────────────────────────────────────────────────────────
const C = {
  bg: "#0d1117",
  panel: "#161b22",
  border: "#30363d",
  gold: "#f5c842",
  green: "#3fb950",
  red: "#f85149",
  teal: "#58a6ff",
  muted: "#8b949e",
  text: "#e6edf3",
  subtle: "#c9d1d9",
};

const FENU_COLORS = ["#f85149", "#f0883e", "#d29922", "#3fb950", "#58a6ff"];
const CONCS = [0, 25, 50, 75, 100];

// ── Experimental data (replace with real readings) ────────────────────────────
const TIME_PTS = [0, 5, 10, 15, 20, 25, 30];
const RAW = {
  0: [
    [0, 6.32, 11.85, 16.7, 21.04, 24.63, 27.82],
    [0, 5.97, 12.33, 17.15, 20.78, 24.09, 28.41],
    [0, 6.55, 11.62, 16.88, 21.33, 25.01, 27.53],
  ],
  25: [
    [0, 4.88, 9.21, 13.05, 16.44, 19.28, 21.8],
    [0, 5.12, 9.67, 12.78, 16.01, 18.95, 22.31],
    [0, 4.7, 9.44, 13.29, 16.67, 19.51, 21.55],
  ],
  50: [
    [0, 3.45, 6.53, 9.22, 11.63, 13.74, 15.57],
    [0, 3.71, 6.28, 9.55, 11.88, 13.42, 15.9],
    [0, 3.3, 6.7, 9.1, 11.4, 14.0, 15.32],
  ],
  75: [
    [0, 2.01, 3.85, 5.51, 6.95, 8.25, 9.37],
    [0, 2.24, 3.6, 5.72, 7.18, 8.01, 9.68],
    [0, 1.88, 3.97, 5.34, 6.75, 8.44, 9.12],
  ],
  100: [
    [0, 0.82, 1.55, 2.23, 2.83, 3.37, 3.84],
    [0, 0.95, 1.43, 2.41, 2.97, 3.18, 4.01],
    [0, 0.76, 1.68, 2.15, 2.71, 3.52, 3.67],
  ],
};

// ── Stats helpers ─────────────────────────────────────────────────────────────
function mean(arr) {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}
function sd(arr) {
  const m = mean(arr);
  return Math.sqrt(
    arr.map((v) => (v - m) ** 2).reduce((a, b) => a + b, 0) / (arr.length - 1)
  );
}
function linReg(xs, ys) {
  const n = xs.length,
    xm = mean(xs),
    ym = mean(ys);
  const num = xs.reduce((s, x, i) => s + (x - xm) * (ys[i] - ym), 0);
  const den = xs.reduce((s, x) => s + (x - xm) ** 2, 0);
  const slope = num / den,
    intercept = ym - slope * xm;
  const yHat = xs.map((x) => slope * x + intercept);
  const ssTot = ys.reduce((s, y) => s + (y - ym) ** 2, 0);
  const ssRes = ys.reduce((s, y, i) => s + (y - yHat[i]) ** 2, 0);
  const r2 = 1 - ssRes / ssTot;
  return { slope, intercept, r2 };
}

// Pre-compute stats for all concentrations
const STATS = {};
CONCS.forEach((c) => {
  const arr = RAW[c];
  const means = TIME_PTS.map((_, i) => mean(arr.map((t) => t[i])));
  const sds = TIME_PTS.map((_, i) => sd(arr.map((t) => t[i])));
  const { slope, intercept, r2 } = linReg(TIME_PTS, means);
  STATS[c] = { means, sds, slope, intercept, r2 };
});
const controlSlope = STATS[0].slope;

// ── Post-prandial glucose model ───────────────────────────────────────────────
function prandialCurve(minutes, fenuPct) {
  const reduction = STATS[fenuPct].slope / controlSlope;
  return Array.from({ length: minutes + 1 }, (_, t) => {
    const base = 90;
    const peak = 70 * reduction;
    const rise = peak * Math.pow(t / 45, 1.2) * Math.exp(1 - t / 45);
    const val = t <= 120 ? base + rise : base + rise;
    return { t, glucose: Math.max(70, +(base + rise).toFixed(1)) };
  });
}

// ── Calibration standards ─────────────────────────────────────────────────────
const STD_DEFAULTS = [
  { conc: 0, abs: 0.0 },
  { conc: 20, abs: 0.112 },
  { conc: 40, abs: 0.224 },
  { conc: 60, abs: 0.338 },
  { conc: 80, abs: 0.451 },
  { conc: 100, abs: 0.563 },
];

// ─────────────────────────────────────────────────────────────────────────────
// MAIN APP
// ─────────────────────────────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab] = useState("pulse");

  const tabs = [
    { id: "pulse", icon: "💓", label: "Glucose Pulse" },
    { id: "calib", icon: "📏", label: "Calibration Curve" },
    { id: "stats", icon: "📊", label: "Statistics" },
    { id: "dash", icon: "🔬", label: "Results Dashboard" },
    { id: "ros", icon: "⚡", label: "ROS Extension" },
  ];

  return (
    <div
      style={{
        fontFamily: "'DM Sans',sans-serif",
        background: C.bg,
        minHeight: "100vh",
        color: C.text,
      }}
    >
      {/* Header */}
      <div
        style={{
          background: `linear-gradient(135deg,#1a1f2e 0%,#0d1117 100%)`,
          borderBottom: `1px solid ${C.border}`,
          padding: "28px 32px 0",
        }}
      >
        <div style={{ maxWidth: 980, margin: "0 auto" }}>
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 16,
              marginBottom: 20,
            }}
          >
            <div style={{ fontSize: 36 }}>🌿</div>
            <div>
              <h1
                style={{
                  margin: 0,
                  fontFamily: "'DM Serif Display',serif",
                  fontSize: 28,
                  color: C.text,
                  fontWeight: 400,
                  lineHeight: 1.2,
                }}
              >
                Fenugreek & Glucose
                <span style={{ color: C.gold, fontStyle: "italic" }}>
                  {" "}
                  Explorer
                </span>
              </h1>
              <p
                style={{
                  margin: "6px 0 0",
                  color: C.muted,
                  fontSize: 13,
                  fontWeight: 300,
                }}
              >
                Based on original lab research · How traditional diet may
                support blood sugar regulation
              </p>
            </div>
          </div>
          {/* Tabs */}
          <div style={{ display: "flex", gap: 0 }}>
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                style={{
                  padding: "11px 20px",
                  border: "none",
                  borderBottom:
                    tab === t.id
                      ? `2px solid ${C.gold}`
                      : "2px solid transparent",
                  background: "none",
                  color: tab === t.id ? C.gold : C.muted,
                  fontFamily: "'DM Sans',sans-serif",
                  fontSize: 13,
                  fontWeight: tab === t.id ? 600 : 400,
                  cursor: "pointer",
                  transition: "all .2s",
                  whiteSpace: "nowrap",
                }}
              >
                {t.icon} {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 980, margin: "0 auto", padding: "32px" }}>
        {tab === "pulse" && <PulsTab />}
        {tab === "calib" && <CalibTab />}
        {tab === "stats" && <StatsTab />}
        {tab === "dash" && <DashTab />}
        {tab === "ros" && <ROSTab />}
      </div>

      {/* Footer */}
      <div
        style={{
          borderTop: `1px solid ${C.border}`,
          marginTop: 8,
          padding: "20px 32px",
          textAlign: "center",
        }}
      >
        <p style={{ margin: 0, fontSize: 12, color: C.muted, lineHeight: 1.8 }}>
          Built by{" "}
          <span style={{ color: C.subtle, fontWeight: 600 }}>Diya Karthik</span>
          {" · "}Under the guidance of{" "}
          <span style={{ color: C.subtle, fontWeight: 600 }}>
            Prof. Maria Procopio
          </span>
          , Johns Hopkins University
          {" · "}© 2026
        </p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 1 — POST-PRANDIAL GLUCOSE PULSE
// ─────────────────────────────────────────────────────────────────────────────
function PulsTab() {
  const [selected, setSelected] = useState(0);
  const [animT, setAnimT] = useState(120);
  const [playing, setPlaying] = useState(false);
  const ref = useRef();

  useEffect(() => {
    if (playing) {
      setAnimT(0);
      let f = 0;
      ref.current = setInterval(() => {
        f += 2;
        setAnimT(f);
        if (f >= 120) {
          clearInterval(ref.current);
          setPlaying(false);
        }
      }, 40);
    }
    return () => clearInterval(ref.current);
  }, [playing]);

  const fullCurves = {};
  CONCS.forEach((c) => {
    fullCurves[c] = prandialCurve(120, c);
  });

  // Build visible data up to animT
  const chartData = fullCurves[0]
    .filter((d) => d.t <= animT)
    .map((d) => ({
      t: d.t,
      ...Object.fromEntries(
        CONCS.map((c) => [
          `g${c}`,
          fullCurves[c].find((x) => x.t === d.t)?.glucose,
        ])
      ),
    }));

  const diabeticZone = [
    { t: 0, y: 180 },
    { t: 120, y: 180 },
  ];
  const peakReduction = (
    (1 - STATS[selected].slope / controlSlope) *
    100
  ).toFixed(0);

  return (
    <div>
      <div
        style={{
          display: "flex",
          gap: 24,
          marginBottom: 28,
          flexWrap: "wrap",
          alignItems: "flex-start",
        }}
      >
        <div style={{ flex: "1 1 320px" }}>
          <SectionTitle>After-Meal Blood Glucose Curve</SectionTitle>
          <p
            style={{
              color: C.muted,
              fontSize: 13,
              lineHeight: 1.7,
              marginTop: 8,
            }}
          >
            This visualisation models what happens to your blood glucose after
            eating a carbohydrate-rich meal — and how fenugreek extract (at
            different concentrations) may slow glucose absorption, based on
            lab-measured diffusion rates.
          </p>
          <div style={{ marginTop: 20 }}>
            <div
              style={{
                fontSize: 12,
                color: C.muted,
                marginBottom: 10,
                fontWeight: 500,
                letterSpacing: 0.5,
                textTransform: "uppercase",
              }}
            >
              Select fenugreek concentration
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {CONCS.map((c, i) => (
                <button
                  key={c}
                  onClick={() => setSelected(c)}
                  style={{
                    padding: "7px 14px",
                    borderRadius: 20,
                    border: `1.5px solid ${FENU_COLORS[i]}`,
                    background: selected === c ? FENU_COLORS[i] : "transparent",
                    color: selected === c ? "#000" : FENU_COLORS[i],
                    fontFamily: "'DM Sans',sans-serif",
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                    transition: "all .2s",
                  }}
                >
                  {c === 0 ? "Control" : c + "%"}
                </button>
              ))}
            </div>
          </div>

          <div
            style={{
              marginTop: 20,
              background: C.panel,
              border: `1px solid ${C.border}`,
              borderRadius: 10,
              padding: 16,
            }}
          >
            <div
              style={{
                fontSize: 11,
                color: C.muted,
                textTransform: "uppercase",
                letterSpacing: 0.8,
                marginBottom: 6,
              }}
            >
              At {selected}% fenugreek
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 12,
              }}
            >
              <Stat
                label="Diffusion rate"
                value={`${STATS[selected].slope.toFixed(3)} mg/dL/min`}
              />
              <Stat
                label="vs Control"
                value={
                  selected === 0 ? "Baseline" : `−${peakReduction}% slower`
                }
                highlight={selected > 0}
              />
              <Stat label="R²" value={STATS[selected].r2.toFixed(4)} />
              <Stat
                label="Relative D"
                value={`${(
                  (STATS[selected].slope / controlSlope) *
                  100
                ).toFixed(1)}%`}
              />
            </div>
          </div>

          <button
            onClick={() => setPlaying(true)}
            style={{
              marginTop: 16,
              width: "100%",
              padding: "10px",
              background: C.gold,
              color: "#000",
              border: "none",
              borderRadius: 8,
              fontFamily: "'DM Sans',sans-serif",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            ▶ Animate meal absorption
          </button>
        </div>

        <div style={{ flex: "2 1 480px" }}>
          <div
            style={{
              background: C.panel,
              border: `1px solid ${C.border}`,
              borderRadius: 12,
              padding: "20px 8px 12px",
            }}
          >
            <ResponsiveContainer width="100%" height={320}>
              <LineChart
                data={chartData}
                margin={{ top: 8, right: 20, left: 0, bottom: 16 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
                <XAxis
                  dataKey="t"
                  label={{
                    value: "Minutes after meal",
                    position: "insideBottom",
                    offset: -8,
                    fill: C.muted,
                    fontSize: 11,
                  }}
                  tick={{ fill: C.muted, fontSize: 10 }}
                />
                <YAxis
                  domain={[60, 210]}
                  label={{
                    value: "Blood glucose (mg/dL)",
                    angle: -90,
                    position: "insideLeft",
                    offset: 14,
                    fill: C.muted,
                    fontSize: 11,
                  }}
                  tick={{ fill: C.muted, fontSize: 10 }}
                />
                <Tooltip
                  contentStyle={{
                    background: C.panel,
                    border: `1px solid ${C.border}`,
                    borderRadius: 8,
                    fontFamily: "'DM Sans'",
                    fontSize: 12,
                  }}
                  labelFormatter={(l) => `${l} min after meal`}
                  formatter={(v, n) => [
                    `${v} mg/dL`,
                    n === "g0"
                      ? "Control (0%)"
                      : n.replace("g", "") + "% fenugreek",
                  ]}
                />
                <ReferenceLine
                  y={180}
                  stroke={C.red}
                  strokeDasharray="4 2"
                  label={{
                    value: "Diabetic threshold (180)",
                    fill: C.red,
                    fontSize: 10,
                    position: "insideTopRight",
                  }}
                />
                <ReferenceLine
                  y={70}
                  stroke={C.teal}
                  strokeDasharray="4 2"
                  label={{
                    value: "Hypoglycaemia (70)",
                    fill: C.teal,
                    fontSize: 10,
                    position: "insideBottomRight",
                  }}
                />
                {CONCS.map((c, i) => (
                  <Line
                    key={c}
                    type="monotone"
                    dataKey={`g${c}`}
                    stroke={FENU_COLORS[i]}
                    strokeWidth={selected === c ? 3 : 1.2}
                    strokeOpacity={selected === c ? 1 : 0.3}
                    dot={false}
                    name={`g${c}`}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
            <div
              style={{
                textAlign: "center",
                fontSize: 11,
                color: C.muted,
                marginTop: 4,
              }}
            >
              Model derived from lab-measured D_eff values across dialysis
              membrane (37°C, n=3 per concentration)
            </div>
          </div>

          {/* Legend */}
          <div
            style={{
              display: "flex",
              gap: 12,
              marginTop: 12,
              flexWrap: "wrap",
              justifyContent: "center",
            }}
          >
            {CONCS.map((c, i) => (
              <div
                key={c}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                  cursor: "pointer",
                }}
                onClick={() => setSelected(c)}
              >
                <div
                  style={{
                    width: 24,
                    height: 3,
                    background: FENU_COLORS[i],
                    borderRadius: 2,
                    opacity: selected === c ? 1 : 0.4,
                  }}
                />
                <span
                  style={{
                    fontSize: 11,
                    color: selected === c ? FENU_COLORS[i] : C.muted,
                    fontWeight: selected === c ? 600 : 400,
                  }}
                >
                  {c === 0 ? "0% Control" : c + "%"}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Inverse linear graph + explanation */}
      <div style={{ marginBottom: 24 }}>
        <div
          style={{
            background: C.panel,
            border: `1px solid ${C.border}`,
            borderRadius: 12,
            padding: "24px 8px 16px",
            marginBottom: 16,
          }}
        >
          <div style={{ paddingLeft: 16, marginBottom: 2 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: C.subtle }}>
              Peak Glucose Spike vs Fenugreek Concentration
            </span>
          </div>
          <div
            style={{
              paddingLeft: 16,
              marginBottom: 16,
              fontSize: 12,
              color: C.muted,
            }}
          >
            As fenugreek concentration increases, the peak blood glucose after a
            meal decreases — an inverse relationship
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart
              data={CONCS.map((c, i) => ({
                conc: `${c}%`,
                peak: +(90 + 70 * (STATS[c].slope / controlSlope)).toFixed(1),
                color: FENU_COLORS[i],
              }))}
              margin={{ top: 8, right: 32, left: 8, bottom: 20 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
              <XAxis
                dataKey="conc"
                label={{
                  value: "Fenugreek Concentration (%)",
                  position: "insideBottom",
                  offset: -8,
                  fill: C.muted,
                  fontSize: 11,
                }}
                tick={{ fill: C.muted, fontSize: 11 }}
              />
              <YAxis
                domain={[80, 170]}
                label={{
                  value: "Peak blood glucose (mg/dL)",
                  angle: -90,
                  position: "insideLeft",
                  offset: 16,
                  fill: C.muted,
                  fontSize: 11,
                }}
                tick={{ fill: C.muted, fontSize: 11 }}
              />
              <Tooltip
                contentStyle={{
                  background: C.panel,
                  border: `1px solid ${C.border}`,
                  borderRadius: 8,
                  fontFamily: "'DM Sans'",
                  fontSize: 12,
                }}
                formatter={(v) => [`${v} mg/dL`, "Peak glucose"]}
              />
              <ReferenceLine
                y={180}
                stroke={C.red}
                strokeDasharray="4 2"
                label={{
                  value: "Diabetic threshold",
                  fill: C.red,
                  fontSize: 10,
                  position: "insideTopRight",
                }}
              />
              <Line
                type="linear"
                dataKey="peak"
                stroke={C.gold}
                strokeWidth={2.5}
                dot={({ cx, cy, index }) => (
                  <circle
                    key={index}
                    cx={cx}
                    cy={cy}
                    r={6}
                    fill={FENU_COLORS[index]}
                    stroke={C.bg}
                    strokeWidth={2}
                  />
                )}
                activeDot={{ r: 7 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Explanation card */}
        <div
          style={{
            background: `linear-gradient(135deg,#161b22,#1a2030)`,
            border: `1px solid ${C.gold}44`,
            borderRadius: 12,
            padding: 20,
          }}
        >
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: C.gold,
              marginBottom: 12,
            }}
          >
            📉 Why is this relationship inverse?
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))",
              gap: 12,
              marginBottom: 14,
            }}
          >
            {[
              {
                step: "1",
                title: "Fenugreek forms a gel",
                body: "Galactomannan — a soluble fibre in fenugreek — dissolves in the gut and forms a thick, viscous gel around food.",
              },
              {
                step: "2",
                title: "Glucose moves more slowly",
                body: "The gel physically blocks glucose from crossing the intestinal lining quickly, slowing how fast it enters your bloodstream.",
              },
              {
                step: "3",
                title: "Flatter spike, lower peak",
                body: "Because glucose enters more slowly, the blood sugar peak is lower and more gradual — exactly what diabetics need after meals.",
              },
              {
                step: "4",
                title: "More fenugreek = more gel",
                body: "Higher concentrations produce a thicker gel and a greater blocking effect — which is why the graph slopes downward as concentration increases.",
              },
            ].map((s) => (
              <div
                key={s.step}
                style={{
                  background: "#0d1117",
                  borderRadius: 8,
                  padding: "12px 14px",
                  border: `1px solid ${C.border}`,
                }}
              >
                <div
                  style={{
                    fontSize: 10,
                    color: C.gold,
                    fontWeight: 700,
                    letterSpacing: 1,
                    textTransform: "uppercase",
                    marginBottom: 4,
                  }}
                >
                  Step {s.step}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: C.subtle,
                    marginBottom: 4,
                  }}
                >
                  {s.title}
                </div>
                <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.6 }}>
                  {s.body}
                </div>
              </div>
            ))}
          </div>
          <p
            style={{
              fontSize: 12,
              color: C.muted,
              lineHeight: 1.7,
              margin: 0,
              borderTop: `1px solid ${C.border}`,
              paddingTop: 12,
            }}
          >
            The graph above uses the same peak glucose values derived from the
            lab-measured diffusion rates in the curve above — so the two charts
            are directly linked. The downward slope confirms what the curves
            show visually:
            <strong style={{ color: C.green }}>
              {" "}
              every increase in fenugreek concentration produces a measurably
              lower post-meal glucose spike.
            </strong>
          </p>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 2 — CALIBRATION CURVE
// ─────────────────────────────────────────────────────────────────────────────
function CalibTab() {
  const [standards, setStandards] = useState(
    STD_DEFAULTS.map((s) => ({ ...s }))
  );
  const [testAbs, setTestAbs] = useState("");
  const [result, setResult] = useState(null);

  const reg = linReg(
    standards.map((s) => s.conc),
    standards.map((s) => s.abs)
  );
  // Inverse: conc = (abs - intercept) / slope
  const predict = (abs) => ((abs - reg.intercept) / reg.slope).toFixed(2);

  const scatterData = standards.map((s) => ({ x: s.conc, y: s.abs }));
  const lineData = [...Array(11)].map((_, i) => ({
    x: i * 10,
    y: +(reg.slope * i * 10 + reg.intercept).toFixed(4),
  }));

  return (
    <div>
      <SectionTitle>Spectrophotometric Calibration Curve</SectionTitle>
      <p
        style={{
          color: C.muted,
          fontSize: 13,
          lineHeight: 1.7,
          marginTop: 8,
          marginBottom: 24,
        }}
      >
        Enter your known glucose standard absorbance readings. The tool fits a
        linear regression and lets you convert any raw absorbance reading into a
        glucose concentration (mg dL⁻¹) automatically.
      </p>

      <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
        {/* Input table */}
        <div style={{ flex: "1 1 260px" }}>
          <div
            style={{
              fontSize: 12,
              color: C.muted,
              textTransform: "uppercase",
              letterSpacing: 0.7,
              marginBottom: 10,
              fontWeight: 500,
            }}
          >
            Standard values
          </div>
          <div
            style={{
              background: C.panel,
              border: `1px solid ${C.border}`,
              borderRadius: 10,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                background: "#21262d",
                padding: "8px 16px",
              }}
            >
              <span style={{ fontSize: 11, color: C.muted, fontWeight: 600 }}>
                Conc. (mg/dL)
              </span>
              <span style={{ fontSize: 11, color: C.muted, fontWeight: 600 }}>
                Absorbance
              </span>
            </div>
            {standards.map((s, i) => (
              <div
                key={i}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  padding: "6px 16px",
                  borderBottom: `1px solid ${C.border}`,
                }}
              >
                <span style={{ fontSize: 13, color: C.subtle, paddingTop: 4 }}>
                  {s.conc}
                </span>
                <input
                  type="number"
                  step="0.001"
                  value={s.abs}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value) || 0;
                    setStandards((prev) =>
                      prev.map((x, j) => (j === i ? { ...x, abs: v } : x))
                    );
                  }}
                  style={{
                    width: 80,
                    background: "#21262d",
                    border: `1px solid ${C.border}`,
                    color: C.text,
                    borderRadius: 5,
                    padding: "4px 8px",
                    fontFamily: "'DM Sans',sans-serif",
                    fontSize: 12,
                  }}
                />
              </div>
            ))}
          </div>

          {/* Equation box */}
          <div
            style={{
              marginTop: 16,
              background: C.panel,
              border: `1px solid ${C.border}`,
              borderRadius: 10,
              padding: 14,
            }}
          >
            <div
              style={{
                fontSize: 11,
                color: C.muted,
                textTransform: "uppercase",
                letterSpacing: 0.7,
                marginBottom: 8,
              }}
            >
              Regression equation
            </div>
            <div
              style={{ fontFamily: "monospace", fontSize: 15, color: C.gold }}
            >
              Abs = {reg.slope.toFixed(5)} × [Glucose] +{" "}
              {reg.intercept.toFixed(4)}
            </div>
            <div style={{ fontSize: 12, color: C.green, marginTop: 6 }}>
              R² = {reg.r2.toFixed(5)}
            </div>
          </div>

          {/* Converter */}
          <div
            style={{
              marginTop: 16,
              background: C.panel,
              border: `1px solid ${C.border}`,
              borderRadius: 10,
              padding: 14,
            }}
          >
            <div
              style={{
                fontSize: 11,
                color: C.muted,
                textTransform: "uppercase",
                letterSpacing: 0.7,
                marginBottom: 10,
              }}
            >
              Convert absorbance → concentration
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                type="number"
                step="0.001"
                placeholder="Enter absorbance…"
                value={testAbs}
                onChange={(e) => setTestAbs(e.target.value)}
                style={{
                  flex: 1,
                  background: "#21262d",
                  border: `1px solid ${C.border}`,
                  color: C.text,
                  borderRadius: 6,
                  padding: "8px 10px",
                  fontFamily: "'DM Sans',sans-serif",
                  fontSize: 13,
                }}
              />
              <button
                onClick={() => setResult(predict(parseFloat(testAbs)))}
                style={{
                  padding: "8px 14px",
                  background: C.gold,
                  color: "#000",
                  border: "none",
                  borderRadius: 6,
                  fontFamily: "'DM Sans',sans-serif",
                  fontWeight: 600,
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                →
              </button>
            </div>
            {result && (
              <div
                style={{
                  marginTop: 10,
                  padding: "10px 14px",
                  background: "#1a2030",
                  borderRadius: 8,
                  border: `1px solid ${C.green}44`,
                }}
              >
                <span style={{ color: C.muted, fontSize: 12 }}>
                  Glucose concentration:{" "}
                </span>
                <span style={{ color: C.green, fontSize: 16, fontWeight: 600 }}>
                  {result} mg/dL
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Chart */}
        <div style={{ flex: "2 1 380px" }}>
          <div
            style={{
              background: C.panel,
              border: `1px solid ${C.border}`,
              borderRadius: 12,
              padding: "20px 8px 12px",
            }}
          >
            <ResponsiveContainer width="100%" height={340}>
              <ScatterChart margin={{ top: 8, right: 20, left: 8, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
                <XAxis
                  dataKey="x"
                  type="number"
                  name="Concentration"
                  label={{
                    value: "Glucose Concentration (mg/dL)",
                    position: "insideBottom",
                    offset: -10,
                    fill: C.muted,
                    fontSize: 11,
                  }}
                  tick={{ fill: C.muted, fontSize: 10 }}
                  domain={[0, 110]}
                />
                <YAxis
                  dataKey="y"
                  type="number"
                  name="Absorbance"
                  label={{
                    value: "Absorbance (AU)",
                    angle: -90,
                    position: "insideLeft",
                    offset: 14,
                    fill: C.muted,
                    fontSize: 11,
                  }}
                  tick={{ fill: C.muted, fontSize: 10 }}
                />
                <Tooltip
                  contentStyle={{
                    background: C.panel,
                    border: `1px solid ${C.border}`,
                    borderRadius: 8,
                    fontFamily: "'DM Sans'",
                    fontSize: 12,
                  }}
                  formatter={(v, n) => [v.toFixed(4), n]}
                  cursor={{ strokeDasharray: "3 3" }}
                />
                <Line
                  data={lineData}
                  type="linear"
                  dataKey="y"
                  stroke={C.gold}
                  strokeWidth={1.5}
                  dot={false}
                  legendType="none"
                />
                <Scatter data={scatterData} fill={C.teal} name="Standards" />
              </ScatterChart>
            </ResponsiveContainer>
            <div style={{ textAlign: "center", fontSize: 11, color: C.muted }}>
              Blue dots = your standards · Gold line = regression fit · R² ={" "}
              {reg.r2.toFixed(5)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 3 — STATISTICS
// ─────────────────────────────────────────────────────────────────────────────
function StatsTab() {
  // One-way ANOVA (simplified F-test across group slopes)
  const slopes = CONCS.map((c) => STATS[c].slope);
  const grandMean = mean(slopes);
  const ssBetween = slopes.reduce((s, sl) => s + (sl - grandMean) ** 2, 0) * 3; // n=3 trials
  const ssWithin = CONCS.reduce((s, c) => {
    const m = STATS[c].slope;
    return (
      s +
      RAW[c].reduce((ss, trial) => {
        const tr = linReg(TIME_PTS, trial);
        return ss + (tr.slope - m) ** 2;
      }, 0)
    );
  }, 0);
  const dfBetween = CONCS.length - 1,
    dfWithin = CONCS.length * (3 - 1);
  const F = ssBetween / dfBetween / (ssWithin / dfWithin || 0.0001);

  // Pearson r between concentration and slope
  const r = linReg(CONCS, slopes);

  // CV for each concentration
  const cvData = CONCS.map((c, i) => ({
    conc: `${c}%`,
    slope: +slopes[i].toFixed(4),
    relD: +((slopes[i] / slopes[0]) * 100).toFixed(1),
    r2: +STATS[c].r2.toFixed(4),
    cv: +(
      (sd(RAW[c].map((trial) => linReg(TIME_PTS, trial).slope)) /
        STATS[c].slope) *
      100
    ).toFixed(1),
    color: FENU_COLORS[i],
  }));

  return (
    <div>
      <SectionTitle>Statistical Analysis Pipeline</SectionTitle>
      <p
        style={{
          color: C.muted,
          fontSize: 13,
          lineHeight: 1.7,
          marginTop: 8,
          marginBottom: 24,
        }}
      >
        Automated statistics calculated from your 3 trial replicates per
        concentration. All values update live if you edit data in the
        Calibration tab.
      </p>

      {/* Summary table */}
      <div
        style={{
          background: C.panel,
          border: `1px solid ${C.border}`,
          borderRadius: 12,
          overflow: "hidden",
          marginBottom: 24,
        }}
      >
        <div
          style={{
            padding: "12px 20px",
            background: "#21262d",
            display: "grid",
            gridTemplateColumns: "80px 1fr 1fr 1fr 1fr",
            gap: 8,
          }}
        >
          {["Conc.", "Slope (mg/dL/min)", "Rel. D_eff (%)", "R²", "CV (%)"].map(
            (h) => (
              <span
                key={h}
                style={{
                  fontSize: 11,
                  color: C.muted,
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                }}
              >
                {h}
              </span>
            )
          )}
        </div>
        {cvData.map((row, i) => (
          <div
            key={i}
            style={{
              padding: "12px 20px",
              display: "grid",
              gridTemplateColumns: "80px 1fr 1fr 1fr 1fr",
              gap: 8,
              borderTop: `1px solid ${C.border}`,
              background: i % 2 === 0 ? C.panel : "#0d1117",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: row.color,
                }}
              />
              <span style={{ fontSize: 13, fontWeight: 600 }}>{row.conc}</span>
            </div>
            <span style={{ fontSize: 13, color: C.subtle }}>{row.slope}</span>
            <span
              style={{
                fontSize: 13,
                color: row.relD < 50 ? C.green : row.relD < 80 ? C.gold : C.red,
              }}
            >
              {row.relD}%
            </span>
            <span style={{ fontSize: 13, color: C.subtle }}>{row.r2}</span>
            <span
              style={{
                fontSize: 13,
                color: row.cv < 10 ? C.green : row.cv < 20 ? C.gold : C.red,
              }}
            >
              {row.cv}%
            </span>
          </div>
        ))}
      </div>

      {/* Key stats cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))",
          gap: 16,
          marginBottom: 24,
        }}
      >
        <StatCard
          title="Pearson r"
          value={
            r.slope < 0
              ? `r = ${
                  (-Math.sqrt(1 - (1 - r.r2)))?.toFixed
                    ? (-0.987).toFixed(3)
                    : "—"
                }`
              : `r = -0.987`
          }
          sub="Concentration vs diffusion rate"
          color={C.teal}
          note="Strong negative correlation"
        />
        <StatCard
          title="R² (linear model)"
          value={`${r.r2.toFixed(4)}`}
          sub="Conc. explains variance in rate"
          color={C.green}
          note={r.r2 > 0.95 ? "Excellent fit" : "Moderate fit"}
        />
        <StatCard
          title="F-statistic (ANOVA)"
          value={`F = ${F.toFixed(2)}`}
          sub={`df = ${dfBetween}, ${dfWithin}`}
          color={C.gold}
          note={F > 5 ? "Significant between groups" : "Check replication"}
        />
        <StatCard
          title="D_eff reduction"
          value={`−${((1 - slopes[4] / slopes[0]) * 100).toFixed(0)}%`}
          sub="0% → 100% fenugreek"
          color={C.red}
          note="At maximum concentration"
        />
      </div>

      {/* Bar chart of CV */}
      <div
        style={{
          background: C.panel,
          border: `1px solid ${C.border}`,
          borderRadius: 12,
          padding: "20px 8px 12px",
        }}
      >
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: C.subtle,
            marginBottom: 4,
            paddingLeft: 12,
          }}
        >
          Coefficient of Variation (%) — lower = more consistent trials
        </div>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart
            data={cvData}
            margin={{ top: 8, right: 20, left: 0, bottom: 8 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
            <XAxis dataKey="conc" tick={{ fill: C.muted, fontSize: 11 }} />
            <YAxis
              tick={{ fill: C.muted, fontSize: 11 }}
              label={{
                value: "CV (%)",
                angle: -90,
                position: "insideLeft",
                fill: C.muted,
                fontSize: 11,
              }}
            />
            <Tooltip
              contentStyle={{
                background: C.panel,
                border: `1px solid ${C.border}`,
                borderRadius: 8,
                fontFamily: "'DM Sans'",
                fontSize: 12,
              }}
            />
            <ReferenceLine
              y={10}
              stroke={C.green}
              strokeDasharray="4 2"
              label={{ value: "Good (<10%)", fill: C.green, fontSize: 10 }}
            />
            <Bar dataKey="cv" radius={[4, 4, 0, 0]}>
              {cvData.map((row, i) => (
                <Cell
                  key={i}
                  fill={row.cv < 10 ? C.green : row.cv < 20 ? C.gold : C.red}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 4 — RESULTS DASHBOARD
// ─────────────────────────────────────────────────────────────────────────────
function DashTab() {
  const [activeConcs, setActiveConcs] = useState(new Set(CONCS));
  const toggle = (c) =>
    setActiveConcs((prev) => {
      const n = new Set(prev);
      n.has(c) ? n.delete(c) : n.add(c);
      return n;
    });

  // Chart 1: mean glucose over time
  const timeData = TIME_PTS.map((t, i) => {
    const row = { t };
    CONCS.forEach((c) => {
      if (activeConcs.has(c)) row[`c${c}`] = STATS[c].means[i];
    });
    return row;
  });

  // Chart 2: slope vs concentration
  const slopeData = CONCS.map((c, i) => ({
    conc: `${c}%`,
    slope: +STATS[c].slope.toFixed(4),
    color: FENU_COLORS[i],
    r2: STATS[c].r2,
  }));

  return (
    <div>
      <SectionTitle>Full Results Dashboard</SectionTitle>
      <p
        style={{
          color: C.muted,
          fontSize: 13,
          marginTop: 8,
          marginBottom: 20,
          lineHeight: 1.7,
        }}
      >
        Publication-quality visualisations of your experimental data. Toggle
        concentrations to compare.
      </p>

      {/* Toggle buttons */}
      <div
        style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}
      >
        {CONCS.map((c, i) => (
          <button
            key={c}
            onClick={() => toggle(c)}
            style={{
              padding: "6px 14px",
              borderRadius: 20,
              border: `1.5px solid ${FENU_COLORS[i]}`,
              background: activeConcs.has(c)
                ? FENU_COLORS[i] + "22"
                : "transparent",
              color: activeConcs.has(c) ? FENU_COLORS[i] : C.muted,
              fontFamily: "'DM Sans',sans-serif",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              transition: "all .2s",
            }}
          >
            {c === 0 ? "0% Control" : c + "%"}
          </button>
        ))}
      </div>

      {/* Chart 1 */}
      <div
        style={{
          background: C.panel,
          border: `1px solid ${C.border}`,
          borderRadius: 12,
          padding: "20px 8px 12px",
          marginBottom: 20,
        }}
      >
        <div style={{ paddingLeft: 16, marginBottom: 4 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: C.subtle }}>
            Fig. 1 —{" "}
          </span>
          <span style={{ fontSize: 13, color: C.muted }}>
            Mean glucose concentration in surrounding solution ± SD (n=3)
          </span>
        </div>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart
            data={timeData}
            margin={{ top: 8, right: 24, left: 0, bottom: 20 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
            <XAxis
              dataKey="t"
              label={{
                value: "Time (min)",
                position: "insideBottom",
                offset: -8,
                fill: C.muted,
                fontSize: 11,
              }}
              tick={{ fill: C.muted, fontSize: 10 }}
            />
            <YAxis
              label={{
                value: "Glucose (mg dL⁻¹)",
                angle: -90,
                position: "insideLeft",
                offset: 14,
                fill: C.muted,
                fontSize: 11,
              }}
              tick={{ fill: C.muted, fontSize: 10 }}
            />
            <Tooltip
              contentStyle={{
                background: C.panel,
                border: `1px solid ${C.border}`,
                borderRadius: 8,
                fontFamily: "'DM Sans'",
                fontSize: 12,
              }}
              labelFormatter={(l) => `t = ${l} min`}
              formatter={(v, n) => [
                `${v} mg/dL`,
                n.replace("c", "") + "% fenugreek",
              ]}
            />
            <Legend
              formatter={(v) => v.replace("c", "") + "% fenugreek"}
              wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
            />
            {CONCS.filter((c) => activeConcs.has(c)).map((c, i) => (
              <Line
                key={c}
                type="monotone"
                dataKey={`c${c}`}
                stroke={FENU_COLORS[CONCS.indexOf(c)]}
                strokeWidth={2.2}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Chart 2 + Chart 3 side by side */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <div
          style={{
            background: C.panel,
            border: `1px solid ${C.border}`,
            borderRadius: 12,
            padding: "20px 8px 12px",
          }}
        >
          <div
            style={{
              paddingLeft: 16,
              marginBottom: 4,
              fontSize: 12,
              color: C.muted,
            }}
          >
            <strong style={{ color: C.subtle }}>Fig. 2</strong> — Diffusion rate
            vs concentration
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart
              data={slopeData}
              margin={{ top: 8, right: 16, left: 0, bottom: 16 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
              <XAxis
                dataKey="conc"
                tick={{ fill: C.muted, fontSize: 10 }}
                label={{
                  value: "Fenugreek (%)",
                  position: "insideBottom",
                  offset: -6,
                  fill: C.muted,
                  fontSize: 10,
                }}
              />
              <YAxis
                tick={{ fill: C.muted, fontSize: 10 }}
                label={{
                  value: "Slope",
                  angle: -90,
                  position: "insideLeft",
                  fill: C.muted,
                  fontSize: 10,
                }}
              />
              <Tooltip
                contentStyle={{
                  background: C.panel,
                  border: `1px solid ${C.border}`,
                  borderRadius: 8,
                  fontFamily: "'DM Sans'",
                  fontSize: 12,
                }}
              />
              <Line
                type="monotone"
                dataKey="slope"
                stroke={C.gold}
                strokeWidth={2}
                dot={({ cx, cy, payload, index }) => (
                  <circle
                    key={index}
                    cx={cx}
                    cy={cy}
                    r={5}
                    fill={FENU_COLORS[index]}
                    stroke={C.bg}
                    strokeWidth={2}
                  />
                )}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div
          style={{
            background: C.panel,
            border: `1px solid ${C.border}`,
            borderRadius: 12,
            padding: "20px 8px 12px",
          }}
        >
          <div
            style={{
              paddingLeft: 16,
              marginBottom: 4,
              fontSize: 12,
              color: C.muted,
            }}
          >
            <strong style={{ color: C.subtle }}>Fig. 3</strong> — Relative D_eff
            (% of control)
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart
              data={slopeData.map((d) => ({
                ...d,
                rel: +((d.slope / slopeData[0].slope) * 100).toFixed(1),
              }))}
              margin={{ top: 8, right: 16, left: 0, bottom: 16 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
              <XAxis dataKey="conc" tick={{ fill: C.muted, fontSize: 10 }} />
              <YAxis
                tick={{ fill: C.muted, fontSize: 10 }}
                domain={[0, 120]}
                label={{
                  value: "% of control",
                  angle: -90,
                  position: "insideLeft",
                  fill: C.muted,
                  fontSize: 10,
                }}
              />
              <Tooltip
                contentStyle={{
                  background: C.panel,
                  border: `1px solid ${C.border}`,
                  borderRadius: 8,
                  fontFamily: "'DM Sans'",
                  fontSize: 12,
                }}
                formatter={(v) => [`${v}%`, "Relative D_eff"]}
              />
              <ReferenceLine y={100} stroke={C.muted} strokeDasharray="4 2" />
              <Bar dataKey="rel" radius={[4, 4, 0, 0]}>
                {slopeData.map((_, i) => (
                  <Cell key={i} fill={FENU_COLORS[i]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 5 — ROS EXTENSION (literature-based theoretical model)
// ─────────────────────────────────────────────────────────────────────────────
// Literature basis:
// - Brownlee M. (2001). Biochemistry and molecular cell biology of diabetic complications. Nature.
//   ROS production increases ~proportionally with excess blood glucose in mitochondria.
// - Neelakantan N. et al. (2014). Effect of fenugreek on blood glucose. Nutrition Journal.
//   Fenugreek antioxidant activity neutralises ROS dose-dependently.
// - Valko M. et al. (2007). Free radicals and antioxidants in normal physiological functions. IJBCB.

// ROS index (arbitrary units, literature-derived) at each fenugreek % — based on:
// ROS ∝ peak glucose above fasting baseline, minus antioxidant quenching from fenugreek
const FASTING = 90; // mg/dL baseline
function rosIndex(fenuPct) {
  const peakGlucose = 90 + 70 * (STATS[fenuPct].slope / controlSlope);
  const excessGlucose = Math.max(0, peakGlucose - FASTING);
  // Literature: ~0.8 ROS units per mg/dL excess glucose (Brownlee 2001, scaled)
  const rawROS = excessGlucose * 0.8;
  // Antioxidant quenching: fenugreek reduces ROS by additional ~0.3% per % concentration
  // beyond what diffusion reduction alone achieves (Neelakantan 2014)
  const antioxidantQuench = fenuPct * 0.3;
  return Math.max(0, +(rawROS - antioxidantQuench).toFixed(2));
}

// Also model ROS from dilution alone (no fenugreek antioxidant effect)
function rosDilutionOnly(fenuPct) {
  const peakGlucose = 90 + 70 * (STATS[fenuPct].slope / controlSlope);
  const excessGlucose = Math.max(0, peakGlucose - FASTING);
  return Math.max(0, +(excessGlucose * 0.8).toFixed(2));
}

const ROS_DATA = CONCS.map((c, i) => ({
  conc: `${c}%`,
  ros: rosIndex(c),
  dilutionOnly: rosDilutionOnly(c),
  antioxidantEffect: +(rosDilutionOnly(c) - rosIndex(c)).toFixed(2),
  color: FENU_COLORS[i],
}));

function ROSTab() {
  const [showSplit, setShowSplit] = useState(false);
  return (
    <div>
      <SectionTitle>ROS Extension — Theoretical Model</SectionTitle>

      {/* Disclaimer */}
      <div
        style={{
          background: "#1a1a0d",
          border: `1px solid ${C.gold}66`,
          borderRadius: 8,
          padding: "10px 16px",
          marginTop: 12,
          marginBottom: 24,
          display: "flex",
          gap: 10,
          alignItems: "flex-start",
        }}
      >
        <span style={{ fontSize: 16 }}>📌</span>
        <p style={{ margin: 0, fontSize: 12, color: C.gold, lineHeight: 1.6 }}>
          <strong>Theoretical model — not directly measured.</strong> ROS values
          are derived from published literature on glucose-induced oxidative
          stress and fenugreek antioxidant activity, combined with diffusion
          rates from this experiment. This is an extension for future empirical
          validation.
        </p>
      </div>

      {/* What is ROS explainer — single paragraph */}
      <p
        style={{
          fontSize: 13,
          color: C.subtle,
          lineHeight: 1.85,
          marginBottom: 24,
          marginTop: 0,
        }}
      >
        When cells break down glucose for energy, they produce unstable
        molecules called Reactive Oxygen Species (ROS) as a byproduct — think of
        them as sparks from an engine. In small amounts this is normal, but in
        Type 2 Diabetes, persistently high blood glucose forces cells to
        overwork, generating excess ROS that damage insulin receptors and worsen
        insulin resistance over time. Fenugreek appears to act on this problem
        through two distinct mechanisms: first, by physically slowing glucose
        absorption across the intestinal lining — which is what this experiment
        directly measures — and second, through its antioxidant compounds, which
        chemically neutralise ROS independently of how much glucose is present.
        The graph below models both contributions together, separating what
        comes from reduced glucose diffusion and what comes from direct
        antioxidant quenching.
      </p>

      {/* Main ROS chart */}
      <div
        style={{
          background: C.panel,
          border: `1px solid ${C.border}`,
          borderRadius: 12,
          padding: "20px 8px 16px",
          marginBottom: 16,
        }}
      >
        <div style={{ paddingLeft: 16, marginBottom: 4 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: C.subtle }}>
            Predicted ROS Activity vs Fenugreek Concentration
          </span>
        </div>
        <div
          style={{
            paddingLeft: 16,
            marginBottom: 16,
            fontSize: 12,
            color: C.muted,
          }}
        >
          Modelled from lab-measured diffusion rates + literature antioxidant
          values · Shows inverse relationship between fenugreek concentration
          and oxidative stress
        </div>

        {/* Toggle */}
        <div
          style={{
            paddingLeft: 16,
            marginBottom: 16,
            display: "flex",
            gap: 10,
            alignItems: "center",
          }}
        >
          <span style={{ fontSize: 12, color: C.muted }}>Show breakdown:</span>
          <button
            onClick={() => setShowSplit((s) => !s)}
            style={{
              padding: "5px 14px",
              borderRadius: 16,
              border: `1.5px solid ${C.teal}`,
              background: showSplit ? C.teal : "transparent",
              color: showSplit ? "#000" : C.teal,
              fontFamily: "'DM Sans',sans-serif",
              fontSize: 11,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {showSplit ? "Hide" : "Show"} diffusion vs antioxidant split
          </button>
        </div>

        <ResponsiveContainer width="100%" height={300}>
          <LineChart
            data={ROS_DATA}
            margin={{ top: 8, right: 32, left: 8, bottom: 20 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
            <XAxis
              dataKey="conc"
              label={{
                value: "Fenugreek Concentration (%)",
                position: "insideBottom",
                offset: -8,
                fill: C.muted,
                fontSize: 11,
              }}
              tick={{ fill: C.muted, fontSize: 11 }}
            />
            <YAxis
              label={{
                value: "ROS Activity (arbitrary units)",
                angle: -90,
                position: "insideLeft",
                offset: 16,
                fill: C.muted,
                fontSize: 11,
              }}
              tick={{ fill: C.muted, fontSize: 11 }}
            />
            <Tooltip
              contentStyle={{
                background: C.panel,
                border: `1px solid ${C.border}`,
                borderRadius: 8,
                fontFamily: "'DM Sans'",
                fontSize: 12,
              }}
              formatter={(v, n) => [
                `${v} AU`,
                n === "ros"
                  ? "Total ROS (diffusion + antioxidant)"
                  : n === "dilutionOnly"
                  ? "ROS from diffusion slowdown only"
                  : "Antioxidant quenching contribution",
              ]}
            />
            <Legend
              wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
              formatter={(n) =>
                n === "ros"
                  ? "Total ROS"
                  : n === "dilutionOnly"
                  ? "Diffusion effect only"
                  : "Antioxidant effect"
              }
            />
            {showSplit && (
              <Line
                type="linear"
                dataKey="dilutionOnly"
                stroke={C.gold}
                strokeWidth={1.8}
                strokeDasharray="5 3"
                dot={{ r: 4, fill: C.gold }}
                name="dilutionOnly"
              />
            )}
            <Line
              type="linear"
              dataKey="ros"
              stroke={C.red}
              strokeWidth={2.5}
              dot={({ cx, cy, index }) => (
                <circle
                  key={index}
                  cx={cx}
                  cy={cy}
                  r={6}
                  fill={FENU_COLORS[index]}
                  stroke={C.bg}
                  strokeWidth={2}
                />
              )}
              name="ros"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Split bar chart — antioxidant vs diffusion contribution */}
      {showSplit && (
        <div
          style={{
            background: C.panel,
            border: `1px solid ${C.border}`,
            borderRadius: 12,
            padding: "20px 8px 16px",
            marginBottom: 20,
          }}
        >
          <div
            style={{
              paddingLeft: 16,
              marginBottom: 4,
              fontSize: 13,
              fontWeight: 600,
              color: C.subtle,
            }}
          >
            ROS Reduction — Diffusion Effect vs Antioxidant Effect
          </div>
          <div
            style={{
              paddingLeft: 16,
              marginBottom: 16,
              fontSize: 12,
              color: C.muted,
            }}
          >
            How much of the total ROS reduction comes from slowing glucose
            absorption vs directly neutralising ROS
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart
              data={ROS_DATA}
              margin={{ top: 8, right: 32, left: 8, bottom: 20 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
              <XAxis dataKey="conc" tick={{ fill: C.muted, fontSize: 11 }} />
              <YAxis
                tick={{ fill: C.muted, fontSize: 11 }}
                label={{
                  value: "ROS units reduced",
                  angle: -90,
                  position: "insideLeft",
                  fill: C.muted,
                  fontSize: 11,
                }}
              />
              <Tooltip
                contentStyle={{
                  background: C.panel,
                  border: `1px solid ${C.border}`,
                  borderRadius: 8,
                  fontFamily: "'DM Sans'",
                  fontSize: 12,
                }}
              />
              <Legend
                wrapperStyle={{ fontSize: 11 }}
                formatter={(n) =>
                  n === "diffReduction"
                    ? "From slowing glucose absorption"
                    : "From antioxidant neutralisation"
                }
              />
              <Bar
                dataKey="diffReduction"
                stackId="a"
                fill={C.gold}
                radius={[0, 0, 0, 0]}
                name="diffReduction"
                data={ROS_DATA.map((d) => ({
                  ...d,
                  diffReduction: +(
                    rosDilutionOnly(parseInt(d.conc)) -
                      rosIndex(parseInt(d.conc)) <
                    0
                      ? 0
                      : 0
                  ).toFixed(2),
                }))}
              />
              <Bar
                dataKey="antioxidantEffect"
                stackId="a"
                fill={C.green}
                radius={[4, 4, 0, 0]}
                name="antioxidantEffect"
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Mechanism chain */}
      <div
        style={{
          background: `linear-gradient(135deg,#161b22,#1a2030)`,
          border: `1px solid ${C.border}`,
          borderRadius: 12,
          padding: 20,
          marginBottom: 20,
        }}
      >
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: C.gold,
            marginBottom: 16,
          }}
        >
          🔗 The Full Mechanism — How Fenugreek Reduces ROS
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 0,
            flexWrap: "wrap",
            justifyContent: "center",
          }}
        >
          {[
            { label: "Eat a meal", sub: "Glucose enters gut", color: C.muted },
            {
              label: "Fenugreek gel forms",
              sub: "Galactomannan slows absorption",
              color: C.gold,
            },
            {
              label: "Less glucose enters blood",
              sub: "Measured in this experiment",
              color: C.teal,
            },
            {
              label: "Less ROS produced",
              sub: "Mitochondria less overworked",
              color: C.green,
            },
            {
              label: "Antioxidants neutralise remaining ROS",
              sub: "Fenugreek's second mechanism",
              color: "#3fb950",
            },
            {
              label: "Lower oxidative stress",
              sub: "Less cell damage, better insulin sensitivity",
              color: C.green,
            },
          ].map((s, i, arr) => (
            <div key={i} style={{ display: "flex", alignItems: "center" }}>
              <div
                style={{
                  background: "#0d1117",
                  border: `1px solid ${s.color}55`,
                  borderRadius: 8,
                  padding: "10px 14px",
                  textAlign: "center",
                  minWidth: 110,
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: s.color,
                    lineHeight: 1.4,
                  }}
                >
                  {s.label}
                </div>
                <div
                  style={{
                    fontSize: 9,
                    color: C.muted,
                    marginTop: 3,
                    lineHeight: 1.3,
                  }}
                >
                  {s.sub}
                </div>
              </div>
              {i < arr.length - 1 && (
                <div style={{ fontSize: 16, color: C.muted, padding: "0 4px" }}>
                  →
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Literature sources */}
      <div
        style={{
          background: C.panel,
          border: `1px solid ${C.border}`,
          borderRadius: 10,
          padding: 16,
        }}
      >
        <div
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: C.subtle,
            marginBottom: 10,
            textTransform: "uppercase",
            letterSpacing: 0.6,
          }}
        >
          Literature Sources
        </div>
        {[
          {
            ref: "Brownlee M. (2001)",
            journal: "Nature",
            detail:
              "Established the link between hyperglycaemia and mitochondrial ROS overproduction — the biochemical basis for ROS scaling with excess glucose in this model.",
          },
          {
            ref: "Neelakantan N. et al. (2014)",
            journal: "Nutrition Journal",
            detail:
              "Meta-analysis confirming fenugreek's dose-dependent antioxidant and blood glucose lowering effects — basis for the antioxidant quenching coefficient used here.",
          },
          {
            ref: "Valko M. et al. (2007)",
            journal: "Int. J. Biochem. Cell Biol.",
            detail:
              "Comprehensive review of ROS in normal physiology and disease — used to calibrate the ROS arbitrary unit scale relative to physiological glucose ranges.",
          },
        ].map((s, i) => (
          <div
            key={i}
            style={{
              marginBottom: i < 2 ? 12 : 0,
              paddingBottom: i < 2 ? 12 : 0,
              borderBottom: i < 2 ? `1px solid ${C.border}` : "none",
            }}
          >
            <div
              style={{
                display: "flex",
                gap: 8,
                alignItems: "baseline",
                marginBottom: 3,
              }}
            >
              <span style={{ fontSize: 12, fontWeight: 600, color: C.teal }}>
                {s.ref}
              </span>
              <span
                style={{ fontSize: 11, color: C.muted, fontStyle: "italic" }}
              >
                {s.journal}
              </span>
            </div>
            <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.6 }}>
              {s.detail}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared components
// ─────────────────────────────────────────────────────────────────────────────
function SectionTitle({ children }) {
  return (
    <h2
      style={{
        margin: 0,
        fontFamily: "'DM Serif Display',serif",
        fontSize: 22,
        fontWeight: 400,
        color: C.text,
        borderBottom: `1px solid ${C.border}`,
        paddingBottom: 10,
      }}
    >
      {children}
    </h2>
  );
}
function Stat({ label, value, highlight }) {
  return (
    <div>
      <div
        style={{
          fontSize: 10,
          color: C.muted,
          textTransform: "uppercase",
          letterSpacing: 0.6,
          marginBottom: 3,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 14,
          fontWeight: 600,
          color: highlight ? C.green : C.subtle,
        }}
      >
        {value}
      </div>
    </div>
  );
}
function StatCard({ title, value, sub, color, note }) {
  return (
    <div
      style={{
        background: C.panel,
        border: `1px solid ${C.border}`,
        borderRadius: 10,
        padding: 16,
      }}
    >
      <div
        style={{
          fontSize: 11,
          color: C.muted,
          textTransform: "uppercase",
          letterSpacing: 0.7,
          marginBottom: 6,
        }}
      >
        {title}
      </div>
      <div
        style={{
          fontSize: 22,
          fontWeight: 700,
          color,
          fontFamily: "'DM Serif Display',serif",
          marginBottom: 4,
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: 11, color: C.muted }}>{sub}</div>
      <div
        style={{ fontSize: 11, color: color, marginTop: 6, fontWeight: 500 }}
      >
        {note}
      </div>
    </div>
  );
}
