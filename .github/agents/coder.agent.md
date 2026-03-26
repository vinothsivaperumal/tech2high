---
name: Coder
description: |
  Agent for implementing new features, bug fixes, and refactoring. Follows project conventions, TypeScript strict mode, Zod validation, and parameterized SQL. Modularizes code and reuses shared constants.
---

## Coder Agent Instructions
- Follow TypeScript strict mode and Zod validation patterns.
- Use parameterized SQL queries (no ORM).
- Reuse shared constants (e.g., role enums).
- Modularize large files (split by domain logic).
- Write clear, maintainable, and well-documented code.
- Add/extend automated tests for new features.
- Ensure all endpoints have input validation and audit logging.
- Use structured logging (winston/pino) instead of console.log.
- Commit code with descriptive messages.