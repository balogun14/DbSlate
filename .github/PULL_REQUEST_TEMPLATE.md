## Description

Please include a summary of the changes and the related issue. Specify what problem this PR solves and outline the design rationale.

Fixes # (issue)

## Type of Change

Please select options that apply:

- [ ] Bug fix (non-breaking change which fixes an issue)
- [ ] New feature (non-breaking change which adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to change)
- [ ] Documentation update (README, CONTRIBUTING, etc.)

## Data Loss Safety (Option B Verification)

If your changes affect schema diffing or migration generation:

- [ ] I verify that all destructive changes are successfully identified by `isDestructive`.
- [ ] I verify that the CLI and Visual GUI enforce interactive user confirmation before including destructive statements in execution DDL.
- [ ] I have included unit tests mapping both confirmed and unconfirmed destructive workflows.

## Verification & Testing

Detail the tests you ran to verify your changes. Provide instructions so we can reproduce.

### Automated Tests

```bash
# Command run to verify
npm run test
```

### Manual Verification

- [ ] Connect SQLite database file and confirm visual modifications.
- [ ] Connect PostgreSQL connection string and confirm visual modifications.
- [ ] Validate model generation output format.

## Checklist

- [ ] My code follows the style guidelines of this project.
- [ ] I have performed a self-review of my code.
- [ ] I have commented my code, particularly in hard-to-understand areas.
- [ ] I have updated corresponding documentation.
- [ ] My changes generate no new warnings or typescript compiler errors.
- [ ] I have added tests that prove my fix is effective or that my feature works.
- [ ] New and existing unit tests pass locally.
