# Releasing

A release is one command, one tag, and one workflow. The workflow does the rest:
npm (signed with provenance), the MCP Registry, and a GitHub Release with the
`.mcpb` bundle attached.

## Cutting a release

```bash
npm run release 0.1.3          # bumps all four version files, opens the CHANGELOG section
$EDITOR CHANGELOG.md           # write the notes under the new heading
git commit -am "chore(release): 0.1.3"
git tag v0.1.3
git push origin main --tags    # the tag is what triggers the release
```

`npm run release` writes the version into **four** files — `package.json`,
`server.json` (twice: the server version and the npm package version),
`manifest.json`, and `package-lock.json` (twice). They are checked against each
other by `npm test`, and again against the tag by the release workflow, because
this has drifted before: 0.1.2 shipped to npm while the other three files still
said 0.1.0, and the only gate in place compared the tag to `package.json` alone.

To check without changing anything:

```bash
npm run version:check
```

### What the tag triggers

`.github/workflows/publish-to-npm.yml`, in order:

1. `npm ci`, then the tag/version agreement check, then `npm test`.
2. `mcp-publisher validate server.json` — the registry's full JSON Schema. This
   is not a formality: the registry caps `description` at 100 characters and
   ours was 135, so the first submission would have been rejected. CI runs the
   same check on every PR (the `registry-schema` job), so this should never be
   where it fails.
3. `npm publish --access public --provenance`. This runs `prepack`, which is
   `npm run build` — so the tarball carries a freshly built `2captcha-mcp.mjs`
   rather than whatever bundle happened to be on the runner. What ships is the
   bundle; `server.js` is source only and is not in the tarball.
4. `npm run build && npm run bundle`, then a GitHub Release with `dist/*.mcpb`
   attached.
5. The container image to `ghcr.io/2captcha/2captcha-mcp`, tagged with the
   version and `latest`, for amd64 and arm64.
6. Then, as a separate job (`.github/workflows/mcp-registry.yml`), the MCP
   Registry. It has to come *after* npm: the registry proves ownership by
   fetching the npm package and matching its `mcpName` field against
   `server.json`'s `name`, so the job first waits for npm's CDN to serve the
   new version, then logs in with the DNS key and publishes, then reads the
   entry back from the registry API.

The registry job is separate so that its signing key lives on the
`mcp-registry` environment and is never in scope for `npm ci` or the build. A
failure there (including a missing key) is a red job but does not undo or block
anything above. To retry it alone: **Actions → MCP Registry → Run workflow**,
and pick the release **tag** under "Use workflow from" — it refuses to run from
a branch, and a version the registry already has is a no-op.

`mcp-publisher` is pinned, and its tarball checked against the release's
sha256, in `.github/actions/setup-mcp-publisher/action.yml`. To bump it, change
both inputs there; a publisher too old for the registry fails login with
`invalid audience`.

GHCR needs no secret: it authenticates with the workflow's own `GITHUB_TOKEN`
via `packages: write`. The first push creates the package as **private** —
make it public once at
`https://github.com/orgs/2captcha/packages/container/2captcha-mcp/settings`,
or the `docker run` line in the README will ask people to log in.

## One-time setup

### `NPM_TOKEN`

An npm automation token with publish rights on the `@2captcha` org, at
**Settings → Secrets and variables → Actions → Repository secrets**. It must be
a *secret*, not a variable.

Provenance additionally needs nothing else: the workflow already requests the
`id-token: write` permission, and npm verifies the OIDC token from the runner.
The result is a "Built and signed" badge on the package page — which the
unaffiliated `2captcha-mcp` package cannot produce, and which is a better
answer to it than the warning in our README.

### `MCP_REGISTRY_DNS_PRIVATE_KEY`

Our registry namespace is `com.2captcha`, which is the reverse-DNS form of
`2captcha.com`. GitHub OIDC login — the secretless option — only grants
`io.github.*` namespaces, so proving this one means proving control of the
domain. We keep `com.2captcha` anyway: a name under the vendor's own domain is
something an unaffiliated publisher cannot claim, which `io.github.*` is not,
and a registry name is not something to change after the fact.

Generate a key pair and the DNS record:

```bash
MY_DOMAIN="2captcha.com"

openssl genpkey -algorithm Ed25519 -out key.pem

PUBLIC_KEY="$(openssl pkey -in key.pem -pubout -outform DER | tail -c 32 | base64)"
echo "${MY_DOMAIN}. IN TXT \"v=MCPv1; k=ed25519; p=${PUBLIC_KEY}\""

PRIVATE_KEY="$(openssl pkey -in key.pem -noout -text | grep -A3 "priv:" | tail -n +2 | tr -d ' :\n')"
echo "$PRIVATE_KEY"   # this goes in the GitHub secret
```

> **The TXT record goes on the apex — `2captcha.com`, not
> `_mcp-registry.2captcha.com`.** MCP's DNS auth follows SPF-style placement, not
> DKIM-style. Under a selector the registry never sees it and login fails with a
> generic signature error that says nothing about placement.

Then:

1. Add the TXT record at the apex and wait for it to propagate
   (`dig +short TXT 2captcha.com`).
2. Create the environment at **Settings → Environments → New environment**,
   named exactly `mcp-registry`, and on it:
   - **Deployment branches and tags → Selected branches and tags**, add a
     *tag* rule `v*`. Only release tags can then reach the key.
   - Optionally, **Required reviewers**, to approve each registry publish by
     hand.
   - **Environment secrets → Add secret** `MCP_REGISTRY_DNS_PRIVATE_KEY` with
     `$PRIVATE_KEY`.

   It must be an *environment* secret. The registry job is a reusable workflow
   called without `secrets: inherit`, so a repository secret of the same name
   is deliberately not visible to it — the key can publish anything under
   `com.2captcha/*`, and a repository secret is readable by any workflow any
   writer pushes. Delete the old repository secret if it exists.
3. Delete `key.pem`. The secret is the only copy that needs to survive.

Ed25519 here needs OpenSSL 3.0+. macOS ships LibreSSL as the system `openssl`,
which fails with `Algorithm Ed25519 not found`; use `brew install openssl@3` and
call that binary explicitly.

On key rotation, **remove the old TXT record**. A stale record is tried first and
fails verification.

## The `.mcpb` bundle

```bash
npm ci
npm run bundle          # → dist/2captcha-mcp-<version>.mcpb
```

`npm run bundle` requires `npm run build` first and says so if the bundle is
missing: what it stages under `server/` is the esbuild output, not the source
tree. The result is self-contained and `manifest.json` runs it with the host's
own node. It deliberately does not shell out to `npx @2captcha/mcp` at install
time — that needs a network round trip and an `npx` on `PATH`, and
`spawn npx ENOENT` is already a troubleshooting entry in our own README.

Staging the bundle rather than `node_modules` is what took the `.mcpb` from
3.1 MB across 2,165 files to **172 KB across 6**, since the SDK's `express`,
`hono` and `cors` are tree-shaken out on the way.
