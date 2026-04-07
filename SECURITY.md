# Security Policy

## Supported Versions

| Version | Supported |
| ------- | --------- |
| 0.3.x   | Yes       |
| 0.2.x   | Yes       |
| 0.1.x   | No        |

## Reporting a Vulnerability

If you discover a security vulnerability in Corvus, please report it responsibly.

**Email:** roger@griffinatlas.us

**Please include:**

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

I will acknowledge receipt within 48 hours and aim to release a fix within 7 days for critical issues.

**Do not** open a public GitHub issue for security vulnerabilities.

## Scope

The following areas are in scope for security reports:

- **Credential storage** — API keys stored in `~/.corvus/credentials.json` (0o600 permissions on Unix, unprotected on Windows)
- **API key exposure** — keys leaking into logs, cache files, error messages, or stdout
- **Input validation** — crafted usernames, tweet IDs, or topics causing unintended behavior
- **Prompt injection** — tweet content reaching Grok planning prompts via agent replan
- **Path traversal** — user input escaping the `~/.corvus/` directory
- **Dependency vulnerabilities** — known CVEs in direct dependencies

## Known Accepted Risks

The following are documented risks that have been evaluated and accepted:

### Prompt Injection via Tweet Content (Medium)

The agent pipeline's replan step includes Grok-returned signals (which may contain real tweet text) in subsequent prompts. A crafted tweet could theoretically influence the agent's plan. This is mitigated by:
- `validCommands` filter (only scan/pulse/trace/profile allowed)
- `MAX_REPLANS = 3` limit
- Step count limits per investigation
- No shell execution or file write capability in the agent

### File Permissions on Windows

`credentials.json` and `voice-profile.json` are written with `0o600` permissions, which are only enforced on Unix. On Windows, these files are readable by any local user.

## Security Measures

- **ID validation** — `getTweet()`, `getUserById()`, `getUserTweets()` validate IDs against `/^\d{1,20}$/`
- **Username validation** — `getUser()` and profile Grok-only path validate against `/^[A-Za-z0-9_]{1,15}$/`
- **Error messages** — credential paths are not leaked in error messages
- **Directory permissions** — `~/.corvus/` created with `0o700`, enforced with explicit `chmodSync`
- **Cost ledger** — query text truncated to 100 chars to limit sensitive data on disk
- **No shell execution** — Corvus never invokes shell commands or `eval()`
- **Dependency audit** — `npm audit` runs as part of CI; 0 known vulnerabilities as of v0.3.1
