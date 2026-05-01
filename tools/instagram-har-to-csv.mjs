#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const EYE_KEYWORDS = [
  "lasik",
  "lasek",
  "prk",
  "smile lasik",
  "eye",
  "eyes",
  "eyecare",
  "eye care",
  "ophthalmology",
  "vision",
  "glasses",
  "eyewear",
  "contact lens",
  "contact lenses",
  "렌즈",
  "라식",
  "라섹",
  "안과",
];

const KOREA_KEYWORDS = [
  "korea",
  "seoul",
  "busan",
  "gangnam",
  "hongdae",
  "itaewon",
  "myeongdong",
  "expat",
  "한국",
  "서울",
  "부산",
  "강남",
];

const CATEGORY_KEYWORDS = [
  "beauty",
  "fashion",
  "lifestyle",
  "travel",
  "wellness",
  "health",
  "student",
  "creator",
  "blogger",
  "vlogger",
  "medical tourism",
  "kbeauty",
  "k-beauty",
];

const args = parseArgs(process.argv.slice(2));

if (!args.input || args.help) {
  printUsage();
  process.exit(args.help ? 0 : 1);
}

const inputPath = path.resolve(args.input);
const outputPath = path.resolve(args.output ?? defaultOutputPath(inputPath));
const minScore = Number.isFinite(args.minScore) ? args.minScore : 1;

const source = readJson(inputPath);
const payloads = extractPayloads(source);
const profiles = collectProfiles(payloads);
const rows = [...profiles.values()]
  .map(normalizeProfile)
  .filter((profile) => profile.username)
  .map(scoreProfile)
  .filter((profile) => profile.fitScore >= minScore)
  .sort((a, b) => b.fitScore - a.fitScore || Number(b.followers || 0) - Number(a.followers || 0));

fs.writeFileSync(outputPath, toCsv(rows), "utf8");

console.log(`Extracted ${rows.length} candidate(s)`);
console.log(`Saved: ${outputPath}`);

function printUsage() {
  console.log(`
Usage:
  node tools/instagram-har-to-csv.mjs --input instagram.har --output candidates.csv
  node tools/instagram-har-to-csv.mjs -i response.json -o candidates.csv --min-score 2

Input:
  - Chrome/Edge HAR from Network > Save all as HAR with content
  - Raw JSON response copied from Network > Response

Notes:
  - This reads local files only.
  - Cookies, request headers, and response headers are ignored.
  - Review candidates manually before outreach.
`);
}

function parseArgs(argv) {
  const parsed = { input: "", output: "", minScore: 1, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") parsed.help = true;
    else if (arg === "--input" || arg === "-i") parsed.input = argv[++i] ?? "";
    else if (arg === "--output" || arg === "-o") parsed.output = argv[++i] ?? "";
    else if (arg === "--min-score") parsed.minScore = Number(argv[++i] ?? "1");
    else if (!parsed.input) parsed.input = arg;
  }
  return parsed;
}

function readJson(filePath) {
  const text = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`JSON/HAR 파일을 읽을 수 없습니다: ${error.message}`);
  }
}

function defaultOutputPath(filePath) {
  const parsed = path.parse(filePath);
  return path.join(parsed.dir, `${parsed.name}-instagram-candidates.csv`);
}

function extractPayloads(source) {
  if (!source?.log?.entries) return [source];

  const payloads = [];
  for (const entry of source.log.entries) {
    const content = entry?.response?.content;
    if (!content?.text) continue;
    const mimeType = String(content.mimeType ?? "");
    const url = String(entry?.request?.url ?? "");
    if (!looksRelevant(mimeType, url, content.text)) continue;

    let text = content.text;
    if (content.encoding === "base64") {
      text = Buffer.from(text, "base64").toString("utf8");
    }

    try {
      payloads.push(JSON.parse(text));
    } catch {
      // Some HAR entries are HTML, images, scripts, or compressed fragments.
    }
  }
  return payloads;
}

function looksRelevant(mimeType, url, text) {
  const haystack = `${mimeType} ${url}`.toLowerCase();
  if (haystack.includes("json") || haystack.includes("graphql") || haystack.includes("api")) return true;
  return text.includes('"username"') || text.includes('"full_name"') || text.includes('"edge_followed_by"');
}

