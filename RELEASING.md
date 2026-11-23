# Releasing

Every release is published to npm by GitHub Actions (`.github/workflows/publish.yml`), with an npm provenance statement. n8n requires provenance for community nodes, and a package published from a laptop has none, so never run `npm publish` locally.

The workflow runs when a version tag is pushed, for example `0.1.0`, with no `v` in front. It installs, builds and tests, then runs `npm run release`. In GitHub Actions that command lints, builds and runs `npm publish` with provenance turned on. It does not change the version or the changelog.

## A normal release

1. On `main`, set `version` in `package.json` and add the release to `CHANGELOG.md`. Commit and push.
2. Tag that commit with the same version and push the tag: `git tag 0.2.0 && git push origin 0.2.0`.
3. Watch the Publish run in the Actions tab. When it finishes, the version is on npm with provenance.

Do not run `npm run release` on your own machine: there it bumps the version and rewrites `CHANGELOG.md` from commit messages.

## The first release (0.1.0)

npm trusted publishing (OIDC, no token) can only be set up for a package that already exists on npm. So 0.1.0 is published by the same workflow with a temporary token:

1. On npmjs.com, signed in as the account that will own the package, create a granular access token with read and write access to packages and a short expiry, such as 7 days. If the account requires two-factor authentication for writes, allow the token to bypass it, or the publish is refused.
2. In this repository, under Settings, Secrets and variables, Actions, add it as `NPM_TOKEN`.
3. Push the tag: `git tag 0.1.0 && git push origin 0.1.0`. The workflow publishes 0.1.0 with provenance.
4. On npmjs.com, open the package's settings and add a trusted publisher: GitHub Actions, repository `penfieldlabs/n8n-nodes-penfield`, workflow `publish.yml`.
5. Delete the `NPM_TOKEN` secret and revoke the token on npmjs.com. Later releases use trusted publishing; the workflow skips the token step when the secret is not set.

Trusted publishing needs npm 11.5.1 or later. The workflow uses the current Node.js LTS, which comes with a newer npm.
