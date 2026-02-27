import React, { useState, useEffect, useRef, useCallback } from "react";

// ─── ELEMENT TYPES ────────────────────────────────────────────────────────────
const ET = {
  SCENE: "scene_heading",
  ACTION: "action",
  CHARACTER: "character",
  PAREN: "parenthetical",
  DIALOGUE: "dialogue",
  TRANSITION: "transition",
};

const EL_CFG = {
  scene_heading: { label: "Scene Heading", ml: "0px", w: "100%", align: "left", upper: true, bold: true, placeholder: "INT. LOCATION — DAY" },
  action: { label: "Action", ml: "0px", w: "100%", align: "left", upper: false, bold: false, placeholder: "Action description..." },
  character: { label: "Character", ml: "37%", w: "26%", align: "center", upper: true, bold: false, placeholder: "CHARACTER NAME" },
  parenthetical: { label: "Parenthetical", ml: "28%", w: "30%", align: "left", upper: false, bold: false, placeholder: "(beat)" },
  dialogue: { label: "Dialogue", ml: "18%", w: "55%", align: "left", upper: false, bold: false, placeholder: "Dialogue..." },
  transition: { label: "Transition", ml: "0px", w: "100%", align: "right", upper: true, bold: false, placeholder: "CUT TO:" },
};

const TAB_ORDER = [ET.ACTION, ET.SCENE, ET.CHARACTER, ET.DIALOGUE, ET.PAREN, ET.TRANSITION];

const SCENE_LOCS = ["INT.", "EXT.", "INT./EXT.", "I/E."];
const SCENE_TIMES = ["DAY", "NIGHT", "DAWN", "DUSK", "MORNING", "EVENING", "CONTINUOUS", "LATER", "MOMENTS LATER", "FLASHBACK", "DREAM SEQUENCE"];
const TRANSITIONS_LIST = ["CUT TO:", "FADE OUT.", "FADE IN:", "DISSOLVE TO:", "SMASH CUT TO:", "MATCH CUT TO:", "JUMP CUT TO:", "WIPE TO:"];

function uid() { return Math.random().toString(36).slice(2, 9) + Date.now().toString(36); }
function mkBlock(type = ET.ACTION, text = "") { return { id: uid(), type, text }; }

function autoDetectType(text) {
  const u = text.toUpperCase().trim();
  if (SCENE_LOCS.some(t => u.startsWith(t))) return ET.SCENE;
  if (TRANSITIONS_LIST.some(t => u.startsWith(t.slice(0, 4)))) return ET.TRANSITION;
  return null;
}

// ─── SUGGESTIONS ENGINE ───────────────────────────────────────────────────────
function getSuggestions(block, allBlocks) {
  const text = block.text;
  const upper = text.toUpperCase().trim();

  // Scene heading → suggest time-of-day after dash
  if (block.type === ET.SCENE) {
    const hasPrefix = SCENE_LOCS.some(loc => upper.startsWith(loc));
    if (hasPrefix) {
      const dashIdx = Math.max(
        text.lastIndexOf(" — "),
        text.lastIndexOf("—"),
        text.lastIndexOf(" - "),
        text.lastIndexOf(" – ")
      );
      if (dashIdx !== -1) {
        const sep = text.slice(dashIdx).match(/^( — | – | - |—|–|-)/)?.[0] || " — ";
        const afterDash = text.slice(dashIdx + sep.length).trim().toUpperCase();
        return SCENE_TIMES
          .filter(t => afterDash === "" || (t.startsWith(afterDash) && t !== afterDash))
          .map(t => ({ label: t, full: text.slice(0, dashIdx) + sep + t, hint: "Time of Day" }));
      }
      // After typing a location, suggest adding time-of-day
      if (upper.replace(/[^A-Z]/g, "").length > 3) {
        return SCENE_TIMES.map(t => ({
          label: t,
          full: text.trimEnd() + " — " + t,
          hint: "Time of Day",
        }));
      }
    }
  }

  // Character → suggest known names
  if (block.type === ET.CHARACTER) {
    const typed = upper.trim();
    const known = [...new Set(
      allBlocks
        .filter(b => b.type === ET.CHARACTER && b.id !== block.id && b.text.trim())
        .map(b => b.text.trim().toUpperCase())
    )];
    if (!typed) return known.map(c => ({ label: c, full: c, hint: "Character" }));
    return known.filter(c => c.startsWith(typed) && c !== typed)
      .map(c => ({ label: c, full: c, hint: "Character" }));
  }

  // Transition → suggest standard transitions
  if (block.type === ET.TRANSITION) {
    const typed = upper.trim();
    return TRANSITIONS_LIST
      .filter(t => typed === "" || (t.startsWith(typed) && t !== typed))
      .map(t => ({ label: t, full: t, hint: "Transition" }));
  }

  return [];
}

