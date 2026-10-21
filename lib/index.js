// src/catalog.ts
var CATALOG_URL = "https://models.dev/api.json";
var CACHE_TTL_MS = 6 * 60 * 60 * 1e3;
var cache;
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
  const body = await download(options.proxyUrl, signal);
  const catalog = buildCatalog(body, Date.now());
  cache = { catalog, proxyUrl: options.proxyUrl };
  return catalog;
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
    ...model.name === void 0 || model.name.length === 0 ? {} : { name: model.name },
    ...positive(model.limit?.context) === void 0 ? {} : { contextWindow: positive(model.limit?.context) },
    ...positive(model.limit?.output) === void 0 ? {} : { maxTokens: positive(model.limit?.output) },
    ...input === void 0 ? {} : { input },
    ...reasoningEfforts === void 0 ? {} : { reasoningEfforts }
  };
}

// src/match.ts
var VARIANT_SUFFIX = /-(high|low|medium|minimal|max|xhigh|thinking|preview|latest|chat)$/;
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
function describe(entry, via) {
  return {
    provider: entry.provider,
    modelId: entry.id,
    via,
    firstParty: FIRST_PARTY.has(entry.provider),
    ...entry.model.name === void 0 ? {} : { name: entry.model.name }
  };
}
function matchModel(catalog, id, aliases = {}) {
  const alias = aliases[id];
  if (alias !== void 0 && alias.length > 0) {
    const hit = lookup(catalog, alias);
    const entry = hit === void 0 ? void 0 : pickBest(hit.entries);
    if (entry !== void 0) return describe(entry, "alias");
  }
  const exact = lookup(catalog, id);
  if (exact !== void 0) {
    const entry = pickBest(exact.entries);
    if (entry !== void 0) return describe(entry, exact.via);
  }
  const base = basename(id);
  if (base !== id) {
    const hit = lookup(catalog, base);
    if (hit !== void 0) {
      const entry = pickBest(hit.entries);
      if (entry !== void 0) return describe(entry, "basename");
    }
  }
  const stripped = base.replace(VARIANT_SUFFIX, "");
  if (stripped !== base && stripped.length > 0) {
    const hit = lookup(catalog, stripped);
    if (hit !== void 0) {
      const entry = pickBest(hit.entries);
      if (entry !== void 0) return describe(entry, "suffix");
    }
  }
  return void 0;
}

// src/index.ts
var name = "model-capability-sync";
var inject = ["connection", "webServer", "llm"];
var CHANNEL = "/model-capability-sync";
function previewOne(catalog, id, aliases) {
  const match = matchModel(catalog, id, aliases);
  if (match === void 0) return { id, reason: "not in the models.dev catalog" };
  const entry = catalog.byId.get(match.modelId)?.find((candidate) => candidate.provider === match.provider);
  if (entry === void 0) return { id, match, reason: "catalog entry vanished between match and read" };
  const fields = capabilitiesOf(entry);
  if (Object.keys(fields).length === 0) return { id, match, reason: "catalog entry states no capability facts" };
  return { id, match, fields };
}
async function preview(request, signal) {
  const ids = Array.isArray(request.ids) ? request.ids.filter((id) => typeof id === "string" && id.length > 0) : [];
  const catalog = await loadCatalog({ refresh: request.refresh === true, proxyUrl: request.proxyUrl }, signal);
  const aliases = request.aliases ?? {};
  return {
    fetchedAt: catalog.fetchedAt,
    catalogModels: catalog.modelCount,
    rows: ids.map((id) => previewOne(catalog, id, aliases))
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
