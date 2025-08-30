# @pixelrpg/story-gjs

Core Storybook functionality for GTK/GJS applications, providing a framework for testing and showcasing GTK widgets.

## Overview

This package provides the foundational components needed to create a Storybook-like experience for GTK/GJS applications. While primarily developed for the PixelRPG project, it's designed to be potentially reusable for other GTK/GJS applications in the future.

> ⚠️ **Note**: This package is currently in early development and tightly coupled with the PixelRPG project. While we aim to make it more generic in the future, it's not yet thoroughly tested for general use.

## Features

- **GTK Widget Stories**: Create isolated environments for testing GTK widgets
- **Interactive Controls**: Manipulate widget properties in real-time
- **Blueprint UI Integration**: Uses GTK's Blueprint UI format for widget templates
- **Adwaita Integration**: Built with GNOME's Adwaita design system

## Installation

```bash
# Using yarn
yarn add @pixelrpg/story-gjs

# Using npm
npm install @pixelrpg/story-gjs
```

## Usage

```typescript
import { Story, StoryWidget } from '@pixelrpg/story-gjs';

// Create a story for your widget
const myWidgetStory = new Story({
    title: 'UI/MyWidget',
    widget: MyWidget,
    controls: {
        label: {
            type: 'string',
            default: 'Hello World'
        },
        size: {
            type: 'number',
            default: 100,
            min: 50,
            max: 200
        }
    }
});

// Add the story to your storybook application
storybook.addStory(myWidgetStory);
```

## Development

### Prerequisites

- GNOME JavaScript (GJS) runtime
- GTK 4.x and Adwaita libraries
- Blueprint Compiler for UI templates

### Building

```bash
# Install dependencies
yarn install

# Build Blueprint UI templates
yarn build:blueprints

# Type checking
yarn check

# Watch mode for development
yarn watch
```

### Project Structure

- `src/widgets/`: GTK widget implementations
- `src/types/`: TypeScript type definitions
- `src/index.ts`: Main package entry point

## Contributing

While this package is primarily developed for the PixelRPG project, we welcome contributions that could help make it more generic and reusable. Please ensure your contributions:

1. Follow the GTK/GJS best practices
2. Include TypeScript type definitions
3. Maintain compatibility with Blueprint UI
4. Include appropriate documentation

## Related Packages

- **@pixelrpg/storybook-gjs**: Reference implementation using this package
- **@pixelrpg/ui-gjs**: GTK widgets for the PixelRPG project
