#!/usr/bin/env node
// Prints the catalog entry for one GGUF file on Hugging Face, pinned to the
// repo's current commit: { url, sha256, sizeBytes }.
//
//   node scripts/catalog-file.mjs <owner/repo> <file.gguf> [revision]
//
// The SHA-256 comes from the LFS pointer the Hub reports, so nothing is
// downloaded. Paste the output into src/features/models/catalog.json.

const [repo, file, revision = 'main'] = process.argv.slice(2);
if (!repo || !file) {
  console.error('usage: catalog-file.mjs <owner/repo> <file.gguf> [revision]');
  process.exit(1);
}

const info = await fetch(
  `https://huggingface.co/api/models/${repo}/revision/${revision}`
).then((r) => r.json());
if (!info.sha) throw new Error(`No commit found for ${repo}@${revision}`);

const tree = await fetch(
  `https://huggingface.co/api/models/${repo}/tree/${info.sha}`
).then((r) => r.json());
const entry = tree.find((f) => f.path === file);
if (!entry?.lfs) throw new Error(`${file} is not an LFS file in ${repo}`);

console.log(
  JSON.stringify(
    {
      url: `https://huggingface.co/${repo}/resolve/${info.sha}/${file}`,
      sha256: entry.lfs.oid,
      sizeBytes: entry.lfs.size,
    },
    null,
    2
  )
);
