// src/catalog.ts
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
var CATALOG_URL = "https://models.dev/api.json";
var CACHE_TTL_MS = 6 * 60 * 60 * 1e3;
var DOWNLOAD_ATTEMPTS = 3;
var RETRY_DELAY_MS = 600;
var cache;
var CACHE_FILE = join(homedir(), ".dsh", "model-capability-sync", "catalog.json");
async function writeDiskCache(body) {
  try {
    const envelope = { fetchedAt: Date.now(), source: CATALOG_URL, body };
    await mkdir(dirname(CACHE_FILE), { recursive: true });
    await writeFile(CACHE_FILE, JSON.stringify(envelope), "utf8");
  } catch {
  }
}
async function readDiskCache() {
  try {
    const parsed = JSON.parse(await readFile(CACHE_FILE, "utf8"));
    if (typeof parsed.fetchedAt !== "number" || parsed.body === void 0) return void 0;
    return { fetchedAt: parsed.fetchedAt, source: typeof parsed.source === "string" ? parsed.source : CATALOG_URL, body: parsed.body };
  } catch {
    return void 0;
  }
}
function pause(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
function push(index, key, entry) {
  const bucket = index.get(key);
  if (bucket === void 0) index.set(key, [entry]);
  else bucket.push(entry);
}
function buildCatalog(body, fetchedAt) {
  const byId = /* @__PURE__ */ new Map();
  const byFolded = /* @__PURE__ */ new Map();
  let modelCount = 0;
  if (typeof body === "object" && body !== null) {
    for (const [provider, value] of Object.entries(body)) {
      const models = value?.models;
      if (typeof models !== "object" || models === null) continue;
      for (const [id, model] of Object.entries(models)) {
        if (id.length === 0) continue;
        modelCount += 1;
        const entry = { provider, id, model };
        push(byId, id, entry);
        push(byFolded, id.toLowerCase(), entry);
      }
    }
  }
  if (modelCount === 0) throw new Error("models.dev returned a catalog with no models");
  return { fetchedAt, modelCount, byId, byFolded };
}
async function download(proxyUrl, signal) {
  if (proxyUrl === void 0 || proxyUrl.length === 0) {
    const response2 = await fetch(CATALOG_URL, { signal });
    if (!response2.ok) throw new Error(`models.dev download failed (HTTP ${String(response2.status)})`);
    return await response2.json();
  }
  const specifier = "undici";
  let undici;
  try {
    undici = await import(specifier);
  } catch {
    throw new Error('a proxy URL was set but the host cannot load "undici"; clear the proxy or install it');
  }
  const dispatcher = new undici.ProxyAgent(proxyUrl);
  const response = await undici.fetch(CATALOG_URL, { signal, dispatcher });
  if (!response.ok) throw new Error(`models.dev download through the proxy failed (HTTP ${String(response.status)})`);
  return await response.json();
}
async function loadCatalog(options = {}, signal) {
  const now = Date.now();
  const fresh = cache !== void 0 && cache.proxyUrl === options.proxyUrl && now - cache.catalog.fetchedAt < CACHE_TTL_MS;
  if (options.refresh !== true && fresh && cache !== void 0) return cache.catalog;
  let lastError;
  for (let attempt = 1; attempt <= DOWNLOAD_ATTEMPTS; attempt += 1) {
    try {
      const body = await download(options.proxyUrl, signal);
      const catalog = buildCatalog(body, Date.now());
      cache = { catalog, proxyUrl: options.proxyUrl };
      void writeDiskCache(body);
      return catalog;
    } catch (error) {
      if (signal?.aborted === true) throw error;
      lastError = error;
      if (attempt < DOWNLOAD_ATTEMPTS) await pause(RETRY_DELAY_MS);
    }
  }
  const disk = await readDiskCache();
  if (disk !== void 0) {
    try {
      const catalog = { ...buildCatalog(disk.body, disk.fetchedAt), stale: true };
      cache = { catalog, proxyUrl: options.proxyUrl };
      return catalog;
    } catch {
    }
  }
  const reason = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`models.dev catalog unavailable (${reason}) and no local copy exists`);
}

