# Self-Evolving Skill Engine

This package turns a natural-language skill description into a TypeScript skill, validates it in a sandbox, runs generated tests, scores it, and hot-registers it into the live SkillRunner if it passes.

## Flow

1. Describe the skill
2. Generate TypeScript
3. Transpile and sandbox it
4. Generate tests
5. Run the tests
6. Score the candidate
7. Repair if needed
8. Hot-register and persist

## Suggested integration

- `SelfEvolvingSkillEngine` in `engine.ts`
- `registerEvolutionRoutes` in `routes.ts`
- `ZeroGStorageEvolutionStore` for persistence
- `hotRegisterSkill` to connect to the live registry