// ─── STORAGE ──────────────────────────────────────────────────────────────────
const SK = "sp_classic_v1";
function persist(data) {
  try { window.storage?.set(SK, JSON.stringify(data), false); } catch { }
  try { localStorage.setItem(SK, JSON.stringify(data)); } catch { }
}
async function hydrate() {
  try { const r = await window.storage?.get(SK, false); if (r?.value) return JSON.parse(r.value); } catch { }
  try { const r = localStorage.getItem(SK); if (r) return JSON.parse(r); } catch { }
  return null;
}

// ─── BLOCK COMPONENT ──────────────────────────────────────────────────────────
function Block({ block, isActive, isDark, allBlocks, onChange, onKeyDown, onFocus, blockRef, showNumbers, sceneNum }) {
  const [suggestions, setSuggestions] = useState([]);
  const [selIdx, setSelIdx] = useState(0);
  const cfg = EL_CFG[block.type];

  // Recompute suggestions whenever text / type / focus changes
  useEffect(() => {
    if (isActive) {
      const s = getSuggestions(block, allBlocks);
      setSuggestions(s);
      setSelIdx(0);
    } else {
      setSuggestions([]);
    }
  }, [block.text, block.type, isActive, allBlocks.length]);

  const apply = (sug) => {
    onChange(block.id, sug.full);
    setSuggestions([]);
  };

  const handleKey = (e) => {
    if (suggestions.length > 0) {
      if (e.key === "ArrowDown") { e.preventDefault(); setSelIdx(i => Math.min(i + 1, suggestions.length - 1)); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setSelIdx(i => Math.max(i - 1, 0)); return; }
      if (e.key === "Tab") { e.preventDefault(); if (suggestions[selIdx]) apply(suggestions[selIdx]); return; }
      if (e.key === "Enter" && suggestions[selIdx]) { e.preventDefault(); apply(suggestions[selIdx]); return; }
      if (e.key === "Escape") { e.preventDefault(); setSuggestions([]); return; }
    }
    onKeyDown(e, block.id);
  };

  // Original first-version visual style: plain Courier, no colour coding on text
  const accent = isDark ? "#c8a96e" : "#8b6914";
  const textColor = isDark ? "#e8e8e8" : "#1a1a1a";
  const mutedColor = isDark ? "#555" : "#bbb";
  const bgHover = isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)";
  const dropBg = isDark ? "#1a1e2a" : "#ffffff";
  const dropBorder = isDark ? "#2a3245" : "#d8dde8";
  const dropHover = isDark ? "rgba(200,169,110,0.08)" : "rgba(139,105,20,0.06)";
  const dropText = isDark ? "#d0ccc4" : "#2a2a2a";

  const isChar = block.type === ET.CHARACTER;
  const isTrans = block.type === ET.TRANSITION;

  return (
    <div style={{ position: "relative", padding: "1px 0", background: isActive ? bgHover : "transparent", borderRadius: "2px" }}>

      {/* Scene number */}
      {showNumbers && block.type === ET.SCENE && sceneNum != null && (
        <span style={{
          position: "absolute", left: "-44px", top: "3px",
          fontFamily: "'Courier Prime', monospace", fontSize: "9px",
          color: accent, userSelect: "none",
        }}>{sceneNum}.</span>
      )}

      {/* Active type label — right gutter */}
      {isActive && (
        <span style={{
          position: "absolute", right: "-82px", top: "3px",
          fontFamily: "'Courier Prime', monospace", fontSize: "8.5px",
          color: accent, textTransform: "uppercase", letterSpacing: "0.07em",
          whiteSpace: "nowrap", userSelect: "none", opacity: 0.85,
        }}>{cfg.label}</span>
      )}

      {/* The textarea */}
      <div style={{ marginLeft: cfg.ml, width: cfg.w, position: "relative" }}>
        <textarea
          ref={blockRef}
          value={cfg.upper ? block.text.toUpperCase() : block.text}
          onChange={e => onChange(block.id, cfg.upper ? e.target.value.toUpperCase() : e.target.value)}
          onKeyDown={handleKey}
          onFocus={() => onFocus(block.id)}
          placeholder={cfg.placeholder}
          rows={1}
          spellCheck
          style={{
            display: "block", width: "100%",
            fontFamily: "'Courier Prime', 'Courier New', Courier, monospace",
            fontSize: "12pt", lineHeight: "1.6",
            color: textColor,
            fontWeight: cfg.bold ? "bold" : "normal",
            fontStyle: block.type === ET.PAREN ? "italic" : "normal",
            textAlign: cfg.align,
            textDecoration: block.type === ET.SCENE ? "underline" : "none",
            textUnderlineOffset: "3px",
            background: "transparent", border: "none", outline: "none",
            resize: "none", padding: "0", overflow: "hidden", boxSizing: "border-box",
            caretColor: isDark ? "#fff" : "#000",
            letterSpacing: block.type === ET.SCENE ? "0.04em" : "0",
          }}
          onInput={e => { e.target.style.height = "auto"; e.target.style.height = e.target.scrollHeight + "px"; }}
        />

        {/* ── SUGGESTION DROPDOWN ─────────────────────────────── */}
        {isActive && suggestions.length > 0 && (
          <div style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: isChar ? "50%" : isTrans ? "auto" : "0",
            right: isTrans ? "0" : "auto",
            transform: isChar ? "translateX(-50%)" : "none",
            minWidth: "170px",
            maxWidth: "300px",
            background: dropBg,
            border: `1px solid ${dropBorder}`,
            borderTop: `2px solid ${accent}`,
            borderRadius: "0 0 6px 6px",
            boxShadow: isDark
              ? "0 12px 32px rgba(0,0,0,0.7), 0 2px 8px rgba(0,0,0,0.4)"
              : "0 8px 24px rgba(0,0,0,0.13)",
            zIndex: 999,
            overflow: "hidden",
          }}>
            {/* Hint header */}
            <div style={{
              padding: "4px 12px",
              background: isDark ? "#141820" : "#f5f7fb",
              borderBottom: `1px solid ${dropBorder}`,
              fontFamily: "'Courier Prime', monospace",
              fontSize: "8px", letterSpacing: "0.09em", textTransform: "uppercase",
              color: mutedColor,
              display: "flex", justifyContent: "space-between",
            }}>
              <span>{suggestions[0]?.hint || "Suggestions"}</span>
              <span style={{ opacity: 0.6 }}>↑↓ Tab/↵ · Esc</span>
            </div>

            {suggestions.map((s, i) => (
              <div
                key={i}
                onMouseDown={e => { e.preventDefault(); apply(s); }}
                style={{
                  display: "flex", alignItems: "center", gap: "10px",
                  padding: "7px 12px",
                  background: i === selIdx ? dropHover : "transparent",
                  borderLeft: i === selIdx ? `2px solid ${accent}` : "2px solid transparent",
                  cursor: "pointer",
                  transition: "background 0.08s, border-color 0.08s",
                }}
              >
                {/* Bullet */}
                <span style={{
                  width: "5px", height: "5px", borderRadius: "50%",
                  background: i === selIdx ? accent : mutedColor,
                  flexShrink: 0, transition: "background 0.08s",
                }} />
                {/* Label */}
                <span style={{
                  fontFamily: "'Courier Prime', monospace",
                  fontSize: "11.5px",
                  color: i === selIdx ? (isDark ? "#e8d5b0" : "#5a3e00") : dropText,
                  fontWeight: i === selIdx ? "bold" : "normal",
                  letterSpacing: block.type === ET.CHARACTER || block.type === ET.SCENE || block.type === ET.TRANSITION
                    ? "0.06em" : "0",
                  textTransform: block.type === ET.CHARACTER || block.type === ET.SCENE || block.type === ET.TRANSITION
                    ? "uppercase" : "none",
                  flex: 1,
                }}>{s.label}</span>
                {/* Enter badge on selected */}
                {i === selIdx && (
                  <span style={{
                    fontFamily: "monospace", fontSize: "9px",
                    background: isDark ? "#0e1118" : "#eaecf2",
                    color: mutedColor,
                    padding: "1px 5px", borderRadius: "3px",
                    flexShrink: 0,
                  }}>↵</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function ScreenplayApp() {
  const [isDark, setIsDark] = useState(true);
  const [scripts, setScripts] = useState([
    { id: "s1", title: "Untitled Screenplay", blocks: [mkBlock(ET.SCENE)], createdAt: Date.now() },
  ]);
  const [activeId, setActiveId] = useState("s1");
  const [activeBlockId, setActiveBlockId] = useState(null);
  const [saveStatus, setSaveStatus] = useState("saved");
  const [showSidebar, setShowSidebar] = useState(true);
  const [showScriptList, setShowScriptList] = useState(false);
  const [showTitleModal, setShowTitleModal] = useState(false);
  const [titleData, setTitleData] = useState({ title: "", author: "", contact: "" });
  const [showNumbers, setShowNumbers] = useState(false);
  const [sideTab, setSideTab] = useState("elements"); // elements | scenes | chars
  const blockRefs = useRef({});
  const saveTimer = useRef(null);

  const script = scripts.find(s => s.id === activeId);
  const blocks = script?.blocks || [];

  // Hydrate
  useEffect(() => {
    hydrate().then(d => {
      if (d?.scripts?.length) { setScripts(d.scripts); setActiveId(d.activeId || d.scripts[0].id); }
      if (d?.titleData) setTitleData(d.titleData);
    });
  }, []);

  // Autosave (5 s debounce)
  useEffect(() => {
    setSaveStatus("unsaved");
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      persist({ scripts, activeId, titleData });
      setSaveStatus("saved");
    }, 5000);
    return () => clearTimeout(saveTimer.current);
  }, [scripts, activeId, titleData]);

  const updateBlock = useCallback((id, text) => {
    const auto = autoDetectType(text);
    setScripts(p => p.map(s => s.id !== activeId ? s : {
      ...s,
      blocks: s.blocks.map(b => b.id === id ? { ...b, text, type: auto || b.type } : b),
    }));
  }, [activeId]);

  const setBlockType = useCallback((id, type) => {
    setScripts(p => p.map(s => s.id !== activeId ? s : {
      ...s,
      blocks: s.blocks.map(b => b.id === id ? { ...b, type } : b),
    }));
  }, [activeId]);

  const nextType = t => ({
    [ET.SCENE]: ET.ACTION, [ET.ACTION]: ET.ACTION,
    [ET.CHARACTER]: ET.DIALOGUE, [ET.DIALOGUE]: ET.DIALOGUE,
    [ET.PAREN]: ET.DIALOGUE, [ET.TRANSITION]: ET.SCENE,
  }[t] || ET.ACTION);

  const insertAfter = useCallback((afterId, type) => {
    const nb = mkBlock(type);
    setScripts(p => p.map(s => {
      if (s.id !== activeId) return s;
      const idx = s.blocks.findIndex(b => b.id === afterId);
      const arr = [...s.blocks];
      arr.splice(idx + 1, 0, nb);
      return { ...s, blocks: arr };
    }));
    setActiveBlockId(nb.id);
    setTimeout(() => blockRefs.current[nb.id]?.focus(), 15);
  }, [activeId]);

  const handleKeyDown = useCallback((e, blockId) => {
    const block = blocks.find(b => b.id === blockId);
    if (!block) return;
    const idx = blocks.findIndex(b => b.id === blockId);

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      // Double-enter on empty dialogue → action
      if (block.type === ET.DIALOGUE && block.text.trim() === "") {
        setScripts(p => p.map(s => {
          if (s.id !== activeId) return s;
          const nb = mkBlock(ET.ACTION);
          const arr = s.blocks.filter(b => b.id !== blockId);
          arr.splice(idx, 0, nb);
          setActiveBlockId(nb.id);
          setTimeout(() => blockRefs.current[nb.id]?.focus(), 15);
          return { ...s, blocks: arr };
        }));
        return;
      }
      insertAfter(blockId, nextType(block.type));
      return;
    }

    if (e.key === "Tab") {
      e.preventDefault();
      const ci = TAB_ORDER.indexOf(block.type);
      setBlockType(blockId, TAB_ORDER[(ci + 1) % TAB_ORDER.length]);
      return;
    }

    if (e.key === "Backspace" && block.text === "") {
      e.preventDefault();
      if (idx > 0) {
        const prev = blocks[idx - 1];
        setScripts(p => p.map(s => s.id !== activeId ? s : { ...s, blocks: s.blocks.filter(b => b.id !== blockId) }));
        setActiveBlockId(prev.id);
        setTimeout(() => blockRefs.current[prev.id]?.focus(), 15);
      }
      return;
    }

    if (e.key === "ArrowUp" && idx > 0) { e.preventDefault(); blockRefs.current[blocks[idx - 1].id]?.focus(); }
    if (e.key === "ArrowDown" && idx < blocks.length - 1) { e.preventDefault(); blockRefs.current[blocks[idx + 1].id]?.focus(); }
  }, [blocks, activeId, insertAfter, setBlockType]);

  // Stats
  const wordCount = blocks.reduce((a, b) => a + b.text.split(/\s+/).filter(Boolean).length, 0);
  const sceneBlocks = blocks.filter(b => b.type === ET.SCENE && b.text.trim());
  const characters = [...new Set(blocks.filter(b => b.type === ET.CHARACTER && b.text.trim()).map(b => b.text.trim().toUpperCase()))];
  const pageEst = Math.max(1, Math.ceil(blocks.reduce((a, b) => a + Math.max(1, Math.ceil(b.text.length / 65)), 0) / 55));

  const newScript = () => {
    const ns = { id: uid(), title: "Untitled Screenplay", blocks: [mkBlock(ET.SCENE)], createdAt: Date.now() };
    setScripts(p => [...p, ns]);
    setActiveId(ns.id);
    setShowScriptList(false);
  };

  const manualSave = () => {
    clearTimeout(saveTimer.current);
    persist({ scripts, activeId, titleData });
    setSaveStatus("saved");
  };

  const activeBlock = blocks.find(b => b.id === activeBlockId);

  // Scene-number map
  let sceneN = 0;
  const sceneNumMap = {};
  blocks.forEach(b => { if (b.type === ET.SCENE && b.text.trim()) sceneNumMap[b.id] = ++sceneN; });

  // ── Theme ──────────────────────────────────────────────────────────────────
  const bg = isDark ? "#111" : "#f5f5f0";
  const surface = isDark ? "#1a1a1a" : "#ffffff";
  const border = isDark ? "#2a2a2a" : "#e0e0e0";
  const text = isDark ? "#e0e0e0" : "#1a1a1a";
  const muted = isDark ? "#555" : "#999";
  const accent = isDark ? "#c8a96e" : "#8b6914";
  const pageBg = isDark ? "#1c1c1c" : "#ffffff";
  const pageShadow = isDark
    ? "0 0 0 1px #2a2a2a, 0 20px 60px rgba(0,0,0,0.6)"
    : "0 0 0 1px #ddd, 0 20px 60px rgba(0,0,0,0.15)";

  return (
    <div style={{ minHeight: "100vh", background: bg, color: text, fontFamily: "'Courier Prime', monospace", display: "flex", flexDirection: "column" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Courier+Prime:ital,wght@0,400;0,700;1,400&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        textarea { font-family: 'Courier Prime','Courier New',Courier,monospace !important; }
        textarea::placeholder { color: ${isDark ? "#2e2e2e" : "#ccc"}; font-style: italic; }
        textarea:focus { outline: none; }
        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: ${border}; border-radius: 9px; }

        .tb-btn {
          background: transparent;
          border: 1px solid ${border};
          color: ${muted};
          font-family: 'Courier Prime', monospace;
          font-size: 10.5px;
          padding: 4px 11px;
          cursor: pointer;
          border-radius: 2px;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          transition: all 0.14s;
          white-space: nowrap;
        }
        .tb-btn:hover  { border-color: ${accent}; color: ${accent}; background: ${isDark ? "#1e1e1e" : "#f0ede8"}; }
        .tb-btn.on     { background: ${accent}; border-color: ${accent}; color: ${isDark ? "#111" : "#fff"}; }

        .side-tab {
          font-family: 'Courier Prime', monospace;
          font-size: 9px; letter-spacing: 0.08em; text-transform: uppercase;
          padding: 3px 8px; cursor: pointer; border-radius: 2px;
          color: ${muted}; transition: all 0.12s; border: none; background: transparent;
        }
        .side-tab.on { color: ${accent}; }
        .side-tab:hover:not(.on) { color: ${text}; }

        .el-row {
          display: flex; align-items: center; gap: 8px;
          padding: 6px 10px; border-radius: 3px; cursor: pointer;
          font-family: 'Courier Prime', monospace; font-size: 10px;
          letter-spacing: 0.05em; text-transform: uppercase;
          border: 1px solid transparent; transition: all 0.1s; margin-bottom: 2px;
        }
        .el-row:hover { background: ${isDark ? "#222" : "#f2ede8"}; }
        .el-row.on    { border-color: ${accent}30; background: ${isDark ? "#1e1a14" : "#faf5ec"}; color: ${accent}; }

        .sc-row {
          padding: 5px 10px; font-family: 'Courier Prime', monospace; font-size: 9.5px;
          color: ${muted}; cursor: pointer; border-radius: 2px; letter-spacing: 0.03em;
          border-left: 2px solid transparent; transition: all 0.1s;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
          text-transform: uppercase;
        }
        .sc-row:hover { background: ${isDark ? "#222" : "#f2ede8"}; color: ${text}; border-color: ${accent}; }

        .ch-pill {
          padding: 5px 10px; font-family: 'Courier Prime', monospace; font-size: 9.5px;
          font-weight: bold; letter-spacing: 0.08em; text-transform: uppercase;
          color: ${accent}; border-radius: 2px; cursor: default;
          border: 1px solid ${isDark ? "#2a2a2a" : "#e8dfc8"};
          background: ${isDark ? "#1a1812" : "#fdf8f0"};
          display: flex; justify-content: space-between; align-items: center;
          margin-bottom: 3px;
        }

        .script-row {
          padding: 8px 12px; cursor: pointer;
          font-family: 'Courier Prime', monospace; font-size: 10.5px; letter-spacing: 0.03em;
          border-bottom: 1px solid ${border}; display: flex; justify-content: space-between; align-items: center;
          transition: background 0.1s; color: ${text};
        }
        .script-row:hover { background: ${isDark ? "#1e1e1e" : "#f5f0e8"}; }
        .script-row.active-s { color: ${accent}; }

        @media print {
          @page { size: letter; margin: 1in 1in 1in 1.5in; }
          body > * { display: none !important; }
          .print-zone { display: block !important; }
        }
      `}</style>

      {/* ══ TOOLBAR ══════════════════════════════════════════════════════════ */}
      <div style={{
        height: "44px", background: surface, borderBottom: `1px solid ${border}`,
        display: "flex", alignItems: "center", padding: "0 16px", gap: "7px",
        position: "sticky", top: 0, zIndex: 200,
      }}>
        {/* Logo */}
        <span style={{ color: accent, fontWeight: "bold", fontSize: "13px", letterSpacing: "0.14em", marginRight: "6px", fontFamily: "'Courier Prime', monospace" }}>
          SCRIPT
        </span>
        <div style={{ width: "1px", height: "22px", background: border }} />

        <button className="tb-btn" onClick={() => setShowScriptList(v => !v)}>Scripts</button>
        <button className="tb-btn" onClick={newScript}>New</button>
        <button className="tb-btn" onClick={manualSave}>{saveStatus === "saved" ? "Saved ✓" : "Save"}</button>
        <button className="tb-btn" onClick={() => window.print()}>Export PDF</button>
        <button className="tb-btn" onClick={() => setShowTitleModal(v => !v)}>Title Page</button>

        <div style={{ flex: 1 }} />

        {/* Editable script title */}
        <input
          value={script?.title || ""}
          onChange={e => setScripts(p => p.map(s => s.id === activeId ? { ...s, title: e.target.value } : s))}
          style={{
            background: "transparent", border: "none",
            borderBottom: `1px solid ${border}`,
            color: text, fontFamily: "'Courier Prime', monospace",
            fontSize: "10.5px", letterSpacing: "0.05em",
            textAlign: "center", width: "210px", padding: "2px 6px",
          }}
        />

        <div style={{ flex: 1 }} />

        <span style={{ fontFamily: "'Courier Prime', monospace", fontSize: "10px", color: muted, letterSpacing: "0.04em" }}>
          {pageEst}p · ~{pageEst}min · {wordCount}w
        </span>

        <div style={{ width: "1px", height: "22px", background: border }} />
        <button className={`tb-btn ${showNumbers ? "on" : ""}`} onClick={() => setShowNumbers(v => !v)}># Scenes</button>
        <button className={`tb-btn ${showSidebar ? "on" : ""}`} onClick={() => setShowSidebar(v => !v)}>Panel</button>
        <button className="tb-btn" onClick={() => setIsDark(v => !v)}>{isDark ? "Light" : "Dark"}</button>
      </div>

      {/* ══ SCRIPTS DROPDOWN ════════════════════════════════════════════════ */}
      {showScriptList && (
        <div onClick={() => setShowScriptList(false)}
          style={{ position: "fixed", inset: 0, zIndex: 290 }}>
          <div onClick={e => e.stopPropagation()} style={{
            position: "absolute", top: "44px", left: "68px",
            width: "240px", background: surface,
            border: `1px solid ${border}`, borderTop: "none",
            boxShadow: isDark ? "4px 4px 20px rgba(0,0,0,0.5)" : "4px 4px 16px rgba(0,0,0,0.12)",
            maxHeight: "320px", overflow: "auto", zIndex: 291,
          }}>
            <div style={{ padding: "8px 12px", borderBottom: `1px solid ${border}`, fontFamily: "'Courier Prime', monospace", fontSize: "9px", color: muted, letterSpacing: "0.1em", textTransform: "uppercase" }}>
              Your Scripts
            </div>
            {scripts.map(s => (
              <div key={s.id} className={`script-row ${s.id === activeId ? "active-s" : ""}`}
                onClick={() => { setActiveId(s.id); setShowScriptList(false); }}>
                <span>{s.title || "Untitled"}</span>
                {scripts.length > 1 && (
                  <span onClick={e => { e.stopPropagation(); setScripts(p => p.filter(x => x.id !== s.id)); if (activeId === s.id) setActiveId(scripts[0].id); }}
                    style={{ color: muted, fontSize: "10px", cursor: "pointer", padding: "2px 5px" }}>✕</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ══ TITLE PAGE MODAL ════════════════════════════════════════════════ */}
      {showTitleModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 400, display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => setShowTitleModal(false)}>
          <div style={{
            background: surface, border: `1px solid ${border}`,
            borderTop: `2px solid ${accent}`,
            padding: "32px", width: "380px",
            boxShadow: "0 30px 70px rgba(0,0,0,0.6)",
          }} onClick={e => e.stopPropagation()}>
            <div style={{ fontFamily: "'Courier Prime', monospace", fontSize: "11px", letterSpacing: "0.1em", textTransform: "uppercase", color: accent, marginBottom: "20px" }}>
              Title Page
            </div>
            {[["title", "Script Title"], ["author", "Written By"], ["contact", "Contact / WGA"]].map(([f, lbl]) => (
              <div key={f} style={{ marginBottom: "14px" }}>
                <label style={{ fontFamily: "'Courier Prime', monospace", fontSize: "9px", color: muted, textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: "5px" }}>{lbl}</label>
                <input value={titleData[f]} onChange={e => setTitleData(p => ({ ...p, [f]: e.target.value }))}
                  style={{ width: "100%", background: isDark ? "#111" : "#fafafa", border: `1px solid ${border}`, color: text, fontFamily: "'Courier Prime', monospace", fontSize: "12px", padding: "7px 10px", borderRadius: "2px" }} />
              </div>
            ))}
            <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
              <button className="tb-btn on" onClick={() => setShowTitleModal(false)}>Done</button>
              <button className="tb-btn" onClick={() => setShowTitleModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ══ BODY ════════════════════════════════════════════════════════════ */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

        {/* ── LEFT SIDEBAR ───────────────────────────────────────────────── */}
        {showSidebar && (
          <div style={{
            width: "168px", background: surface, borderRight: `1px solid ${border}`,
            display: "flex", flexDirection: "column", flexShrink: 0, overflow: "hidden",
          }}>
            {/* Tabs */}
            <div style={{ padding: "7px 10px", borderBottom: `1px solid ${border}`, display: "flex", gap: "2px" }}>
              {[["elements", "EL"], ["scenes", "SC"], ["chars", "CH"]].map(([t, l]) => (
                <button key={t} className={`side-tab ${sideTab === t ? "on" : ""}`} onClick={() => setSideTab(t)}>{l}</button>
              ))}
            </div>

            <div style={{ flex: 1, overflow: "auto", padding: "10px 8px" }}>

              {/* ELEMENTS TAB */}
              {sideTab === "elements" && (
                <>
                  <div style={{ fontFamily: "'Courier Prime', monospace", fontSize: "8.5px", color: muted, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "8px", padding: "0 4px" }}>
                    Element Type
                  </div>
                  {Object.entries(EL_CFG).map(([key, cfg]) => (
                    <div key={key}
                      className={`el-row ${activeBlock?.type === key ? "on" : ""}`}
                      onClick={() => activeBlock && setBlockType(activeBlock.id, key)}>
                      <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: accent, opacity: activeBlock?.type === key ? 1 : 0.3, flexShrink: 0 }} />
                      <span style={{ color: activeBlock?.type === key ? accent : muted, fontSize: "9px" }}>{cfg.label}</span>
                    </div>
                  ))}

                  <div style={{ marginTop: "18px", padding: "0 4px" }}>
                    <div style={{ fontFamily: "'Courier Prime', monospace", fontSize: "8.5px", color: muted, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "10px" }}>Shortcuts</div>
                    {[["Tab", "Cycle type"], ["Enter", "Next element"], ["↑↓", "Navigate"], ["Bksp", "Delete empty"], ["Esc", "Close suggest"]].map(([k, v]) => (
                      <div key={k} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "5px" }}>
                        <span style={{ fontFamily: "'Courier Prime', monospace", fontSize: "9px", background: isDark ? "#1e1a14" : "#faf5ec", color: accent, padding: "1px 6px", borderRadius: "2px", border: `1px solid ${isDark ? "#2a2518" : "#e8dfc8"}` }}>{k}</span>
                        <span style={{ fontFamily: "'Courier Prime', monospace", fontSize: "9px", color: muted }}>{v}</span>
                      </div>
                    ))}
                  </div>

                  {/* Suggestion preview */}
                  <div style={{ marginTop: "18px", padding: "8px", background: isDark ? "#141210" : "#faf5ec", border: `1px solid ${isDark ? "#2a2518" : "#e8dfc8"}`, borderRadius: "2px" }}>
                    <div style={{ fontFamily: "'Courier Prime', monospace", fontSize: "8px", color: accent, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "6px" }}>Smart Suggest</div>
                    <div style={{ fontFamily: "'Courier Prime', monospace", fontSize: "8.5px", color: muted, lineHeight: "1.7" }}>
                      • Scene → time of day<br />
                      • Character → known names<br />
                      • Transition → formats
                    </div>
                  </div>
                </>
              )}

              {/* SCENES TAB */}
              {sideTab === "scenes" && (
                <>
                  <div style={{ fontFamily: "'Courier Prime', monospace", fontSize: "8.5px", color: muted, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "8px", padding: "0 4px" }}>
                    {sceneBlocks.length} Scene{sceneBlocks.length !== 1 ? "s" : ""}
                  </div>
                  {sceneBlocks.map((b, i) => (
                    <div key={b.id} className="sc-row"
                      onClick={() => { setActiveBlockId(b.id); blockRefs.current[b.id]?.scrollIntoView({ behavior: "smooth", block: "center" }); blockRefs.current[b.id]?.focus(); }}>
                      <span style={{ color: accent, marginRight: "6px", fontWeight: "bold" }}>{i + 1}.</span>
                      {b.text.slice(0, 22)}{b.text.length > 22 ? "…" : ""}
                    </div>
                  ))}
                  {sceneBlocks.length === 0 && (
                    <div style={{ fontFamily: "'Courier Prime', monospace", fontSize: "9px", color: muted, padding: "0 4px", fontStyle: "italic" }}>
                      No scenes yet.<br />Start with INT. or EXT.
                    </div>
                  )}
                </>
              )}

              {/* CHARACTERS TAB */}
              {sideTab === "chars" && (
                <>
                  <div style={{ fontFamily: "'Courier Prime', monospace", fontSize: "8.5px", color: muted, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "8px", padding: "0 4px" }}>
                    {characters.length} Character{characters.length !== 1 ? "s" : ""}
                  </div>
                  {characters.map(c => {
                    const cnt = blocks.filter(b => b.type === ET.CHARACTER && b.text.trim().toUpperCase() === c).length;
                    return (
                      <div key={c} className="ch-pill">
                        <span>{c}</span>
                        <span style={{ color: muted, fontSize: "8.5px", fontWeight: "normal" }}>{cnt}×</span>
                      </div>
                    );
                  })}
                  {characters.length === 0 && (
                    <div style={{ fontFamily: "'Courier Prime', monospace", fontSize: "9px", color: muted, padding: "0 4px", fontStyle: "italic" }}>
                      No characters yet.<br />Character names auto-populate as you write.
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {/* ── EDITOR CANVAS ──────────────────────────────────────────────── */}
        <div style={{ flex: 1, overflow: "auto", display: "flex", justifyContent: "center", padding: "44px 80px 80px", background: bg }}>
          <div style={{ width: "100%", maxWidth: "790px" }}>

            {/* Title page preview */}
            {titleData.title && (
              <div style={{
                background: pageBg, boxShadow: pageShadow,
                padding: "96px 96px 96px 144px", marginBottom: "24px",
                fontFamily: "'Courier Prime', monospace", fontSize: "12pt",
                color: text, textAlign: "center", minHeight: "320px",
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              }}>
                <div style={{ fontSize: "14pt", fontWeight: "bold", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: "40px", borderBottom: `1px solid ${border}`, paddingBottom: "20px", width: "100%" }}>
                  {titleData.title}
                </div>
                {titleData.author && <div style={{ lineHeight: 2 }}>Written by<br /><strong>{titleData.author}</strong></div>}
                {titleData.contact && <div style={{ marginTop: "40px", fontSize: "9.5pt", color: muted }}>{titleData.contact}</div>}
              </div>
            )}

            {/* ── THE SCRIPT PAGE ─────────────────────────────────────── */}
            <div style={{
              background: pageBg, boxShadow: pageShadow,
              padding: "96px 96px 96px 144px",
              position: "relative", minHeight: "1100px",
            }}>
              {/* Page number */}
              <div style={{
                position: "absolute", top: "48px", right: "96px",
                fontFamily: "'Courier Prime', monospace", fontSize: "12pt", color: muted,
              }}>1.</div>

              {/* Subtle horizontal rule lines */}
              <div style={{
                position: "absolute", inset: 0, pointerEvents: "none",
                backgroundImage: `repeating-linear-gradient(to bottom, transparent, transparent 31.4px, ${isDark ? "rgba(255,255,255,0.018)" : "rgba(0,0,0,0.025)"} 31.4px, ${isDark ? "rgba(255,255,255,0.018)" : "rgba(0,0,0,0.025)"} 31.5px)`,
              }} />

              <div style={{ position: "relative" }}>
                {blocks.map((b, i) => (
                  <Block
                    key={b.id}
                    block={b}
                    isActive={activeBlockId === b.id}
                    isDark={isDark}
                    allBlocks={blocks}
                    onChange={updateBlock}
                    onKeyDown={handleKeyDown}
                    onFocus={setActiveBlockId}
                    blockRef={el => {
                      blockRefs.current[b.id] = el;
                      if (el) { el.style.height = "auto"; el.style.height = el.scrollHeight + "px"; }
                    }}
                    showNumbers={showNumbers}
                    sceneNum={sceneNumMap[b.id]}
                  />
                ))}

                {blocks.length === 0 && (
                  <div style={{ color: muted, fontStyle: "italic", cursor: "pointer", fontSize: "12pt" }}
                    onClick={() => {
                      const b = mkBlock(ET.SCENE);
                      setScripts(p => p.map(s => s.id === activeId ? { ...s, blocks: [b] } : s));
                      setTimeout(() => blockRefs.current[b.id]?.focus(), 15);
                    }}>
                    Click here to begin writing your screenplay...
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ══ STATUS BAR ══════════════════════════════════════════════════════ */}
      <div style={{
        height: "26px", background: surface, borderTop: `1px solid ${border}`,
        display: "flex", alignItems: "center", padding: "0 16px", gap: "14px",
      }}>
        {activeBlock && (
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <div style={{ width: "5px", height: "5px", borderRadius: "50%", background: accent }} />
            <span style={{ fontFamily: "'Courier Prime', monospace", fontSize: "9.5px", color: text, letterSpacing: "0.05em", textTransform: "uppercase" }}>
              {EL_CFG[activeBlock.type]?.label}
            </span>
          </div>
        )}
        <div style={{ width: "1px", height: "14px", background: border }} />
        <span style={{ fontFamily: "'Courier Prime', monospace", fontSize: "9.5px", color: muted }}>{blocks.length} elements</span>
        <span style={{ fontFamily: "'Courier Prime', monospace", fontSize: "9.5px", color: muted }}>{sceneBlocks.length} scenes</span>
        <span style={{ fontFamily: "'Courier Prime', monospace", fontSize: "9.5px", color: muted }}>{characters.length} characters</span>
        <div style={{ flex: 1 }} />
        <span style={{
          fontFamily: "'Courier Prime', monospace", fontSize: "9.5px", letterSpacing: "0.04em",
          color: saveStatus === "saved" ? (isDark ? "#5a8a5a" : "#3a7a3a") : accent
        }}>
          {saveStatus === "saved" ? "● autosaved" : "○ saving…"}
        </span>
        <div style={{ width: "1px", height: "14px", background: border }} />
        <span style={{ fontFamily: "'Courier Prime', monospace", fontSize: "9.5px", color: muted, letterSpacing: "0.04em" }}>Courier 12pt · US Letter</span>
      </div>
    </div>
  );
}
