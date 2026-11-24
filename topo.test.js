import assert from "node:assert/strict";
import { test } from "node:test";
import { COMMISSIONS } from "./commissions.js";
import {
  countExtensions,
  createKahn,
  dfsTrace,
  findCycle,
  isValidOrder,
  layersOf,
  layoutGraph,
  respectsBearings,
  runKahn,
  stepKahn,
} from "./topo.js";

const chain = {
  nodes: ["a", "b", "c"],
  edges: [
    { prereq: "a", dependent: "b" },
    { prereq: "b", dependent: "c" },
  ],
};

test("a chain has one order and both algorithms find it", () => {
  const kahn = runKahn(chain.nodes, chain.edges, "ledger");
  const dfs = dfsTrace(chain.nodes, chain.edges);
  assert.deepEqual(kahn.order, ["a", "b", "c"]);
  assert.equal(kahn.seized, false);
  assert.deepEqual(dfs.order, ["a", "b", "c"]);
  assert.equal(dfs.cycle, null);
  assert.equal(countExtensions(chain.nodes, chain.edges).count, 1n);
});

test("a diamond has two linear extensions and the policies disagree", () => {
  const nodes = [
    { id: "a", name: "Ash" },
    { id: "c", name: "Cedar" },
    { id: "b", name: "Alder" },
    { id: "d", name: "Yew" },
  ];
  const edges = [
    { prereq: "a", dependent: "c" },
    { prereq: "a", dependent: "b" },
    { prereq: "b", dependent: "d" },
    { prereq: "c", dependent: "d" },
  ];
  const ledger = runKahn(nodes, edges, "ledger");
  const clerk = runKahn(nodes, edges, "clerk");
  assert.deepEqual(ledger.order, ["a", "c", "b", "d"]);
  assert.deepEqual(clerk.order, ["a", "b", "c", "d"]);
  assert.equal(isValidOrder(nodes, edges, ledger.order), true);
  assert.equal(isValidOrder(nodes, edges, clerk.order), true);
  assert.equal(countExtensions(nodes, edges).count, 2n);
  assert.equal(isValidOrder(nodes, edges, ["a", "d", "b", "c"]), false);
});

test("a hand is asked only when the queue holds a real choice", () => {
  const nodes = [
    { id: "a", name: "Ash" },
    { id: "b", name: "Alder" },
    { id: "c", name: "Cedar" },
  ];
  const edges = [
    { prereq: "a", dependent: "b" },
    { prereq: "a", dependent: "c" },
  ];
  const state = createKahn(nodes, edges, "hand");
  assert.equal(stepKahn(state, "c").type, "blocked");
  assert.equal(stepKahn(state).type, "seat");
  const choice = stepKahn(state);
  assert.equal(choice.type, "await");
  assert.equal(choice.queue.length, 2);
  const seated = stepKahn(state, "c");
  assert.equal(seated.id, "c");
  assert.deepEqual(seated.order, ["a", "c"]);
});

test("cycles are named, refused, and counted as zero", () => {
  const self = findCycle(["a"], [{ prereq: "a", dependent: "a" }]);
  assert.deepEqual(self, ["a", "a"]);
  assert.equal(countExtensions(["a"], [{ prereq: "a", dependent: "a" }]).count, 0n);

  const pair = findCycle(
    ["a", "b"],
    [
      { prereq: "a", dependent: "b" },
      { prereq: "b", dependent: "a" },
    ],
  );
  assert.equal(pair[0], pair[pair.length - 1]);
  assert.equal(new Set(pair).size, 2);

  const run = runKahn(
    ["frame", "a"],
    [
      { prereq: "frame", dependent: "a" },
      { prereq: "a", dependent: "a" },
    ],
    "ledger",
  );
  assert.deepEqual(run.order, ["frame"]);
  assert.equal(run.seized, true);
  assert.equal(respectsBearings(["frame", "a"], [{ prereq: "frame", dependent: "a" }], run.order), true);
});

test("layers follow the longest path and cyclic nodes are set aside", () => {
  const chainLayers = layersOf(chain.nodes, chain.edges);
  assert.equal(chainLayers.layer.get("a"), 0);
  assert.equal(chainLayers.layer.get("b"), 1);
  assert.equal(chainLayers.layer.get("c"), 2);
  assert.deepEqual(chainLayers.cyclic, []);

  const cyclic = layersOf(
    ["a", "b", "c"],
    [
      { prereq: "a", dependent: "b" },
      { prereq: "b", dependent: "a" },
    ],
  );
  assert.deepEqual(cyclic.cyclic.sort(), ["a", "b"]);
  assert.equal(cyclic.layer.get("c"), 0);
  assert.ok(cyclic.layer.get("a") > cyclic.layer.get("c"));
});

