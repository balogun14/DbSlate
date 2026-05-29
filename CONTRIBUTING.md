# Contributing to DbSlate

Thank you for your interest in contributing to DbSlate! We are excited to build a safe, visual, and lightweight database migration tool together.

To ensure a smooth collaboration, please review and follow these guidelines.

---

## Code of Conduct

By participating in this project, you agree to abide by our [Code of Conduct](CODE_OF_CONDUCT.md) in all communication channels.

---

## Monorepo Architecture

DbSlate is organized as an npm workspaces monorepo:

- **[`core/`](file:///c:/Users/awwal/Documents/work/hobby/database/core)**: Database-agnostic schema schemas, SQL dialect introspectors, diff engines, and code generators.
- **[`cli/`](file:///c:/Users/awwal/Documents/work/hobby/database/cli)**: Command-line parsing and interactive prompt confirmations.
- **[`web/`](file:///c:/Users/awwal/Documents/work/hobby/database/web)**: Next.js visual dashboard schema designer, SQL editor, and exporter GUI.

---

## Local Development Setup

### 1. Initial Setup

Fork the repository, clone it, and install node packages:

```bash
git clone https://github.com/YOUR_USERNAME/dbslate.git
cd dbslate
npm install
```

### 2. Developing the Core Library

The core library exports its APIs inside `dist/` compilation targets. Keep a compiler running in watch mode while making changes:

```bash
# In the project root:
npm run build:core -- --watch
```

### 3. Running the Visual GUI Dashboard

Launch the local Next.js client on port 3000:

```bash
npm run dev:web
```

---

## Adding a New Database Dialect (e.g., MySQL)

DbSlate is designed to be easily extensible. To add support for a new SQL database dialect:

1. **Introspector**:
   - Create a file `core/introspect/mydialect.ts`.
   - Implement an introspection function that queries database metadata catalog tables and returns a standardized `Schema` schema.
   - Register it in `core/index.ts`.
2. **DDL Generator**:
   - Create a file `core/diff/mydialect-generator.ts`.
   - Implement a function translating a `SchemaDiff[]` difference listing into dialect-compliant SQL.
   - Register the generator in the main CLI entry (`cli/bin.ts`) and Web app diff endpoint (`web/app/api/diff/route.ts`).

---

## Coding Guidelines

- **TypeScript Only**: All code must be written in TypeScript with `"strict": true` enabled.
- **ES Modules (ESM)**: This monorepo targets native ESM. Always append file extensions (e.g., `.js`) to local imports:
  ```typescript
  import { Schema } from './types.js'; // Correct
  import { Schema } from './types'; // Incorrect - will fail ESM resolution
  ```
- **Styling**: The web app uses standard **Vanilla CSS** and CSS modules. Do not import third-party CSS utilities (e.g., Tailwind CSS) unless explicitly agreed upon. Maintain our sleek, glassmorphic dark theme tokens.
- **Option B Protections**: Never change the behavior of destructive confirmations. All commands resulting in data loss MUST undergo checkbox approvals.

---

## Commit Guidelines

We enforce **Conventional Commits** for clean git history parsing:

Format: `<type>(<scope>): <subject>`

### Types

- `feat`: A new user-facing feature (e.g. `feat(core): add mysql introspection`)
- `fix`: A bug fix (e.g. `fix(sqlite): resolve autoincrement parsing bug`)
- `docs`: Documentation alterations (e.g. `docs: update CONTRIBUTING guidelines`)
- `style`: Formatting changes, missing semicolons, etc. (no runtime code modifications)
- `refactor`: Structural refactoring that neither fixes a bug nor adds a feature
- `test`: Adding missing tests or refactoring test suites
- `chore`: Maintenance tasks, package updates, config settings

---

## Pull Request Guidelines

Before submitting your PR, ensure:

1. All TypeScript projects compile successfully: `npm run build:all`.
2. The code conforms to formatting standards and has no unresolved lints.
3. Tests have been written or updated to cover your modifications.
4. Your commits follow the conventional format.
5. You fill out the template in `PULL_REQUEST_TEMPLATE.md`.
