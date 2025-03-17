# Pixel RPG Map Editor - GJS Version

The primary implementation of the Pixel RPG Map Editor using GNOME JavaScript (GJS) with GTK 4 and WebKit.

## Architecture & Technology

- **Native UI**: GTK 4 with Adwaita design language
- **Game Engine**: Excalibur.js running in a WebKit WebView
- **Communication**: Bidirectional RPC between GJS and WebView
- **Languages**: TypeScript for type-safety
- **Build Tools**: Vite, GResource, Blueprint Compiler

## Development

### Prerequisites

- GNOME development environment with GJS
- Node.js and Yarn
- GTK 4 development packages
- Blueprint Compiler for UI files

### Commands

```bash
yarn build                # Full build (resources, blueprints, vite)
yarn check                # TypeScript type checking
yarn start                # Build resources and start the application
```

## Project Structure

- `src/` - Source code (GTK application, UI definitions, controllers)
- `dist/` - Built application
- `org.pixelrpg.maker.data.gresource.xml` - Resource definitions
- `src/widgets/*.blp` - Blueprint UI definition files

## WebView Integration

Messages are passed between GTK and WebView using WebKit's message API, mirroring the iframe approach used in the web version. This ensures consistent code sharing between platforms.

## Development Workflow

1. Run with `yarn start` for a quick start
2. Modify GJS/GTK code
3. For UI changes, edit Blueprint files and run `yarn build:blueprints`
4. Test changes
5. For resource changes, run `yarn build:resources`

For engine development, update the corresponding engine packages then integrate with the GJS application. 