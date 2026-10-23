window.__ModuleLoader__.load({ id: "dsh-model-capability-sync", factory: (require) => {
var module = { exports: {} }; var exports = module.exports;
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client/index.ts
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(index_exports);

// src/client/SyncSection.tsx
var import_react = require("react");

// src/sort.ts
function modelSortKey(id) {
  const slash = id.lastIndexOf("/");
  if (slash === -1) {
    const folded = id.toLowerCase();
    return { group: folded, name: folded };
  }
  return { group: id.slice(0, slash).toLowerCase(), name: id.slice(slash + 1).toLowerCase() };
}
function sourcePrefix(id) {
  const slash = id.indexOf("/");
  return slash <= 0 ? "" : id.slice(0, slash);
}
function redirectedSortKey(id, name) {
  const idPrefix = sourcePrefix(id);
  const displayName = name !== "" ? name : id;
  let extracted = "";
  let cleaned = displayName;
  const leadingFullWidthMatch = displayName.match(/^【([^】]+)】\s*/);
  if (leadingFullWidthMatch) {
    extracted = leadingFullWidthMatch[1] ?? "";
    cleaned = displayName.slice(leadingFullWidthMatch[0].length).trim();
  } else {
    const trailingFullWidthMatch = displayName.match(/【([^】]+)】\s*$/);
    if (trailingFullWidthMatch) {
      extracted = trailingFullWidthMatch[1] ?? "";
      cleaned = displayName.slice(0, -trailingFullWidthMatch[0].length).trim();
    } else {
      const halfWidthMatch = displayName.match(/[([]\s*([^)\]]*)\s*[)\]]\s*/);
      if (halfWidthMatch) {
        extracted = halfWidthMatch[1] ?? "";
        cleaned = displayName.replace(halfWidthMatch[0], "").trim();
      }
    }
  }
  const sortPrefix = extracted !== "" ? extracted : idPrefix !== "" ? idPrefix : "other";
  const sortName = cleaned !== "" ? cleaned : idPrefix !== "" ? id.slice(idPrefix.length + 1) : id;
  return [sortPrefix.toLowerCase(), sortName.toLowerCase()];
}
function compareModelIds(left, right) {
  const a = modelSortKey(left);
  const b = modelSortKey(right);
  if (a.group !== b.group) return a.group < b.group ? -1 : 1;
  if (a.name !== b.name) return a.name < b.name ? -1 : 1;
  if (left === right) return 0;
  return left < right ? -1 : 1;
}
function compareRedirected(left, right, nameOf) {
  const [aPrefix, aName] = redirectedSortKey(left, nameOf(left));
  const [bPrefix, bName] = redirectedSortKey(right, nameOf(right));
  if (aPrefix !== bPrefix) return aPrefix < bPrefix ? -1 : 1;
  if (aName !== bName) return aName < bName ? -1 : 1;
  if (left === right) return 0;
  return left < right ? -1 : 1;
}
function sortByModelId(items, idOf, nameOf = () => "", mode = "prefix") {
  const copy = [...items];
  if (mode === "redirected") {
    const names = new Map(copy.map((item) => [idOf(item), nameOf(item)]));
    return copy.sort((left, right) => compareRedirected(idOf(left), idOf(right), (id) => names.get(id) ?? ""));
  }
  return copy.sort((left, right) => compareModelIds(idOf(left), idOf(right)));
}

// src/client/shared.ts
var TARGET_DEFAULT = "llm-pi-ai";
var TARGET_DIRECTORY = {
  "llm-pi-ai": { native: true, nameKey: "nameLlmPiAi" },
  "llm-deepseek": { native: true, nameKey: "nameLlmDeepseek" },
  "llm-deepseek-account": { native: true, nameKey: "nameLlmDeepseekAccount" },
  "llm-newapi": { native: false, nameKey: "nameLlmNewapi" }
};
function targetLabelOf(ns, t) {
  const known = TARGET_DIRECTORY[ns];
  if (known === void 0) return `${t("sourcePlugin")} \xB7 ${ns}`;
  return `${known.native ? t("sourceNative") : t("sourcePlugin")} \xB7 ${t(known.nameKey)}`;
}
function providersOf(descriptor) {
  const providers = descriptor?.value?.providers;
  return typeof providers === "object" && providers !== null ? providers : {};
}
function modelsOf(provider) {
  const models = provider?.models;
  return Array.isArray(models) ? models.filter((entry) => typeof entry === "object" && entry !== null) : [];
}
function sortedModelsOf(provider, mode = "prefix") {
  return sortByModelId(
    modelsOf(provider),
    (model) => textOf(model, "id"),
    (model) => textOf(model, "name"),
    mode
  );
}
function textOf(model, key) {
  const value = model[key];
  return typeof value === "string" ? value : "";
}
function isBlank(value) {
  if (value === void 0 || value === null || value === "") return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value).length === 0;
  return false;
}

// src/client/rename.ts
function sourcePrefixOf(id) {
  const slash = id.indexOf("/");
  if (slash <= 0) return "";
  return id.slice(0, slash);
}
function bareIdOf(id) {
  const slash = id.indexOf("/");
  if (slash === -1) return id;
  const rest = id.slice(slash + 1);
  return rest === "" ? id : rest;
}
function redirectName(id, name) {
  let prefix = sourcePrefixOf(id);
  if (prefix === "") prefix = "other";
  const before = name !== "" ? name : id;
  const prefix_bracket = `\u3010${prefix}\u3011`;
  const prefix_space = `${prefix_bracket} `;
  if (before.startsWith(prefix_space)) {
    return { prefix, before, after: before, changed: false };
  }
  let stripped = before;
  const leadingAnnotations = /^【[^】]*】\s*|\s*\([^)]*\)\s*|\s*\[[^\]]*\]\s*/;
  stripped = stripped.replace(leadingAnnotations, "");
  const trailingAnnotations = /\s*【[^】]*】\s*|\s*\([^)]*\)\s*|\s*\[[^\]]*\]\s*$/;
  while (trailingAnnotations.test(stripped)) {
    stripped = stripped.replace(trailingAnnotations, "");
  }
  const originalPrefix = sourcePrefixOf(id);
  if (originalPrefix !== "") {
    const lead = `${originalPrefix}/`;
    if (stripped.startsWith(lead)) {
      stripped = stripped.slice(lead.length);
    }
  }
  const base = stripped.trimEnd() !== "" ? stripped.trimEnd() : bareIdOf(id);
  const after = `${prefix_space}${base}`;
  return { prefix, before, after, changed: after !== before };
}
function planNames(models) {
  return models.map((model) => {
    const id = textOf(model, "id");
    return { id, ...redirectName(id, textOf(model, "name")) };
  });
}
function renameModels(models, selected) {
  let written = 0;
  const next = models.map((model) => {
    const id = textOf(model, "id");
    if (!selected.has(id)) return model;
    const { after, changed } = redirectName(id, textOf(model, "name"));
    if (!changed) return model;
    written += 1;
    return { ...model, name: after };
  });
  return { next, written };
}

