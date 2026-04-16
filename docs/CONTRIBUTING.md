# Contributing to PixelRPG Map Editor

Thank you for your interest in contributing to the PixelRPG Map Editor! This document provides guidelines and information for contributors.

## 📋 Table of Contents

- [Code of Conduct](#-code-of-conduct)
- [Getting Started](#-getting-started)
- [Development Workflow](#-development-workflow)
- [Architecture Guidelines](#-architecture-guidelines)
- [Coding Standards](#-coding-standards)
- [Testing](#-testing)
- [Documentation](#-documentation)
- [Submitting Changes](#-submitting-changes)
- [Review Process](#-review-process)

## 🤝 Code of Conduct

This project follows a code of conduct to ensure a welcoming environment for all contributors. By participating, you agree to:

- Be respectful and inclusive
- Focus on constructive feedback
- Accept responsibility for mistakes
- Show empathy towards other contributors
- Help create a positive community

## 🚀 Getting Started

### Prerequisites

- **Node.js**: Version 18.0 or higher
- **Yarn**: Version 4.0 or higher
- **Git**: Version 2.30 or higher
- **GNOME**: For desktop development (optional)

### Initial Setup

```bash
# Fork the repository on GitHub
# Clone your fork
git clone https://github.com/your-username/pixelrpg-map-editor.git
cd pixelrpg-map-editor

# Install dependencies
yarn install

# Build all packages
yarn build

# Verify everything works
yarn check
```

## 🔄 Development Workflow

### Branching Strategy

We use a simplified branching strategy:

```bash
# Create a feature branch from main
git checkout -b feature/your-feature-name

# Or for bug fixes
git checkout -b fix/issue-description

# Or for documentation
git checkout -b docs/update-readme
```

### Development Process

1. **Choose an Issue**: Pick from [open issues](../../issues) or create a new one
2. **Create Branch**: Use descriptive branch names
3. **Implement**: Follow the architecture and coding guidelines
4. **Test**: Ensure all tests pass and add new tests if needed
5. **Document**: Update documentation for any new features
6. **Commit**: Use conventional commit format
7. **Push**: Push your branch to your fork
8. **Pull Request**: Create a PR with a clear description

### Daily Development

```bash
# Run the editor
yarn workspace @pixelrpg/maker-gjs start

# Run the storybook
yarn workspace @pixelrpg/storybook-gjs start

# Type-check a single package
yarn workspace @pixelrpg/<pkg> run check

# Type-check + build everything
yarn workspaces foreach -A run check
yarn build
```

There is currently no project-wide test runner or formatter — tests and formatting are areas slated for future work.

## 🏗️ Architecture Guidelines

### Package Structure

```
packages/
├── engine/       # Excalibur-based engine + editor logic
├── gjs/          # GTK4/libadwaita widgets + Gdk preview pipeline
└── story-gjs/    # Storybook framework for GTK widgets

apps/
├── maker-gjs/      # The map editor (primary)
├── storybook-gjs/  # Widget playground
└── game-browser/   # Browser-runtime template for game export
```

See [README.md](../README.md#workspace) and [AGENTS.md](../AGENTS.md) for the full overview.

### Design Principles

- **ECS-First**: Game and editor state lives in Excalibur `Component`s; behavior in `System`s. Avoid parallel class hierarchies.
- **Type Safety**: No `any` types, strict TypeScript usage
- **Single Responsibility**: Clear boundaries between widgets, services, and engine code
- **Upstream-First**: Prefer fixes in `gjsify`/`excalibur`/`@girs/*` over local patches

### Adding New Features

1. **State**: Model state as Excalibur Components
2. **Behavior**: Implement as Excalibur Systems
3. **UI**: GTK widgets in `packages/gjs`, declarative Blueprint files
4. **Stories**: Add Storybook stories for new UI components

## 💻 Coding Standards

### TypeScript Guidelines

```typescript
// ✅ Good: Explicit types, no any
interface User {
  id: string
  name: string
  email: string
}

function createUser(data: User): User {
  return { ...data }
}

// ❌ Bad: Using any, implicit types
function createUser(data: any) {
  return data
}
```

### File Organization

```
src/
├── types/         # Type definitions and interfaces
├── utils/         # Utility functions
├── services/      # Business logic services
├── components/    # UI components
├── widgets/       # GTK widgets (GJS packages)
└── index.ts       # Public API exports
```

### Naming Conventions

- **Files**: PascalCase for classes, camelCase for utilities
- **Classes**: PascalCase with clear, descriptive names
- **Methods**: camelCase, verb-first naming
- **Constants**: UPPER_SNAKE_CASE
- **Interfaces**: PascalCase with 'I' prefix (optional)

### Documentation Standards

```typescript
/**
 * Calculates the distance between two points.
 *
 * @param point1 - The first point
 * @param point2 - The second point
 * @returns The Euclidean distance between the points
 *
 * @example
 * ```typescript
 * const distance = calculateDistance({x: 0, y: 0}, {x: 3, y: 4})
 * console.log(distance) // Output: 5
 * ```
 */
function calculateDistance(point1: Point, point2: Point): number {
  // Implementation
}
```

## 🧪 Testing

There is currently no automated test infrastructure. Verification is done manually:

- **Type-check**: `yarn workspaces foreach -A run check`
- **Build**: `yarn build` — must succeed for all packages
- **Smoke-test the editor**: `yarn workspace @pixelrpg/maker-gjs start` — open a map, try the brush/eraser tools
- **Smoke-test the storybook**: `yarn workspace @pixelrpg/storybook-gjs start` — render widget stories

Test infrastructure (unit tests, integration tests) is planned but not yet in place. When adding tests, colocate them next to the source they cover (`foo.ts` + `foo.test.ts`).

## 📚 Documentation

### Documentation Types

- **API Documentation**: JSDoc comments in code
- **User Guides**: Markdown files in `/docs`
- **Storybook Stories**: Interactive component documentation
- **Architecture Docs**: System design and decisions

### Documentation Workflow

1. **Code Comments**: Add JSDoc to all public APIs
2. **README Updates**: Update package READMEs for changes
3. **Storybook**: Create stories for new UI components
4. **Changelogs**: Document breaking changes

## 🔄 Submitting Changes

### Commit Guidelines

We use conventional commits:

```bash
# Feature commits
git commit -m "feat: add multi-tileset support"

# Bug fixes
git commit -m "fix: resolve tile transparency issue"

# Documentation
git commit -m "docs: update API documentation"

# Refactoring
git commit -m "refactor: improve error handling in data validation"
```

### Pull Request Process

1. **Create PR**: Use GitHub's pull request interface
2. **Description**: Provide clear description of changes
3. **Link Issues**: Reference related issues
4. **Checklist**: Ensure all items are completed

#### PR Template

```markdown
## Description
Brief description of the changes made.

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update
- [ ] Refactoring

## Testing
- [ ] Unit tests added/updated
- [ ] Integration tests added/updated
- [ ] Manual testing completed

## Screenshots (if applicable)
Add screenshots of UI changes.

## Checklist
- [ ] Code follows project standards
- [ ] Tests pass locally
- [ ] Documentation updated
- [ ] No linting errors
```

## 🔍 Review Process

### Review Guidelines

**For Reviewers:**
- Be constructive and respectful
- Focus on code quality and architecture
- Suggest improvements, don't demand changes
- Approve when standards are met

**For Contributors:**
- Address all review comments
- Explain decisions when requested
- Keep discussions focused and productive
- Mark resolved comments

### Automated Checks

All PRs must pass:
- TypeScript compilation (`yarn workspaces foreach -A run check`)
- Build process (`yarn build`)

Linting and automated testing are not yet wired up — see the [Testing](#-testing) section.

## 🆘 Getting Help

### Communication Channels

- **Issues**: Bug reports and feature requests
- **Discussions**: General questions and ideas
- **Pull Requests**: Code review and implementation discussion

### Resources

- [Project README](../README.md) — overview, architecture, workspace layout
- [AGENTS.md](../AGENTS.md) — coding conventions, ECS patterns, Blueprint, GTK4 lifecycle
- Storybook: `yarn workspace @pixelrpg/storybook-gjs start`

## 🎉 Recognition

Contributors are recognized through:
- GitHub contributor statistics
- Changelog mentions
- Project acknowledgments
- Community recognition

Thank you for contributing to PixelRPG Map Editor! 🚀
