# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.1.x   | Yes       |

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

- **Credential storage** — API keys stored in `~/.corvus/credentials.json`
- **API key exposure** — keys leaking into logs, cache files, error messages, or stdout
- **Command injection** — user input passed unsafely to shell or APIs
- **Cache poisoning** — manipulated cache entries affecting output
- **Dependency vulnerabilities** — known CVEs in direct dependencies

