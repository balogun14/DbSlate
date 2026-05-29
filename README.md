# DbSlate

> **Database Introspection, Visual Modeling, and Safe DDL Migration Diff Engine.**

DbSlate is an open-source, developer-focused utility to inspect database schemas, visually model databases, generate safe, data-loss-aware SQL migrations, and export native models for multiple languages (TypeScript, C#, Python, Go) without requiring heavy ORM migration runtimes.

---

## Key Features

- 🔍 **Schema Introspection**: Reverse-engineer existing PostgreSQL and SQLite databases directly into a unified JSON format in seconds.
- 🎨 **Visual Designer**: A gorgeous, reactive monorepo desktop-dashboard that runs locally to visually draw tables, configure column types, design foreign keys, and configure indexes.
- 🛡️ **Zero Data Loss Protections (Option B)**: Destructive DDL actions (like `DROP TABLE` or `DROP COLUMN`) are locked behind explicit interactive confirmations in both the Visual GUI and the command-line CLI.
- 🔄 **Agnostic Diff Engine**: Compares schema states (JSON model vs live DB connection) to generate clean, transaction-wrapped SQL migration scripts.
- 🗂️ **Multi-Language Model Generation**: Export clean, type-safe target models matching your database schema for:
  - **TypeScript** (clean Interfaces)
  - **C#** (DTO / Entity properties)
  - **Python** (Pydantic V2 models)
  - **Go** (Struct definitions with native JSON and DB tags)
- 🚀 **CLI-First**: Run validations, schema exports, or diff scripts directly inside your CI/CD pipelines.

---

## Core System Architecture

DbSlate is structured as a monorepo workspace for modularity:

```
├── core/                  # Database drivers, diff engine, and code generators
├── cli/                   # Standalone node CLI bin
└── web/                   # Next.js visual schema editor and migration preview dashboard
```

```mermaid
graph TD
    DB[("PostgreSQL / SQLite")] -->|Introspect| Core["@dbslate/core"]
    Core -->|Export JSON| SchemaJSON["schema.json"]
    SchemaJSON -->|Visual UI| WebDashboard["Next.js Visual Designer"]
    WebDashboard -->|Diff & Generate| SQL["migration.sql"]
    WebDashboard -->|Export Models| Models["TypeScript / C# / Python / Go"]
    CLI["dbslate CLI"] -->|Diff & Generate| SQL
    SQL -->|Apply| DB
```

---

## Getting Started

### Prerequisites

- Node.js (v18.0.0 or higher)
- npm (v9.0.0 or higher)

### Installation

Clone the repository and install workspace dependencies:

```bash
git clone https://github.com/your-username/dbslate.git
cd dbslate
npm install
```

### Compile Packages

```bash
# Build the TypeScript files for core and CLI
npm run build:core
npm run build:cli
```

### Running the Visual Dashboard (GUI)

Start the Next.js visual schema app locally on port 3000:

```bash
npm run dev:web
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## CLI Usage

Run command actions via `node cli/dist/bin.js` or link the bin globally using `npm link`.

### 1. Introspect an Existing Database

Extract structural schema details to a local JSON file:

```bash
# PostgreSQL
node cli/dist/bin.js introspect "postgresql://user:password@localhost:5432/mydb" --out schema.json

# SQLite
node cli/dist/bin.js introspect "sqlite://path/to/database.db" --out schema.json
```

### 2. Diff and Generate a Migration

Compare a current database schema with your desired target schema representation, and generate a migration script:

```bash
node cli/dist/bin.js diff --current schema.json --target schema.new.json --out migration.sql
```

_Note: If destructive operations are found, the CLI will interactively prompt you before including them (Option B safety lock)._

### 3. Apply a Migration File

Apply a migration file directly to a target database wrapped in transaction guards:

```bash
node cli/dist/bin.js apply "postgresql://user:password@localhost:5432/mydb" --migration migration.sql
```

### 4. Code Model Generation

Generate code model scripts directly from a schema JSON file:

```bash
node cli/dist/bin.js generate --schema schema.json --lang go --out ./models/user.go
```

---

## Open Source Contribution

DbSlate is open-source and welcomes contributions! Please read our [CONTRIBUTING.md](file:///c:/Users/awwal/Documents/work/hobby/database/CONTRIBUTING.md) to understand local development protocols, pull request approvals, and lint rules.

## License

MIT © [DbSlate Contributors](LICENSE)