// src/mapping.ts
var THINKING_LEVELS = /* @__PURE__ */ new Set(["off", "minimal", "low", "medium", "high", "xhigh", "max"]);
function positive(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.round(value) : void 0;
}
function modalitiesOf(entry) {
  const declared = entry.model.modalities?.input;
  if (declared === void 0) return void 0;
  const accepted = [];
  for (const media of declared) {
    if (media === "image" && !accepted.includes("image")) accepted.push("image");
  }
  return ["text", ...accepted];
}
function reasoningOf(entry) {
  const model = entry.model;
  if (model.reasoning === false) return false;
  const option = model.reasoning_options?.find((candidate) => candidate.type === "effort");
  const values = option?.values ?? [];
  const efforts = {};
  for (const value of values) {
    if (typeof value !== "string") continue;
    if (!THINKING_LEVELS.has(value)) continue;
    efforts[value] = value;
  }
  return Object.keys(efforts).length > 0 ? efforts : void 0;
}
function capabilitiesOf(entry) {
  const model = entry.model;
  const input = modalitiesOf(entry);
  const reasoningEfforts = reasoningOf(entry);
  return {
    ...positive(model.limit?.context) === void 0 ? {} : { contextWindow: positive(model.limit?.context) },
    ...positive(model.limit?.output) === void 0 ? {} : { maxTokens: positive(model.limit?.output) },
    ...input === void 0 ? {} : { input },
    ...reasoningEfforts === void 0 ? {} : { reasoningEfforts }
  };
}

