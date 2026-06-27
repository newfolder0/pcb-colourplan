// IPC-2581 (open XML PCB exchange) -> Board adapter.
//
// Runs inside a Web Worker (no DOM), so XML is parsed with fast-xml-parser, not
// DOMParser. The mapping is deliberately tolerant: it searches for elements by
// local tag name at any depth and tries several attribute spellings, because
// real exports (KiCAD 8+, Altium, Cadence, Zuken) vary.
//
// COORDINATE NOTE: IPC-2581 uses Y-up (origin lower-left); our Board model and
// renderer use KiCAD's Y-down. Y_SIGN converts between them. ROT_SIGN/back-side
// mirroring should be confirmed against a real export (see plan).

import { XMLParser } from 'fast-xml-parser';
import type { Board, Footprint, Graphic, Mount, Side, Vec2 } from '../model/types';

const Y_SIGN = -1; // IPC Y-up -> model Y-down

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Node = any;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,
  parseAttributeValue: false,
  // Disable custom DOCTYPE entity expansion: standard predefined entities
  // (&lt; &amp; ...) are still decoded, but a malicious file cannot define
  // self-referential entities to mount a "billion laughs" expansion DoS.
  // (fast-xml-parser is pure JS with no network, so classic XXE is N/A.)
  processEntities: false,
});

export function parseIpc2581(xml: string): Board {
  const root = parser.parse(xml) as Node;
  const ipc = root['IPC-2581'] ?? root['IPC2581'];
  if (!ipc) throw new Error('Not an IPC-2581 file (missing <IPC-2581> root)');

  const unitScale = detectUnitScale(root);

  // Board outline from the first Profile polygon.
  const edges: Graphic[] = [];
  const profile = collect(ipc, 'Profile')[0];
  if (profile) {
    for (const poly of collect(profile, 'Polygon')) {
      const pts = polygonPoints(poly, unitScale);
      if (pts.length >= 2) edges.push({ kind: 'poly', layer: 'Edge.Cuts', width: 0.1, pts });
    }
  }

  // Package definitions: name -> { local outline points, has through-hole }.
  const packages = new Map<string, { pts: Vec2[]; thru: boolean }>();
  for (const pkg of collect(ipc, 'Package')) {
    const name = str(pkg['@_name']);
    if (!name) continue;
    const outline = collect(pkg, 'Outline')[0] ?? pkg;
    const poly = collect(outline, 'Polygon')[0];
    const pts = poly ? polygonPoints(poly, unitScale) : [];
    const thru = collect(pkg, 'Hole').length > 0;
    packages.set(name, { pts, thru });
  }

  // BOM: refDes -> { populate, value, footprint, props }. The BomItem carries the
  // clean human value (a "Value" characteristic) and a clean packageRef. The
  // placement <Component> only has a combined OEM design-number string and a
  // per-instance packageRef (e.g. "C_Rect..._12"), which would split identical
  // parts into separate BOM lines - so prefer the BomItem.
  const bom = new Map<string, { populate: boolean; value: string; footprint: string; props: Record<string, string>; excludeFromBom: boolean }>();
  for (const item of collect(ipc, 'BomItem')) {
    const props: Record<string, string> = {};
    for (const t of collect(item, 'Textual')) {
      const name = str(t['@_textualCharacteristicName']);
      if (name) props[name] = str(t['@_textualCharacteristicValue']);
    }
    const value = props['Value'] || str(item['@_OEMDesignNumberRef']) || str(item['@_OEMDesignNumber']) || characteristicValue(item);
    // DOCUMENT-category items are silkscreen symbols/logos (HV triangles, company
    // logos), not assembled parts - keep them out of the BOM/colour-plan.
    const excludeFromBom = str(item['@_category']).toUpperCase() === 'DOCUMENT';
    for (const rd of asArray(item['RefDes'])) {
      const name = str(rd['@_name']);
      if (!name) continue;
      const populate = str(rd['@_populate']).toLowerCase() !== 'false';
      bom.set(name, { populate, value, footprint: str(rd['@_packageRef']), props, excludeFromBom });
    }
  }

  const footprints: Footprint[] = [];
  for (const comp of collect(ipc, 'Component')) {
    const ref = str(comp['@_refDes'] ?? comp['@_refdes']);
    if (!ref) continue;
    const packageRef = str(comp['@_packageRef'] ?? comp['@_packageref']);
    const layerRef = str(comp['@_layerRef'] ?? comp['@_layer']).toUpperCase();
    // KiCAD names the layer "B.Cu"; others use "BOTTOM"/"BOT". "B.CU" does not
    // contain "BOT", so check the "B." prefix as well.
    const side: Side = layerRef.startsWith('B.') || layerRef.includes('BOT') ? 'B' : 'F';

    const loc = collect(comp, 'Location')[0];
    const xform = collect(comp, 'Xform')[0] ?? comp;
    const at = {
      x: num(loc?.['@_x'] ?? loc?.['@_xOffset']) * unitScale,
      y: Y_SIGN * num(loc?.['@_y'] ?? loc?.['@_yOffset']) * unitScale,
      rot: num(xform['@_rotation']),
    };

    const pkg = packages.get(packageRef);
    const mount = mountOf(str(comp['@_mountType']), pkg?.thru);
    const bomEntry = bom.get(ref);
    // Prefer the BomItem's clean value/package over the placement record's
    // combined OEM string and per-instance packageRef (which break grouping).
    const value = bomEntry?.value || str(comp['@_part'] ?? comp['@_partRef']) || '';
    const footprintName = bomEntry?.footprint || packageRef || value;

    const graphics: Graphic[] = pkg && pkg.pts.length >= 2 ? [{ kind: 'poly', layer: `${side}.Fab`, width: 0.12, pts: pkg.pts }] : [];

    footprints.push({
      ref,
      value,
      footprintName,
      side,
      mount,
      dnp: bomEntry ? !bomEntry.populate : false,
      excludeFromBom: bomEntry?.excludeFromBom ?? false,
      excludeFromPos: false,
      at,
      properties: bomEntry?.props ?? {},
      graphics,
      pads: [],
    });
  }

  return {
    title: str(ipc['Ecad']?.['@_name']) || '',
    rev: str(ipc['@_revision']),
    date: '',
    company: '',
    edges,
    footprints,
  };
}

