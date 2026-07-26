# MessApp deployment environments

## Staging

- Branch: `staging`
- Vercel environment: Preview
- Purpose: integration testing and release-candidate review
- Changes enter through pull requests from feature branches.
- Preview-scoped Vercel variables should point to staging services and data.

## Production

- Branch: `main`
- Vercel environment: Production
- Purpose: the live user-facing application
- Production pull requests must originate from `staging`.
- Production-scoped Vercel variables must remain separate from Preview values.

## Promotion flow

1. Open a feature pull request into `staging`.
2. Wait for the GitHub validation gate and Vercel Preview deployment.
3. Test the staged application.
4. Open a pull request from `staging` into `main`.
5. Merge only after validation succeeds. Vercel then deploys `main` to Production.

Native Android, Windows, and Linux prereleases are packaged separately through
`build_all.sh` and the GitHub release workflow.
