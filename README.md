# Taskmanager

[![CI](https://github.com/AVMG20/arnotes/actions/workflows/ci.yml/badge.svg)](https://github.com/AVMG20/arnotes/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-34d399.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-0.1.0-34d399.svg)](https://github.com/AVMG20/arnotes/releases)

Taskmanager is a self-hosted project manager for an agency and its customers: organisations, customers with their own logins, and kanban boards with assignees, due dates and nested subtasks. It started as a fork of [Arnotes](https://github.com/AVMG20/arnotes-old), and its install names (`services.arnotes`, the `arnotes` database and Docker volumes) are kept from there so upgrades stay in place. It includes a rich-text editor, full-text search, attachments, expiring public links to boards, an installable PWA, optional AI writing tools through OpenRouter, and an MCP server for connecting AI agents.

![Taskmanager editor](public/screenshot.png)

> Taskmanager is at version 0.1.0. Back up your data before upgrading and review the [changelog](CHANGELOG.md) for upgrade instructions.

## Features

- Rich editing with headings, tables, tasks, code blocks, highlighting, and images
- Search across boards, tasks, and labels
- Markdown import and export
- Soft deletion and trash recovery
- Private boards, each with an optional expiring public link
- Email/password accounts with optional Discord, GitHub and Google OAuth, or your own OpenID Connect server
- Passkeys, authenticator-app two-factor, and optional sign-in codes by email
- Bring-your-own-key OpenRouter integration; AI is entirely optional
- Customers inside your organisation, each with projects and logins of their own: a customer sees the tasks and updates you mark as visible to them, and never the internal ones
- Kanban boards for projects: columns, drag-and-drop tasks, labels, rich-text descriptions, and a log of updates per task, written in a narrow inline Markdown (bold, italic, code, strike, highlight, links)
- Live updates, so a change made by an AI agent, a teammate, or another tab shows up without a reload — on shared links too
- Built-in MCP server so Claude Code and other AI agents can read and manage your boards, using API keys you scope yourself
- Installable Progressive Web App
- Docker- and Nix-based self-hosting with persistent PostgreSQL and attachment storage

## Quick Start

Requirements: [Git](https://git-scm.com/) and Docker with the Compose plugin.

```bash
git clone https://github.com/AVMG20/arnotes.git
cd arnotes
docker compose up -d --build
```

Open [http://localhost:3000](http://localhost:3000) and create an account.

That is the entire local self-hosting setup. Compose builds Taskmanager, starts PostgreSQL, waits for it to become healthy, pushes the Drizzle schema, and generates a persistent authentication secret.

Check status and logs with:

```bash
docker compose ps
docker compose logs -f app
```

Stop the stack without deleting data:

```bash
docker compose down
```

## Self-Host With Docker

The defaults are intended to work immediately on a trusted local machine. For an internet-facing server, create a `.env` file first:

```bash
cp .env.example .env
```

At minimum, change these values:

```dotenv
BETTER_AUTH_URL=https://taskmanager.example.com
BETTER_AUTH_SECRET=replace-with-at-least-32-random-characters
ALLOW_SIGN_UP=true
```

Generate an authentication secret with `openssl rand -base64 32`. The default `DATABASE_URL` connects to the bundled PostgreSQL service; replace the complete URL only when using an external PostgreSQL database.

Start the production stack:

```bash
docker compose up -d --build
```

Create your owner account, then set `ALLOW_SIGN_UP=false` in `.env` and apply the change:

```bash
docker compose up -d
```

### HTTPS And Reverse Proxy

Taskmanager listens on port `3000`. Put it behind a TLS-terminating reverse proxy for internet access. `BETTER_AUTH_URL` must exactly match the public origin, including `https://` and any non-standard port.

Example Caddy configuration:

```caddyfile
taskmanager.example.com {
  reverse_proxy localhost:3000
}
```

Only expose the application through the reverse proxy. PostgreSQL is bound to `127.0.0.1` by default and should not be made publicly reachable.

### Configuration

| Variable | Default | Description |
| --- | --- | --- |
| `BETTER_AUTH_URL` | `http://localhost:3000` | Public application origin used by authentication |
| `BETTER_AUTH_TRUSTED_ORIGINS` | empty | Extra origins, comma separated, that may sign in besides `BETTER_AUTH_URL` |
| `APP_PORT` | `3000` | Host port mapped to the application |
| `DATABASE_URL` | bundled PostgreSQL | Complete PostgreSQL connection URL |
| `BETTER_AUTH_SECRET` | generated | Stable 32+ character authentication secret; generated into the data volume when empty |
| `ALLOW_SIGN_UP` | `true` | Whether visitors may create accounts, by any sign-in method |
| `NUXT_PUBLIC_DISCORD_ENABLED` | `false` | Show and enable Discord OAuth sign-in |
| `DISCORD_CLIENT_ID` | empty | Discord application client ID |
| `DISCORD_CLIENT_SECRET` | empty | Discord application client secret |
| `NUXT_PUBLIC_GITHUB_ENABLED` | `false` | Show and enable GitHub OAuth sign-in |
| `GITHUB_CLIENT_ID` | empty | GitHub application client ID |
| `GITHUB_CLIENT_SECRET` | empty | GitHub application client secret |
| `NUXT_PUBLIC_GOOGLE_ENABLED` | `false` | Show and enable Google OAuth sign-in |
| `GOOGLE_CLIENT_ID` | empty | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | empty | Google OAuth client secret |
| `NUXT_PUBLIC_OIDC_ENABLED` | `false` | Show and enable sign-in through your own OpenID Connect server |
| `NUXT_PUBLIC_OIDC_NAME` | `Single sign-on` | Label on that button, e.g. `Authentik` |
| `OIDC_DISCOVERY_URL` | empty | The server's `.well-known/openid-configuration` URL |
| `OIDC_CLIENT_ID` | empty | OIDC client ID |
| `OIDC_CLIENT_SECRET` | empty | OIDC client secret |
| `NUXT_PUBLIC_PASSKEYS_ENABLED` | `true` | Allow signing in with passkeys |
| `NUXT_PUBLIC_EMAIL_CODE_ENABLED` | `false` | Show and enable "Email me a code" sign-in; needs SMTP |
| `SMTP_HOST` | empty | SMTP server for outgoing mail |
| `SMTP_PORT` | `587`, or `465` when secure | SMTP port |
| `SMTP_SECURE` | `false` | `true` for TLS from the first byte; otherwise STARTTLS is used when offered |
| `SMTP_USER` / `SMTP_PASSWORD` | empty | SMTP credentials, if the server needs them |
| `SMTP_FROM` | empty | Sender address, e.g. `Taskmanager <taskmanager@example.com>` |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | empty | Key pair for Web Push (notifications when no tab is open); both must be set, and the site needs HTTPS. `.env.example` has a one-line command that makes a pair |
| `VAPID_SUBJECT` | `mailto:admin@localhost` | How push services can reach you: a `mailto:` or `https:` URL |
| `GITHUB_TOKEN` | empty | Optional GitHub token for reading issues, pull requests and workflow runs; public repositories work without it, at GitHub's lower rate limit. Only ever sent to GitHub |
| `GITHUB_WEBHOOK_SECRET` | empty | Secret GitHub signs webhook deliveries with, checked on `POST /api/github/webhook`. The receiver answers 503 until it is set |
| `GITHUB_ALLOWED_OWNERS` | empty | Comma-separated GitHub owners and orgs that links may point at. Empty allows any owner the token can see; set it in production, since the token can read every repository it has access to |
| `GITHUB_API_URL` | empty | Testing only: call a local stub instead of `api.github.com`. Ignored when `NODE_ENV` is `production` |

To enable Discord, set all three Discord variables and register this redirect URL in the Discord developer portal:

```text
https://taskmanager.example.com/api/auth/callback/discord
```

To enable GitHub, set all three GitHub variables and register this authorization callback URL in a GitHub OAuth app:

```text
https://taskmanager.example.com/api/auth/callback/github
```

To enable Google, set all three Google variables and create a *Web application* OAuth client under Google Auth Platform → Clients in the Google Cloud Console, with this authorized redirect URI:

```text
https://taskmanager.example.com/api/auth/callback/google
```

Google accepts plain `http` redirect URIs only for `localhost`, so `http://localhost:3000/api/auth/callback/google` works for local development. Other hosts, including `*.localhost` names and LAN IP addresses, need HTTPS on a public domain. While the consent screen is in *Testing*, only the Google accounts listed as test users can sign in.

To use your own OpenID Connect server (Authentik, Authelia, Keycloak, Pocket ID, Kanidm), create a confidential client there with this redirect URI, set the three `OIDC_*` variables, and name the button with `NUXT_PUBLIC_OIDC_NAME`:

```text
https://taskmanager.example.com/api/auth/oauth2/callback/oidc
```

GitHub integration is in progress. The server side is in place: it parses GitHub references, reads issue, pull request, branch and workflow run data from `api.github.com` with the token kept on the server, and keeps a cache with a webhook receiver. No link can be added from the app yet: the task routes, the task panel, the card badge and the agent tools are still to come, and this section will be updated when they land. The webhook receiver is in place. In the repository or organisation settings on GitHub, add a webhook with this payload URL, content type `application/json`, the same secret as `GITHUB_WEBHOOK_SECRET`, and the events `issues`, `pull_request`, `check_run` and `workflow_run`. Until the secret is set on the server, the receiver answers 503:

```text
https://taskmanager.example.com/api/github/webhook
```

### Passkeys, Two-Factor And Email Codes

**Passkeys** work without any configuration. A signed-in user adds one under **Settings → Security**, then signs in with the passkey button, or by picking it from the email field's autofill. A passkey is bound to the hostname in `BETTER_AUTH_URL`: changing that hostname, or moving from `localhost` to a real domain, leaves existing passkeys unusable, and they have to be added again.

**Two-factor authentication** is also always available, under **Settings → Security**: scan the QR code with an authenticator app, confirm one code, and keep the backup codes. It protects password sign-in, so it is only offered to accounts that have a password. An account with two-factor turned on cannot sign in with an email code, since that would let the inbox stand in for the second factor; passkeys and OAuth still work.

**Email codes** need an SMTP server. Set `NUXT_PUBLIC_EMAIL_CODE_ENABLED=true` with at least `SMTP_HOST` and `SMTP_FROM`. A code is valid for 10 minutes and allows three attempts. When sign-up is allowed, a code for an unknown address creates the account. For local development, [Mailpit](https://mailpit.axllent.org/) catches the mail without sending it:

```bash
docker run -d -p 1025:1025 -p 8025:8025 axllent/mailpit
# .env: SMTP_HOST=localhost, SMTP_PORT=1025, SMTP_FROM=Taskmanager <taskmanager@localhost>
# read the mail at http://localhost:8025
```

The `NUXT_PUBLIC_*_ENABLED` switches are used by both the server and client, so the same configuration works with native development and Docker Compose.

OpenRouter credentials are entered per user under Settings and are not server environment variables.

### Organisations And Customers

The first account to sign up runs the instance. It gets an organisation of its own and is the only account that may hand out the right to create organisations, under **Accounts on this instance** in the workspace menu. An instance that already had users is upgraded the same way on startup: its oldest account becomes the admin.

Inside an organisation, **Customers** in the workspace menu adds customers, files projects under them (the customer button next to a board's name), and creates invitation links. A link works once, for 14 days, and is shown only when it is created. Whoever opens it signs in or creates an account, even where `ALLOW_SIGN_UP=false`, and becomes a contact of that customer: the customer's boards appear in their personal workspace.

Contacts see what is marked as visible to the customer and nothing else:

- A task is visible to the customer unless it is switched to **Internal** in its panel. Internal tasks are also left off a board's public link.
- An update starts out internal. The lock next to the update box shares the next one, and **Show to customer** in an update's menu shares one already posted.
- Contacts can file tasks and post updates, which are always visible to the team and the customer. They cannot move, edit, or delete tasks, change columns, or share the board.

Agents over MCP and the in-app assistant work with staff access only. They never reach a customer's board through a contact's key.

### Persistent Data

Compose creates two named volumes:

- `arnotes_postgres_data` stores accounts, boards, settings, and metadata.
- `arnotes_app_data` stores uploaded attachments and the auto-generated auth secret.

`docker compose down` keeps both volumes. `docker compose down -v` permanently deletes them.

### Backups

Back up both PostgreSQL and the application data volume:

```bash
docker compose exec -T postgres pg_dump -U arnotes -d arnotes > arnotes.sql
docker run --rm -v arnotes_app_data:/data:ro -v "$PWD":/backup alpine tar czf /backup/arnotes-data.tar.gz -C /data .
```

When using an external database, use its matching connection details instead. Store the backup files somewhere separate from the host running Taskmanager.

### Updates

Pull the new source, rebuild the image, and let Compose push the current schema before starting Taskmanager:

```bash
git pull --ff-only
docker compose up -d --build
docker image prune -f
```

Take a backup first. Watch startup with `docker compose logs -f app` and verify `http://localhost:3000/api/health` returns a healthy response.

## Self-Host With Nix

The same stack runs natively on Nix: a `flake.nix` builds the app and the schema tooling as hermetic packages, and a NixOS module turns them into the same three services Compose runs — PostgreSQL, a one-shot schema push, and the app.

Requirements: [Nix with flakes](https://nixos.org/manual/nix/stable/command-ref/new-cli/nix.html).

### NixOS module

The module manages everything itself. By default it creates a dedicated `arnotes` PostgreSQL role and database on the system PostgreSQL, generates a stable auth secret into `/var/lib/arnotes` on first start, and runs the Drizzle schema push before launching the app.

```nix
# flake.nix of your system
{
  inputs.arnotes.url = "github:AVMG20/arnotes";
  outputs = { self, nixpkgs, arnotes, ... }: {
    nixosConfigurations.host = nixpkgs.lib.nixosSystem {
      modules = [
        arnotes.nixosModules.default
        {
          services.arnotes = {
            enable = true;
            betterAuth.url = "https://taskmanager.example.com";
            openFirewall = true;
            # allowSignUp defaults to true; set to false once the owner account exists
          };
        }
      ];
    };
  };
}
```

Build the configuration and apply it with `nixos-rebuild switch --flake .#host`, then open `http://localhost:3000`. Attachments and the generated secret live under `/var/lib/arnotes`; back that directory up alongside PostgreSQL (`pg_dump`).

Key options (`services.arnotes.*`):

| Option | Default | Description |
| --- | --- | --- |
| `port` / `host` | `3000` / `0.0.0.0` | Listen address |
| `stateDir` | `/var/lib/arnotes` | Attachments and generated auth secret |
| `database.createLocally` | `true` | Manage a local PostgreSQL role and database |
| `database.url` | derived | Use an external database instead of the local one |
| `betterAuth.url` | `http://localhost:3000` | Public origin used by authentication |
| `betterAuth.secretFile` | generated | Read a stable 32+ char secret from a file |
| `allowSignUp` | `true` | Allow new accounts, by any sign-in method |
| `discord.enable` / `github.enable` / `google.enable` | `false` | Enable OAuth sign-in; set `clientId`/`clientSecret` |
| `oidc.enable` | `false` | Enable your own OIDC server; set `name`, `discoveryUrl`, `clientId`, `clientSecret` |
| `passkeys.enable` | `true` | Allow passkey sign-in |
| `emailCode.enable` | `false` | Enable email-code sign-in; set `smtp.host`, `smtp.from` and, if needed, `smtp.port`/`secure`/`user`/`password` |
| `environment` | `{}` | Extra environment variables |
| `openFirewall` | `false` | Open the app port in the firewall |

### Packages

Without a NixOS system, build and run the packages directly:

```bash
nix build .#default   # the app  (result/bin/arnotes)
nix build .#schema    # schema tooling (result/bin/arnotes-db-push)
```

Run the app against a PostgreSQL of your choice:

```bash
DATABASE_URL=postgresql://arnotes:arnotes@localhost:5432/arnotes \
BETTER_AUTH_URL=http://localhost:3000 \
BETTER_AUTH_SECRET=replace-with-at-least-32-random-characters \
./result/bin/arnotes
```

### Development shell

`nix develop` provides bun, node, PostgreSQL, and two helpers that replace `docker compose up -d postgres`:

```bash
nix develop
db-start            # init and start a local PostgreSQL on port 5432
bun install
bun run db:push     # push server/db/schema.ts to PostgreSQL
bun run dev         # run the dev server with hot reload
```

`db-stop` stops the local PostgreSQL. Its data lives under `.nix-data/` in the repo.

> Building the packages runs `bun install` against the npm registry inside a fixed-output derivation, so builds need network access on first run. Native dependencies differ per platform, so each one has its own hash in `nix/hashes.json` (linux × x86_64/arm64 and Apple Silicon macOS). The `nix-hashes` workflow recomputes and commits them whenever `bun.lock`/`package.json` change, so dependency bumps don't break the flake. Intel macOS (`x86_64-darwin`) was retired from nixpkgs and is not supported.

## Connect An AI Agent

Taskmanager ships an [MCP](https://modelcontextprotocol.io) server, so Claude Code, Claude Desktop, and any other MCP client can search, read, and manage your kanban boards.

Open **Settings → API keys & MCP** to create a key, then follow the in-app setup guide at `/mcp`, which shows the endpoint for your install along with ready-made configuration snippets.

### API Keys

Keys are created per workspace: a key made inside a team reaches that team's boards, and a key made in your personal workspace reaches only your own. Each key carries the permissions you give it — read, write, or both.

| Permission | Tools it unlocks |
| --- | --- |
| Read boards | `list_boards`, `get_board`, `get_task`, `search_tasks`, `list_task_labels` |
| Write boards | `create_board`, `update_board`, `create_column`, `update_column`, `delete_column`, `restore_column`, `create_task`, `update_task`, `move_task`, `delete_task`, `restore_task` |

A key is displayed once, at creation. Only its SHA-256 hash is stored, so it can never be shown again — copy it then, or create a new one. Keys can be given an expiry date and can be revoked at any time, which disconnects anything using them immediately.

A read-only key does not merely refuse to write: the writing tools are never advertised to it.

### What the tools return

The list-shaped tools answer with what the screen shows, not with everything behind it. `get_board` returns each task the way its kanban card renders — title, labels, update count and the first 160 characters of the description — and `search_tasks` returns an excerpt around the match. The full description and the thread of updates come from `get_task`, one task at a time, so reading a busy board costs a board and not a stack of documents.

A large board can be narrowed further: `columns` restricts the read to the stages you care about, `detail: "titles"` drops the excerpts, and `limit` caps the tasks per column, reporting the rest as `omitted`.

Anything addressable in the app is also addressable by its link. Paste the URL of a board, or a board with a task open (`/projects/<id>?task=<id>`), into `get_board` or `get_task` and it resolves to that one resource — there is no title to describe and no id to retype.

### Connecting

The endpoint is `https://taskmanager.example.com/api/mcp`, spoken over streamable HTTP and authenticated with an `Authorization: Bearer` header.

```bash
claude mcp add --transport http taskmanager https://taskmanager.example.com/api/mcp \
  --header "Authorization: Bearer arn_your_key_here"
```

For clients configured with JSON:

```json
{
  "mcpServers": {
    "taskmanager": {
      "type": "http",
      "url": "https://taskmanager.example.com/api/mcp",
      "headers": { "Authorization": "Bearer arn_your_key_here" }
    }
  }
}
```

Anything an agent writes shows up in an open browser immediately — the app listens on a WebSocket at `/_ws` and refetches what changed, so a board list never sits there stale. Public pages listen on the same socket for the one board they were given a link to, so a shared board follows the work as it moves. Behind a reverse proxy, that path needs the usual `Upgrade`/`Connection` headers forwarded; a single app instance holds the connections in memory, so running several would need a shared bus between them.

Agents work with task descriptions as Markdown; Taskmanager converts to and from the editor's format on both sides.

Nothing reachable over MCP deletes anything permanently. `delete_column` and `delete_task` put the column or card in the board's trash, undone by `restore_column` and `restore_task` or by the user under **Show trashed** on the board. A board's trash is emptied automatically after 7 days. There is no `delete_board` tool at all — deleting a board takes every column, task and update with it, so it stays in the app behind a confirmation, where an agent cannot reach it.

The setup guide also offers a copyable skill file that teaches an agent the conventions of the app, such as matching your existing labels and reading a task before editing it.

## Development

Requirements, either path:

- [Bun 1.3.10 or newer](https://bun.sh/) and Docker with Compose
- Or [Nix with flakes](https://nixos.org/manual/nix/stable/command-ref/new-cli/nix.html) and run `nix develop` instead of the steps below

Install dependencies and prepare local configuration:

```bash
bun install
cp .env.example .env
```

For native development, change `postgres` to `localhost` in `DATABASE_URL` inside `.env`.

Start only PostgreSQL, then run Nuxt with hot reload:

```bash
docker compose up -d postgres
bun run db:push
bun run dev
```

With Nix, `docker compose up -d postgres` becomes `db-start` inside `nix develop`; the rest is identical.

Open [http://localhost:3000](http://localhost:3000). Run `bun run db:push` again after changing `server/db/schema.ts`.

Useful commands:

```bash
bun run lint          # ESLint
bun run typecheck     # Vue and TypeScript checks
bun run build         # Production build
bun run db:push       # Push server/db/schema.ts to PostgreSQL
```

Database structure is defined only in `server/db/schema.ts`. After changing it, run `bun run db:push`; do not commit generated SQL, snapshots, or migration metadata.

## Architecture

- Nuxt 4 and Vue 3 provide the client and Nitro API server.
- Nuxt UI and Tailwind CSS provide the interface.
- Better Auth handles email/password sessions, passkeys, two-factor, email codes, and optional Discord, GitHub, Google and generic OIDC sign-in.
- Drizzle ORM and PostgreSQL store application data.
- Uploaded files are stored under `data/attachments` and mounted as a Docker volume.
- OpenRouter powers optional user-configured AI actions.
- An MCP server at `/api/mcp` exposes boards to AI agents, authenticated with scoped API keys.

## Marketing Site

The standalone [`index.html`](index.html) is the project marketing page. To publish it with GitHub Pages, set Pages **Source** to **Deploy from a branch**, then select the `main` branch and `/(root)` folder.

## Contributing

Bug reports and pull requests are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) before submitting a change. Please report security issues privately according to [SECURITY.md](SECURITY.md).

## License

Taskmanager is available under the [MIT License](LICENSE).
