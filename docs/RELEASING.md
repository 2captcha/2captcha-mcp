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
   ours was 135, so the first submission would have been rejected.
3. `npm publish --access public --provenance`. This runs `prepack`, which is
   `npm run build` — so the tarball carries a freshly built `2captcha-mcp.mjs`
   rather than whatever bundle happened to be on the runner. What ships is the
   bundle; `server.js` is source only and is not in the tarball.
4. `mcp-publisher publish` to the MCP Registry. This has to come *after* npm:
   the registry proves ownership by fetching the npm package and matching its
   `mcpName` field against `server.json`'s `name`. It retries for a couple of
   minutes because npm's CDN does not serve a new version instantly.
5. `npm run build && npm run bundle`, then a GitHub Release with `dist/*.mcpb`
   attached.
6. The container image to `ghcr.io/2captcha/2captcha-mcp`, tagged with the
   version and `latest`, for amd64 and arm64.

A missing registry key downgrades step 4 to a warning — the npm release still
happens.

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
`2captcha.com`. GitHub OIDC login only grants `io.github.*` namespaces, so
proving this one means proving control of the domain.

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
2. Put `$PRIVATE_KEY` in the repository secret `MCP_REGISTRY_DNS_PRIVATE_KEY`.
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

The bundle is self-contained: `server.js`, `tool_groups.js` and the production
`node_modules` are staged under `server/` inside it, and `manifest.json` runs
them with the host's own node. It deliberately does not shell out to
`npx @2captcha/mcp` at install time — that needs a network round trip and an
`npx` on `PATH`, and `spawn npx ENOENT` is already a troubleshooting entry in
our own README.

Because the dependency tree is ~26 MB, so is the bundle. Bundling `server.js`
with esbuild first would cut that by an order of magnitude — the SDK pulls in
`express`, `hono`, `cors` and `ajv`, none of which this bridge uses.
