// Edges point from prerequisite to dependent: the prerequisite must be seated first.
// A topological order is a total order in which every edge points forward.

export function normalizeNode(node) {
  if (typeof node === "string") return { id: node, name: node };
  return { id: node.id, name: node.name || node.id };
}

export function indexGraph(nodes, edges) {
  const list = nodes.map(normalizeNode);
  const ids = list.map((node) => node.id);
  const name = new Map(list.map((node) => [node.id, node.name]));
  const idSet = new Set(ids);
  const adj = new Map(ids.map((id) => [id, []]));
  const indeg = new Map(ids.map((id) => [id, 0]));
  const seen = new Set();
  const clean = [];

  for (const edge of edges) {
    if (!idSet.has(edge.prereq) || !idSet.has(edge.dependent)) continue;
    const key = `${edge.prereq}\0${edge.dependent}`;
    if (seen.has(key)) continue;
    seen.add(key);
    clean.push({ prereq: edge.prereq, dependent: edge.dependent });
    adj.get(edge.prereq).push(edge.dependent);
    indeg.set(edge.dependent, indeg.get(edge.dependent) + 1);
  }

  return { ids, name, adj, indeg, edges: clean };
}

function pathBack(parent, start, end) {
  const chain = [start];
  let cursor = start;
  const guard = new Set();
  while (cursor !== end) {
    const previous = parent.get(cursor);
    if (previous == null || guard.has(previous)) {
      const fallback = [end, start];
      if (fallback[fallback.length - 1] !== end) fallback.push(end);
      return fallback;
    }
    guard.add(cursor);
    cursor = previous;
    chain.push(cursor);
  }
  chain.reverse();
  chain.push(end);
  return chain;
}

export function findCycle(nodes, edges) {
  const graph = indexGraph(nodes, edges);
  const color = new Map();
  const parent = new Map();
  let cycle = null;

  function visit(id) {
    color.set(id, 1);
    for (const next of graph.adj.get(id)) {
      const tone = color.get(next) || 0;
      if (tone === 1) {
        cycle = pathBack(parent, id, next);
        return true;
      }
      if (tone === 0) {
        parent.set(next, id);
        if (visit(next)) return true;
      }
    }
    color.set(id, 2);
    return false;
  }

  for (const id of graph.ids) {
    if ((color.get(id) || 0) === 0 && visit(id)) break;
  }
  return cycle;
}

export function createKahn(nodes, edges, policy = "ledger") {
  const graph = indexGraph(nodes, edges);
  const indeg = new Map(graph.indeg);
  return {
    ids: graph.ids,
    name: graph.name,
    adj: graph.adj,
    indeg,
    queue: graph.ids.filter((id) => indeg.get(id) === 0),
    order: [],
    choices: [],
    policy,
    done: false,
    seized: false,
  };
}

function remainingIds(state) {
  const seated = new Set(state.order);
  return state.ids.filter((id) => !seated.has(id));
}

function seatAt(state, index) {
  const ready = state.queue.slice();
  const id = state.queue.splice(index, 1)[0];
  if (ready.length > 1) state.choices.push({ seated: id, ready });
  state.order.push(id);
  const unlocked = [];
  for (const dependent of state.adj.get(id)) {
    const next = state.indeg.get(dependent) - 1;
    state.indeg.set(dependent, next);
    if (next === 0) {
      state.queue.push(dependent);
      unlocked.push(dependent);
    }
  }
  if (state.queue.length === 0) {
    state.done = true;
    state.seized = state.order.length !== state.ids.length;
  }
  return {
    type: "seat",
    id,
    unlocked,
    queue: state.queue.slice(),
    order: state.order.slice(),
    finished: state.done,
    seized: state.seized,
    remaining: state.seized ? remainingIds(state) : [],
  };
}

export function stepKahn(state, choiceId) {
  if (state.done) {
    return {
      type: state.seized ? "seized" : "complete",
      order: state.order.slice(),
      remaining: remainingIds(state),
    };
  }
  if (state.queue.length === 0) {
    state.done = true;
    state.seized = state.order.length !== state.ids.length;
    return {
      type: state.seized ? "seized" : "complete",
      order: state.order.slice(),
      remaining: remainingIds(state),
    };
  }

  let index;
  if (choiceId != null) {
    index = state.queue.indexOf(choiceId);
    if (index < 0) {
      return {
        type: "blocked",
        id: choiceId,
        waiting: state.indeg.get(choiceId) ?? null,
      };
    }
  } else if (state.policy === "hand" && state.queue.length > 1) {
    return { type: "await", queue: state.queue.slice() };
  } else if (state.policy === "clerk") {
    index = 0;
    for (let i = 1; i < state.queue.length; i += 1) {
      const candidate = state.name.get(state.queue[i]);
      const best = state.name.get(state.queue[index]);
      if (String(candidate).localeCompare(String(best)) < 0) index = i;
    }
  } else {
    index = 0;
  }
  return seatAt(state, index);
}

export function runKahn(nodes, edges, policy = "ledger") {
  const state = createKahn(nodes, edges, policy === "hand" ? "ledger" : policy);
  while (!state.done) {
    const event = stepKahn(state);
    if (event.type !== "seat") break;
  }
  return {
    order: state.order.slice(),
    seized: state.seized || state.order.length !== state.ids.length,
    remaining: remainingIds(state),
    choices: state.choices.map((choice) => ({
      seated: choice.seated,
      ready: choice.ready.slice(),
    })),
  };
}

