import { COMMISSIONS } from "./commissions.js";
import {
  countExtensions,
  createKahn,
  dfsTrace,
  findCycle,
  isValidOrder,
  layoutGraph,
  respectsBearings,
  runKahn,
  stepKahn,
} from "./topo.js";

const SVG = "http://www.w3.org/2000/svg";

const KAHN_LINES = [
  "Count open bearings.",
  "Queue ← pieces with none.",
  "While the queue is not empty:",
  "    Take one ready piece.",
  "    Seat it.",
  "    For each piece it releases:",
  "        Open bearings − 1.",
  "        If it hits zero, it joins the queue.",
  "If anything remains, those bearings form a cycle.",
];

const DFS_LINES = [
  "Mark every piece unvisited.",
  "Descend into a piece.",
  "If it is still on the stack, that is a cycle.",
  "Otherwise visit what waits on it.",
  "When it finishes, chalk it.",
  "Read the chalk from last to first.",
];

const FILL = {
  gear: "#d2b07a",
  wheel: "#d2b07a",
  planet: "#d7c4a2",
  moon: "#efeae0",
  moons: "#e4d4f2",
  sun: "#f0c14a",
  bell: "#f4ead7",
  hand: "#f0d7a6",
  note: "#f0d7a6",
  stone: "#b7b1a6",
  arbor: "#b7c4ce",
  ring: "#f0e2b8",
  lamp: "#f0c14a",
  plaque: "#e6dccb",
  cam: "#d2b07a",
  gate: "#7d9a84",
};

const state = {
  commission: null,
  pieces: [],
  edges: [],
  base: "",
  policy: "hand",
  method: "kahn",
  playing: false,
  selected: null,
  status: "",
  phase: "ready",
  highlight: new Set([0, 1]),
  popId: null,
  cycle: null,
  kahn: null,
  dfs: null,
  analysis: null,
  countText: "",
};

let bearingSig = "";

function el(name, attrs = {}, parent) {
  const node = document.createElementNS(SVG, name);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    node.setAttribute(key, String(value));
  }
  if (parent) parent.appendChild(node);
  return node;
}

function pieceName(id) {
  const piece = state.pieces.find((item) => item.id === id);
  return piece ? piece.name : id;
}

function byId(id) {
  return state.pieces.find((piece) => piece.id === id) || null;
}

function signature() {
  return JSON.stringify({
    pieces: state.pieces.map((piece) => [piece.id, piece.name, piece.kind]),
    edges: state.edges,
  });
}