function mountOf(mountType: string, thru: boolean | undefined): Mount {
  const m = mountType.toUpperCase();
  if (m.includes('THM') || m.includes('THT') || m.includes('PRESS') || m === 'THROUGH_HOLE') return 'THT';
  if (m.includes('SMT') || m.includes('SMD') || m.includes('SURFACE')) return 'SMD';
  return thru ? 'THT' : 'SMD';
}

function polygonPoints(poly: Node, scale: number): Vec2[] {
  const pts: Vec2[] = [];
  const begin = collect(poly, 'PolyBegin')[0];
  if (begin) pts.push(xy(begin, scale));
  // Segments and curves come as ordered children; treat curve endpoints as lines.
  for (const seg of [...collect(poly, 'PolyStepSegment'), ...collect(poly, 'PolyStepCurve')]) {
    pts.push(xy(seg, scale));
  }
  return pts;
}

function xy(node: Node, scale: number): Vec2 {
  return { x: num(node['@_x']) * scale, y: Y_SIGN * num(node['@_y']) * scale };
}

function characteristicValue(item: Node): string {
  for (const c of collect(item, 'Characteristics')) {
    const v = str(c['@_value'] ?? c['@_textualDef']);
    if (v) return v;
  }
  return '';
}

function detectUnitScale(root: Node): number {
  const node = findWithAttr(root, '@_units');
  const u = str(node?.['@_units']).toUpperCase();
  if (u.includes('INCH') || u === 'IN') return 25.4;
  if (u.includes('MIL') && !u.includes('MILLI')) return 0.0254; // thou
  if (u.includes('MICRON') || u === 'UM') return 0.001;
  return 1; // MILLIMETER / default
}

// ---- generic tolerant traversal helpers -----------------------------------

function asArray(v: unknown): Node[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

/** Collect every value stored under a key named `tag`, at any depth. */
function collect(node: Node, tag: string, out: Node[] = []): Node[] {
  if (node == null || typeof node !== 'object') return out;
  for (const [k, v] of Object.entries(node)) {
    const vals = Array.isArray(v) ? v : [v];
    if (k === tag) for (const item of vals) out.push(item);
    for (const item of vals) if (item && typeof item === 'object') collect(item, tag, out);
  }
  return out;
}

/** First object anywhere in the tree that has the given attribute key. */
function findWithAttr(node: Node, attr: string): Node | undefined {
  if (node == null || typeof node !== 'object') return undefined;
  if (attr in node) return node;
  for (const v of Object.values(node)) {
    for (const item of Array.isArray(v) ? v : [v]) {
      if (item && typeof item === 'object') {
        const hit = findWithAttr(item, attr);
        if (hit) return hit;
      }
    }
  }
  return undefined;
}

function num(v: unknown): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : 0;
}

function str(v: unknown): string {
  return v == null ? '' : String(v);
}
