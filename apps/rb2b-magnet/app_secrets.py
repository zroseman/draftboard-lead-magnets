"""Secrets loader for rb2b-magnet.

Reads from `~/.draftboard-secrets/<file>.env` (Zach's standard convention).
Mirrors the logic in signal-router/auth/secrets.py so this project doesn't
depend on signal-router's modules.

The .env files use shell-style `export FOO=bar` lines (or plain `FOO=bar`);
this parser handles both, plus inline `# comments`.

Public API:
    get_anthropic_api_key() -> Optional[str]
    get_secret(env_var, secrets_files) -> Optional[str]
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Iterable, Optional


SECRETS_DIR = Path(os.path.expanduser("~/.draftboard-secrets"))


def _parse_env_file(path: Path) -> dict:
    """Read a shell-style env file. Returns {var: value}."""
    out: dict = {}
    if not path.exists():
        return out
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[len("export "):]
        if "=" not in line:
            continue
        k, v = line.split("=", 1)
        # Strip inline `# comment` (only when not inside quotes).
        if "#" in v and not (v.startswith('"') or v.startswith("'")):
            v = v.split("#", 1)[0]
        v = v.strip().strip('"').strip("'")
        out[k.strip()] = v
    return out


def get_secret(env_var: str, secrets_files: Iterable[str]) -> Optional[str]:
    """Return the value for env_var. Process env first, then each file."""
    val = os.environ.get(env_var)
    if val:
        return val
    for fname in secrets_files:
        env = _parse_env_file(SECRETS_DIR / fname)
        if env_var in env:
            return env[env_var]
    return None


def get_anthropic_api_key() -> Optional[str]:
    return get_secret("ANTHROPIC_API_KEY", ["ai.env"])
