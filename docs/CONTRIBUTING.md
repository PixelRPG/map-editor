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
# Start development server
yarn start

# Run type checking
yarn check

# Format code
yarn format

# Run tests
yarn test
```

## 🏗️ Architecture Guidelines

### Package Structure

The project follows a strict package structure:

```
packages/
├── *-core/        # Platform-independent interfaces
├── *-gjs/         # GNOME implementations
├── *-excalibur/   # Web/Excalibur implementations
└── *-web/         # Web-specific utilities
```

### Design Principles

- **Platform Independence**: Core packages must remain runtime-agnostic
- **Interface Segregation**: Clean contracts between components
- **Type Safety**: No `any` types, strict TypeScript usage
- **Modular Design**: Clear boundaries and single responsibility
- **Testability**: Dependency injection and isolated components

### Adding New Features

1. **Define Interface**: Add to appropriate `-core` package
2. **Implement**: Create platform-specific implementations
3. **Test**: Add comprehensive test coverage
4. **Document**: Update API documentation
5. **Example**: Create Storybook stories for UI components

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

### Test Structure

Tests are organized alongside source code:

```
src/
├── component.ts
└── component.test.ts
```

### Testing Guidelines

- **Unit Tests**: Test individual functions and classes
- **Integration Tests**: Test component interactions
- **E2E Tests**: Test complete user workflows
- **Coverage**: Aim for >80% code coverage

### Running Tests

```bash
# Run all tests
yarn test

# Run tests for specific package
yarn workspace @pixelrpg/data-core test

# Run tests with coverage
yarn test --coverage

# Run tests in watch mode
yarn test --watch
```

### Writing Tests

```typescript
import { describe, it, expect } from 'vitest'
import { calculateDistance } from './math'

describe('calculateDistance', () => {
  it('should calculate distance between two points', () => {
    const result = calculateDistance({x: 0, y: 0}, {x: 3, y: 4})
    expect(result).toBe(5)
  })

  it('should handle negative coordinates', () => {
    const result = calculateDistance({x: -1, y: -1}, {x: 1, y: 1})
    expect(result).toBeCloseTo(2.828, 3)
  })
})
```

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
- ✅ TypeScript compilation
- ✅ Linting (ESLint)
- ✅ Unit tests
- ✅ Build process
- ✅ Documentation generation

## 🆘 Getting Help

### Communication Channels

- **Issues**: Bug reports and feature requests
- **Discussions**: General questions and ideas
- **Pull Requests**: Code review and implementation discussion

### Resources

- [Architecture Overview](../../docs/WIP/architecture-overview.md)
- [Implementation Guide](../../docs/WIP/implementation-guide.md)
- [API Documentation](../../docs/README.md#api-documentation)
- [Storybook](http://localhost:6006) (when running locally)

## 🎉 Recognition

Contributors are recognized through:
- GitHub contributor statistics
- Changelog mentions
- Project acknowledgments
- Community recognition

Thank you for contributing to PixelRPG Map Editor! 🚀
