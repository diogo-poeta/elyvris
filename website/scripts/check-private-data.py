"""Block passwords, secret keys and credential files from the repository.

Runs on every pull request, before every deploy, and before each local commit.
It never prints a found value, only the file, the line and the kind of problem.

  python website/scripts/check-private-data.py           # all tracked files
  python website/scripts/check-private-data.py --staged  # files about to be committed
"""
import re
import subprocess
import sys
from pathlib import PurePosixPath

# File names that must never be in a public repository, whatever they contain.
BLOCKED_NAMES = re.compile(
    r"(^|/)(\.env(\..*)?|.*\.(pem|key|p12|pfx|kdbx|jks|keystore)|id_(rsa|dsa|ecdsa|ed25519)(\.pub)?"
    r"|.*(vault|secret|password|passwd|credential)[^/]*|service[-_]account[^/]*\.json|\.npmrc|\.pypirc|\.netrc)$",
    re.IGNORECASE,
)

# Content that looks like a real secret. The public Supabase key (sb_publishable_...) is allowed.
PATTERNS = [
    ("private key", re.compile(r"-----BEGIN ([A-Z]+ )*PRIVATE KEY-----")),
    ("Supabase secret key", re.compile(r"sb_secret_[A-Za-z0-9_-]{10,}")),
    ("JSON web token (e.g. service_role key)", re.compile(r"eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}")),
    ("GitHub token", re.compile(r"gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}")),
    ("cloud or AI API key", re.compile(r"AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{35}|\bsk-(ant-|proj-)?[A-Za-z0-9_-]{20,}|xox[abpr]-[A-Za-z0-9-]{10,}")),
    ("password inside a web address", re.compile(r"[a-z][a-z0-9+.-]*://[^/\s:@'\"]+:[^/\s@'\"]{3,}@", re.IGNORECASE)),
    ("password or key written in the code", re.compile(
        r"(?i)\b(password|passwd|pwd|passphrase|secret|api[_-]?key|access[_-]?key|private[_-]?key|client[_-]?secret|auth[_-]?token)"
        r"[\"']?\s*[:=]\s*[\"'][^\"'\s]{6,}[\"']")),
]

BINARY = {".pdf", ".png", ".jpg", ".jpeg", ".webp", ".gif", ".ico", ".gds", ".woff", ".woff2", ".mp4", ".zip"}


def git(*args):
    return subprocess.run(["git", *args], capture_output=True, check=True).stdout


def files_and_text(staged):
    if staged:
        names = git("diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z").decode().split("\0")
        read = lambda p: git("show", ":" + p)
    else:
        names = git("ls-files", "-z").decode().split("\0")
        read = lambda p: open(p, "rb").read()
    for name in filter(None, names):
        yield name, read


def main():
    staged = "--staged" in sys.argv
    problems = []
    for name, read in files_and_text(staged):
        if BLOCKED_NAMES.search(name):
            problems.append(f"{name}: file name looks like a secret or credentials file")
            continue
        if PurePosixPath(name).suffix.lower() in BINARY:
            continue
        text = read(name).decode("utf-8", "replace")
        for number, line in enumerate(text.splitlines(), 1):
            for kind, pattern in PATTERNS:
                if pattern.search(line):
                    problems.append(f"{name}:{number}: {kind}")
    if problems:
        print("SECRET CHECK FAILED. Remove these before committing (keep them in a private place):")
        print("\n".join("  " + p for p in problems))
        return 1
    print('{"status": "passed", "check": "no passwords, secret keys or credential files"}')
    return 0


if __name__ == "__main__":
    sys.exit(main())
