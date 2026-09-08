import { describe, expect, it } from 'vitest';

import { Vector3D } from '../src/core/Types';
import { ParsedRoadSegment } from '../src/gis/RealOsmLoader';
import { RoadGraph } from '../src/navigation/RoadGraph';

const v = (x: number, y: number, z: number): Vector3D => ({ x, y, z });

const segment = (id: string, points: Vector3D[]): ParsedRoadSegment => ({
  id,
  wayId: Number(id.replace(/\D/g, '')) || 1,
  name: `road-${id}`,
  highwayType: 'residential',
  lanes: 2,
  speedLimitKmh: 40,
  points,
});

describe('RoadGraph.buildFromOsm', () => {
  it('creates one node per distinct point of a two-point segment', () => {
    const g = new RoadGraph();
    g.buildFromOsm([segment('a', [v(0, 0, 0), v(100, 0, 0)])]);

    expect(g.getAllNodes()).toHaveLength(2);
  });

  it('links the two nodes in both directions', () => {
    const g = new RoadGraph();
    g.buildFromOsm([segment('a', [v(0, 0, 0), v(100, 0, 0)])]);

    const [n1, n2] = g.getAllNodes();
    expect(g.getNeighborNodeIds(n1.id)).toContain(n2.id);
    expect(g.getNeighborNodeIds(n2.id)).toContain(n1.id);
  });

  it('emits a forward and a reverse edge per point pair', () => {
    const g = new RoadGraph();
    g.buildFromOsm([segment('a', [v(0, 0, 0), v(100, 0, 0)])]);

    expect(g.getAllEdges()).toHaveLength(2);
  });

  it('records the true 3D length on each edge', () => {
    const g = new RoadGraph();
    g.buildFromOsm([segment('a', [v(0, 0, 0), v(3, 0, 4)])]);

    for (const edge of g.getAllEdges()) {
      expect(edge.length).toBeCloseTo(5, 6);
    }
  });

  it('snaps endpoints within the threshold onto a single intersection node', () => {
    const g = new RoadGraph();
    // Two roads meeting at (100,0,0), the second one 1m off — inside the 3.5m default.
    g.buildFromOsm([
      segment('a', [v(0, 0, 0), v(100, 0, 0)]),
      segment('b', [v(101, 0, 0), v(200, 0, 0)]),
    ]);

    // 4 endpoints, but two of them snap together -> 3 nodes.
    expect(g.getAllNodes()).toHaveLength(3);
  });

  it('leaves endpoints further apart than the threshold as separate nodes', () => {
    const g = new RoadGraph();
    g.buildFromOsm([
      segment('a', [v(0, 0, 0), v(100, 0, 0)]),
      segment('b', [v(110, 0, 0), v(200, 0, 0)]),
    ]);

    expect(g.getAllNodes()).toHaveLength(4);
  });

  it('honours a custom snap threshold', () => {
    const g = new RoadGraph();
    const segs = [
      segment('a', [v(0, 0, 0), v(100, 0, 0)]),
      segment('b', [v(105, 0, 0), v(200, 0, 0)]),
    ];

    g.buildFromOsm(segs, 3.5);
    expect(g.getAllNodes()).toHaveLength(4);

    g.buildFromOsm(segs, 10);
    expect(g.getAllNodes()).toHaveLength(3);
  });

  it('makes a snapped junction traversable between both roads', () => {
    const g = new RoadGraph();
    g.buildFromOsm([
      segment('a', [v(0, 0, 0), v(100, 0, 0)]),
      segment('b', [v(101, 0, 0), v(200, 0, 0)]),
    ]);

    const junction = g.findNearestNode(v(100, 0, 0));
    expect(junction).not.toBeNull();
    // The junction reaches the start of road A and the end of road B.
    expect(g.getNeighborNodeIds(junction!.id)).toHaveLength(2);
  });

  it('skips segments with fewer than two points', () => {
    const g = new RoadGraph();
    g.buildFromOsm([segment('a', [v(0, 0, 0)]), segment('b', [])]);

    expect(g.getAllNodes()).toHaveLength(0);
    expect(g.getAllEdges()).toHaveLength(0);
  });

  it('discards previous state on rebuild', () => {
    const g = new RoadGraph();
    g.buildFromOsm([segment('a', [v(0, 0, 0), v(100, 0, 0)])]);
    g.buildFromOsm([segment('b', [v(500, 0, 500), v(600, 0, 500)])]);

    expect(g.getAllNodes()).toHaveLength(2);
    expect(g.findNearestNode(v(0, 0, 0), 50)).toBeNull();
  });
});

describe('RoadGraph.clear', () => {
  it('empties nodes, edges and adjacency', () => {
    const g = new RoadGraph();
    g.buildFromOsm([segment('a', [v(0, 0, 0), v(100, 0, 0)])]);
    const nodeId = g.getAllNodes()[0].id;

    g.clear();

    expect(g.getAllNodes()).toHaveLength(0);
    expect(g.getAllEdges()).toHaveLength(0);
    expect(g.getNeighborNodeIds(nodeId)).toEqual([]);
  });
});

describe('RoadGraph.findNearestNode', () => {
  it('returns the closest node by horizontal distance', () => {
    const g = new RoadGraph();
    g.buildFromOsm([segment('a', [v(0, 0, 0), v(100, 0, 0)])]);

    const near = g.findNearestNode(v(90, 0, 0));
    expect(near!.position.x).toBe(100);
  });

  it('ignores height when measuring', () => {
    const g = new RoadGraph();
    g.buildFromOsm([segment('a', [v(0, 0, 0), v(100, 0, 0)])]);

    // 400m up but directly above the origin node.
    expect(g.findNearestNode(v(0, 400, 0), 50)!.position.x).toBe(0);
  });

  it('returns null when everything is beyond maxDistance', () => {
    const g = new RoadGraph();
    g.buildFromOsm([segment('a', [v(0, 0, 0), v(100, 0, 0)])]);

    expect(g.findNearestNode(v(5000, 0, 5000), 100)).toBeNull();
  });

  it('returns null for a malformed position rather than throwing', () => {
    const g = new RoadGraph();
    g.buildFromOsm([segment('a', [v(0, 0, 0), v(100, 0, 0)])]);

    expect(g.findNearestNode({ x: NaN, y: 0, z: 0 })).toBeNull();
    expect(g.findNearestNode(undefined as unknown as Vector3D)).toBeNull();
  });

  it('returns null on an empty graph', () => {
    expect(new RoadGraph().findNearestNode(v(0, 0, 0))).toBeNull();
  });
});

describe('RoadGraph lookups', () => {
  it('returns undefined for ids that do not exist', () => {
    const g = new RoadGraph();
    expect(g.getNode(-1)).toBeUndefined();
    expect(g.getEdge('nope')).toBeUndefined();
  });

  it('carries segment metadata onto every edge', () => {
    const g = new RoadGraph();
    g.buildFromOsm([segment('a', [v(0, 0, 0), v(100, 0, 0)])]);

    for (const edge of g.getAllEdges()) {
      expect(edge.lanes).toBe(2);
      expect(edge.speedLimitKmh).toBe(40);
      expect(edge.highwayType).toBe('residential');
    }
  });
});
