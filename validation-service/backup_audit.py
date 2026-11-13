"""Run on the validator host; creates a consistent SQLite snapshot, never a raw WAL-unsafe copy."""
import os
import sqlite3
import sys
from pathlib import Path

def backup(source, target):
    source = Path(source).resolve()
    target = Path(target).resolve()
    if source == target or target.exists():
        raise ValueError('Backup destination must be a new file, different from the live audit database')
    target.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(source.as_uri() + '?mode=ro', uri=True) as live:
        with sqlite3.connect(target) as snapshot:
            live.backup(snapshot)
            if snapshot.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
                raise RuntimeError('Backup integrity check failed')
    os.chmod(target, 0o600)

if __name__ == '__main__':
    if len(sys.argv) != 2:
        raise SystemExit('Usage: python backup-audit.py /new/backup/path.sqlite')
    backup(os.environ['VALIDATION_DB'], sys.argv[1])
    print('SQLite audit snapshot created and integrity-checked. Copy it to protected off-host storage.')
