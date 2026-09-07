import { deflateRawSync } from "node:zlib";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const sourceDirectory = path.resolve(scriptDirectory, "..");
const manifest = JSON.parse(await readFile(path.join(sourceDirectory, "manifest.json"), "utf8"));
const defaultOutput = path.join(
  sourceDirectory,
  "web-ext-artifacts",
  `veilance-firefox-${manifest.version}.xpi`
);
const outputPath = path.resolve(process.argv[2] || defaultOutput);

const rootFiles = [
  "LICENSE",
  "background.js",
  "config.js",
  "content.js",
  "injected.js",
  "manifest.json",
  "onboarding.css",
  "onboarding.html",
  "onboarding.js",
  "popup.css",
  "popup.html",
  "popup.js",
  "protection.js",
  "report.css",
  "report.html",
  "report.js",
  "settings.css",
  "settings.html",
  "settings.js"
];
const runtimeDirectories = ["assets", "data", "lib", "vendor"];

async function filesBelow(directory, prefix = "") {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (entry.isSymbolicLink()) throw new Error(`Refusing to package symbolic link: ${path.join(prefix, entry.name)}`);
    const absolute = path.join(directory, entry.name);
    const relative = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) files.push(...await filesBelow(absolute, relative));
    else if (entry.isFile()) files.push(relative);
  }
  return files;
}

const entryNames = [...rootFiles];
for (const directory of runtimeDirectories) {
  entryNames.push(...await filesBelow(path.join(sourceDirectory, directory), directory));
}
entryNames.sort((left, right) => left.localeCompare(right));

const crcTable = new Uint32Array(256);
for (let index = 0; index < crcTable.length; index += 1) {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
  }
  crcTable[index] = value >>> 0;
}

function crc32(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) value = crcTable[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

const dosTime = 0;
const dosDate = ((2026 - 1980) << 9) | (1 << 5) | 1;
const localParts = [];
const centralParts = [];
let localOffset = 0;

for (const entryName of entryNames) {
  const absolute = path.join(sourceDirectory, ...entryName.split("/"));
  const metadata = await stat(absolute);
  if (!metadata.isFile()) throw new Error(`Runtime entry is not a file: ${entryName}`);
  const data = await readFile(absolute);
  const compressed = deflateRawSync(data, { level: 9 });
  const name = Buffer.from(entryName, "utf8");
  const checksum = crc32(data);

  const localHeader = Buffer.alloc(30);
  localHeader.writeUInt32LE(0x04034b50, 0);
  localHeader.writeUInt16LE(20, 4);
  localHeader.writeUInt16LE(0x0800, 6);
  localHeader.writeUInt16LE(8, 8);
  localHeader.writeUInt16LE(dosTime, 10);
  localHeader.writeUInt16LE(dosDate, 12);
  localHeader.writeUInt32LE(checksum, 14);
  localHeader.writeUInt32LE(compressed.length, 18);
  localHeader.writeUInt32LE(data.length, 22);
  localHeader.writeUInt16LE(name.length, 26);
  localHeader.writeUInt16LE(0, 28);
  localParts.push(localHeader, name, compressed);

  const centralHeader = Buffer.alloc(46);
  centralHeader.writeUInt32LE(0x02014b50, 0);
  centralHeader.writeUInt16LE(0x0314, 4);
  centralHeader.writeUInt16LE(20, 6);
  centralHeader.writeUInt16LE(0x0800, 8);
  centralHeader.writeUInt16LE(8, 10);
  centralHeader.writeUInt16LE(dosTime, 12);
  centralHeader.writeUInt16LE(dosDate, 14);
  centralHeader.writeUInt32LE(checksum, 16);
  centralHeader.writeUInt32LE(compressed.length, 20);
  centralHeader.writeUInt32LE(data.length, 24);
  centralHeader.writeUInt16LE(name.length, 28);
  centralHeader.writeUInt16LE(0, 30);
  centralHeader.writeUInt16LE(0, 32);
  centralHeader.writeUInt16LE(0, 34);
  centralHeader.writeUInt16LE(0, 36);
  centralHeader.writeUInt32LE((0o100644 << 16) >>> 0, 38);
  centralHeader.writeUInt32LE(localOffset, 42);
  centralParts.push(centralHeader, name);

  localOffset += localHeader.length + name.length + compressed.length;
}

const centralDirectory = Buffer.concat(centralParts);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(0, 4);
end.writeUInt16LE(0, 6);
end.writeUInt16LE(entryNames.length, 8);
end.writeUInt16LE(entryNames.length, 10);
end.writeUInt32LE(centralDirectory.length, 12);
end.writeUInt32LE(localOffset, 16);
end.writeUInt16LE(0, 20);

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, Buffer.concat([...localParts, centralDirectory, end]));
console.log(`Built ${outputPath} (${entryNames.length} files)`);
