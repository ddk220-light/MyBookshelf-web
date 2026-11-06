"""Read JSONL on actual newline bytes, preserving Unicode inside JSON strings."""
import json


def read_jsonl(path, *, allow_incomplete_tail=False):
    if not path.exists():
        return []
    data = path.read_bytes()
    lines = data.split(b'\n')
    result = []
    for index, line in enumerate(lines):
        if not line.strip():
            continue
        try:
            result.append(json.loads(line))
        except (json.JSONDecodeError, UnicodeDecodeError):
            if allow_incomplete_tail and index == len(lines) - 1 and not data.endswith(b'\n'):
                # Optional for read-only live status snapshots only. Validators
                # and writer resumption remain strict; never repair/delete bytes.
                break
            raise
    return result
