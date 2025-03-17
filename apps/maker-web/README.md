# Pixel RPG Map Editor - Web Version

This is the web implementation of the Pixel RPG Map Editor. It serves as a testing ground for the engine's capabilities in a browser environment.

## Current Implementation

The current implementation uses an iframe to load and display the engine. This approach was chosen primarily for testing purposes, as it mirrors how the engine is integrated in the GJS version using a webview component.

### Why an iframe?

Using an iframe allows us to:

1. **Test RPC Communication**: Demonstrate that our Remote Procedure Call (RPC) implementation works both ways:
   - GJS <-> WebView in the desktop application
   - Browser <-> iframe in this web version

2. **Maintain Architecture Consistency**: By using similar integration patterns across platforms, we can ensure that the same message passing systems work consistently.

3. **Isolation**: The engine runs in its own context, which can help with performance and memory management.

## Future Considerations

In a production web version, the iframe approach would not necessarily be required:

- **Direct Integration**: The engine could be loaded directly in the same document, eliminating the overhead of cross-document communication.
  
- **Simplified Architecture**: Without the iframe, we could avoid the complexity of cross-origin issues and message passing.

- **Better Performance**: Direct integration would likely result in better performance without the overhead of iframe communication.

However, maintaining the iframe approach could:

- **Provide Consistency**: Keep the architecture similar between platforms, potentially simplifying maintenance.
  
- **Enable Easier Shared Code**: Components designed to work with the message-passing system would work across platforms without modification.

The final implementation approach remains open for discussion and will be determined based on performance requirements, maintenance considerations, and development resources.

## Development Focus

Currently, development efforts are primarily focused on the GJS version of the application, as it's the main target platform. This web version serves as a complementary testing environment and proof of concept.

## Running the Web Version

```bash
# Install dependencies
yarn install

# Start the development server
yarn dev

# Build for production
yarn build

# Preview the production build
yarn preview
```

## Project Structure

- `src/` - Source code for the map editor interface
- `dist/` - Built application
- `index.html` - Main entry point 