// src/client/SyncSection.tsx
var import_jsx_runtime = require("react/jsx-runtime");
function tokens(value) {
  if (typeof value !== "number") return "\u2014";
  if (value >= 1e6) return `${String(Number((value / 1e6).toFixed(1)))}M`;
  if (value >= 1e3) return `${String(Number((value / 1e3).toFixed(0)))}K`;
  return String(value);
}
function viaLabel(row, t) {
  switch (row.match?.via) {
    case "alias":
      return t("viaAlias");
    case "exact":
      return t("viaExact");
    case "folded":
      return t("viaFolded");
    case "basename":
      return t("viaBasename");
    case "suffix":
      return t("viaSuffix");
    case "name":
      return t("viaName");
    case "nameSuffix":
      return t("viaNameSuffix");
    default:
      return "";
  }
}
function mergeModel(model, fields, overwrite) {
  const next = { ...model };
  for (const [key, value] of Object.entries(fields)) {
    if (key === "name" || value === void 0) continue;
    if (!overwrite && !isBlank(next[key])) continue;
    next[key] = value;
  }
  return next;
}
function changesBetween(model, fields, overwrite) {
  const next = mergeModel(model, fields, overwrite);
  const changes = [];
  for (const key of Object.keys(fields)) {
    const before = model[key];
    const after = next[key];
    if (JSON.stringify(before) === JSON.stringify(after)) continue;
    changes.push({ key, before, after });
  }
  return changes;
}
function imageText(value, t) {
  if (Array.isArray(value) && value.includes("image")) return t("imageYes");
  if (isBlank(value)) return t("fieldEmpty");
  return t("imageNo");
}
function reasoningText(value) {
  if (value === false) return "off";
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    const keys = Object.keys(value);
    return keys.length === 0 ? "\u2014" : keys.join(" / ");
  }
  return "\u2014";
}
function liveLabel(row, t) {
  if (row === void 0) return "\u2014";
  if (row.error !== void 0) return t("liveError");
  if (row.input === void 0) return "\u2014";
  return row.input.includes("image") ? t("imageYes") : t("imageNo");
}
function valueCell(change, current, format) {
  if (change === void 0) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "cs-dim", children: format(current) });
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "cs-change", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "cs-from", children: format(change.before) }),
    " \u2192 ",
    format(change.after)
  ] });
}
function SyncSection(props) {
  const { t, preview, live, describeSettings, mutateSettings } = props;
  const [status, setStatus] = (0, import_react.useState)("loading");
  const [errorText, setErrorText] = (0, import_react.useState)(void 0);
  const [descriptors, setDescriptors] = (0, import_react.useState)([]);
  const [targetNs, setTargetNs] = (0, import_react.useState)(TARGET_DEFAULT);
  const [providerKey, setProviderKey] = (0, import_react.useState)("");
  const [models, setModels] = (0, import_react.useState)([]);
  const [rows, setRows] = (0, import_react.useState)(void 0);
  const [liveRows, setLiveRows] = (0, import_react.useState)(/* @__PURE__ */ new Map());
  const [selected, setSelected] = (0, import_react.useState)(/* @__PURE__ */ new Set());
  const [overwrite, setOverwrite] = (0, import_react.useState)(false);
  const [query, setQuery] = (0, import_react.useState)("");
  const [onlyChanged, setOnlyChanged] = (0, import_react.useState)(false);
  const [sortMode, setSortMode] = (0, import_react.useState)("prefix");
  const [renaming, setRenaming] = (0, import_react.useState)(false);
  const [reordering, setReordering] = (0, import_react.useState)(false);
  const [busy, setBusy] = (0, import_react.useState)("idle");
  const [notice, setNotice] = (0, import_react.useState)(void 0);
  const [catalogInfo, setCatalogInfo] = (0, import_react.useState)(void 0);
  const [staleInfo, setStaleInfo] = (0, import_react.useState)(void 0);
  const plan = (() => {
    if (rows === void 0) return [];
    const stored = new Map(models.map((model) => [textOf(model, "id"), model]));
    return rows.map((row) => {
      const model = stored.get(row.id) ?? {};
      const fields = row.fields;
      return {
        row,
        model,
        changes: fields === void 0 ? [] : changesBetween(model, fields, overwrite)
      };
    });
  })();
  const matched = plan.filter((entry) => entry.row.fields !== void 0);
  const unmatched = plan.filter((entry) => entry.row.fields === void 0);
  const changing = matched.filter((entry) => entry.changes.length > 0);
  const changeFields = changing.reduce((total, entry) => total + entry.changes.length, 0);
  const liveImage = matched.filter((entry) => liveRows.get(entry.row.id)?.input?.includes("image") === true).length;
  const liveText = matched.filter((entry) => {
    const answer = liveRows.get(entry.row.id);
    return answer?.input !== void 0 && !answer.input.includes("image");
  }).length;
  const load = async (mode = sortMode) => {
    setStatus("loading");
    setErrorText(void 0);
    try {
      const list = await describeSettings();
      setDescriptors(list);
      const candidates2 = list.filter((entry) => Object.keys(providersOf(entry)).length > 0);
      const target = candidates2.find((entry) => entry.ns === TARGET_DEFAULT) ?? candidates2[0];
      if (target === void 0) {
        setStatus("error");
        setErrorText(t("noTarget"));
        return;
      }
      const providers = providersOf(target);
      const firstKey = Object.keys(providers)[0] ?? "";
      setTargetNs(target.ns);
      setProviderKey(firstKey);
      setModels(sortedModelsOf(providers[firstKey], mode));
      setRows(void 0);
      setLiveRows(/* @__PURE__ */ new Map());
      setSelected(/* @__PURE__ */ new Set());
      setQuery("");
      setStatus("ready");
    } catch (error) {
      setStatus("error");
      setErrorText(error instanceof Error ? error.message : String(error));
    }
  };
  (0, import_react.useEffect)(() => {
    void load();
  }, []);
  const showProvider = (ns, key, mode = sortMode) => {
    const providers = providersOf(descriptors.find((entry) => entry.ns === ns));
    const resolved = key !== "" && providers[key] !== void 0 ? key : Object.keys(providers)[0] ?? "";
    setTargetNs(ns);
    setProviderKey(resolved);
    setModels(sortedModelsOf(providers[resolved], mode));
    setRows(void 0);
    setLiveRows(/* @__PURE__ */ new Map());
    setSelected(/* @__PURE__ */ new Set());
    setNotice(void 0);
    setQuery("");
  };
  const refreshLive = async (provider, ids) => {
    try {
      const answer = await live({ provider, ids });
      setLiveRows(answer.ok ? new Map(answer.value.rows.map((row) => [row.id, row])) : /* @__PURE__ */ new Map());
    } catch {
      setLiveRows(/* @__PURE__ */ new Map());
    }
  };
  const reloadConfig = async () => {
    const list = await describeSettings();
    setDescriptors(list);
    const descriptor2 = list.find((entry) => entry.ns === targetNs);
    if (descriptor2 !== void 0) setModels(sortedModelsOf(providersOf(descriptor2)[providerKey], sortMode));
  };
  const selectChanging = (source, stored, mode) => {
    const byId = new Map(stored.map((model) => [textOf(model, "id"), model]));
    setSelected(new Set(source.filter((row) => row.fields !== void 0 && changesBetween(byId.get(row.id) ?? {}, row.fields, mode).length > 0).map((row) => row.id)));
  };
  const analyze = async (refresh) => {
    setBusy("analyzing");
    setErrorText(void 0);
    setNotice(void 0);
    setStaleInfo(void 0);
    try {
      const ids = models.map((model) => textOf(model, "id")).filter((id) => id.length > 0);
      const names = {};
      for (const model of models) {
        const id = textOf(model, "id");
        const name = textOf(model, "name");
        if (id !== "" && name !== "" && name !== id) names[id] = name;
      }
      const result = await preview({
        ids,
        ...Object.keys(names).length > 0 ? { names } : {},
        ...refresh ? { refresh: true } : {}
      });
      if (!result.ok) throw new Error(result.error.message);
      setRows(result.value.rows);
      selectChanging(result.value.rows, models, overwrite);
      setCatalogInfo(t("catalogInfo", {
        models: result.value.catalogModels,
        time: new Date(result.value.fetchedAt).toLocaleString()
      }));
      setStaleInfo(result.value.stale === true ? t("catalogStale", { time: new Date(result.value.fetchedAt).toLocaleString() }) : void 0);
      await refreshLive(providerKey, ids);
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy("idle");
    }
  };
  const setSortModeAndApply = (mode) => {
    setSortMode(mode);
    const descriptor2 = descriptors.find((entry) => entry.ns === targetNs);
    if (descriptor2 !== void 0) setModels(sortedModelsOf(providersOf(descriptor2)[providerKey], mode));
  };
  const setOverwriteMode = (mode) => {
    setOverwrite(mode);
    if (rows === void 0) return;
    selectChanging(rows, models, mode);
  };
  const doRename = async () => {
    const descriptor2 = descriptors.find((entry) => entry.ns === targetNs);
    if (descriptor2 === void 0) return;
    const targets = new Set(planNames(models).filter((row) => row.changed).map((row) => row.id));
    if (targets.size === 0) {
      setNotice(t("redirectNoChanges"));
      return;
    }
    const renamed = renameModels(models, targets);
    setRenaming(true);
    setErrorText(void 0);
    setNotice(void 0);
    try {
      const ordered = sortByModelId(renamed.next, (model) => textOf(model, "id"), (model) => textOf(model, "name"), sortMode);
      const view = await mutateSettings(targetNs, [{
        op: "set",
        path: ["providers", providerKey, "models"],
        value: ordered
      }], descriptor2.revision);
      setModels(ordered);
      setDescriptors((previous) => previous.map((entry) => entry.ns === targetNs && typeof view.revision === "number" ? { ...entry, revision: view.revision } : entry));
      setNotice(`${t("redirectApplied", { count: renamed.written })}`);
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : String(error));
    } finally {
      setRenaming(false);
    }
  };
  const doReorder = async () => {
    const descriptor2 = descriptors.find((entry) => entry.ns === targetNs);
    if (descriptor2 === void 0) return;
    setReordering(true);
    setErrorText(void 0);
    setNotice(void 0);
    try {
      const ordered = sortByModelId(models, (model) => textOf(model, "id"), (model) => textOf(model, "name"), sortMode);
      const view = await mutateSettings(targetNs, [{
        op: "set",
        path: ["providers", providerKey, "models"],
        value: ordered
      }], descriptor2.revision);
      setModels(ordered);
      setDescriptors((previous) => previous.map((entry) => entry.ns === targetNs && typeof view.revision === "number" ? { ...entry, revision: view.revision } : entry));
      setNotice(t("reordered"));
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : String(error));
    } finally {
      setReordering(false);
    }
  };
  const applyRows = async () => {
    const descriptor2 = descriptors.find((entry) => entry.ns === targetNs);
    if (descriptor2 === void 0) return;
    const targets = new Map(changing.filter((entry) => selected.has(entry.row.id)).map((entry) => [entry.row.id, entry]));
    if (targets.size === 0) {
      setNotice(t("nothingSelected"));
      return;
    }
    let written = 0;
    const next = models.map((model) => {
      const entry = targets.get(textOf(model, "id"));
      if (entry?.row.fields === void 0) return model;
      written += 1;
      return mergeModel(model, entry.row.fields, overwrite);
    });
    setBusy("applying");
    setErrorText(void 0);
    setNotice(void 0);
    try {
      const ordered = sortByModelId(next, (model) => textOf(model, "id"), (model) => textOf(model, "name"), sortMode);
      const view = await mutateSettings(targetNs, [{
        op: "set",
        path: ["providers", providerKey, "models"],
        value: ordered
      }], descriptor2.revision);
      setModels(ordered);
      setDescriptors((previous) => previous.map((entry) => entry.ns === targetNs && typeof view.revision === "number" ? { ...entry, revision: view.revision } : entry));
      setNotice(t("applied", { count: written }));
      await refreshLive(providerKey, next.map((model) => textOf(model, "id")).filter((id) => id.length > 0));
    } catch (error) {
      const code = error?.code;
      if (code === "settings/conflict") {
        try {
          await reloadConfig();
        } catch {
        }
        setNotice(t("conflictReload"));
      } else {
        setErrorText(error instanceof Error ? error.message : String(error));
      }
    } finally {
      setBusy("idle");
    }
  };
  if (status === "loading") return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "cs-hint", children: t("loading") });
  if (status === "error") {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "cs-field", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { className: "cs-error", children: [
        t("loadFailed"),
        ": ",
        errorText
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "cs-button", onClick: () => {
        void load();
      }, children: t("retry") })
    ] });
  }
  const descriptor = descriptors.find((entry) => entry.ns === targetNs);
  const candidates = descriptors.filter((entry) => Object.keys(providersOf(entry)).length > 0);
  const providerKeys = Object.keys(providersOf(descriptor));
  const needle = query.trim().toLowerCase();
  const visible = matched.filter((entry) => {
    if (onlyChanged && entry.changes.length === 0) return false;
    if (needle === "") return true;
    return entry.row.id.toLowerCase().includes(needle) || entry.row.match?.modelId.toLowerCase().includes(needle) === true;
  });
  const selectable = visible.filter((entry) => entry.changes.length > 0);
  const toggle = (id) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "cs-hint", children: t("intro") }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "cs-row", children: [
      candidates.length > 1 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: "cs-field", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "cs-hint", children: t("writeTarget") }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("select", { className: "cs-select", value: targetNs, onChange: (event) => {
          showProvider(event.target.value, "");
        }, children: candidates.map((entry) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: entry.ns, children: targetLabelOf(entry.ns, t) }, entry.ns)) })
      ] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "cs-field", title: targetNs, children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "cs-hint", children: t("writeTarget") }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "cs-target", children: targetLabelOf(targetNs, t) })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: "cs-field", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "cs-hint", children: t("provider") }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("select", { className: "cs-select", value: providerKey, onChange: (event) => {
          showProvider(targetNs, event.target.value);
        }, children: providerKeys.map((key) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: key, children: key }, key)) })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "cs-hint", children: t("modelCount", { count: models.length }) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: "cs-field", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "cs-hint", children: t("sortMode") }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
          "select",
          {
            className: "cs-select",
            value: sortMode,
            onChange: (event) => {
              setSortModeAndApply(event.target.value);
            },
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "prefix", children: t("sortByPrefix") }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "redirected", children: t("sortByRedirected") })
            ]
          }
        )
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "cs-hint", children: t("willSort") })
    ] }),
    models.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "cs-hint", children: t("noModels") }) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "cs-row", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "cs-button cs-button--primary", disabled: busy !== "idle", onClick: () => {
        void analyze(false);
      }, children: busy === "analyzing" ? t("analyzing") : t("analyze") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "cs-button", disabled: busy !== "idle", onClick: () => {
        void analyze(true);
      }, children: t("refreshCatalog") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: "cs-hint", title: t("overwriteHint"), children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", { type: "checkbox", checked: overwrite, onChange: (event) => {
          setOverwriteMode(event.target.checked);
        } }),
        " ",
        t("overwrite")
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "button",
        {
          type: "button",
          className: "cs-button",
          disabled: renaming,
          onClick: () => {
            void doRename();
          },
          children: renaming ? t("redirectApplying") : t("redirectApply")
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "button",
        {
          type: "button",
          className: "cs-button",
          disabled: reordering,
          onClick: () => {
            void doReorder();
          },
          children: reordering ? t("reordering") : t("reorder")
        }
      )
    ] }),
    errorText !== void 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "cs-error", children: errorText }) : null,
    notice !== void 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "cs-hint", children: notice }) : null,
    catalogInfo !== void 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "cs-hint", children: catalogInfo }) : null,
    staleInfo !== void 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "cs-warn", children: staleInfo }) : null,
    rows !== void 0 && matched.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "cs-row", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "input",
          {
            className: "cs-input",
            type: "search",
            value: query,
            placeholder: t("search"),
            onChange: (event) => {
              setQuery(event.target.value);
            }
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: "cs-hint", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", { type: "checkbox", checked: onlyChanged, onChange: (event) => {
            setOnlyChanged(event.target.checked);
          } }),
          " ",
          t("onlyChanged")
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "cs-hint", children: changing.length === 0 ? t("noChanges") : t("changeSummary", { rows: changing.length, fields: changeFields }) })
      ] }),
      visible.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "cs-hint", children: t("filteredEmpty") }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "cs-table-wrap", children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("table", { className: "cs-table", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("thead", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "input",
            {
              type: "checkbox",
              "aria-label": t("selectAll"),
              checked: selectable.length > 0 && selectable.every((entry) => selected.has(entry.row.id)),
              onChange: (event) => {
                const keep = event.target.checked ? new Set(selectable.map((entry) => entry.row.id)) : /* @__PURE__ */ new Set();
                setSelected(keep);
              }
            }
          ) }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { children: t("colModel") }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { children: t("colMatch") }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { children: t("colContext") }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { children: t("colOutput") }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { children: t("colImage") }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { title: t("colLiveHint"), children: t("colLive") }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { children: t("colReasoning") })
        ] }) }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tbody", { children: visible.map(({ row, model, changes }) => {
          const changeOf = (key) => changes.find((change) => change.key === key);
          return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", { className: changes.length > 0 ? "cs-row--changed" : void 0, children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              "input",
              {
                type: "checkbox",
                "aria-label": row.id,
                checked: selected.has(row.id),
                disabled: changes.length === 0,
                onChange: () => {
                  toggle(row.id);
                }
              }
            ) }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { className: "cs-id", children: row.id }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("td", { className: "cs-dim", children: [
              row.match === void 0 ? "\u2014" : `${row.match.provider}/${row.match.modelId}`,
              " ",
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "cs-badge", children: viaLabel(row, t) })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { children: valueCell(changeOf("contextWindow"), model.contextWindow, tokens) }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { children: valueCell(changeOf("maxTokens"), model.maxTokens, tokens) }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { children: valueCell(changeOf("input"), model.input, (value) => imageText(value, t)) }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: liveRows.get(row.id)?.input?.includes("image") === true ? "cs-badge cs-badge--image" : "cs-dim", children: liveLabel(liveRows.get(row.id), t) }) }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { className: "cs-dim", children: valueCell(changeOf("reasoningEfforts"), model.reasoningEfforts, reasoningText) })
          ] }, row.id);
        }) })
      ] }) }),
      liveRows.size > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "cs-hint", children: t("liveSummary", { image: liveImage, text: liveText }) }) : null,
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "cs-row", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "button",
        {
          type: "button",
          className: "cs-button cs-button--primary",
          disabled: busy !== "idle" || !changing.some((entry) => selected.has(entry.row.id)),
          onClick: () => {
            void applyRows();
          },
          children: busy === "applying" ? t("applying") : t("apply")
        }
      ) })
    ] }) : null,
    unmatched.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "cs-hint", children: t("unmatchedHint") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", { className: "cs-unmatched", children: unmatched.map((entry) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", { children: [
        entry.row.id,
        entry.row.reason === void 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "cs-dim", children: [
          " \u2014 ",
          entry.row.reason
        ] })
      ] }, entry.row.id)) })
    ] }) : null
  ] });
}

