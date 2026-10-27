# Security Policy

## Reporting a vulnerability

CINEVA maintainers take security and user privacy seriously. If you discover a vulnerability or potential security flaw, please report it responsibly so it can be addressed before public disclosure.

### How to Report
- Use GitHub's private vulnerability reporting for this repository if it is enabled.
- If private reporting is unavailable, contact the maintainer through the GitHub profile.
- Do not open a public issue for an undisclosed vulnerability.

### What to Include in Your Report
Include enough detail to reproduce the issue. Do not include real credentials, session tokens, or private media.

1. Type of vulnerability (e.g., path traversal, SSRF, XSS, authentication bypass, denial of service).
2. Affected component (`apps/server`, `apps/web`, or `packages/shared`).
3. Step-by-step reproduction instructions or a minimal Proof of Concept (PoC).
4. Potential impact and severity.
5. Suggested remediation or mitigation, if known.

## Security boundaries

CINEVA is designed around several core security principles:

1. Uploaded media is stored on the host's local disk. Public tunnels provide connectivity only.
2. The server checks room sessions and host permissions before protected room actions.
3. Inputs are validated at routes and socket handlers; chat text is sanitized before broadcast.
4. Only `VITE_` variables are intended for the browser bundle. Never place credentials in them.