export function dfsTrace(nodes, edges, { reverse = false } = {}) {
  const graph = indexGraph(nodes, edges);
  const color = new Map();
  const parent = new Map();
  const events = [];
  const chalk = [];
  let cycle = null;

  function visit(id) {
    if (cycle) return;
    color.set(id, 1);
    events.push({ type: "enter", id });
    const children = graph.adj.get(id).slice();
    if (reverse) children.reverse();
    for (const next of children) {
      if (cycle) return;
      const tone = color.get(next) || 0;
      if (tone === 0) {
        parent.set(next, id);
        visit(next);
      } else if (tone === 1) {
        cycle = pathBack(parent, id, next);
        events.push({ type: "cycle", path: cycle });
        return;
      }
    }
    if (cycle) return;
    color.set(id, 2);
    chalk.push(id);
    events.push({ type: "finish", id });
  }

  for (const id of graph.ids) {
    if (cycle) break;
    if ((color.get(id) || 0) === 0) visit(id);
  }

  return {
    events,
    chalk,
    cycle,
    order: cycle ? null : chalk.slice().reverse(),
  };
}

export function respectsBearings(nodes, edges, order) {
  const graph = indexGraph(nodes, edges);
  const position = new Map(order.map((id, index) => [id, index]));
  for (const edge of graph.edges) {
    if (!position.has(edge.prereq) || !position.has(edge.dependent)) continue;
    if (position.get(edge.prereq) >= position.get(edge.dependent)) return false;
  }
  return true;
}

export function isValidOrder(nodes, edges, order) {
  const graph = indexGraph(nodes, edges);
  if (!order || order.length !== graph.ids.length) return false;
  const position = new Map();
  for (let index = 0; index < order.length; index += 1) {
    if (position.has(order[index])) return false;
    position.set(order[index], index);
  }
  for (const id of graph.ids) {
    if (!position.has(id)) return false;
  }
  for (const edge of graph.edges) {
    if (position.get(edge.prereq) >= position.get(edge.dependent)) return false;
  }
  return true;
}

export function layersOf(nodes, edges) {
  const graph = indexGraph(nodes, edges);
  const indeg = new Map(graph.indeg);
  const layer = new Map(graph.ids.map((id) => [id, 0]));
  const queue = graph.ids.filter((id) => indeg.get(id) === 0);
  const popped = new Set();

  while (queue.length) {
    const id = queue.shift();
    if (popped.has(id)) continue;
    popped.add(id);
    for (const dependent of graph.adj.get(id)) {
      layer.set(dependent, Math.max(layer.get(dependent), layer.get(id) + 1));
      indeg.set(dependent, indeg.get(dependent) - 1);
      if (indeg.get(dependent) === 0) queue.push(dependent);
    }
  }

  const cyclic = graph.ids.filter((id) => !popped.has(id));
  let maxLayer = 0;
  for (const id of popped) maxLayer = Math.max(maxLayer, layer.get(id));
  const seizedLayer = cyclic.length ? maxLayer + 1 : null;
  for (const id of cyclic) layer.set(id, seizedLayer);
  return { layer, cyclic, seizedLayer };
}

export function layoutGraph(nodes, edges) {
  let remaining = edges.map((edge) => ({ prereq: edge.prereq, dependent: edge.dependent }));
  const back = [];
  for (let guard = 0; guard <= edges.length; guard += 1) {
    const cycle = findCycle(nodes, remaining);
    if (!cycle || cycle.length < 2) break;
    const prereq = cycle[cycle.length - 2];
    const dependent = cycle[cycle.length - 1];
    const index = remaining.findIndex(
      (edge) => edge.prereq === prereq && edge.dependent === dependent,
    );
    if (index < 0) break;
    back.push(remaining[index]);
    remaining = remaining.filter((_, edgeIndex) => edgeIndex !== index);
  }
  const laid = layersOf(nodes, remaining);
  return { layer: laid.layer, cyclic: laid.cyclic, back };
}

function factorial(count) {
  let value = 1n;
  for (let factor = 2n; factor <= BigInt(count); factor += 1n) value *= factor;
  return value;
}

export function countExtensions(nodes, edges) {
  const graph = indexGraph(nodes, edges);
  if (findCycle(nodes, graph.edges)) return { exact: true, count: 0n };
  const count = graph.ids.length;
  if (graph.edges.length === 0) return { exact: true, count: factorial(count) };
  if (count > 20) {
    return {
      exact: false,
      count: null,
      reason:
        "More than 20 pieces. The exact count is a table over every subset that can be a legal prefix, and that table no longer fits a single gesture.",
    };
  }

  const index = new Map(graph.ids.map((id, position) => [id, position]));
  const prerequisites = new Uint32Array(count);
  for (const edge of graph.edges) {
    prerequisites[index.get(edge.dependent)] |= 1 << index.get(edge.prereq);
  }

  const size = 1 << count;
  const ways = new Array(size);
  ways[0] = 1n;
  for (let mask = 0; mask < size; mask += 1) {
    const current = ways[mask];
    if (!current) continue;
    for (let node = 0; node < count; node += 1) {
      const bit = 1 << node;
      if (mask & bit) continue;
      if ((prerequisites[node] & mask) !== prerequisites[node]) continue;
      const next = mask | bit;
      ways[next] = (ways[next] || 0n) + current;
    }
  }
  return { exact: true, count: ways[size - 1] || 0n };
}
