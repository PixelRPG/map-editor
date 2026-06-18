/**
 * D-Bus interface description for `org.pixelrpg.maker.Control`.
 *
 * Two methods that aren't expressible as `Gio.Action`s:
 * - `GetStatus`   → a JSON snapshot of the editor's live state.
 * - `Screenshot`  → PNG bytes of the window (or just the canvas).
 *
 * Navigation + commands are NOT here — `Gtk.Application` already exports
 * every `app.*` / `win.*` action over the standard `org.gtk.Actions`
 * interface, which external tooling drives directly.
 *
 * Kept in its own GTK-free module (no `Gio` import) so a unit test can
 * assert its method list matches `CONTROL_METHOD_KINDS` — the pause-policy
 * classification every method must carry — without pulling GTK into the
 * node test bundle. {@link ControlDbusService} imports it.
 */
export const CONTROL_IFACE_XML = `
<node>
  <interface name="org.pixelrpg.maker.Control">
    <method name="GetStatus">
      <arg type="s" direction="out" name="status_json"/>
    </method>
    <method name="Screenshot">
      <arg type="s" direction="in" name="scope"/>
      <arg type="ay" direction="out" name="png_bytes"/>
    </method>
    <method name="ListActions">
      <arg type="s" direction="out" name="actions_json"/>
    </method>
    <method name="ActivateAction">
      <arg type="s" direction="in" name="scope"/>
      <arg type="s" direction="in" name="name"/>
      <arg type="s" direction="in" name="value_json"/>
    </method>
    <method name="ChangeActionState">
      <arg type="s" direction="in" name="scope"/>
      <arg type="s" direction="in" name="name"/>
      <arg type="s" direction="in" name="value_json"/>
    </method>
    <method name="OpenProject">
      <arg type="s" direction="in" name="path"/>
    </method>
    <method name="ListRecentProjects">
      <arg type="s" direction="out" name="projects_json"/>
    </method>
    <method name="GetMapData">
      <arg type="s" direction="in" name="map_id"/>
      <arg type="s" direction="out" name="map_json"/>
    </method>
    <method name="ListTemplates">
      <arg type="s" direction="out" name="templates_json"/>
    </method>
    <method name="StartSession">
      <arg type="s" direction="out" name="room_id"/>
    </method>
    <method name="JoinSession">
      <arg type="s" direction="in" name="room_id"/>
    </method>
    <method name="GetSessionState">
      <arg type="s" direction="out" name="state_json"/>
    </method>
    <method name="SetZoom">
      <arg type="d" direction="in" name="zoom"/>
    </method>
    <method name="PresentWindow"/>
    <method name="ResizeWindow">
      <arg type="i" direction="in" name="width"/>
      <arg type="i" direction="in" name="height"/>
      <arg type="i" direction="out" name="result_width"/>
      <arg type="i" direction="out" name="result_height"/>
    </method>
    <method name="PaintTile">
      <arg type="s" direction="in" name="layer_id"/>
      <arg type="i" direction="in" name="tile_x"/>
      <arg type="i" direction="in" name="tile_y"/>
      <arg type="i" direction="in" name="sprite_id"/>
      <arg type="b" direction="out" name="applied"/>
    </method>
    <method name="PlaceObject">
      <arg type="s" direction="in" name="def_id"/>
      <arg type="s" direction="in" name="layer_id"/>
      <arg type="i" direction="in" name="tile_x"/>
      <arg type="i" direction="in" name="tile_y"/>
      <arg type="b" direction="out" name="applied"/>
    </method>
    <method name="SetAssistantCursor">
      <arg type="i" direction="in" name="tile_x"/>
      <arg type="i" direction="in" name="tile_y"/>
      <arg type="b" direction="out" name="applied"/>
    </method>
    <method name="SetAssistantInfo">
      <arg type="s" direction="in" name="display_name"/>
      <arg type="s" direction="in" name="color"/>
    </method>
    <method name="HideAssistant"/>
    <method name="FollowParticipant">
      <arg type="s" direction="in" name="peer_id"/>
    </method>
  </interface>
</node>`
