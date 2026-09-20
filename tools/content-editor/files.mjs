// The one directory walk this tool uses to find content files, shared so the
// server and the standalone smoke script sweep exactly the same set. api/skills
// in particular is TWO levels deep (the player skills at the top, the
// mob-embedded ones under mobs/), and a second copy of this recursion that
// forgot the nested folder would quietly check half the content.
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';

export function listJsonFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const abs = path.join(dir, name);
    if (statSync(abs).isDirectory()) { out.push(...listJsonFiles(abs)); continue; }
    if (name.endsWith('.json')) out.push(abs);
  }
  return out;
}
