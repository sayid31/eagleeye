// src/voice/voiceToolGroups.js
/**
 * The five owner-switchable permission groups for voice tools (G2 in
 * planbatasanai.md). Every declared voice tool belongs to exactly one group;
 * `voiceToolGroups.test.mjs` fails if a tool is added without a group.
 *
 * A switched-off group is enforced SERVER-SIDE: its tools are simply not
 * declared to the GPT-Live session, so the model cannot call them. The client
 * runner is not involved.
 *
 * Pure — no DOM, no network, no fs.
 *
 * @module voice/voiceToolGroups
 */

/** @typedef {{id: string, label: string, description: string, tools: string[]}} VoiceToolGroup */

/** @type {ReadonlyArray<VoiceToolGroup>} */
export const VOICE_TOOL_GROUPS = Object.freeze([
  {
    id: 'readOnly',
    label: 'Read-only',
    description: 'Look up what is on screen and answer questions about it.',
    tools: ['get_entity_context', 'get_current_view_state', 'analyst_query', 'next_iss_pass', 'read_screen'],
  },
  {
    id: 'camera',
    label: 'Camera & navigation',
    description: 'Fly, zoom, move the camera and track aircraft or vessels.',
    tools: [
      'fly_to_location', 'adjust_camera_zoom', 'zoom_to_globe', 'move_camera', 'fly_route',
      'frame_overhead', 'select_nearest_aircraft', 'track_entity', 'stop_tracking',
    ],
  },
  {
    id: 'display',
    label: 'Display & layers',
    description: 'Turn layers, panels, HUD, visual styles, basemaps and scenes on or off.',
    tools: [
      'set_layer_visibility', 'show_data_layers_menu', 'set_panel_open', 'set_context_mode',
      'set_visual_style', 'set_hud', 'set_detection', 'set_map_stack', 'set_post_processing',
      'control_scene', 'control_cockpit',
    ],
  },
  {
    id: 'media',
    label: 'Media (CCTV & radio)',
    description: 'Open third-party CCTV video and internet radio streams.',
    tools: ['control_cctv', 'control_radio'],
  },
  {
    id: 'annotate',
    label: 'Map drawing',
    description: 'Draw marks, areas and routes on the map, and clear them.',
    tools: ['annotate_map', 'clear_annotations'],
  },
].map((group) => Object.freeze({ ...group, tools: Object.freeze(group.tools) })));

/** Group ids, in display order. */
export const VOICE_TOOL_GROUP_IDS = Object.freeze(VOICE_TOOL_GROUPS.map((group) => group.id));

/** Every group on: the default, identical to the behavior before groups existed. */
export function defaultToolGroups() {
  return Object.fromEntries(VOICE_TOOL_GROUP_IDS.map((id) => [id, true]));
}

/**
 * @param {string} toolName
 * @returns {string | null} The group id, or null for an unknown tool.
 */
export function toolGroupOf(toolName) {
  return VOICE_TOOL_GROUPS.find((group) => group.tools.includes(toolName))?.id ?? null;
}

/**
 * Drop the tools of every switched-off group. A tool with no group is kept
 * (fail-open: an unmapped new tool must not silently vanish; the test above
 * catches the missing mapping instead).
 *
 * @param {Array<{name: string}>} tools
 * @param {Record<string, boolean>} [groups]
 * @returns {Array<{name: string}>}
 */
export function filterToolsByGroups(tools, groups = {}) {
  return tools.filter((tool) => groups[toolGroupOf(tool.name)] !== false);
}

/**
 * Groups the owner switched off, in display order.
 * @param {Record<string, boolean>} [groups]
 * @returns {VoiceToolGroup[]}
 */
export function disabledToolGroups(groups = {}) {
  return VOICE_TOOL_GROUPS.filter((group) => groups[group.id] === false);
}
