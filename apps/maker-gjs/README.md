# Pixel RPG Map Editor - GJS Version

This is the GNOME JavaScript (GJS) implementation of the Pixel RPG Map Editor, the primary focus of this workspace. It combines a modern GTK 4 Adwaita interface with a WebView-embedded game engine.

## Architecture

The application follows a hybrid architecture:

1. **GTK 4 Native Interface**: The main application UI is built using GTK 4 with the Adwaita design language, providing a native desktop experience on GNOME-based environments.

2. **WebView Game Engine**: The game engine itself is rendered using a WebKit WebView that runs Excalibur.js, a HTML5 game engine.

3. **Message-based Communication**: Communication between the native GJS application and the WebView is handled through a bidirectional RPC (Remote Procedure Call) implementation.

## Technology Stack

- **GJS**: GNOME JavaScript, the JavaScript runtime for GNOME
- **TypeScript**: For type-safe development experience
- **GTK 4**: Modern widget toolkit for creating graphical user interfaces
- **WebKit**: WebView rendering engine for displaying HTML/CSS/JS content
- **Excalibur.js**: HTML5 game engine for rendering the game maps and assets
- **Vite**: Build tooling for modern web development

## Building and Running

### Prerequisites

- GNOME development environment with GJS installed
- Node.js and Yarn package manager
- GTK 4 development packages

### Development

```bash
# Install dependencies
yarn install

# Build gresource files (for embedding resources)
yarn build:gresource

# Start the development build
yarn dev

# Build for production
yarn build

# Run the production build
yarn start
```

## WebView Communication

The application uses a message-based communication system between the GTK application and the WebView:

1. The GTK application sends messages to the WebView using the WebKit message API
2. The WebView communicates back using message handlers registered by the GTK application
3. A consistent message format ensures type safety across the boundary

This architecture mirrors the iframe approach used in the web version of the map editor, allowing for consistent code sharing between platforms.

## Development Workflow

The development workflow typically involves:

1. Running the application in development mode with `yarn dev`
2. Making changes to the GJS/GTK code
3. Testing the changes within the application
4. Building the gresource file if resources have been modified

For WebView engine development, changes need to be made in the corresponding engine packages and then integrated with the GJS application.

## Packaging

For distribution, the application can be packaged as a Flatpak or native package:

```bash
# Build Flatpak package
yarn package:flatpak

# Build RPM package (Fedora)
yarn package:rpm
```

## Main Focus

This GJS implementation is the primary focus of the Pixel RPG Map Editor project, with the goal of creating a polished, native desktop application for GNOME-based environments while leveraging web technologies for the game engine rendering. 