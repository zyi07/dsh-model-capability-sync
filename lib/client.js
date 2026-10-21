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
var import_jsx_runtime = require("react/jsx-runtime");
var TARGET_DEFAULT = "llm-pi-ai";
function textOf(model, key) {
  const value = model[key];
  return typeof value === "string" ? value : "";
}
function providersOf(descriptor) {
  const providers = descriptor?.value?.providers;
  return typeof providers === "object" && providers !== null ? providers : {};
}
function modelsOf(provider) {
  const models = provider?.models;
  return Array.isArray(models) ? models.filter((entry) => typeof entry === "object" && entry !== null) : [];
}
function tokens(value) {
  if (value === void 0) return "\u2014";
  if (value >= 1e6) return `${String(Number((value / 1e6).toFixed(1)))}M`;
  if (value >= 1e3) return `${String(Number((value / 1e3).toFixed(0)))}K`;
  return String(value);
}
function imageLabel(fields, t) {
  if (fields?.input === void 0) return "\u2014";
  return fields.input.includes("image") ? t("imageYes") : t("imageNo");
}
function reasoningLabel(fields) {
  const efforts = fields?.reasoningEfforts;
  if (efforts === void 0) return "\u2014";
  if (efforts === false) return "off";
  const keys = Object.keys(efforts);
  return keys.length === 0 ? "\u2014" : keys.join(" / ");
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
    default:
      return "";
  }
}
function mergeModel(model, fields, overwrite) {
  const next = { ...model };
  for (const [key, value] of Object.entries(fields)) {
    if (value === void 0) continue;
    if (!overwrite && next[key] !== void 0) continue;
    next[key] = value;
  }
  return next;
}
function SyncSection(props) {
  const { t, preview, describeSettings, mutateSettings } = props;
  const [status, setStatus] = (0, import_react.useState)("loading");
  const [errorText, setErrorText] = (0, import_react.useState)(void 0);
  const [descriptors, setDescriptors] = (0, import_react.useState)([]);
  const [targetNs, setTargetNs] = (0, import_react.useState)(TARGET_DEFAULT);
  const [providerKey, setProviderKey] = (0, import_react.useState)("");
  const [models, setModels] = (0, import_react.useState)([]);
  const [rows, setRows] = (0, import_react.useState)(void 0);
  const [selected, setSelected] = (0, import_react.useState)(/* @__PURE__ */ new Set());
  const [overwrite, setOverwrite] = (0, import_react.useState)(false);
  const [busy, setBusy] = (0, import_react.useState)("idle");
  const [notice, setNotice] = (0, import_react.useState)(void 0);
  const [catalogInfo, setCatalogInfo] = (0, import_react.useState)(void 0);
  const load = async () => {
    setStatus("loading");
    setErrorText(void 0);
    try {
      const list = await describeSettings();
      setDescriptors(list);
      const candidates = list.filter((entry) => Object.keys(providersOf(entry)).length > 0);
      const target = candidates.find((entry) => entry.ns === TARGET_DEFAULT) ?? candidates[0];
      if (target === void 0) {
        setStatus("error");
        setErrorText(t("noTarget"));
        return;
      }
      const providers = providersOf(target);
      const firstKey = Object.keys(providers)[0] ?? "";
      setTargetNs(target.ns);
      setProviderKey(firstKey);
      setModels(modelsOf(providers[firstKey]));
      setRows(void 0);
      setSelected(/* @__PURE__ */ new Set());
      setStatus("ready");
    } catch (error) {
      setStatus("error");
      setErrorText(error instanceof Error ? error.message : String(error));
    }
  };
  (0, import_react.useEffect)(() => {
    void load();
  }, []);
  const selectProvider = (key) => {
    const descriptor2 = descriptors.find((entry) => entry.ns === targetNs);
    setProviderKey(key);
    setModels(modelsOf(providersOf(descriptor2)[key]));
    setRows(void 0);
    setSelected(/* @__PURE__ */ new Set());
    setNotice(void 0);
  };
  const analyze = async (refresh) => {
    setBusy("analyzing");
    setErrorText(void 0);
    setNotice(void 0);
    try {
      const ids = models.map((model) => textOf(model, "id")).filter((id) => id.length > 0);
      const result = await preview({ ids, ...refresh ? { refresh: true } : {} });
      if (!result.ok) throw new Error(result.error.message);
      setRows(result.value.rows);
      setSelected(new Set(result.value.rows.filter((row) => row.fields !== void 0).map((row) => row.id)));
      setCatalogInfo(t("catalogInfo", {
        models: result.value.catalogModels,
        time: new Date(result.value.fetchedAt).toLocaleString()
      }));
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy("idle");
    }
  };
  const applyRows = async () => {
    if (rows === void 0) return;
    const descriptor2 = descriptors.find((entry) => entry.ns === targetNs);
    if (descriptor2 === void 0) return;
    const byId = new Map(rows.map((row) => [row.id, row]));
    let written = 0;
    const next = models.map((model) => {
      const id = textOf(model, "id");
      const row = byId.get(id);
      if (row?.fields === void 0 || !selected.has(id)) return model;
      written += 1;
      return mergeModel(model, row.fields, overwrite);
    });
    if (written === 0) {
      setNotice(t("nothingSelected"));
      return;
    }
    setBusy("applying");
    setErrorText(void 0);
    try {
      const view = await mutateSettings(targetNs, [{
        op: "set",
        path: ["providers", providerKey, "models"],
        value: next
      }], descriptor2.revision);
      setModels(next);
      setDescriptors((previous) => previous.map((entry) => entry.ns === targetNs && typeof view.revision === "number" ? { ...entry, revision: view.revision } : entry));
      setNotice(t("applied", { count: written }));
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : String(error));
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
  const providerKeys = Object.keys(providersOf(descriptor));
  const unmatched = (rows ?? []).filter((row) => row.fields === void 0);
  const matched = (rows ?? []).filter((row) => row.fields !== void 0);
  const toggle = (id) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "cs-hint", children: t("intro") }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "cs-row", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: "cs-field", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "cs-hint", children: t("target") }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("select", { className: "cs-select", value: targetNs, onChange: (event) => {
          setTargetNs(event.target.value);
          setRows(void 0);
        }, children: descriptors.filter((entry) => Object.keys(providersOf(entry)).length > 0).map((entry) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: entry.ns, children: entry.ns }, entry.ns)) })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: "cs-field", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "cs-hint", children: t("provider") }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("select", { className: "cs-select", value: providerKey, onChange: (event) => selectProvider(event.target.value), children: providerKeys.map((key) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: key, children: key }, key)) })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "cs-hint", children: t("modelCount", { count: models.length }) })
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
          setOverwrite(event.target.checked);
        } }),
        " ",
        t("overwrite")
      ] })
    ] }),
    errorText !== void 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "cs-error", children: errorText }) : null,
    notice !== void 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "cs-hint", children: notice }) : null,
    catalogInfo !== void 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "cs-hint", children: catalogInfo }) : null,
    rows !== void 0 && matched.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("table", { className: "cs-table", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("thead", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "input",
            {
              type: "checkbox",
              "aria-label": t("selectAll"),
              checked: matched.every((row) => selected.has(row.id)),
              onChange: (event) => {
                setSelected(event.target.checked ? new Set(matched.map((row) => row.id)) : /* @__PURE__ */ new Set());
              }
            }
          ) }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { children: t("colModel") }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { children: t("colMatch") }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { children: t("colContext") }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { children: t("colOutput") }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { children: t("colImage") }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", { children: t("colReasoning") })
        ] }) }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tbody", { children: matched.map((row) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "input",
            {
              type: "checkbox",
              "aria-label": row.id,
              checked: selected.has(row.id),
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
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { children: tokens(row.fields?.contextWindow) }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { children: tokens(row.fields?.maxTokens) }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: row.fields?.input?.includes("image") === true ? "cs-badge cs-badge--image" : "cs-dim", children: imageLabel(row.fields, t) }) }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", { className: "cs-dim", children: reasoningLabel(row.fields) })
        ] }, row.id)) })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "cs-row", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "button",
        {
          type: "button",
          className: "cs-button cs-button--primary",
          disabled: busy !== "idle" || selected.size === 0,
          onClick: () => {
            void applyRows();
          },
          children: busy === "applying" ? t("applying") : t("apply")
        }
      ) })
    ] }) : null,
    unmatched.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "cs-hint", children: t("unmatchedHint") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", { className: "cs-unmatched", children: unmatched.map((row) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: row.id }, row.id)) })
    ] }) : null
  ] });
}