// src/match.ts
var VARIANT_SUFFIX = /[-_](high|low|medium|minimal|max|xhigh|thinking|preview|latest|chat|tiered|disabled|trial|official|free|stable|experimental|reasoning|it|instruct|base|pro|flash|mini|nano|small|large)$/i;
var ROUTE_TAG = /:[a-z0-9][a-z0-9_-]*$/i;
var BUILD_NUMBER = /-\d{1,2}$/;
var VENDOR_PREFIX = /^([a-z]{2,4})-(.+)$/i;
function stripMarkers(key) {
  let current = key;
  for (let pass = 0; pass < 6; pass += 1) {
    const next = current.replace(ROUTE_TAG, "").replace(VARIANT_SUFFIX, "").replace(BUILD_NUMBER, "");
    if (next === current || next.length === 0) break;
    current = next;
  }
  return current === key ? void 0 : current;
}
var SOURCE_ANNOTATION = /【[^】]*】|\([^)]*\)|\[[^\]]*\]/g;
function cleanDisplayName(name2) {
  return name2.replace(SOURCE_ANNOTATION, " ").replace(/\s+/g, " ").trim();
}
var FIRST_PARTY = /* @__PURE__ */ new Set([
  "openai",
  "anthropic",
  "google",
  "deepseek",
  "xai",
  "meta",
  "mistral",
  "cohere",
  "moonshotai",
  "moonshotai-cn",
  "zai",
  "zhipuai",
  "alibaba",
  "alibaba-cn",
  "qwen",
  "sensenova",
  "minimax",
  "stepfun",
  "bytedance",
  "baidu",
  "nvidia",
  "microsoft",
  "amazon",
  "ai21",
  "perplexity",
  "upstage",
  "01-ai",
  "inclusionai",
  "tencent",
  "kuaishou"
]);
function score(entry) {
  const model = entry.model;
  let value = 0;
  if (FIRST_PARTY.has(entry.provider)) value += 5;
  if (model.limit?.context !== void 0 || model.limit?.output !== void 0) value += 2;
  if (model.modalities?.input !== void 0) value += 2;
  if (model.reasoning_options !== void 0) value += 1;
  if (model.name !== void 0) value += 1;
  return value;
}
function pickBest(entries) {
  let best;
  let bestScore = -1;
  for (const entry of entries) {
    const value = score(entry);
    if (value > bestScore || value === bestScore && best !== void 0 && entry.provider < best.provider) {
      best = entry;
      bestScore = value;
    }
  }
  return best;
}
function basename(id) {
  const slash = id.lastIndexOf("/");
  return slash === -1 ? id : id.slice(slash + 1);
}
function lookup(catalog, key) {
  const exact = catalog.byId.get(key);
  if (exact !== void 0) return { entries: exact, via: "exact" };
  const folded = catalog.byFolded.get(key.toLowerCase());
  if (folded !== void 0) return { entries: folded, via: "folded" };
  return void 0;
}
function buildPrefixIndex(catalog) {
  const index = /* @__PURE__ */ new Map();
  for (const [id, entries] of catalog.byFolded) {
    for (let length = 4; length <= id.length; length += 1) {
      const key = id.slice(0, length);
      const bucket = index.get(key);
      if (bucket === void 0) index.set(key, [...entries]);
      else bucket.push(...entries);
    }
  }
  return index;
}
var prefixCache;
function prefixesOf(catalog) {
  if (prefixCache !== void 0 && prefixCache.catalog === catalog) return prefixCache.index;
  const index = buildPrefixIndex(catalog);
  prefixCache = { catalog, index };
  return index;
}
function versionSpellings(key) {
  const dashed = key.replace(/(\d)[-_.](\d)/g, "$1-$2");
  const dotted = key.replace(/(\d)[-_.](\d)/g, "$1.$2");
  return [.../* @__PURE__ */ new Set([key, dashed, dotted])];
}
function describe(entry, via) {
  return {
    provider: entry.provider,
    modelId: entry.id,
    via,
    firstParty: FIRST_PARTY.has(entry.provider),
    ...entry.model.name === void 0 ? {} : { name: entry.model.name }
  };
}
function resolveId(catalog, key) {
  const exact = lookupExact(catalog, key);
  if (exact !== void 0) return exact;
  const withoutMarkers = stripMarkers(key);
  if (withoutMarkers !== void 0) {
    const hit = lookupExact(catalog, withoutMarkers);
    if (hit !== void 0) return { entry: hit.entry, via: "suffix" };
    const prefixed = prefixesOf(catalog).get(withoutMarkers.toLowerCase());
    if (prefixed !== void 0) {
      const entry = pickBest(prefixed);
      if (entry !== void 0) return { entry, via: "prefix" };
    }
  }
  const peeled = peelVendorNamespace(key);
  if (peeled !== void 0) {
    const hit = lookupExact(catalog, peeled);
    if (hit !== void 0) return { entry: hit.entry, via: "vendor" };
    const peeledStripped = stripMarkers(peeled);
    if (peeledStripped !== void 0) {
      const again = lookupExact(catalog, peeledStripped);
      if (again !== void 0) return { entry: again.entry, via: "vendor" };
    }
  }
  return void 0;
}
function lookupExact(catalog, key) {
  const spellings = versionSpellings(key);
  for (const [position, spelling] of spellings.entries()) {
    const hit = lookup(catalog, spelling);
    if (hit === void 0) continue;
    const entry = pickBest(hit.entries);
    if (entry === void 0) continue;
    return { entry, via: position === 0 ? hit.via : "folded" };
  }
  return void 0;
}
function peelVendorNamespace(key) {
  const match = VENDOR_PREFIX.exec(key);
  if (match === null) return void 0;
  const rest = match[2];
  if (rest === void 0 || rest.length < 3) return void 0;
  return rest;
}
function matchModel(catalog, id, aliases = {}, name2 = "") {
  const onId = resolveId(catalog, id);
  if (onId !== void 0) return describe(onId.entry, onId.via);
  const segments = id.split("/");
  for (let drop = 1; drop < segments.length; drop += 1) {
    const rest = segments.slice(drop).join("/");
    if (rest.length === 0) continue;
    const onRest = resolveId(catalog, rest);
    if (onRest !== void 0) return describe(onRest.entry, onRest.via === "exact" ? "basename" : onRest.via);
  }
  const label = cleanDisplayName(name2);
  if (label.length > 0) {
    const onName = resolveId(catalog, label);
    if (onName !== void 0) {
      return {
        ...describe(onName.entry, onName.via === "exact" ? "name" : onName.via === "folded" ? "name" : "nameSuffix"),
        matchedName: label,
        nameSource: "name"
      };
    }
    const tail = basename(label);
    if (tail !== label && tail.length > 0) {
      const onTail = resolveId(catalog, tail);
      if (onTail !== void 0) {
        return {
          ...describe(onTail.entry, onTail.via === "exact" ? "name" : onTail.via === "folded" ? "name" : "nameSuffix"),
          matchedName: tail,
          nameSource: "name"
        };
      }
    }
  }
  const alias = aliases[id];
  if (alias !== void 0 && alias.length > 0) {
    const hit = lookup(catalog, alias);
    const entry = hit === void 0 ? void 0 : pickBest(hit.entries);
    if (entry !== void 0) return describe(entry, "alias");
  }
  return void 0;
}

