# Cursor Rules for PixelRPG

This directory contains Cursor rules that guide AI coding assistants in understanding and working with the PixelRPG codebase.

## Rule Structure

The rules are organized into the following categories:

1. **General Guidelines** (`general-guidelines.mdc`): Project-wide standards that apply to all code.
2. **Package-Type Rules**:
   - `core-packages.mdc`: Guidelines for core packages (data-core, engine-core, message-channel-core)
   - `gjs-packages.mdc`: Guidelines for GJS packages (engine-gjs, data-gjs, message-channel-gjs)
   - `excalibur-packages.mdc`: Guidelines for Excalibur packages (engine-excalibur, data-excalibur)
   - `web-packages.mdc`: Guidelines for web packages (message-channel-web)
   - `data-format.mdc`: Guidelines for data format implementation
3. **Application Rules**:
   - `app-architecture.mdc`: Architecture standards for end-user applications
   - `cli-implementation.mdc`: Guidelines for CLI implementation
4. **Language-Specific Rules**:
   - `typescript-best-practices.mdc`: TypeScript best practices for the project
5. **Project Management**:
   - `package-management.mdc`: Package management standards for the project

## Using These Rules

These rules are automatically applied by Cursor when working with files that match the glob patterns defined in each rule. The rules provide guidance on:

- Project structure and organization
- Code quality standards
- Package responsibilities and integration
- Implementation patterns
- Error handling
- Message passing
- Platform-specific considerations

## Rule Design Principles

1. **Generality**: Rules should be general enough to avoid frequent updates as the codebase evolves.
2. **Clarity**: Rules should clearly communicate the project's architecture and patterns.
3. **Consistency**: Rules should promote consistent coding practices across the project.
4. **Relevance**: Rules should focus on the most important aspects of the codebase.
5. **Maintainability**: Rules should be easy to update as the project evolves.

## Updating Rules

As the codebase evolves, these rules should be updated to reflect changes in architecture, patterns, and best practices. When updating rules:

1. Focus on architectural patterns rather than specific implementation details.
2. Update glob patterns to ensure rules apply to the right files.
3. Keep rules concise and focused on the most important aspects.
4. Document changes in commit messages.
5. Consider whether a rule needs to be updated or if a new rule should be created. 