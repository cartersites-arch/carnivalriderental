import fs from "node:fs";

// Only the isolated fixture database and its SQLite sidecars; works on Windows and Linux.
for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(`data/e2e.sqlite${suffix}`, { force: true });