function joinNames(ids) {
  const names = ids.map(pieceName);
  if (names.length <= 1) return names.join("");
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

function cycleIds(path) {
  const seen = new Set();
  const ids = [];
  for (const id of path || []) {
    if (seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

function dawnIds() {
  if (state.method === "kahn") return state.kahn.order;
  return state.dfs.seated;
}

function freshDfs() {
  const trace = dfsTrace(state.pieces, state.edges);
  return {
    events: trace.events,
    order: trace.order,
    i: 0,
    stack: [],
    chalk: [],
    seated: [],
    revealing: false,
    revealQueue: [],
    active: null,
    done: false,
    cycle: null,
  };
}

function resetProgress() {
  state.kahn = createKahn(state.pieces, state.edges, state.policy);
  state.dfs = freshDfs();
  state.phase = "ready";
  state.popId = null;
  state.cycle = null;
  state.highlight = state.method === "kahn" ? new Set([0, 1]) : new Set([0]);
}

function initialStatus() {
  const queue = state.kahn.queue;
  if (state.pieces.length === 0) {
    return "The bench is clear. Lay a piece down. Until one piece waits on another, every order is a topological sort.";
  }
  if (queue.length === 0) {
    return "Nothing is free, and the bench is not empty. These bearings form a ring. Step, and the bench will say so.";
  }
  if (queue.length === 1) return `Only ${pieceName(queue[0])} is free. Everything else still waits.`;
  return `${queue.length} pieces are free at once. A topological sort may take any of them next.`;
}

function openingStatus() {
  if (state.method === "dfs") {
    return "Finishing chalk starts at the other end of the work. Nothing is seated until the chalk is read backward.";
  }
  return initialStatus();
}

function loadCommission(id) {
  const commission = COMMISSIONS.find((item) => item.id === id) || COMMISSIONS[0];
  state.commission = commission;
  state.pieces = commission.pieces.map((piece) => ({ ...piece }));
  state.edges = commission.edges.map((edge) => ({ ...edge }));
  state.base = signature();
  state.selected = null;
  state.analysis = null;
  state.countText = "";
  bearingSig = "";
  state.playing = false;
  resetProgress();
  state.status = openingStatus();
  document.getElementById("commission").value = commission.id;
  render();
}

function mutate(status) {
  state.playing = false;
  state.analysis = null;
  state.countText = "";
  if (!state.pieces.some((piece) => piece.id === state.selected)) state.selected = null;
  resetProgress();
  state.status = status || openingStatus();
  render();
}

function doneStatus() {
  const order = dawnIds();
  const valid = state.pieces.length === 0 || isValidOrder(state.pieces, state.edges, order);
  if (!valid) return "The order just produced breaks a bearing. That is a fault in the bench.";
  if (state.pieces.length === 0) {
    return "There is nothing to seat. The empty order is a topological sort, and it is the only one.";
  }
  if (state.method === "dfs") {
    return "Dawn. Read backward, the chalk seats every piece, and every bearing points forward.";
  }
  const choices = state.kahn.choices.length;
  if (choices === 0) return "Dawn. The queue never offered a choice, and every bearing points forward.";
  if (choices === 1) {
    return "Dawn. Every bearing points forward. Once, the queue held more than one piece and the choice was yours.";
  }
  return `Dawn. Every bearing points forward. ${choices} times, the queue held more than one piece and the choice was yours.`;
}

function seizedStatus() {
  const ring = cycleIds(state.cycle || findCycle(state.pieces, state.edges) || []);
  const ringSet = new Set(ring);
  const seated = state.method === "kahn" ? state.kahn.order : state.dfs.seated;
  const ringText = ring.length === 1
    ? `${pieceName(ring[0])} waits on itself.`
    : `${joinNames(ring)} wait on each other in a ring.`;
  if (state.method === "dfs") {
    return `${ringText} Finishing times stop at a cycle. They do not hand back a partial dawn.`;
  }
  const seatedText = seated.length
    ? `${joinNames(seated)} ${seated.length === 1 ? "is" : "are"} seated. `
    : "";
  const stranded = state.pieces
    .map((piece) => piece.id)
    .filter((id) => !seated.includes(id) && !ringSet.has(id));
  const strandedText = stranded.length
    ? ` Also unseated, because they depend on the ring: ${stranded.map(pieceName).join(", ")}.`
    : "";
  return `${seatedText}${ringText} The queue can seat anything that does not depend on the ring. It cannot invent an order inside it.${strandedText}`;
}

function blockedStatus(id) {
  const seated = new Set(state.kahn.order);
  const waits = [];
  const seen = new Set();
  for (const edge of state.edges) {
    if (edge.dependent !== id || seated.has(edge.prereq) || seen.has(edge.prereq)) continue;
    seen.add(edge.prereq);
    waits.push(pieceName(edge.prereq));
  }
  if (!waits.length) return `${pieceName(id)} is caught in the ring.`;
  return `${pieceName(id)} waits on ${waits.join(", ")}.`;
}

function shake() {
  const frame = document.getElementById("sky-frame");
  frame.classList.remove("seized");
  void frame.offsetWidth;
  frame.classList.add("seized");
}

function absorb(event) {
  if (!event) return;
  if (event.type === "seat") {
    state.popId = event.id;
    if (event.seized) {
      state.phase = "seized";
      state.cycle = findCycle(state.pieces, state.edges);
      state.highlight = new Set([8]);
      state.status = seizedStatus();
      shake();
      return;
    }
    if (event.finished) {
      state.phase = "done";
      state.highlight = state.method === "dfs" ? new Set([5]) : new Set();
      state.status = doneStatus();
      return;
    }
    state.phase = "seating";
    if (event.via === "read") {
      state.highlight = new Set([5]);
      state.status = `${pieceName(event.id)} takes its place in the dawn.`;
      return;
    }
    state.highlight = new Set([3, 4, 5, 6, 7]);
    const unlocked = event.unlocked.map(pieceName);
    let text = `${pieceName(event.id)} is seated.`;
    if (unlocked.length === 1) text += ` ${unlocked[0]} can be seated now.`;
    if (unlocked.length > 1) text += ` Now free: ${unlocked.join(", ")}.`;
    state.status = text;
    return;
  }
  if (event.type === "await") {
    state.phase = "choice";
    state.highlight = new Set([3]);
    state.status = `${joinNames(event.queue)} are all free. The bearings do not say which. Choose one.`;
    return;
  }
  if (event.type === "blocked") {
    state.status = blockedStatus(event.id);
    return;
  }
  if (event.type === "complete") {
    state.phase = "done";
    state.highlight = state.method === "dfs" ? new Set([5]) : new Set();
    state.status = doneStatus();
    return;
  }
  if (event.type === "seized") {
    state.phase = "seized";
    state.cycle = event.path || findCycle(state.pieces, state.edges);
    state.highlight = state.method === "dfs" ? new Set([2]) : new Set([8]);
    state.status = seizedStatus();
    shake();
    return;
  }
  if (event.type === "enter") {
    state.phase = "seating";
    state.highlight = new Set([1, 3]);
    state.status = `Descending into ${pieceName(event.id)}. The stack remembers the way back.`;
    return;
  }
  if (event.type === "finish") {
    state.phase = "seating";
    state.highlight = new Set([4]);
    state.status = `${pieceName(event.id)} is chalked. It is not seated yet. The dawn is the chalk, read backward.`;
  }
  if (event.type === "read") {
    state.phase = "seating";
    state.highlight = new Set([5]);
    state.status = "Read the chalk from last to first. That order is the dawn.";
  }
}

function stepDfs() {
  const dfs = state.dfs;
  if (dfs.revealing) {
    if (dfs.revealQueue.length === 0) {
      dfs.done = true;
      dfs.revealing = false;
      return { type: "complete", order: dfs.seated.slice() };
    }
    const id = dfs.revealQueue.shift();
    dfs.seated.push(id);
    dfs.active = id;
    const finished = dfs.revealQueue.length === 0;
    if (finished) {
      dfs.done = true;
      dfs.revealing = false;
    }
    return { type: "seat", id, unlocked: [], finished, seized: false, via: "read" };
  }
  if (dfs.done) {
    return dfs.cycle
      ? { type: "seized", path: dfs.cycle }
      : { type: "complete", order: dfs.seated.slice() };
  }
  if (dfs.i >= dfs.events.length) {
    if (dfs.cycle) {
      dfs.done = true;
      return { type: "seized", path: dfs.cycle };
    }
    dfs.revealing = true;
    dfs.revealQueue = (dfs.order || []).slice();
    return { type: "read" };
  }
  const event = dfs.events[dfs.i];
  dfs.i += 1;
  if (event.type === "enter") {
    dfs.stack.push(event.id);
    dfs.active = event.id;
    return event;
  }
  if (event.type === "finish") {
    dfs.stack.pop();
    dfs.chalk.push(event.id);
    dfs.active = event.id;
    return event;
  }
  if (event.type === "cycle") {
    dfs.cycle = event.path;
    dfs.done = true;
    dfs.active = null;
    return { type: "seized", path: event.path };
  }
  return event;
}

function advance() {
  return state.method === "kahn" ? stepKahn(state.kahn) : stepDfs();
}

function delayMs() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return 0;
  return document.getElementById("brisk").checked ? 110 : 480;
}

async function run() {
  if (state.playing) {
    state.playing = false;
    renderControls();
    return;
  }
  state.playing = true;
  renderControls();
  while (state.playing) {
    const event = advance();
    absorb(event);
    render();
    if (["await", "complete", "seized", "blocked"].includes(event.type)) break;
    if (event.type === "seat" && event.finished) break;
    await new Promise((resolve) => setTimeout(resolve, delayMs()));
  }
  state.playing = false;
  renderControls();
}

function onPiece(id, allowSeat) {
  state.selected = id;
  if (allowSeat && state.method === "kahn" && state.kahn.queue.includes(id)) {
    state.playing = false;
    absorb(stepKahn(state.kahn, id));
  } else if (allowSeat && state.method === "kahn" && !state.kahn.order.includes(id)) {
    state.status = blockedStatus(id);
  }
  render();
}

function ensureAnalysis() {
  if (state.analysis) return state.analysis;
  const cycle = findCycle(state.pieces, state.edges);
  if (cycle) {
    state.analysis = { cycle };
    return state.analysis;
  }
  state.analysis = {
    cycle: null,
    ledger: runKahn(state.pieces, state.edges, "ledger").order,
    clerk: runKahn(state.pieces, state.edges, "clerk").order,
    book: dfsTrace(state.pieces, state.edges).order,
    flipped: dfsTrace(state.pieces, state.edges, { reverse: true }).order,
  };
  return state.analysis;
}

function formatBig(value) {
  return value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function pieceFlags(id) {
  const flags = [];
  if (state.selected === id) flags.push("selected");
  const ring = new Set(cycleIds(state.cycle));
  if (ring.has(id)) flags.push("in-cycle");
  if (state.method === "kahn") {
    if (state.kahn.order.includes(id)) flags.push("seated");
    else if (state.kahn.queue.includes(id)) flags.push("ready");
    else flags.push("ghost");
  } else if (state.dfs.seated.includes(id)) flags.push("seated");
  else if (state.dfs.stack.includes(id)) flags.push("onstack");
  else if (state.dfs.chalk.includes(id)) flags.push("chalked");
  else flags.push("ghost");
  if (state.popId === id) flags.push("just");
  return flags.join(" ");
}

function gearPath(radius, teeth) {
  const inner = radius * 0.72;
  const parts = [];
  for (let i = 0; i < teeth; i += 1) {
    const a0 = (i / teeth) * Math.PI * 2;
    const a1 = ((i + 0.18) / teeth) * Math.PI * 2;
    const a2 = ((i + 0.45) / teeth) * Math.PI * 2;
    const a3 = ((i + 0.63) / teeth) * Math.PI * 2;
    const point = (angle, distance) => [Math.cos(angle) * distance, Math.sin(angle) * distance];
    [point(a0, inner), point(a1, radius), point(a2, radius), point(a3, inner)].forEach((pair, index) => {
      parts.push(`${i === 0 && index === 0 ? "M" : "L"}${pair[0].toFixed(2)} ${pair[1].toFixed(2)}`);
    });
  }
  return `${parts.join(" ")} Z`;
}

function starPath(radius) {
  const parts = [];
  for (let i = 0; i < 10; i += 1) {
    const distance = i % 2 === 0 ? radius : radius * 0.42;
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    parts.push(`${i === 0 ? "M" : "L"}${(Math.cos(angle) * distance).toFixed(2)} ${(Math.sin(angle) * distance).toFixed(2)}`);
  }
  return `${parts.join(" ")} Z`;
}

function drawGlyph(parent, piece) {
  const { kind, r, fill } = piece;
  if (kind === "sun" || kind === "lamp") {
    el("circle", { r: r * 1.65, fill, opacity: 0.16, class: "glow" }, parent);
    for (let i = 0; i < 8; i += 1) {
      const angle = (i / 8) * Math.PI * 2;
      el("line", {
        x1: Math.cos(angle) * r * 1.15,
        y1: Math.sin(angle) * r * 1.15,
        x2: Math.cos(angle) * r * 1.7,
        y2: Math.sin(angle) * r * 1.7,
        stroke: fill,
        "stroke-width": 1.4,
      }, parent);
    }
    el("circle", { r, fill, class: "glyph" }, parent);
    el("circle", { r: r * 0.28, fill: "#fff6d2" }, parent);
    return;
  }
  if (kind === "gear" || kind === "wheel") {
    el("path", { d: gearPath(r, kind === "wheel" ? 14 : 10), fill, class: "glyph" }, parent);
    el("circle", { r: r * 0.28, fill: "#0c1220" }, parent);
    return;
  }
  if (kind === "moons") {
    [[-0.7, -0.3], [0.55, -0.55], [-0.15, 0.6], [0.7, 0.35]].forEach(([x, y]) => {
      el("circle", { cx: x * r, cy: y * r, r: r * 0.28, fill, class: "glyph" }, parent);
    });
    return;
  }
  if (kind === "arbor") {
    el("rect", { x: -2.5, y: -r, width: 5, height: r * 2, fill, class: "glyph" }, parent);
    el("circle", { r: r * 0.55, fill, class: "glyph" }, parent);
    return;
  }
  if (kind === "hand") {
    el("line", { x1: 0, y1: -r, x2: 0, y2: r, stroke: fill, "stroke-width": 2 }, parent);
    el("polygon", {
      points: `0,${-r} ${r * 0.45},${-r * 0.15} 0,${r * 0.2} ${-r * 0.45},${-r * 0.15}`,
      fill,
      class: "glyph",
    }, parent);
    return;
  }
  if (kind === "ring") {
    el("ellipse", {
      rx: r * 1.9,
      ry: r * 0.62,
      fill: "none",
      stroke: fill,
      "stroke-width": 3,
      transform: "rotate(-18)",
      class: "glyph",
    }, parent);
    return;
  }
  if (kind === "bell") {
    el("path", {
      d: `M ${-r * 0.72} ${r * 0.45} Q ${-r * 0.8} ${-r * 0.15} 0 ${-r} Q ${r * 0.8} ${-r * 0.15} ${r * 0.72} ${r * 0.45} Z`,
      fill,
      class: "glyph",
    }, parent);
    el("circle", { cy: r * 0.62, r: r * 0.14, fill }, parent);
    return;
  }
  if (kind === "stone" || kind === "plaque") {
    const width = kind === "plaque" ? r * 2.6 : r * 2;
    const height = kind === "plaque" ? r * 1.5 : r * 1.35;
    el("rect", {
      x: -width / 2,
      y: -height / 2,
      width,
      height,
      rx: 4,
      fill,
      class: "glyph",
    }, parent);
    return;
  }
  if (kind === "gate") {
    el("rect", { x: -r, y: -r * 0.15, width: r * 2, height: r * 0.18, fill, class: "glyph" }, parent);
    el("rect", { x: -r, y: -r * 0.1, width: r * 0.18, height: r, fill, class: "glyph" }, parent);
    el("rect", { x: r * 0.82, y: -r * 0.1, width: r * 0.18, height: r, fill, class: "glyph" }, parent);
    return;
  }
  if (kind === "note") {
    el("path", { d: starPath(r), fill, class: "glyph" }, parent);
    return;
  }
  if (kind === "cam") {
    el("circle", { r, fill, class: "glyph" }, parent);
    el("circle", { cx: r * 0.35, cy: -r * 0.15, r: r * 0.28, fill: "#fff6d2" }, parent);
    return;
  }
  el("circle", { r, fill, class: "glyph" }, parent);
  if (kind === "planet") el("circle", { cx: -r * 0.25, cy: -r * 0.28, r: r * 0.22, fill: "rgba(255,255,255,0.35)" }, parent);
  if (kind === "moon") el("circle", { cx: r * 0.2, cy: r * 0.1, r: r * 0.18, fill: "rgba(80,70,60,0.25)" }, parent);
}

function labelPoint(piece) {
  const side = piece.labelSide || "below";
  if (side === "above") return { x: 0, y: -piece.r - 16, anchor: "middle" };
  if (side === "right") return { x: piece.r + 12, y: 5, anchor: "start" };
  if (side === "left") return { x: -piece.r - 12, y: 5, anchor: "end" };
  return { x: 0, y: piece.r + 20, anchor: "middle" };
}

function cornerMarks(parent) {
  const margin = 18;
  const length = 26;
  [[margin, margin, 1, 1], [1000 - margin, margin, -1, 1], [margin, 760 - margin, 1, -1], [1000 - margin, 760 - margin, -1, -1]]
    .forEach(([x, y, sx, sy]) => {
      el("path", {
        d: `M ${x} ${y + sy * length} L ${x} ${y} L ${x + sx * length} ${y}`,
        fill: "none",
        stroke: "rgba(212,180,131,0.45)",
        "stroke-width": 1,
      }, parent);
    });
}

function stars(parent, seed, count) {
  let value = seed;
  for (let i = 0; i < count; i += 1) {
    value = (value * 16807) % 2147483647;
    const x = 36 + ((value % 9200) / 9200) * 920;
    value = (value * 16807) % 2147483647;
    const y = 28 + ((value % 7000) / 7000) * 690;
    el("circle", {
      cx: x.toFixed(1),
      cy: y.toFixed(1),
      r: i % 7 === 0 ? 1.4 : 0.7,
      fill: "rgba(244,234,215,0.5)",
    }, parent);
  }
}

function drawPlate(parent) {
  const almanac = state.commission.stage === "almanac";
  const node = el("text", {
    x: almanac ? 780 : 560,
    y: 40,
    "text-anchor": "middle",
    class: "engraved",
  }, parent);
  node.textContent = state.commission.plate;
}

function drawBackdrop(parent) {
  const stage = state.commission.stage;
  cornerMarks(parent);
  if (stage === "empty") {
    stars(parent, 11, 18);
    const node = el("text", { x: 500, y: 370, "text-anchor": "middle", class: "engraved" }, parent);
    node.textContent = "The bench is clear.";
    drawPlate(parent);
    return;
  }
  if (stage === "orrery") {
    stars(parent, 19, 42);
    const [cx, cy] = state.commission.center;
    for (const radius of state.commission.orbits) {
      el("circle", {
        cx, cy, r: radius, fill: "none", class: "orbit",
        stroke: "rgba(212,180,131,0.32)", "stroke-width": 1, "stroke-dasharray": "2 8",
      }, parent);
    }
    const outer = state.commission.orbits[state.commission.orbits.length - 1];
    for (let degree = 0; degree < 360; degree += 10) {
      const angle = (degree * Math.PI) / 180;
      const inner = degree % 30 === 0 ? outer - 12 : outer - 6;
      el("line", {
        x1: cx + Math.cos(angle) * inner,
        y1: cy - Math.sin(angle) * inner,
        x2: cx + Math.cos(angle) * outer,
        y2: cy - Math.sin(angle) * outer,
        stroke: "rgba(212,180,131,0.35)",
        "stroke-width": degree % 30 === 0 ? 1.2 : 0.6,
      }, parent);
    }
    const sun = byId("sun");
    const great = byId("great");
    if (sun && great) {
      el("line", {
        x1: sun.x, y1: sun.y + sun.r, x2: great.x, y2: great.y - great.r,
        stroke: "rgba(183,196,206,0.4)", "stroke-width": 2,
      }, parent);
    }
  } else if (stage === "harbor") {
    stars(parent, 23, 20);
    el("rect", { x: 0, y: 520, width: 1000, height: 240, fill: "rgba(90,130,150,0.18)" }, parent);
    el("line", { x1: 0, y1: 520, x2: 1000, y2: 520, stroke: "rgba(212,180,131,0.35)" }, parent);
    [560, 600, 650].forEach((y, index) => {
      el("path", {
        d: `M 40 ${y} Q 180 ${y - 10} 320 ${y} T 600 ${y} T 960 ${y}`,
        fill: "none", class: "wave", stroke: "rgba(198,220,228,0.28)", "stroke-width": 1.2,
        "stroke-dasharray": index === 1 ? "6 8" : "2 10",
      }, parent);
    });
  } else if (stage === "almanac") {
    el("line", { x1: 120, y1: 50, x2: 120, y2: 730, stroke: "rgba(176,58,46,0.45)", "stroke-width": 1 }, parent);
    state.pieces.forEach((piece) => {
      el("line", {
        x1: 90, y1: piece.y, x2: 940, y2: piece.y,
        stroke: "rgba(212,180,131,0.16)", "stroke-width": 1,
      }, parent);
    });
  } else if (stage === "paradox") {
    stars(parent, 29, 24);
    el("circle", {
      cx: 500, cy: 400, r: 270, fill: "none",
      stroke: "rgba(212,180,131,0.18)", "stroke-width": 1, "stroke-dasharray": "2 8",
    }, parent);
  }
  drawPlate(parent);
}

function marker(parent, id, color) {
  const node = el("marker", {
    id, viewBox: "0 0 10 8", refX: 9, refY: 4, markerWidth: 8, markerHeight: 8, orient: "auto",
  }, parent);
  el("path", { d: "M0,0 L10,4 L0,8 Z", fill: color }, node);
}

function shorten(x1, y1, x2, y2, trimStart, trimEnd) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.hypot(dx, dy) || 1;
  return [
    x1 + (dx / length) * trimStart,
    y1 + (dy / length) * trimStart,
    x2 - (dx / length) * trimEnd,
    y2 - (dy / length) * trimEnd,
    length,
  ];
}

function drawSkyEdges(parent, layout) {
  const back = new Set(layout.back.map((edge) => `${edge.prereq}\0${edge.dependent}`));
  const ring = new Set();
  if (state.cycle) {
    for (let i = 0; i < state.cycle.length - 1; i += 1) ring.add(`${state.cycle[i]}\0${state.cycle[i + 1]}`);
  }
  const defs = el("defs", {}, parent);
  marker(defs, "arrow-sky", "#d4b483");
  marker(defs, "arrow-sky-cycle", "#e07a6a");
  for (const edge of state.edges) {
    const from = byId(edge.prereq);
    const to = byId(edge.dependent);
    if (!from || !to) continue;
    const key = `${edge.prereq}\0${edge.dependent}`;
    const hot = state.selected === edge.prereq || state.selected === edge.dependent;
    const cycled = ring.has(key);
    if (state.edges.length > 12 && !cycled) continue;
    const [x1, y1, x2, y2, length] = shorten(from.x, from.y, to.x, to.y, from.r + 4, to.r + 10);
    if (length < from.r + to.r + 8 && edge.prereq !== edge.dependent) continue;
    let d;
    if (edge.prereq === edge.dependent) {
      d = `M ${from.x + from.r} ${from.y} C ${from.x + from.r + 36} ${from.y - 40}, ${from.x + from.r + 36} ${from.y + 40}, ${from.x + from.r} ${from.y + 8}`;
    } else {
      const midX = (x1 + x2) / 2;
      const midY = (y1 + y2) / 2 - 22;
      d = `M ${x1} ${y1} Q ${midX} ${midY} ${x2} ${y2}`;
    }
    const classes = ["sky-edge"];
    if (back.has(key)) classes.push("back");
    if (hot) classes.push("hot");
    if (cycled) classes.push("cycle");
    el("path", {
      d, class: classes.join(" "),
      "marker-end": cycled ? "url(#arrow-sky-cycle)" : "url(#arrow-sky)",
    }, parent);
  }
}

function renderSky() {
  const svg = document.getElementById("sky");
  [...svg.children].forEach((child) => {
    if (child.id !== "sky-label") child.remove();
  });
  const label = document.getElementById("sky-label");
  label.textContent = `${state.commission.title}. ${dawnIds().length} of ${state.pieces.length} pieces seated.`;
  drawBackdrop(svg);
  const layout = layoutGraph(state.pieces, state.edges);
  drawSkyEdges(svg, layout);
  const ordered = state.pieces.slice().sort((a, b) => (a.kind === "ring" ? 0 : 1) - (b.kind === "ring" ? 0 : 1));
  const dawn = dawnIds();
  for (const piece of ordered) {
    const group = el("g", {
      class: `piece ${pieceFlags(piece.id)}`,
      "data-id": piece.id,
      transform: `translate(${piece.x} ${piece.y})`,
    }, svg);
    const title = el("title", {}, group);
    title.textContent = `${piece.name}. ${piece.blurb || ""}`;
    el("circle", { r: Math.max(piece.r, 16), class: "hit" }, group);
    const pop = el("g", { class: "pop" }, group);
    drawGlyph(pop, piece);
    el("circle", { r: piece.r + 8, class: "ready-ring" }, pop);
    const spot = labelPoint(piece);
    const text = el("text", { class: "label", x: spot.x, y: spot.y, "text-anchor": spot.anchor }, group);
    text.textContent = piece.name;
    const index = dawn.indexOf(piece.id);
    if (index >= 0) {
      const badge = el("g", { transform: `translate(${piece.r * 0.72} ${-piece.r * 0.72})` }, group);
      el("circle", { r: 9, class: "badge-disk" }, badge);
      const number = el("text", { class: "badge-num", y: 4, "text-anchor": "middle" }, badge);
      number.textContent = String(index + 1);
    }
  }
  const frame = document.getElementById("sky-frame");
  frame.classList.toggle("running", state.phase === "done" && state.commission.stage === "orrery");
  frame.classList.toggle("tide", state.phase === "done" && state.commission.stage === "harbor");
}

function renderMesh() {
  const svg = document.getElementById("mesh");
  svg.replaceChildren();
  if (state.pieces.length === 0) {
    const text = el("text", { x: 12, y: 28, class: "engraved" }, svg);
    text.textContent = "Bearings will appear here.";
    svg.setAttribute("width", "420");
    svg.setAttribute("height", "48");
    svg.setAttribute("viewBox", "0 0 420 48");
    return;
  }
  const layout = layoutGraph(state.pieces, state.edges);
  const columns = new Map();
  for (const piece of state.pieces) {
    const layer = layout.layer.get(piece.id) || 0;
    if (!columns.has(layer)) columns.set(layer, []);
    columns.get(layer).push(piece);
  }
  const layers = [...columns.keys()].sort((a, b) => a - b);
  const columnWidth = 176;
  const rowHeight = 46;
  const padX = 12;
  const padY = 16;
  let maxRows = 1;
  for (const list of columns.values()) maxRows = Math.max(maxRows, list.length);
  const width = padX * 2 + layers.length * columnWidth;
  const height = padY + maxRows * rowHeight + 10;
  svg.setAttribute("width", String(width));
  svg.setAttribute("height", String(height));
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  const defs = el("defs", {}, svg);
  marker(defs, "arrow-mesh", "#d4b483");
  marker(defs, "arrow-mesh-cycle", "#e07a6a");
  const pos = new Map();
  layers.forEach((layer, layerIndex) => {
    columns.get(layer).forEach((piece, row) => {
      pos.set(piece.id, { x: padX + layerIndex * columnWidth, y: padY + row * rowHeight });
    });
  });
  const back = new Set(layout.back.map((edge) => `${edge.prereq}\0${edge.dependent}`));
  const ring = new Set();
  if (state.cycle) {
    for (let i = 0; i < state.cycle.length - 1; i += 1) ring.add(`${state.cycle[i]}\0${state.cycle[i + 1]}`);
  }
  for (const edge of state.edges) {
    const from = pos.get(edge.prereq);
    const to = pos.get(edge.dependent);
    if (!from || !to) continue;
    const key = `${edge.prereq}\0${edge.dependent}`;
    const x1 = from.x + 156;
    const y1 = from.y + 16;
    const x2 = to.x;
    const y2 = to.y + 16;
    let d;
    if (edge.prereq === edge.dependent) {
      d = `M ${x1 - 24} ${y1} C ${x1 + 28} ${y1 - 34}, ${x1 + 28} ${y1 + 34}, ${x1 - 24} ${y1 + 6}`;
    } else if (from.x >= to.x) {
      const bow = Math.min(y1, y2) - 30;
      d = `M ${x1} ${y1} C ${x1 + 28} ${bow}, ${x2 - 28} ${bow}, ${x2} ${y2}`;
    } else {
      const mid = (x1 + x2) / 2;
      d = `M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`;
    }
    const classes = ["edge"];
    if (back.has(key)) classes.push("back");
    if (state.selected === edge.prereq || state.selected === edge.dependent) classes.push("hot");
    if (ring.has(key)) classes.push("cycle");
    el("path", {
      d, class: classes.join(" "),
      "marker-end": ring.has(key) ? "url(#arrow-mesh-cycle)" : "url(#arrow-mesh)",
    }, svg);
  }
  for (const piece of state.pieces) {
    const spot = pos.get(piece.id);
    const group = el("g", { class: `node ${pieceFlags(piece.id)}`, "data-id": piece.id }, svg);
    el("rect", { x: spot.x, y: spot.y, width: 156, height: 32, rx: 16 }, group);
    const title = el("title", {}, group);
    title.textContent = piece.blurb || piece.name;
    const text = el("text", { x: spot.x + 14, y: spot.y + 21 }, group);
    text.textContent = piece.name.length > 20 ? `${piece.name.slice(0, 19)}…` : piece.name;
  }
}

function renderControls() {
  document.getElementById("run").textContent = state.playing ? "Stop" : "Run";
}

function methodNote() {
  if (state.method === "dfs") {
    return "Finishing chalk does not take requests. Clicking a piece only inspects it. Step descends, chalks, then reads the chalk backward onto the sky.";
  }
  if (state.policy === "hand") {
    return "Click a glowing piece to seat it. Run seats whatever is forced, then stops when several pieces are free.";
  }
  if (state.policy === "clerk") {
    return "Run seats the alphabetically first free piece whenever the queue holds a choice. Step does the same, one piece at a time.";
  }
  return "Run keeps the oldest piece in the queue. That is Kahn's algorithm with a first-in list. Step walks it one seating at a time.";
}

function renderWork() {
  const title = document.getElementById("work-title");
  const work = document.getElementById("work");
  work.replaceChildren();
  if (state.method === "kahn") {
    title.textContent = "Ready now";
    if (state.kahn.queue.length === 0) {
      const note = document.createElement("p");
      note.className = "quiet";
      if (state.phase === "seized") note.textContent = "The queue is empty and the bench is not. That is the cycle.";
      else if (state.phase === "done") note.textContent = "The queue is empty because everything is seated.";
      else note.textContent = "Nothing is free.";
      work.appendChild(note);
      return;
    }
    for (const id of state.kahn.queue) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "token";
      button.dataset.id = id;
      button.textContent = pieceName(id);
      work.appendChild(button);
    }
    return;
  }
  title.textContent = "On the stack";
  if (state.dfs.stack.length === 0) {
    const note = document.createElement("p");
    note.className = "quiet";
    note.textContent = state.dfs.done ? "The descent is over." : "The stack is empty. Step to descend.";
    work.appendChild(note);
    return;
  }
  for (const id of state.dfs.stack) {
    const chip = document.createElement("span");
    chip.className = "token static";
    chip.textContent = pieceName(id);
    work.appendChild(chip);
  }
}

function renderProgram() {
  const lines = state.method === "kahn" ? KAHN_LINES : DFS_LINES;
  const list = document.getElementById("program");
  list.replaceChildren();
  lines.forEach((line, index) => {
    const item = document.createElement("li");
    item.textContent = line;
    if (state.highlight.has(index)) item.className = "on";
    list.appendChild(item);
  });
  document.getElementById("algo-title").textContent = state.method === "kahn"
    ? "Kahn's algorithm"
    : "Depth-first finishing times";
}

function renderOrders() {
  const dawn = dawnIds();
  const order = document.getElementById("order");
  order.replaceChildren();
  document.getElementById("order-title").textContent = state.method === "dfs" ? "The dawn, read backward" : "The dawn so far";
  if (dawn.length === 0) {
    const item = document.createElement("li");
    item.textContent = state.method === "dfs" ? "Not read backward yet." : "Nothing seated yet.";
    order.appendChild(item);
  } else {
    dawn.forEach((id) => {
      const item = document.createElement("li");
      item.textContent = pieceName(id);
      order.appendChild(item);
    });
  }
  const wrap = document.getElementById("chalk-wrap");
  wrap.hidden = state.method !== "dfs";
  const chalk = document.getElementById("chalk");
  chalk.replaceChildren();
  if (state.method === "dfs") {
    if (state.dfs.chalk.length === 0) {
      const item = document.createElement("li");
      item.textContent = "Nothing finished yet.";
      chalk.appendChild(item);
    } else {
      state.dfs.chalk.forEach((id) => {
        const item = document.createElement("li");
        item.textContent = pieceName(id);
        chalk.appendChild(item);
      });
    }
  }
  const proof = document.getElementById("proof");
  let text = "";
  if (state.phase === "seized") {
    if (state.method === "kahn") {
      const ok = respectsBearings(state.pieces, state.edges, state.kahn.order);
      text = ok
        ? "The seated prefix respects every bearing it touches. The rest cannot be extended to a full order."
        : "The seated prefix breaks a bearing. That is a fault in the bench.";
    } else {
      text = "No reading of the chalk is a dawn, because a cycle has no topological order.";
    }
  } else if (state.phase === "done" && state.pieces.length) {
    const ok = isValidOrder(state.pieces, state.edges, dawn);
    text = ok
      ? `Checked: ${state.edges.length} bearings, all pointing forward.`
      : "Checked: this order breaks a bearing. The bench is wrong.";
  }
  proof.textContent = text;
  proof.className = text.includes("fault") || text.includes("wrong") ? "bad" : text ? "good" : "";
}

function renderChoices() {
  const list = document.getElementById("choices");
  list.replaceChildren();
  const item = document.createElement("li");
  if (state.method === "dfs") {
    const analysis = ensureAnalysis();
    if (analysis.cycle) item.textContent = "A cycle has no finishing-time order, listed forward or backward.";
    else if (analysis.book.join() === analysis.flipped.join()) item.textContent = "Reversing the book's listing chalks the same dawn. This one is forced.";
    else item.textContent = "The chalk looks forced, but only because the book lists bearings in one order. Reverse that listing and another legal dawn appears. The freedom moved; it did not vanish.";
  } else if (state.kahn.choices.length === 0) {
    item.textContent = state.phase === "done"
      ? "The queue never held more than one piece. This dawn was forced."
      : "No choice yet. A choice is a moment when more than one piece is free.";
  } else {
    list.replaceChildren();
    state.kahn.choices.forEach((choice) => {
      const row = document.createElement("li");
      row.textContent = `Free together: ${choice.ready.map(pieceName).join(", ")}. Seated ${pieceName(choice.seated)}.`;
      list.appendChild(row);
    });
    return;
  }
  list.appendChild(item);
}

function renderCompare() {
  const host = document.getElementById("compare");
  host.replaceChildren();
  const analysis = ensureAnalysis();
  if (analysis.cycle) {
    const paragraph = document.createElement("p");
    paragraph.textContent = "Neither mechanician will name a dawn. The bearings contradict themselves, so both the queue and the chalk refuse a full order.";
    host.appendChild(paragraph);
    return;
  }
  const pair = document.createElement("div");
  pair.className = "pair";
  [["The ledger", analysis.ledger], ["The clerk", analysis.clerk]].forEach(([heading, order], side) => {
    const column = document.createElement("div");
    const title = document.createElement("h4");
    title.textContent = heading;
    column.appendChild(title);
    const list = document.createElement("ol");
    const other = side === 0 ? analysis.clerk : analysis.ledger;
    order.forEach((id, index) => {
      const item = document.createElement("li");
      item.textContent = pieceName(id);
      if (other[index] !== id) item.className = "diff";
      list.appendChild(item);
    });
    column.appendChild(list);
    pair.appendChild(column);
  });
  host.appendChild(pair);
  const note = document.createElement("p");
  note.className = "quiet";
  const same = analysis.ledger.join() === analysis.clerk.join();
  note.textContent = same
    ? "Both habits produce the same dawn. On this bench the queue never holds a real disagreement — or their rules happen to agree."
    : "Both dawns are correct. A topological sort does not promise a unique answer. Brass marks the places they disagree.";
  host.appendChild(note);
}

function structuralWaiting(id) {
  const seen = new Set();
  let count = 0;
  for (const edge of state.edges) {
    if (edge.dependent !== id || seen.has(edge.prereq)) continue;
    seen.add(edge.prereq);
    count += 1;
  }
  return count;
}

function renderTable() {
  const body = document.getElementById("rows");
  body.replaceChildren();
  for (const piece of state.pieces) {
    const row = document.createElement("tr");
    row.dataset.id = piece.id;
    row.tabIndex = 0;
    row.className = pieceFlags(piece.id);
    const name = document.createElement("td");
    name.textContent = piece.name;
    const waiting = document.createElement("td");
    waiting.className = "num";
    const live = state.method === "kahn" ? state.kahn.indeg.get(piece.id) : structuralWaiting(piece.id);
    waiting.textContent = String(live ?? 0);
    const mode = document.createElement("td");
    const flags = pieceFlags(piece.id);
    if (flags.includes("in-cycle")) mode.textContent = "In the ring";
    else if (flags.includes("seated")) mode.textContent = "Seated";
    else if (flags.includes("ready")) mode.textContent = "Ready";
    else if (flags.includes("onstack")) mode.textContent = "On the stack";
    else if (flags.includes("chalked")) mode.textContent = "Chalked";
    else mode.textContent = "Waiting";
    row.append(name, waiting, mode);
    body.appendChild(row);
  }
}

function waitsOn(id) {
  const seen = new Set();
  const list = [];
  for (const edge of state.edges) {
    if (edge.dependent !== id || seen.has(edge.prereq)) continue;
    seen.add(edge.prereq);
    list.push(edge.prereq);
  }
  return list;
}

function holds(id) {
  const seen = new Set();
  const list = [];
  for (const edge of state.edges) {
    if (edge.prereq !== id || seen.has(edge.dependent)) continue;
    seen.add(edge.dependent);
    list.push(edge.dependent);
  }
  return list;
}

function renderInspector() {
  const host = document.getElementById("inspector");
  host.replaceChildren();
  const piece = state.selected ? byId(state.selected) : null;
  if (!piece) {
    const note = document.createElement("p");
    note.className = "quiet";
    note.textContent = "Select a piece on the sky, the mesh, or the table.";
    host.appendChild(note);
    return;
  }
  host.className = "inspector";
  const title = document.createElement("h4");
  title.textContent = piece.name;
  const kind = document.createElement("p");
  kind.className = "kind";
  kind.textContent = piece.kind;
  const blurb = document.createElement("p");
  blurb.textContent = piece.blurb || "Added on the bench tonight.";
  host.append(title, kind, blurb);

  const waitsLabel = document.createElement("p");
  waitsLabel.className = "kind";
  waitsLabel.textContent = "Waits on";
  host.appendChild(waitsLabel);
  const chips = document.createElement("div");
  chips.className = "chips";
  const prerequisites = waitsOn(piece.id);
  if (prerequisites.length === 0) {
    const none = document.createElement("span");
    none.className = "quiet";
    none.textContent = "Nothing. It may start a dawn.";
    chips.appendChild(none);
  }
  prerequisites.forEach((prereq) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = `Lift bearing · ${pieceName(prereq)}`;
    button.addEventListener("click", () => {
      state.edges = state.edges.filter((edge) => !(edge.prereq === prereq && edge.dependent === piece.id));
      mutate(`${piece.name} no longer waits on ${pieceName(prereq)}.`);
    });
    chips.appendChild(button);
  });
  host.appendChild(chips);

  const held = holds(piece.id);
  if (held.length) {
    const line = document.createElement("p");
    line.textContent = `Holds back ${held.map(pieceName).join(", ")}.`;
    host.appendChild(line);
  }
  const lift = document.createElement("button");
  lift.type = "button";
  lift.textContent = "Lift this piece off the bench";
  lift.addEventListener("click", () => {
    const name = piece.name;
    state.pieces = state.pieces.filter((item) => item.id !== piece.id);
    state.edges = state.edges.filter((edge) => edge.prereq !== piece.id && edge.dependent !== piece.id);
    state.selected = null;
    mutate(`${name} is off the bench. Bearings that touched it are gone.`);
  });
  host.appendChild(lift);
}

function syncBearingSelects() {
  const sig = state.pieces.map((piece) => piece.id).join("|");
  if (sig === bearingSig) return;
  bearingSig = sig;
  for (const id of ["prereq", "dependent"]) {
    const select = document.getElementById(id);
    const previous = select.value;
    select.replaceChildren();
    state.pieces.forEach((piece) => {
      const option = document.createElement("option");
      option.value = piece.id;
      option.textContent = piece.name;
      select.appendChild(option);
    });
    if ([...select.options].some((option) => option.value === previous)) select.value = previous;
  }
}

function render() {
  const altered = signature() !== state.base;
  document.getElementById("kicker").textContent = state.commission.kicker;
  document.getElementById("stage-title").textContent = state.commission.title + (altered ? " · altered" : "");
  document.getElementById("summary").textContent = state.commission.summary;
  document.getElementById("status").textContent = state.status;
  document.getElementById("method-note").textContent = methodNote();
  document.getElementById("count-result").textContent = state.countText;
  renderControls();
  renderSky();
  renderMesh();
  renderWork();
  renderProgram();
  renderOrders();
  renderChoices();
  renderCompare();
  renderTable();
  renderInspector();
  syncBearingSelects();
}

function uniqueId(name) {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "piece";
  let id = base;
  let n = 2;
  while (state.pieces.some((piece) => piece.id === id)) {
    id = `${base}-${n}`;
    n += 1;
  }
  return id;
}

function autoPlace(index) {
  const turn = index * 2.399963;
  const radius = 140 + (index % 6) * 34;
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  return {
    x: clamp(Math.round(500 + Math.cos(turn) * radius), 48, 952),
    y: clamp(Math.round(360 + Math.sin(turn) * radius * 0.72), 48, 700),
  };
}

function bind() {
  const commission = document.getElementById("commission");
  COMMISSIONS.forEach((item) => {
    const option = document.createElement("option");
    option.value = item.id;
    option.textContent = `${item.kicker} — ${item.title}`;
    commission.appendChild(option);
  });
  commission.addEventListener("change", () => loadCommission(commission.value));

  document.getElementById("step").addEventListener("click", () => {
    state.playing = false;
    absorb(advance());
    render();
  });
  document.getElementById("run").addEventListener("click", () => { run(); });
  document.getElementById("reset").addEventListener("click", () => {
    state.playing = false;
    resetProgress();
    state.status = openingStatus();
    render();
  });
  document.getElementById("restore").addEventListener("click", () => loadCommission(state.commission.id));
  document.getElementById("brisk").addEventListener("change", renderControls);

  document.querySelectorAll('input[name="policy"]').forEach((input) => {
    input.addEventListener("change", () => {
      if (!input.checked) return;
      state.policy = input.value;
      if (state.kahn) state.kahn.policy = input.value;
      document.getElementById("method-note").textContent = methodNote();
    });
  });
  document.querySelectorAll('input[name="method"]').forEach((input) => {
    input.addEventListener("change", () => {
      if (!input.checked) return;
      state.method = input.value;
      state.playing = false;
      resetProgress();
      state.status = openingStatus();
      render();
    });
  });

  document.getElementById("sky").addEventListener("click", (event) => {
    const hit = event.target.closest("[data-id]");
    if (!hit) {
      state.selected = null;
      render();
      return;
    }
    onPiece(hit.getAttribute("data-id"), true);
  });
  document.getElementById("mesh").addEventListener("click", (event) => {
    const hit = event.target.closest("[data-id]");
    if (!hit) return;
    onPiece(hit.getAttribute("data-id"), true);
  });
  document.getElementById("work").addEventListener("click", (event) => {
    const hit = event.target.closest("button[data-id]");
    if (!hit) return;
    onPiece(hit.dataset.id, true);
  });
  const rows = document.getElementById("rows");
  rows.addEventListener("click", (event) => {
    const hit = event.target.closest("tr[data-id]");
    if (!hit) return;
    onPiece(hit.dataset.id, true);
  });
  rows.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const hit = event.target.closest("tr[data-id]");
    if (!hit) return;
    event.preventDefault();
    onPiece(hit.dataset.id, true);
  });

  document.getElementById("new-piece").addEventListener("submit", (event) => {
    event.preventDefault();
    const name = document.getElementById("piece-name").value.trim().slice(0, 42);
    if (!name) return;
    const kind = document.getElementById("piece-kind").value;
    const place = autoPlace(state.pieces.length);
    state.pieces.push({
      id: uniqueId(name),
      name,
      kind,
      x: place.x,
      y: place.y,
      r: kind === "sun" ? 28 : kind === "gear" || kind === "wheel" ? 24 : 16,
      fill: FILL[kind] || "#d2b07a",
      blurb: "Added on the bench tonight.",
      labelSide: "below",
    });
    document.getElementById("piece-name").value = "";
    mutate(`${name} is on the bench. It waits on nothing yet.`);
  });

  document.getElementById("new-bearing").addEventListener("submit", (event) => {
    event.preventDefault();
    const prereq = document.getElementById("prereq").value;
    const dependent = document.getElementById("dependent").value;
    if (!prereq || !dependent) {
      state.status = "Lay a piece on the bench before setting a bearing.";
      render();
      return;
    }
    if (state.edges.some((edge) => edge.prereq === prereq && edge.dependent === dependent)) {
      state.status = "That bearing is already in the book.";
      render();
      return;
    }
    state.edges.push({ prereq, dependent });
    const cycle = findCycle(state.pieces, state.edges);
    const extra = cycle ? " That bearing closes a ring." : "";
    mutate(`${pieceName(prereq)} must now be seated before ${pieceName(dependent)}.${extra}`);
  });

  document.getElementById("count").addEventListener("click", async () => {
    const stamp = signature();
    state.countText = "Counting linear extensions…";
    document.getElementById("count-result").textContent = state.countText;
    await new Promise((resolve) => setTimeout(resolve, 20));
    if (signature() !== stamp) return;
    const result = countExtensions(state.pieces, state.edges);
    if (!result.exact) state.countText = result.reason;
    else if (result.count === 0n) {
      state.countText = "Zero. A ring of bearings has no linear extension. There is no dawn that seats every piece.";
    } else if (result.count === 1n) state.countText = "One. The bearings force a single order.";
    else if (state.edges.length === 0) {
      state.countText = `${formatBig(result.count)} legal dawns. With no bearings, that number is ${state.pieces.length}!.`;
    } else {
      state.countText = `${formatBig(result.count)} legal dawns. Each one is a topological sort of this bench.`;
    }
    document.getElementById("count-result").textContent = state.countText;
  });

  document.addEventListener("keydown", (event) => {
    if (event.target.closest("input, textarea, select, button, summary, a")) return;
    if (event.key === " ") {
      event.preventDefault();
      document.getElementById("step").click();
    } else if (event.key === "Escape") {
      state.playing = false;
      renderControls();
    }
  });

  document.getElementById("sky-frame").addEventListener("animationend", (event) => {
    if (event.animationName === "seize") event.currentTarget.classList.remove("seized");
  });
}

bind();
loadCommission("queen");
