# PixelRPG Map Editor - GJS Version

The primary, production-ready implementation of the PixelRPG Map Editor using GNOME JavaScript (GJS) with GTK 4 and WebKit. Provides a native desktop experience with seamless integration between GTK UI components and the Excalibur.js game engine running in a WebView.

## ✨ Features

- **Native Desktop Application**: Full GTK 4 application with Adwaita design system
- **Integrated Game Engine**: Excalibur.js running in WebKit WebView with real-time preview
- **Advanced Map Editor**: Professional tile-based map editing with multiple layers and tools
- **Project Management**: Complete project lifecycle with asset organization and version control
- **RPC Communication**: Bidirectional communication between GTK and WebView using WebKit's message API
- **Blueprint UI**: Modern GTK UI definitions with Blueprint compiler
- **Type Safety**: Full TypeScript support throughout the application
- **Resource Management**: GResource integration for bundled assets
- **Cross-Platform Compatibility**: Consistent experience across GNOME environments

## 🚀 Quick Start

### Prerequisites

- **GNOME Environment**: GNOME desktop environment with GJS support
- **GTK 4**: GTK 4 development libraries (`libgtk-4-dev` on Ubuntu/Debian)
- **WebKit**: WebKit2GTK development libraries (`libwebkit2gtk-4.1-dev`)
- **Node.js**: 18+ with npm or yarn
- **Blueprint Compiler**: GTK Blueprint compiler for UI files
- **GJS**: GNOME JavaScript runtime (usually included with GNOME)

### Installation

```bash
# Clone the repository
git clone https://github.com/your-org/pixelrpg-map-editor.git
cd pixelrpg-map-editor

# Install dependencies
yarn install

# Build and run the application
yarn workspace @pixelrpg/maker-gjs start
```

## 🎮 Usage

### Application Interface

```
┌─────────────────────────────────────────────────┐
│ PixelRPG Map Editor - GJS                     │_│
├─────────────────┬───────────────────────────────┤
│ Project Panel   │                               │
│ 📁 Projects     │        Map Editor Canvas       │
│ 🎨 Assets       │                               │
│ 🗺️  Maps        │  ┌─────────────────────────┐  │
│ ⚙️  Properties  │  │                         │  │
├─────────────────┤  │     Game Engine         │  │
│ Tools Panel     │  │     Preview             │  │
│ 🎯 Select       │  │   (WebKit WebView)      │  │
│ 🖌️  Brush       │  │                         │  │
│ 🧽 Eraser       │  └─────────────────────────┘  │
│ 🪣 Fill         │                               │
│ 📏 Measure      │                               │
└─────────────────┴───────────────────────────────┘
```

### Basic Workflow

1. **Launch Application**: Run `yarn start` to launch the GTK application
2. **Create/Open Project**: Use the project panel to create a new project or open existing one
3. **Edit Maps**: Use the toolbar tools to paint, select, and modify map tiles
4. **Real-time Preview**: See changes instantly in the integrated WebView
5. **Save Project**: Export your work as JSON project files

### Keyboard Shortcuts

- `Ctrl+N`: New project
- `Ctrl+O`: Open project
- `Ctrl+S`: Save project
- `Ctrl+Z`: Undo
- `Ctrl+Y`: Redo
- `Ctrl+A`: Select all
- `Delete`: Delete selected tiles
- `F5`: Refresh WebView
- `F12`: Developer tools (if available)

## 🏗️ Architecture

### GTK + WebKit Integration

```
┌─────────────────┐     RPC      ┌─────────────────┐
│   GTK UI        │◄──────────► │   WebKit        │
│   (Adwaita)     │             │   WebView       │
│                 │             │                 │
│ • Project View  │             │ • Excalibur.js  │
│ • Asset Browser │             │ • Game Canvas   │
│ • Property      │             │ • Live Preview  │
│   Inspector     │             │                 │
│ • Tool Palette  │             │                 │
└─────────────────┘             └─────────────────┘
```

#### Communication Flow

1. **UI Events**: GTK widgets emit signals when user interacts
2. **RPC Messages**: GJS sends typed RPC messages to WebView
3. **Engine Updates**: WebView processes messages and updates Excalibur.js engine
4. **Event Notifications**: Engine sends status updates back to GTK UI
5. **UI Updates**: GTK UI reflects engine state changes

### Key Components

