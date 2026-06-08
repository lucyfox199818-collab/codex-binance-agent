# Security Policy

Codex Binance Agent can read private exchange data and, when explicitly enabled, submit account
and trading actions. Security reports must be handled separately from ordinary bug reports.

## Supported Version

Security fixes currently target the latest commit on `main` and the latest published release.

## Private Reporting

Use GitHub Security Advisories:

https://github.com/lucyfox199818-collab/codex-binance-agent/security/advisories/new

Do not create a public Issue for:

- Credential, API key, secret, proxy credential, or account-data exposure.
- A path that bypasses `CCXT_ENABLE_TRADING` or `CCXT_DRY_RUN`.
- Unauthorized order, transfer, withdrawal, leverage, margin, or account-mode actions.
- Command injection, arbitrary code execution, filesystem access, or sensitive log disclosure.
- A flaw that lets audit or UI components reach exchange execution capabilities.

Include the affected commit or version, prerequisites, minimal reproduction, expected impact, and a
suggested mitigation when available. Redact all real credentials, balances, positions, order IDs,
addresses, IP addresses, and other identifying information.

## Safe Testing

- Prefer public market data, dry-run, local fixtures, or an exchange test environment.
- Never test against another person's account or infrastructure without explicit authorization.
- Do not send real orders, transfers, or withdrawals to demonstrate a vulnerability.
- Use a dedicated low-permission API key with withdrawals disabled and an IP allowlist.

## Disclosure

Please allow maintainers reasonable time to reproduce and remediate a confirmed issue before public
disclosure. Credit will be given when requested, unless the report is abusive, fraudulent, or
violates applicable law.