// src/client/locale.ts
var zh = {
  nav: "\u6A21\u578B\u80FD\u529B\u540C\u6B65",
  navRedirect: "\u540D\u79F0\u91CD\u5B9A\u5411",
  loading: "\u6B63\u5728\u8BFB\u53D6\u914D\u7F6E\u2026",
  intro: "\u4ECE models.dev \u67E5\u8BE2\u5DF2\u914D\u7F6E\u6A21\u578B\u7684\u80FD\u529B\uFF08\u4E0A\u4E0B\u6587\u7A97\u53E3\u3001\u8F93\u51FA\u4E0A\u9650\u3001\u662F\u5426\u652F\u6301\u56FE\u7247\u3001\u63A8\u7406\u6863\u4F4D\uFF09\uFF0C\u5E76\u5199\u5165\u6240\u9009\u4F9B\u5E94\u5546\u7684\u914D\u7F6E\u3002\u672C\u9875\u53EA\u5199\u914D\u7F6E\uFF0C\u4E0D\u53D1\u9001\u4EFB\u4F55\u63A8\u7406\u8BF7\u6C42\u3002",
  writeTarget: "\u5199\u5165\u4F4D\u7F6E",
  sourceNative: "\u539F\u751F\u914D\u7F6E",
  sourcePlugin: "\u63D2\u4EF6\u914D\u7F6E",
  nameLlmPiAi: "pi-ai \u9002\u914D\u5668",
  nameLlmDeepseek: "DeepSeek \u5B98\u65B9",
  nameLlmDeepseekAccount: "DeepSeek \u8D26\u53F7",
  nameLlmNewapi: "NewAPI",
  provider: "\u4F9B\u5E94\u5546",
  modelCount: "\u5171 {count} \u4E2A\u6A21\u578B",
  willSort: "\u5199\u5165\u65F6\u6309\u300C\u524D\u7F00\u5206\u7EC4 + \u540D\u79F0\u300D\u6392\u5E8F",
  sortMode: "\u6392\u5E8F",
  sortByPrefix: "\u6309\u6A21\u578B\u524D\u7F00\u6392\u5E8F\uFF08\u5206\u7EC4\uFF09",
  sortByRedirected: "\u6309\u91CD\u5B9A\u5411\u540E\u3010\u6765\u6E90\u3011\u540D\u79F0\u6392\u5E8F",
  sortRedirectedHint: "\u6309\u540D\u79F0\u6392\u5E8F\u8BFB\u7684\u662F\u91CD\u5B9A\u5411\u540E\u7684\u540D\u79F0\uFF08\u524D\u7F00\u79FB\u5230\u672B\u5C3E\u3010\u3011\u91CC\uFF09\uFF0C\u5217\u8868\u56E0\u6B64\u662F\u6574\u4EFD\u540D\u79F0\u7684\u5B57\u6BCD\u5E8F\uFF0C\u800C\u4E0D\u662F\u6309\u6765\u6E90\u5206\u7EC4\u3002",
  search: "\u641C\u7D22\u6A21\u578B ID \u6216\u76EE\u5F55 ID",
  onlyChanged: "\u53EA\u770B\u6709\u53D8\u5316\u7684",
  changeSummary: "\u5C06\u4FEE\u6539 {rows} \u884C \xB7 {fields} \u4E2A\u5B57\u6BB5",
  noChanges: "\u6CA1\u6709\u9700\u8981\u5199\u5165\u7684\u53D8\u5316\uFF08\u76EE\u5F55\u503C\u4E0E\u4F60\u73B0\u6709\u914D\u7F6E\u4E00\u81F4\uFF09\u3002",
  filteredEmpty: "\u6CA1\u6709\u7B26\u5408\u7B5B\u9009\u6761\u4EF6\u7684\u6A21\u578B\u3002",
  fieldEmpty: "\u672A\u8BBE\u7F6E",
  conflictReload: "\u914D\u7F6E\u5DF2\u88AB\u5176\u4ED6\u6539\u52A8\u66F4\u65B0\uFF0C\u5DF2\u91CD\u65B0\u8BFB\u53D6\u6700\u65B0\u503C\uFF1B\u8BF7\u786E\u8BA4\u540E\u518D\u70B9\u4E00\u6B21\u300C\u5E94\u7528\u300D\u3002",
  analyze: "\u5206\u6790\u80FD\u529B",
  analyzing: "\u6B63\u5728\u5339\u914D\u2026",
  refreshCatalog: "\u91CD\u65B0\u4E0B\u8F7D\u76EE\u5F55",
  apply: "\u5E94\u7528",
  applying: "\u6B63\u5728\u5199\u5165\u2026",
  applied: "\u5DF2\u5199\u5165 {count} \u4E2A\u6A21\u578B",
  overwrite: "\u8986\u76D6\u5DF2\u6709\u503C",
  overwriteHint: "\u4E0D\u52FE\u9009\u65F6\u53EA\u586B\u7A7A\u767D\u5B57\u6BB5\uFF0C\u4F60\u624B\u586B\u8FC7\u7684\u503C\u4E0D\u4F1A\u88AB\u6539\u5199\u3002",
  selectAll: "\u5168\u9009",
  colModel: "\u6A21\u578B ID",
  colMatch: "\u5339\u914D",
  colContext: "\u4E0A\u4E0B\u6587",
  colOutput: "\u8F93\u51FA",
  colImage: "\u56FE\u7247",
  colLive: "\u5F53\u524D\u751F\u6548",
  colLiveHint: "\u7531\u771F\u6B63\u63A5\u7BA1\u8FD9\u6761\u8DEF\u7531\u7684\u9002\u914D\u5668\u4E0A\u62A5\uFF0C\u4E5F\u5C31\u662F\u804A\u5929\u8BF7\u6C42\u5B9E\u9645\u770B\u5230\u7684\u503C\u3002\u82E5\u5B83\u4E0E\u300C\u56FE\u7247\u300D\u5217\u4E0D\u4E00\u81F4\uFF0C\u8BF4\u660E\u914D\u7F6E\u88AB\u53E6\u4E00\u4E2A\u63D2\u4EF6\u62A2\u5360\u4E86\u8DEF\u7531\u3002",
  liveError: "\u65E0\u6CD5\u8BFB\u53D6",
  liveSummary: "\u5F53\u524D\u751F\u6548\uFF1A{image} \u4E2A\u652F\u6301\u56FE\u7247\uFF0C{text} \u4E2A\u7EAF\u6587\u672C\u3002\u82E5\u4E0E\u300C\u56FE\u7247\u300D\u5217\u4E0D\u4E00\u81F4\uFF0C\u8BF4\u660E\u8FD9\u6761\u8DEF\u7531\u7531\u522B\u7684\u63D2\u4EF6\u63A5\u7BA1\uFF0C\u5199\u5165\u672C\u914D\u7F6E\u4E0D\u4F1A\u751F\u6548\u3002",
  colReasoning: "\u63A8\u7406\u6863\u4F4D",
  imageYes: "\u652F\u6301",
  imageNo: "\u7EAF\u6587\u672C",
  unmatched: "\u672A\u5339\u914D",
  unmatchedHint: "\u8FD9\u4E9B\u6A21\u578B\u5728 models.dev \u91CC\u627E\u4E0D\u5230\uFF08ID \u548C\u663E\u793A\u540D\u79F0\u90FD\u8BD5\u8FC7\u4E86\uFF09\uFF0C\u4FDD\u6301\u539F\u6837\u3002\u53EF\u5728\u522B\u540D\u8868\u91CC\u624B\u52A8\u6307\u5B9A\u3002",
  noModels: "\u8BE5\u4F9B\u5E94\u5546\u4E0B\u8FD8\u6CA1\u6709\u6A21\u578B\u3002",
  noTarget: "\u6CA1\u6709\u627E\u5230\u53EF\u5199\u7684\u914D\u7F6E\u6761\u76EE\uFF08\u9700\u8981\u5DF2\u542F\u7528\u7684 llm-pi-ai \u4F9B\u5E94\u5546\u914D\u7F6E\uFF09\u3002",
  loadFailed: "\u52A0\u8F7D\u5931\u8D25",
  retry: "\u91CD\u8BD5",
  viaAlias: "\u522B\u540D",
  viaName: "\u6309\u540D\u79F0",
  viaNameSuffix: "\u540D\u79F0\u53BB\u53D8\u4F53",
  viaExact: "\u7CBE\u786E",
  viaFolded: "\u5FFD\u7565\u5927\u5C0F\u5199",
  viaBasename: "\u53BB\u524D\u7F00",
  viaSuffix: "\u53BB\u53D8\u4F53\u540E\u7F00",
  catalogInfo: "\u76EE\u5F55\uFF1A{models} \u4E2A\u6A21\u578B \xB7 {time}",
  catalogStale: "\u5728\u7EBF\u76EE\u5F55\u4E0B\u8F7D\u5931\u8D25\uFF0C\u6B63\u5728\u4F7F\u7528\u672C\u673A\u7F13\u5B58\uFF08{time}\uFF09\u3002\u6570\u636E\u53EF\u80FD\u4E0D\u662F\u6700\u65B0\uFF0C\u5B57\u6BB5\u542B\u4E49\u4E0D\u53D8\u3002",
  nothingSelected: "\u6CA1\u6709\u9009\u4E2D\u4EFB\u4F55\u6A21\u578B\u3002",
  done: "\u5B8C\u6210\u3002",
  redirectIntro: "\u6E05\u6D17\u663E\u793A\u540D\u79F0\u7684\u6765\u6E90\u524D\u7F00\uFF1A\u7F51\u5173\u6A21\u578B ID \u91CC\u7B2C\u4E00\u4E2A\u300C/\u300D\u4E4B\u524D\u7684\u90E8\u5206\uFF08\u5982 qoder/qfmodel \u7684 qoder\uFF09\u4F1A\u4ECE\u540D\u79F0\u5F00\u5934\u53BB\u6389\uFF0C\u6539\u6210\u4EE5\u5168\u89D2\u3010\u3011\u7684\u5F62\u5F0F\u8FFD\u52A0\u5230\u540D\u79F0\u672B\u5C3E\uFF0C\u540C\u540D\u6A21\u578B\u56E0\u6B64\u80FD\u533A\u5206\u6765\u6E90\u3002",
  redirectRule: "\u89C4\u5219\uFF1Aqoder/Qwen3.8-Flash \u2192 Qwen3.8-Flash\u3010qoder\u3011\u3002\u524D\u7F00\u53EA\u4FDD\u7559\u672B\u5C3E\u7684\u5168\u89D2\u3010\u3011\u4E00\u79CD\u5F62\u5F0F\uFF0C\u5F00\u5934\u7684 qoder/ \u548C\u65E7\u7684\u534A\u89D2 (qoder) \u90FD\u4F1A\u88AB\u6E05\u6389\uFF1B\u91CD\u590D\u5E94\u7528\u4E0D\u4F1A\u53E0\u52A0\uFF0C\u6CA1\u6709\u6765\u6E90\u524D\u7F00\u7684\u6A21\u578B\u4FDD\u6301\u539F\u6837\u3002",
  redirectSearch: "\u641C\u7D22\u6A21\u578B ID \u6216\u540D\u79F0",
  redirectNoChanges: "\u8FD9\u4E9B\u540D\u79F0\u5DF2\u5E26\u6765\u6E90\u524D\u7F00\uFF0C\u65E0\u9700\u6539\u52A8\u3002",
  redirectSummary: "\u5C06\u6539\u5199 {count} \u4E2A\u540D\u79F0",
  colPrefix: "\u6765\u6E90\u524D\u7F00",
  colNameBefore: "\u5F53\u524D\u540D\u79F0",
  colNameAfter: "\u65B0\u540D\u79F0",
  redirectSortHint: "\u6309\u91CD\u5B9A\u5411\u540E\u7684\u540D\u79F0\uFF08\u524D\u7F00\u5728\u672B\u5C3E\u3010\u3011\u91CC\uFF09\u6392\u5E8F\uFF0C\u548C\u6A21\u578B\u5217\u8868\u7684\u987A\u5E8F\u5BF9\u9F50\u3002",
  redirectRearrange: "\u540C\u65F6\u6309\u5F53\u524D\u6392\u5E8F\u91CD\u6392\u6A21\u578B\u76EE\u5F55",
  redirectRearranged: "\u5DF2\u91CD\u6392 {count} \u4E2A\u6A21\u578B\u7684\u4F4D\u7F6E\u3002",
  redirectFooter: "{count} \u4E2A\u6A21\u578B\u6CA1\u6709\u6765\u6E90\u524D\u7F00\uFF0C\u4FDD\u6301\u539F\u6837\u3002",
  reorder: "\u91CD\u6392",
  reordering: "\u91CD\u6392\u4E2D...",
  reordered: "\u5DF2\u6309 {mode} \u91CD\u6392\u76EE\u5F55",
  reorderHint: "\u6309 {mode} \u91CD\u65B0\u6392\u5E8F\u6A21\u578B\u5217\u8868",
  redirectApply: "\u5199\u5165\u540D\u79F0",
  redirectApplying: "\u6B63\u5728\u5199\u5165\u2026",
  redirectApplied: "\u5DF2\u6539\u5199 {count} \u4E2A\u540D\u79F0"
};
var en = {
  nav: "Model capabilities",
  navRedirect: "Model name redirect",
  loading: "Reading configuration\u2026",
  intro: "Look up capabilities (context window, output cap, image input, reasoning efforts) for the models already configured here, then write them into the selected provider. This page only writes configuration; it never sends a model request.",
  writeTarget: "Write to",
  sourceNative: "Built in",
  sourcePlugin: "Plugin",
  nameLlmPiAi: "pi-ai adapter",
  nameLlmDeepseek: "DeepSeek official",
  nameLlmDeepseekAccount: "DeepSeek account",
  nameLlmNewapi: "NewAPI",
  provider: "Provider",
  modelCount: "{count} models",
  willSort: "Written sorted by vendor prefix, then name",
  sortMode: "Order",
  sortByPrefix: "Sort by model prefix (grouped)",
  sortByRedirected: "Sort by redirected name \u3010source\u3011",
  sortRedirectedHint: "Name order reads the redirected label (prefix moved into a trailing \u3010\u3011), so the list is one alphabetical run of names instead of vendor groups.",
  search: "Search model id or catalog id",
  onlyChanged: "Only rows that change",
  changeSummary: "Will change {rows} rows \xB7 {fields} fields",
  noChanges: "Nothing to write: the catalog agrees with your configuration.",
  filteredEmpty: "No model matches the filter.",
  fieldEmpty: "unset",
  conflictReload: "The configuration changed elsewhere; the latest values were reloaded. Check them, then press Apply again.",
  analyze: "Analyze",
  analyzing: "Matching\u2026",
  refreshCatalog: "Re-download catalog",
  apply: "Apply",
  applying: "Writing\u2026",
  applied: "Wrote {count} models",
  overwrite: "Overwrite existing values",
  overwriteHint: "Unchecked: only blank fields are filled, so values you typed are preserved.",
  selectAll: "Select all",
  colModel: "Model id",
  colMatch: "Match",
  colContext: "Context",
  colOutput: "Output",
  colImage: "Image",
  colLive: "In effect",
  colLiveHint: "Reported by the adapter that actually serves this route \u2014 what a chat request sees. A value that disagrees with the Image column means another plugin owns the route.",
  liveError: "unreadable",
  liveSummary: "In effect: {image} image-capable, {text} text-only. If this disagrees with the Image column, another plugin serves the route and writing this entry changes nothing.",
  colReasoning: "Reasoning",
  imageYes: "yes",
  imageNo: "text only",
  unmatched: "unmatched",
  unmatchedHint: "Neither the id nor the display name appears in models.dev, so these stay untouched. Add an alias to map them by hand.",
  noModels: "This provider has no models yet.",
  noTarget: "No writable configuration entry found (an enabled llm-pi-ai provider is required).",
  loadFailed: "Load failed",
  retry: "Retry",
  viaAlias: "alias",
  viaName: "by name",
  viaNameSuffix: "name + variant",
  viaExact: "exact",
  viaFolded: "case-folded",
  viaBasename: "basename",
  viaSuffix: "suffix",
  catalogInfo: "Catalog: {models} models \xB7 {time}",
  catalogStale: "The online catalog download failed; using the local copy from {time}. The facts still mean the same thing, they may just be older.",
  nothingSelected: "Nothing selected.",
  done: "Done.",
  redirectIntro: 'Normalize the source prefix on each display name: the part of a gateway model id before its first "/" (for qoder/qfmodel, that is qoder) is removed from the front of the name and appended at the end in full-width brackets, so models with the same name stay distinguishable.',
  redirectRule: "Rule: qoder/Qwen3.8-Flash \u2192 Qwen3.8-Flash\u3010qoder\u3011. The prefix survives only as a full-width suffix: a leading qoder/ and an older half-width (qoder) are both stripped. Re-applying never stacks a suffix, and models without a source prefix are left alone.",
  redirectSearch: "Search model id or name",
  redirectNoChanges: "These names already carry a source prefix; nothing to change.",
  redirectSummary: "{count} names will be rewritten",
  colPrefix: "Prefix",
  colNameBefore: "Current name",
  colNameAfter: "New name",
  redirectSortHint: "Ordered by the redirected label (prefix in a trailing \u3010\u3011), so it lines up with the model list.",
  redirectRearrange: "Also reorder the model catalog to match",
  redirectRearranged: "Moved {count} models into place.",
  redirectFooter: "{count} models have no source prefix and stay as they are.",
  reorder: "Reorder",
  reordering: "Reordering\u2026",
  reordered: "Reordered by {mode}",
  reorderHint: "Reorder by {mode}",
  redirectApply: "Write names",
  redirectApplying: "Writing\u2026",
  redirectApplied: "Rewrote {count} names"
};

