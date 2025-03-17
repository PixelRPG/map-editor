# Pixel RPG Map Editor - Web Version

A browser-based implementation of the Pixel RPG Map Editor, serving as a testing ground for the engine in web environments.

## Implementation

The editor uses an iframe to load the engine, mirroring the WebView approach in the GJS version for testing purposes.

### Benefits of the iframe Approach

- **RPC Testing**: Validates that communication works between Browser <-> iframe (similar to GJS <-> WebView)
- **Consistency**: Maintains similar integration patterns across platforms
- **Isolation**: Engine runs in its own context

## Future Considerations

For a production web version:

**Without iframe:**
- Direct integration would eliminate cross-document communication overhead
- Avoids cross-origin complexities
- Potentially better performance

**With iframe:**
- Maintains architectural consistency across platforms
- Enables code sharing for message-passing components

The final approach will be determined based on performance, maintenance, and resource considerations.

## Development

```bash
yarn install              # Install dependencies
yarn dev                  # Start development server
yarn build                # Build for production
yarn preview              # Preview the production build using serve (port 5001)
```

## Project Structure

- `src/` - Editor interface source code
- `dist/` - Built application
- `index.html` - Entry point

## Note

This web version is secondary to the primary GJS implementation and serves mainly as a testing environment. 