// src/client/locale.ts
var zh = {
  nav: "\u6A21\u578B\u80FD\u529B\u540C\u6B65",
  loading: "\u6B63\u5728\u8BFB\u53D6\u914D\u7F6E\u2026",
  intro: "\u4ECE models.dev \u67E5\u8BE2\u5DF2\u914D\u7F6E\u6A21\u578B\u7684\u80FD\u529B\uFF08\u4E0A\u4E0B\u6587\u7A97\u53E3\u3001\u8F93\u51FA\u4E0A\u9650\u3001\u662F\u5426\u652F\u6301\u56FE\u7247\u3001\u63A8\u7406\u6863\u4F4D\uFF09\uFF0C\u5E76\u5199\u5165\u6240\u9009\u4F9B\u5E94\u5546\u7684\u914D\u7F6E\u3002\u672C\u9875\u53EA\u5199\u914D\u7F6E\uFF0C\u4E0D\u53D1\u9001\u4EFB\u4F55\u63A8\u7406\u8BF7\u6C42\u3002",
  target: "\u76EE\u6807\u63D2\u4EF6",
  provider: "\u4F9B\u5E94\u5546",
  modelCount: "\u5171 {count} \u4E2A\u6A21\u578B",
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
  colReasoning: "\u63A8\u7406\u6863\u4F4D",
  imageYes: "\u652F\u6301",
  imageNo: "\u7EAF\u6587\u672C",
  unmatched: "\u672A\u5339\u914D",
  unmatchedHint: "\u8FD9\u4E9B\u6A21\u578B\u5728 models.dev \u91CC\u627E\u4E0D\u5230\uFF0C\u4FDD\u6301\u539F\u6837\u3002\u53EF\u5728\u522B\u540D\u8868\u91CC\u624B\u52A8\u6307\u5B9A\u3002",
  noModels: "\u8BE5\u4F9B\u5E94\u5546\u4E0B\u8FD8\u6CA1\u6709\u6A21\u578B\u3002",
  noTarget: "\u6CA1\u6709\u627E\u5230\u53EF\u5199\u7684\u914D\u7F6E\u6761\u76EE\uFF08\u9700\u8981\u5DF2\u542F\u7528\u7684 llm-pi-ai \u4F9B\u5E94\u5546\u914D\u7F6E\uFF09\u3002",
  loadFailed: "\u52A0\u8F7D\u5931\u8D25",
  retry: "\u91CD\u8BD5",
  viaAlias: "\u522B\u540D",
  viaExact: "\u7CBE\u786E",
  viaFolded: "\u5FFD\u7565\u5927\u5C0F\u5199",
  viaBasename: "\u53BB\u524D\u7F00",
  viaSuffix: "\u53BB\u53D8\u4F53\u540E\u7F00",
  catalogInfo: "\u76EE\u5F55\uFF1A{models} \u4E2A\u6A21\u578B \xB7 {time}",
  nothingSelected: "\u6CA1\u6709\u9009\u4E2D\u4EFB\u4F55\u6A21\u578B\u3002",
  done: "\u5B8C\u6210\u3002"
};
var en = {
  nav: "Model capabilities",
  loading: "Reading configuration\u2026",
  intro: "Look up capabilities (context window, output cap, image input, reasoning efforts) for the models already configured here, then write them into the selected provider. This page only writes configuration; it never sends a model request.",
  target: "Target plugin",
  provider: "Provider",
  modelCount: "{count} models",
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
  colReasoning: "Reasoning",
  imageYes: "yes",
  imageNo: "text only",
  unmatched: "unmatched",
  unmatchedHint: "These ids are absent from models.dev and stay untouched. Add an alias to map them by hand.",
  noModels: "This provider has no models yet.",
  noTarget: "No writable configuration entry found (an enabled llm-pi-ai provider is required).",
  loadFailed: "Load failed",
  retry: "Retry",
  viaAlias: "alias",
  viaExact: "exact",
  viaFolded: "case-folded",
  viaBasename: "basename",
  viaSuffix: "suffix",
  catalogInfo: "Catalog: {models} models \xB7 {time}",
  nothingSelected: "Nothing selected.",
  done: "Done."
};