test("an empty bench has one empty dawn", () => {
  const run = runKahn([], [], "ledger");
  assert.deepEqual(run.order, []);
  assert.equal(run.seized, false);
  assert.equal(countExtensions([], []).count, 1n);
  assert.equal(countExtensions(["a", "b"], []).count, 2n);
});

test("every commission is internally consistent", () => {
  for (const commission of COMMISSIONS) {
    const cycle = findCycle(commission.pieces, commission.edges);
    const run = runKahn(commission.pieces, commission.edges, "ledger");
    const clerk = runKahn(commission.pieces, commission.edges, "clerk");
    const dfs = dfsTrace(commission.pieces, commission.edges);
    const count = countExtensions(commission.pieces, commission.edges);
    const layout = layoutGraph(commission.pieces, commission.edges);

    if (commission.id === "paradox") {
      assert.ok(cycle);
      assert.equal(run.seized, true);
      assert.deepEqual(run.order, ["plinth", "lamp", "plaque"]);
      assert.equal(dfs.order, null);
      assert.equal(count.count, 0n);
      const names = new Set(cycle.slice(0, -1));
      assert.deepEqual([...names].sort(), ["wheel-a", "wheel-b", "wheel-c"]);
      for (let i = 0; i < cycle.length - 1; i += 1) {
        assert.ok(
          commission.edges.some(
            (edge) => edge.prereq === cycle[i] && edge.dependent === cycle[i + 1],
          ),
        );
      }
    } else {
      assert.equal(cycle, null, commission.id);
      assert.equal(run.seized, false, commission.id);
      assert.equal(isValidOrder(commission.pieces, commission.edges, run.order), true, commission.id);
      assert.equal(isValidOrder(commission.pieces, commission.edges, clerk.order), true, commission.id);
      assert.equal(isValidOrder(commission.pieces, commission.edges, dfs.order), true, commission.id);
      assert.equal(count.exact, true, commission.id);
      assert.ok(count.count > 0n, commission.id);
    }

    for (const piece of commission.pieces) {
      assert.equal(typeof layout.layer.get(piece.id), "number", piece.id);
    }
    assert.deepEqual(layout.cyclic, []);
  }
});

test("the orrery is not a forced dawn, and the clerk disagrees with the ledger at once", () => {
  const queen = COMMISSIONS.find((commission) => commission.id === "queen");
  const ledger = runKahn(queen.pieces, queen.edges, "ledger");
  const clerk = runKahn(queen.pieces, queen.edges, "clerk");
  assert.equal(ledger.order[0], "frame");
  assert.equal(ledger.order[1], "barrel");
  assert.equal(clerk.order[0], "frame");
  assert.equal(clerk.order[1], "fusee");
  assert.notEqual(ledger.order.join(","), clerk.order.join(","));
  assert.ok(countExtensions(queen.pieces, queen.edges).count > 1n);

  const harbor = COMMISSIONS.find((commission) => commission.id === "harbor");
  const almanac = COMMISSIONS.find((commission) => commission.id === "almanac");
  assert.ok(countExtensions(harbor.pieces, harbor.edges).count > 1n);
  assert.ok(countExtensions(almanac.pieces, almanac.edges).count > 1n);
});

test("depth-first neighbor order is another place the result can change", () => {
  const nodes = ["a", "b", "c", "d"];
  const edges = [
    { prereq: "a", dependent: "b" },
    { prereq: "a", dependent: "c" },
    { prereq: "b", dependent: "d" },
    { prereq: "c", dependent: "d" },
  ];
  const book = dfsTrace(nodes, edges);
  const flipped = dfsTrace(nodes, edges, { reverse: true });
  assert.notEqual(book.order.join(","), flipped.order.join(","));
  assert.equal(isValidOrder(nodes, edges, book.order), true);
  assert.equal(isValidOrder(nodes, edges, flipped.order), true);
});

test("duplicate bearings count once", () => {
  const once = countExtensions(
    ["a", "b"],
    [
      { prereq: "a", dependent: "b" },
      { prereq: "a", dependent: "b" },
    ],
  );
  assert.equal(once.count, 1n);
  const run = runKahn(
    ["a", "b"],
    [
      { prereq: "a", dependent: "b" },
      { prereq: "a", dependent: "b" },
    ],
  );
  assert.deepEqual(run.order, ["a", "b"]);
});
