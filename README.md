# map-editor
Experimental tile based map editor

## Development

### Dependencies

- [gjs](https://gjs.guide/)
- [node.js](https://nodejs.org/en/)
- [yarn](https://yarnpkg.com/getting-started/install)
- [blueprint-compiler](https://jwestman.pages.gitlab.gnome.org/blueprint-compiler/)
- [glib-compile-resources](https://docs.gtk.org/gio/struct.Resource.html)

### Building

1. Install dependencies: `yarn install`
2. Build and run: `yarn start`

### Troubleshooting

I get the following error:

```bash
bwrap: setting up uid map: Permission denied
```

Solution: https://etbe.coker.com.au/2024/04/24/ubuntu-24-04-bubblewrap/