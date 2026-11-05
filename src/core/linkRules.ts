// ============================================================
// CompendiumNG Web — IBIS Link Rules
//
// Mirrors the connection behaviour of the original Compendium
// (verified against Compendium 2.x source:
//   System/resources/LinkGroups/Default.xml — the default link
//   group is "Issue-Based Information System (IBIS)").
//
//   · Connections are NOT policed: any node may be linked to any
//     node (original Compendium lets you draw a link between any
//     pair — even Question ↔ Question — so a Reference can hang
//     off several Ideas, a Pro can challenge a Note, etc.)
//   · Any of the IBIS link types can be assigned to any link;
//     users retype afterwards (and via the link editor)
//   · Fresh links receive the group's default type, "Responds To"
//     (default="39" in Default.xml)
//
// The IBIS rhetorical rules remain as *guidance* in documentation,
// not as hard enforcement, exactly like the original tool.
// ============================================================

import { LinkType } from './types';

/**
 * The link types of the original Compendium default IBIS link
 * group (About/Challenges/Expands On/Objects To/Related To/
 * Resolves/Responds To/Specializes/Supports), plus a CUSTOM
 * escape hatch for user-defined types (Compendium supported
 * custom link groups).
 */
export const IBIS_LINK_TYPES: LinkType[] = [
  LinkType.ABOUT,
  LinkType.CHALLENGES,
  LinkType.EXPANDS_ON,
  LinkType.OBJECTS_TO,
  LinkType.RELATED_TO,
  LinkType.RESOLVES,
  LinkType.RESPONDS_TO,
  LinkType.SPECIALIZES,
  LinkType.SUPPORTS,
  LinkType.CUSTOM,
];

/**
 * Returns the link types allowed on a directed from→to pair.
 * As in original Compendium, every connection is possible — the
 * full link-type palette is offered on every pair.
 */
export function getAllowedLinkTypes(_from?: unknown, _to?: unknown): LinkType[] {
  return [...IBIS_LINK_TYPES];
}

/**
 * True when this connection may be drawn. Original Compendium
 * places no legality constraints on connections, so this is
 * always true; kept as an API for callers.
 */
export function isLinkAllowed(_from?: unknown, _to?: unknown): boolean {
  return true;
}

/**
 * Default link type for a freshly drawn link.
 * Mirrors the original Compendium: the active link group's
 * default type — "Responds To" in the stock IBIS group.
 */
export function getDefaultLinkType(_from?: unknown, _to?: unknown): LinkType {
  return LinkType.RESPONDS_TO;
}