function collectProfiles(payloads) {
  const profiles = new Map();
  for (const payload of payloads) {
    walk(payload, (value) => {
      const profile = profileFromObject(value);
      if (!profile?.username) return;
      const existing = profiles.get(profile.username) ?? {};
      profiles.set(profile.username, mergeProfile(existing, profile));
    });
  }
  return profiles;
}

function walk(value, visit, seen = new WeakSet()) {
  if (!value || typeof value !== "object") return;
  if (seen.has(value)) return;
  seen.add(value);
  visit(value);
  if (Array.isArray(value)) {
    for (const item of value) walk(item, visit, seen);
    return;
  }
  for (const item of Object.values(value)) walk(item, visit, seen);
}

function profileFromObject(obj) {
  const username = cleanString(obj.username ?? obj.user_name ?? obj.handle);
  if (!isLikelyUsername(username)) return null;

  const fullName = cleanString(obj.full_name ?? obj.fullName ?? obj.name);
  const bio = cleanString(obj.biography ?? obj.bio ?? obj.category ?? obj.about);
  const followers = numberFromUnknown(
    obj.follower_count ??
    obj.followers_count ??
    obj.edge_followed_by?.count ??
    obj.followed_by?.count,
  );

  return {
    username,
    fullName,
    bio,
    followers,
    verified: Boolean(obj.is_verified ?? obj.verified),
    private: Boolean(obj.is_private ?? obj.private),
    profileUrl: `https://www.instagram.com/${username}/`,
    sourceSignals: collectTextSignals(obj),
  };
}

function isLikelyUsername(value) {
  return typeof value === "string" && /^[a-zA-Z0-9._]{2,30}$/.test(value);
}

function cleanString(value) {
  if (value === undefined || value === null) return "";
  return String(value).replace(/\s+/g, " ").trim();
}

function numberFromUnknown(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/,/g, ""));
    if (Number.isFinite(parsed)) return parsed;
  }
  return "";
}

function collectTextSignals(obj) {
  const fields = [
    obj.biography,
    obj.bio,
    obj.category,
    obj.full_name,
    obj.name,
    obj.caption?.text,
    obj.edge_media_to_caption?.edges?.[0]?.node?.text,
  ];
  return fields.map(cleanString).filter(Boolean).join(" ");
}

function mergeProfile(a, b) {
  return {
    username: b.username || a.username,
    fullName: longest(a.fullName, b.fullName),
    bio: longest(a.bio, b.bio),
    followers: bestNumber(a.followers, b.followers),
    verified: Boolean(a.verified || b.verified),
    private: Boolean(a.private || b.private),
    profileUrl: b.profileUrl || a.profileUrl,
    sourceSignals: longest(a.sourceSignals, b.sourceSignals),
  };
}

function longest(a = "", b = "") {
  return String(b).length > String(a).length ? b : a;
}

function bestNumber(a, b) {
  const an = typeof a === "number" ? a : -1;
  const bn = typeof b === "number" ? b : -1;
  return bn > an ? b : a;
}

function normalizeProfile(profile) {
  return {
    username: profile.username,
    profileUrl: profile.profileUrl,
    fullName: profile.fullName,
    followers: profile.followers,
    verified: profile.verified ? "yes" : "no",
    private: profile.private ? "yes" : "no",
    bio: profile.bio,
    signals: `${profile.fullName} ${profile.bio} ${profile.sourceSignals}`.trim(),
  };
}

function scoreProfile(profile) {
  const text = profile.signals.toLowerCase();
  const eyeMatches = matches(text, EYE_KEYWORDS);
  const koreaMatches = matches(text, KOREA_KEYWORDS);
  const categoryMatches = matches(text, CATEGORY_KEYWORDS);
  const fitScore = eyeMatches.length * 3 + koreaMatches.length * 2 + categoryMatches.length;
  return {
    ...profile,
    eyeSignals: eyeMatches.join("; "),
    koreaSignals: koreaMatches.join("; "),
    categorySignals: categoryMatches.join("; "),
    fitScore,
  };
}

function matches(text, keywords) {
  return [...new Set(keywords.filter((keyword) => text.includes(keyword.toLowerCase())))];
}

function toCsv(rows) {
  const headers = [
    "username",
    "profileUrl",
    "fullName",
    "followers",
    "verified",
    "private",
    "fitScore",
    "eyeSignals",
    "koreaSignals",
    "categorySignals",
    "bio",
  ];
  return [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(",")),
  ].join("\n");
}

function csvCell(value) {
  const text = value === undefined || value === null ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}
