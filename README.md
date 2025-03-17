# PixelRPG Map Editor

An experimental tile-based map editor built with Excalibur.js, GTK/Adwaita, and GJS.

## Project Structure

- `apps/maker-gjs`: Desktop application built with GTK/Adwaita and GJS
- `packages/engine-excalibur`: Game rendering and map view built with Excalibur.js
- `packages/message-channel-gjs`: Message service implementation for GJS runtime
- `packages/message-channel-web`: Message service implementation for WebView runtime
- `packages/common`: Shared code between GJS and WebView

## Development

### Prerequisites

- [gjs](https://gjs.guide/)
- Node.js
- Yarn


### Setup

```bash
yarn install
```

### Development Commands

```bash
# Start the desktop application
yarn workspace @pixelrpg/maker-gjs start

# Build the client
yarn workspace @pixelrpg/engine-excalibur build

# Preview the client
yarn workspace @pixelrpg/engine-excalibur preview
```

## Known Issues

If you encounter this error:
```bash
bwrap: setting up uid map: Permission denied
```
See solution here: https://etbe.coker.com.au/2024/04/24/ubuntu-24-04-bubblewrap/

## License

MIT