// src/index.ts
var name = "model-capability-sync";
var inject = ["connection", "webServer", "llm"];
var CHANNEL = "/model-capability-sync";
function previewOne(catalog, id, aliases, name2 = "") {
  const named = name2 === "" ? {} : { name: name2 };
  const match = matchModel(catalog, id, aliases, name2);
  if (match === void 0) return { id, ...named, reason: "not in the models.dev catalog" };
  const entry = catalog.byId.get(match.modelId)?.find((candidate) => candidate.provider === match.provider);
  if (entry === void 0) return { id, ...named, match, reason: "catalog entry vanished between match and read" };
  const fields = capabilitiesOf(entry);
  if (Object.keys(fields).length === 0) return { id, ...named, match, reason: "catalog entry states no capability facts" };
  return { id, ...named, match, fields };
}
async function preview(request, signal) {
  const ids = Array.isArray(request.ids) ? request.ids.filter((id) => typeof id === "string" && id.length > 0) : [];
  const catalog = await loadCatalog({ refresh: request.refresh === true, proxyUrl: request.proxyUrl }, signal);
  const aliases = request.aliases ?? {};
  const names = request.names ?? {};
  return {
    fetchedAt: catalog.fetchedAt,
    catalogModels: catalog.modelCount,
    ...catalog.stale === true ? { stale: true } : {},
    rows: ids.map((id) => previewOne(catalog, id, aliases, typeof names[id] === "string" ? names[id] : ""))
  };
}
function failure(message) {
  return { ok: false, error: { code: "internal", message, details: {} } };
}
async function live(llm, request, signal) {
  const provider = typeof request.provider === "string" ? request.provider : "";
  const ids = Array.isArray(request.ids) ? request.ids.filter((id) => typeof id === "string" && id.length > 0) : [];
  const rows = [];
  for (const id of ids) {
    try {
      const info = await llm.resolveModelInfo(provider, id, signal);
      rows.push({
        id,
        ...info.inputModalities === void 0 ? {} : { input: [...info.inputModalities] },
        ...info.context === void 0 ? {} : { contextWindow: info.context.contextWindow },
        ...info.defaultMaxTokens === void 0 ? {} : { maxTokens: info.defaultMaxTokens }
      });
    } catch (error) {
      rows.push({ id, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return { rows };
}
function createHandler(llm) {
  return async (endpoint, payload, signal) => {
    try {
      if (endpoint === "preview") {
        return { ok: true, value: await preview(payload, signal) };
      }
      if (endpoint === "live") {
        if (llm === void 0) return failure("model-capability-sync: no llm service to resolve the live route");
        return { ok: true, value: await live(llm, payload, signal) };
      }
      return failure(`model-capability-sync: unknown endpoint ${JSON.stringify(endpoint)}`);
    } catch (error) {
      return failure(error instanceof Error ? error.message : String(error));
    }
  };
}
function apply(ctx) {
  const connection = ctx.get("connection");
  const llm = ctx.get("llm");
  if (connection === void 0) {
    ctx.logger.warn("model-capability-sync: no connection service; the capability channel is unavailable");
    return;
  }
  if (llm === void 0) ctx.logger.warn("model-capability-sync: no llm service; the live route check is unavailable");
  const registrar = connection;
  const handler = createHandler(llm);
  ctx.effect(() => registrar.register(ctx, CHANNEL, handler), "model-capability-sync: RPC channel");
}
export {
  apply,
  inject,
  name
};
//# sourceMappingURL=index.js.map