- **Main Application**: `src/main.ts` - GTK application setup and lifecycle
- **Window Management**: `src/application.ts` - Main window and layout
- **UI Components**: `src/widgets/` - GTK widgets and controllers
- **Engine Integration**: `src/widgets/engine.ts` - WebKit WebView wrapper
- **Project Management**: `src/widgets/project-view.ts` - Project operations
- **WebView Bridge**: `src/widgets/webview.ts` - RPC communication layer

## 🔧 Development

### Development Commands

```bash
# Full build (resources, blueprints, TypeScript)
yarn build

# Quick development build and run
yarn start

# TypeScript type checking only
yarn check

# Build UI blueprints only
yarn build:blueprints

# Build GResources only
yarn build:resources

# Development mode with file watching
yarn dev
```

### Development Workflow

```bash
# 1. Setup development environment
yarn install

# 2. Start with file watching (rebuilds on changes)
yarn dev

# 3. Make changes to source files:
#    - GTK widgets: src/widgets/*.ts
#    - UI blueprints: src/widgets/*.blp
#    - Application logic: src/*.ts

# 4. Test changes (application auto-restarts)

# 5. Build for production
yarn build

# 6. Package for distribution
#    (Add packaging commands as needed)
```

### Blueprint UI Development

```bash
# Edit UI blueprint files
vim src/widgets/project-panel.blp

# Compile blueprints
yarn build:blueprints

# Restart application to see changes
yarn start
```

### GResource Management

```bash
# Add new resources to the XML manifest
vim org.pixelrpg.maker.data.gresource.xml

# Compile resources
yarn build:resources

# Resources are embedded in the binary
```

## 📁 Project Structure

```
apps/maker-gjs/
├── src/
│   ├── main.ts                 # Application entry point
│   ├── application.ts          # GTK application setup
│   ├── widgets/
│   │   ├── engine.ts           # WebKit WebView wrapper
│   │   ├── webview.ts          # RPC communication layer
│   │   ├── project-view.ts     # Project management UI
│   │   ├── map-editor.ts       # Main editing canvas
│   │   ├── tools-panel.blp     # Blueprint UI definitions
│   │   ├── project-panel.blp   # UI blueprints
│   │   └── *.blp               # GTK UI templates
│   ├── services/
│   │   ├── project-service.ts  # Project operations
│   │   ├── rpc-service.ts      # RPC communication
│   │   └── file-service.ts     # File I/O operations
│   └── types/
│       └── *.ts                # TypeScript definitions
├── dist/                       # Built application
├── org.pixelrpg.maker.data.gresource.xml  # Resource manifest
├── package.json                # Dependencies and scripts
├── tsconfig.json               # TypeScript configuration
└── vite.config.js              # Build configuration
```

## 📖 API Usage Examples

### Engine Integration

```typescript
import { Engine } from '@pixelrpg/engine-gjs';
import { RpcEngineType } from '@pixelrpg/engine-core';

// Create engine instance with WebView
const webView = new WebKit.WebView();
const engine = new Engine(webView);

// Initialize engine
await engine.initialize();

// Load project
await engine.loadProject('/path/to/project.json');

// Handle engine events
engine.connect(RpcEngineType.PROJECT_LOADED, (source, projectId) => {
  console.log('Project loaded:', projectId);
});

engine.connect(RpcEngineType.ERROR, (source, message, error) => {
  console.error('Engine error:', message, error);
});
```

### RPC Communication

```typescript
import { RpcEndpoint } from '@pixelrpg/message-channel-gjs';

// Create RPC endpoint
const endpoint = RpcEndpoint.getInstance('editor-rpc', webView);

// Register handlers for WebView messages
endpoint.registerHandler('saveProject', async (projectData) => {
  await saveToFile(projectData);
  return { success: true };
});

// Send requests to WebView
const result = await endpoint.sendRequest('updateMap', {
  mapId: 'overworld',
  changes: tileUpdates
});
```

### GTK Widget Creation

```typescript
import GObject from '@girs/gobject-2.0';
import Gtk from '@girs/gtk-4.0';

// Create custom GTK widget
export class MapEditor extends Gtk.Widget {
  static {
    GObject.registerClass({
      GTypeName: 'MapEditor',
      Template: 'resource:///org/pixelrpg/maker/map-editor.ui',
      InternalChildren: ['canvas', 'toolbar'],
    }, this);
  }

  // Widget implementation...
}
```