// src/client/apply.ts
var NS = "settings.capability-sync";
var CHANNEL = "/model-capability-sync";
function refusalOf(answer) {
  if (typeof answer !== "object" || answer === null) return void 0;
  const envelope = answer;
  if (envelope.ok !== false) return void 0;
  return {
    ...typeof envelope.error?.code === "string" ? { code: envelope.error.code } : {},
    message: typeof envelope.error?.message === "string" ? envelope.error.message : "settings request refused"
  };
}
function unwrap(answer) {
  const refusal = refusalOf(answer);
  if (refusal !== void 0) {
    throw Object.assign(new Error(refusal.message), refusal.code === void 0 ? {} : { code: refusal.code });
  }
  if (typeof answer === "object" && answer !== null && "ok" in answer && "value" in answer) {
    return answer.value;
  }
  return answer;
}
function namespacesOf(answer) {
  const document2 = unwrap(answer);
  if (Array.isArray(document2)) return document2;
  const namespaces = document2?.namespaces;
  if (!Array.isArray(namespaces)) throw new Error("settings.describe returned no namespace list");
  return namespaces;
}
var inject = ["slots", "locale", "connection", "remote", "remote.settings"];
var SECTION_CSS = `
.cs-field { display: flex; flex-direction: column; gap: 4px; margin-bottom: 12px; }
.cs-row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 12px; }
.cs-select {
  box-sizing: border-box; padding: 6px 10px; border-radius: 8px;
  border: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
  font: inherit; font-size: 13px;
}
.cs-button {
  padding: 6px 12px; border-radius: 6px; font: inherit; font-size: 13px;
  border: 1px solid var(--dsw-alias-border-l2);
  background: transparent; color: var(--dsw-alias-label-primary);
  cursor: pointer;
}
.cs-button:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); }
.cs-button:disabled { opacity: 0.4; cursor: default; }
.cs-button--primary {
  border-color: transparent;
  background: var(--dsw-alias-button-primary-fill);
  color: var(--dsw-alias-label-primary-foreground);
}
.cs-button--primary:hover:not(:disabled) { background: var(--dsw-alias-button-primary-hover); }
.cs-hint { font-size: 12px; color: var(--dsw-alias-label-tertiary); line-height: 18px; }
.cs-error { color: var(--dsw-alias-state-error-primary); font-size: 12px; }
.cs-warn { color: var(--dsw-alias-state-warning-primary, var(--dsw-alias-label-secondary)); font-size: 12px; line-height: 18px; }
.cs-input {
  box-sizing: border-box; padding: 6px 10px; border-radius: 8px; min-width: 200px;
  border: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
  font: inherit; font-size: 13px;
}
.cs-target { font-size: 13px; color: var(--dsw-alias-label-primary); line-height: 30px; }
.cs-table-wrap {
  max-height: 460px; overflow: auto; margin-bottom: 12px;
  border: 1px solid var(--dsw-alias-border-l2); border-radius: 8px;
}
.cs-table { width: 100%; border-collapse: separate; border-spacing: 0; font-size: 12px; }
.cs-table th {
  position: sticky; top: 0; z-index: 1;
  text-align: left; font-weight: 500; color: var(--dsw-alias-label-secondary);
  background: var(--dsw-alias-bg-layer-1);
  padding: 6px 8px; border-bottom: 1px solid var(--dsw-alias-border-l2); white-space: nowrap;
}
.cs-table td {
  padding: 6px 8px; border-bottom: 1px solid var(--dsw-alias-border-l2);
  color: var(--dsw-alias-label-primary); vertical-align: top;
}
.cs-table tr:last-child td { border-bottom: none; }
.cs-row--changed td { background: var(--dsw-alias-bg-layer-2, transparent); }
.cs-id { font-variant-numeric: tabular-nums; word-break: break-all; }
.cs-dim { color: var(--dsw-alias-label-tertiary); }
.cs-change { white-space: nowrap; }
.cs-from { color: var(--dsw-alias-label-tertiary); text-decoration: line-through; }
.cs-badge {
  display: inline-block; padding: 0 6px; border-radius: 9px; font-size: 11px; line-height: 18px;
  border: 1px solid var(--dsw-alias-border-l2); color: var(--dsw-alias-label-secondary);
}
.cs-badge--image { border-color: var(--dsw-alias-brand-primary); color: var(--dsw-alias-brand-primary); }
.cs-unmatched { margin: 8px 0 0; padding-left: 18px; color: var(--dsw-alias-label-tertiary); font-size: 12px; }
`;
function apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), "model-capability-sync: copy dictionaries");
  if (typeof document !== "undefined") {
    ctx.effect(() => {
      const element = document.createElement("style");
      element.textContent = SECTION_CSS;
      document.head.append(element);
      return () => {
        element.remove();
      };
    }, "model-capability-sync: section styles");
  }
  const connection = ctx.get("connection");
  const remote = ctx.get("remote");
  const t = ctx.locale.bind(NS);
  const settingsInjected = () => ({
    describeSettings: async () => namespacesOf(await remote.settings.describe()),
    mutateSettings: async (ns, ops, expectedRevision) => {
      const view = unwrap(await remote.settings.mutate(ns, ops, expectedRevision));
      if (view === void 0) throw new Error("settings.mutate returned no namespace view");
      return view;
    }
  });
  const injected = () => ({
    ...settingsInjected(),
    preview: (request) => connection.rpc.call(CHANNEL, "preview", request),
    live: (request) => connection.rpc.call(CHANNEL, "live", request)
  });
  ctx.slots.inject("settings.section", () => ctx.slots.register({
    name: "settings.section",
    id: "model-capability-sync",
    order: 16,
    label: () => t("nav"),
    locale: NS,
    inject: injected
  }, SyncSection));
}
return module.exports; } });
//# sourceMappingURL=client.js.map
