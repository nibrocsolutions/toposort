# First Light

A night bench for topological sort. The instruments are fictional. The orders are not.

Every commission is a directed graph of bearings: an edge means one piece must be seated before another. A legal dawn is a topological sort of that graph. When the bearings form a cycle, there is no dawn, and the bench says which pieces wait in a ring.

## Run

```bash
docker build -t first-light .
docker run --rm -p 8052:8052 first-light
```

If you have Compose:

```bash
docker compose up --build
```

Open `http://localhost:8052`.

The container listens on port **8052**.

## What the bench will do

- **The Queen's Desk Orrery** is an assembly order. Kahn's queue starts at the oak frame. The first time two pieces are free, the bearings have stopped deciding — that choice is yours, the ledger's, or the clerk's, and the two mechanicians build different skies.
- **The Harbor Clock** is an interlock. Two branches meet at the fog bell.
- **The Comet Almanac** is a schedule. The lecture waits on the fair copy. It does not wait on the press.
- **Lord Pellam's Paradox** is a cycle. The queue can still hang the lamp. Finishing chalk walks into the ring and stops.
- **An empty bench** is yours. With no bearings the number of dawns is n!. A self-bearing drops it to zero.

Under the sky, the same graph is drawn as a partial order, earlier on the left. The ledger steps either Kahn's algorithm or depth-first finishing times, checks that every bearing points forward, and can count the linear extensions.

## Tests

```bash
node --test topo.test.js
```

`topo.js` is the pattern. `app.js` is the bench.
