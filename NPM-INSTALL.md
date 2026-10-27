# npm install vs. npm ci

With no package changes, both install the same packages. They differ in what
they do to the lock file and to `node_modules`:

| | `npm install` | `npm ci` |
| --- | --- | --- |
| Changes `package-lock.json` | Sometimes (noise, see below) | Never |
| `node_modules` | Keeps it, updates what's needed | Deletes it, installs everything fresh (slower) |
| Lock file out of date with `package.json` | Fixes the lock file | Stops with an error |
| Runs `postinstall` scripts | Yes | Yes |

## Which one to run

- **Just installing** (fresh clone, after pulling): `npm ci`. Nothing to restore afterwards.
- **Adding, removing or updating a package**: `npm install <package>`.

## When `package-lock.json` changes

Never ignore the lock file or add it to `.gitignore`. It pins the exact
version of every package so everyone installs the same thing.

- **Commit the change** when you changed packages on purpose. Commit it together
  with `package.json`.
- **Restore it** (`git restore package-lock.json`) when you didn't change any
  packages. Those changes are noise: a different npm version, `"resolved"` URLs
  switching registry, or extra fields such as `"peer": true`.

If unsure, check with `git diff package-lock.json`. Version numbers changing
that you didn't ask for are worth asking the team about. If the lock file changes
the same way on every install, compare `npm -v` with the team's version.