## 🐛 Troubleshooting

### Common Issues

#### WebKit WebView Not Loading

If the WebView doesn't show content:

```bash
# Check WebKit installation
pkg-config --modversion webkit2gtk-4.1

# Verify engine package is built
yarn workspace @pixelrpg/engine-excalibur build

# Check WebView console for errors
# Enable developer tools in WebKit settings
```

#### Blueprint Compilation Errors

```bash
# Check blueprint compiler installation
blueprint-compiler --version

# Validate blueprint syntax
blueprint-compiler validate src/widgets/*.blp

# Rebuild blueprints
yarn build:blueprints
```

#### GResource Build Errors

```bash
# Check glib-compile-resources availability
glib-compile-resources --version

# Validate resource XML
xmllint --noout org.pixelrpg.maker.data.gresource.xml

# Clean and rebuild resources
rm -rf dist/
yarn build:resources
```

#### Permission Issues

If you encounter permission errors:

```bash
# For Ubuntu/Debian
sudo apt install libgtk-4-dev libwebkit2gtk-4.1-dev

# For Fedora/CentOS
sudo dnf install gtk4-devel webkit2gtk4.1-devel

# For Arch Linux
sudo pacman -S gtk4 webkit2gtk
```

### Development Tips

- Use `journalctl -f` to monitor GJS application logs
- Enable GTK inspector: `gsettings set org.gtk.Settings.Debug enable-inspector-keybinding true`
- Use `WEBKIT_DISABLE_COMPOSITING_MODE=1` for debugging WebView issues
- Check `/tmp/gjs-debug.log` for detailed error information

## 🔍 System Requirements

### Minimum Requirements

- **GNOME**: 40+ with GJS support
- **GTK**: 4.0+
- **WebKit**: 2.32+
- **RAM**: 2GB minimum, 4GB recommended
- **Storage**: 500MB for application and projects

### Recommended Setup

```bash
# Ubuntu/Debian
sudo apt update
sudo apt install libgtk-4-dev libwebkit2gtk-4.1-dev gjs

# Fedora
sudo dnf install gtk4-devel webkit2gtk4.1-devel gjs

# Arch Linux
sudo pacman -S gtk4 webkit2gtk gjs
```

## 🚀 Distribution

### Building for Distribution

```bash
# Full production build
yarn build

# Create distributable package
# (Add packaging commands based on your distribution method)
```

### Flatpak Integration

The application is designed to work well with Flatpak:

```yaml
# org.pixelrpg.maker.yml
id: org.pixelrpg.maker
runtime: org.gnome.Platform
runtime-version: '44'
sdk: org.gnome.Sdk

command: pixelrpg-maker
modules:
  - name: pixelrpg-maker
    buildsystem: simple
    build-commands:
      - yarn install --frozen-lockfile
      - yarn build
      - install -Dm755 dist/main.js /app/bin/pixelrpg-maker
```

## 🤝 Contributing

### Development Guidelines

- Follow GTK 4 and Adwaita design guidelines
- Use Blueprint for UI definitions when possible
- Maintain TypeScript strict mode compliance
- Add JSDoc comments for public APIs
- Test on multiple GNOME environments
- Follow GObject naming conventions

### Code Organization

- **Widgets**: GTK UI components in `src/widgets/`
- **Services**: Business logic in `src/services/`
- **Types**: TypeScript definitions in `src/types/`
- **Resources**: Static assets in GResource XML

## 📚 Related Documentation

- [Main Project README](../../README.md) - Complete project overview
- [Engine Core Documentation](../../packages/engine-core/README.md) - Core engine APIs
- [Engine GJS Documentation](../../packages/engine-gjs/README.md) - GJS engine integration
- [Message Channel GJS Documentation](../../packages/message-channel-gjs/README.md) - GJS messaging APIs
- [GTK Documentation](https://docs.gtk.org/) - GTK 4 reference
- [GJS Guide](https://gjs.guide/) - GNOME JavaScript development

## 📄 License

This project is licensed under the MIT License - see the main [LICENSE](../../LICENSE) file for details.

---

**Note**: This GJS version is the primary, production-ready implementation of the PixelRPG Map Editor. For development and testing purposes, also see the web version at [apps/maker-web](../../apps/maker-web/). 