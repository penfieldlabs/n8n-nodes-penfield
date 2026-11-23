# Releasing

Every release is published to npm by GitHub Actions (`.github/workflows/publish.yml`), with an npm provenance statement. n8n requires provenance for community nodes, and a package published from a laptop has none, so never run `npm publish` locally.

The workflow runs when a version tag is pushed, for example `0.1.0`, with no `v` in front. It installs, builds and tests, then runs `npm run release`. In GitHub Actions that command lints, builds and runs `npm publish` with provenance turned on. It does not change the version or the changelog.

## A normal release

1. On `main`, set `version` in `package.json` (and the two matching `version` fields at the top of `package-lock.json`) and add the release to `CHANGELOG.md`. Commit and push, and wait for CI to pass.
2. Tag that commit with the same version and push the tag: `git tag 0.2.0 && git push origin 0.2.0`.
3. Watch the Publish run in the Actions tab. When it finishes, the version is on npm with provenance.

Do not run `npm run release` on your own machine: there it bumps the version and rewrites `CHANGELOG.md` from commit messages.

## How npm trusts this workflow

npm trusted publishing (OIDC) is set up for this package on npmjs.com: npm accepts a publish only from the repository `penfieldlabs/n8n-nodes-penfield` and the workflow `publish.yml`. No npm token is stored in this repository. Trusted publishing needs npm 11.5.1 or later; the workflow uses the current Node.js LTS, which comes with a newer npm.

The workflow also checks every tag before it publishes: the tag must match the `version` in `package.json`, and it must point at a commit on `main`. Any other tag stops the run before anything is built.

The first release, 0.1.0, was published with a temporary npm token, because trusted publishing can only be set up for a package that already exists on npm. That token has been revoked.
