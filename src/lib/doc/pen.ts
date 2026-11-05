import type { Seg } from "./pathData";

/**
 * A node placed with the pen tool. (ox, oy) is the outgoing Bézier handle,
 * relative to the node. The incoming handle is its mirror image, so a
 * click-and-drag makes a smooth curve point and a plain click makes a corner.
 */
export interface PenNode {
  x: number;
  y: number;
  ox: number;
  oy: number;
}

const isCorner = (n: PenNode) => n.ox === 0 && n.oy === 0;

function link(a: PenNode, b: PenNode): Seg {
  if (isCorner(a) && isCorner(b)) return { t: "L", x: b.x, y: b.y };
  return {
    t: "C",
    x1: a.x + a.ox,
    y1: a.y + a.oy,
    x2: b.x - b.ox,
    y2: b.y - b.oy,
    x: b.x,
    y: b.y,
  };
}

/** Segments through the nodes, optionally closed back to the first node. */
export function penSegs(nodes: readonly PenNode[], closed: boolean): Seg[] {
  if (nodes.length === 0) return [];
  const segs: Seg[] = [{ t: "M", x: nodes[0].x, y: nodes[0].y }];
  for (let i = 1; i < nodes.length; i++) segs.push(link(nodes[i - 1], nodes[i]));
  if (closed && nodes.length > 2) {
    const last = nodes[nodes.length - 1];
    const first = nodes[0];
    // Skip a redundant closing line when the last node already sits on the first.
    if (Math.hypot(last.x - first.x, last.y - first.y) > 1e-6) segs.push(link(last, first));
    segs.push({ t: "Z" });
  }
  return segs;
}

/** Whether a path can be made from these nodes. */
export function canFinishPen(nodes: readonly PenNode[], closed: boolean): boolean {
  return closed ? nodes.length >= 3 : nodes.length >= 2;
}

/** Drop a trailing node that a double-click placed on top of the previous one. */
export function dropDuplicateTail(nodes: readonly PenNode[], tolerance = 0.5): PenNode[] {
  if (nodes.length < 2) return [...nodes];
  const a = nodes[nodes.length - 2];
  const b = nodes[nodes.length - 1];
  return Math.hypot(a.x - b.x, a.y - b.y) <= tolerance ? nodes.slice(0, -1) : [...nodes];
}
