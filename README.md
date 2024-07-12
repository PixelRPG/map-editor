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

```
npm install -g yarn@latest
git clone --recurse-submodules https://github.com/PixelRPG/map-editor.git
cd map-editor
yarn install
yarn build:all
yarn start
```

### Troubleshooting

I get the following error:

```bash
bwrap: setting up uid map: Permission denied
```

Solution: https://etbe.coker.com.au/2024/04/24/ubuntu-24-04-bubblewrap/