// src/client/apply.ts
var NS = "settings.capability-sync";
var CHANNEL = "/model-capability-sync";
function refusalOf(answer) {
  if (typeof answer !== "object" || answer === null) return void 0;
  const envelope = answer;
  if (envelope.ok !== false) return void 0;
  return typeof envelope.error?.message === "string" ? envelope.error.message : "settings request refused";
}
function unwrap(answer) {
  const refusal = refusalOf(answer);
  if (refusal !== void 0) throw new Error(refusal);
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
.cs-table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 12px; }
.cs-table th {
  text-align: left; font-weight: 500; color: var(--dsw-alias-label-secondary);
  padding: 6px 8px; border-bottom: 1px solid var(--dsw-alias-border-l2); white-space: nowrap;
}
.cs-table td {
  padding: 6px 8px; border-bottom: 1px solid var(--dsw-alias-border-l2);
  color: var(--dsw-alias-label-primary); vertical-align: top;
}
.cs-id { font-variant-numeric: tabular-nums; word-break: break-all; }
.cs-dim { color: var(--dsw-alias-label-tertiary); }
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
  const injected = () => ({
    preview: (request) => connection.rpc.call(CHANNEL, "preview", request),
    describeSettings: async () => namespacesOf(await remote.settings.describe()),
    mutateSettings: async (ns, ops, expectedRevision) => {
      const view = unwrap(await remote.settings.mutate(ns, ops, expectedRevision));
      if (view === void 0) throw new Error("settings.mutate returned no namespace view");
      return view;
    }
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
