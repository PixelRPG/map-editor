#!/bin/bash
# Headless mutter compositor for the map-editor race rig.
export XDG_RUNTIME_DIR=/run/user/1000
exec mutter --headless --wayland --no-x11 --wayland-display pixrace --virtual-monitor 1280x800
