# Build Command

Execute a plan file to build features.

## Instructions

1. Read the entire plan provided as argument
2. Execute tasks in the specified order
3. Use sub-agents for parallel work where indicated
4. Test and validate after each major task
5. Update progress.md with completion status

## Execution Flow

1. Parse the plan structure
2. Identify parallel execution opportunities
3. For each task:
   - Mark as in_progress
   - Execute the implementation
   - Run validation if specified
   - Mark as completed
4. Update progress.md with final status
5. Report any issues encountered

## Usage

```
/build <path-to-plan-file>
```

Example: `/build agent-plans/plan-01-module-01-app-shell.md`
