import { useState, useEffect, useRef, useCallback, useMemo } from "react";

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const NOTES = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
const OCTAVES = [7,6,5,4,3,2,1];
const ALL_NOTES = OCTAVES.flatMap(o => [...NOTES].reverse().map(n => `${n}${o}`));
const NOTE_FREQS = {};
ALL_NOTES.forEach(note => {
  const n = note.slice(0,-1), o = parseInt(note.slice(-1));
  const idx = NOTES.indexOf(n);
  NOTE_FREQS[note] = 440 * Math.pow(2, (idx - 9 + (o - 4) * 12) / 12);
});

const DRUM_PADS = [
  { name:"KICK",  color:"#ff4d4d", type:"kick"  },
  { name:"SNARE", color:"#ffaa00", type:"snare" },
  { name:"HIHAT", color:"#00e5ff", type:"hihat" },
  { name:"CLAP",  color:"#b44dff", type:"clap"  },
  { name:"OPEN",  color:"#00ff9f", type:"open"  },
  { name:"RIDE",  color:"#ff69b4", type:"ride"  },
];
const BEAT_STEPS = 16;
const PIANO_ROLL_COLS = 32;
const CELL_W = 28;
const CELL_H = 14;

const TRACK_COLORS = ["#ff4d4d","#ffaa00","#00e5ff","#b44dff","#00ff9f","#ff69b4","#7fffd4","#ffd700"];

// ─── AUDIO ENGINE ─────────────────────────────────────────────────────────────
let _ctx = null;
let _master = null;
function getAudio() {
  if (!_ctx) {
    _ctx = new (window.AudioContext || window.webkitAudioContext)();
    _master = _ctx.createGain();
    _master.gain.value = 0.7;
    _master.connect(_ctx.destination);
  }
  return { ctx: _ctx, master: _master };
}

function playNote(freq, duration = 0.3, synth = {}) {
  const { ctx, master } = getAudio();
  if (ctx.state === "suspended") ctx.resume();
  const { wave = "sawtooth", attack = 0.01, decay = 0.1, sustain = 0.6, release = 0.2, cutoff = 2000, filterType = "lowpass" } = synth;
  const osc = ctx.createOscillator();
  const envGain = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  filter.type = filterType;
  filter.frequency.value = cutoff;
  osc.type = wave;
  osc.frequency.value = freq;
  osc.connect(filter);
  filter.connect(envGain);
  envGain.connect(master);
  const now = ctx.currentTime;
  envGain.gain.setValueAtTime(0, now);
  envGain.gain.linearRampToValueAtTime(0.8, now + attack);
  envGain.gain.linearRampToValueAtTime(sustain * 0.8, now + attack + decay);
  envGain.gain.setValueAtTime(sustain * 0.8, now + duration - release);
  envGain.gain.linearRampToValueAtTime(0, now + duration + release);
  osc.start(now);
  osc.stop(now + duration + release + 0.05);
}

function playDrum(type) {
  const { ctx, master } = getAudio();
  if (ctx.state === "suspended") ctx.resume();
  const g = ctx.createGain();
  g.connect(master);
  const now = ctx.currentTime;
  if (type === "kick") {
    const o = ctx.createOscillator();
    o.connect(g);
    o.frequency.setValueAtTime(120, now);
    o.frequency.exponentialRampToValueAtTime(20, now + 0.5);
    g.gain.setValueAtTime(1, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
    o.start(now); o.stop(now + 0.5);
  } else if (type === "snare") {
    const buf = ctx.createBuffer(1, ctx.sampleRate * 0.15, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const s = ctx.createBufferSource(); s.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = 1500;
    s.connect(f); f.connect(g);
    g.gain.setValueAtTime(0.8, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    s.start(now); s.stop(now + 0.15);
  } else if (type === "hihat") {
    const buf = ctx.createBuffer(1, ctx.sampleRate * 0.04, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const s = ctx.createBufferSource(); s.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = "highpass"; f.frequency.value = 8000;
    s.connect(f); f.connect(g);
    g.gain.setValueAtTime(0.4, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
    s.start(now); s.stop(now + 0.04);
  } else if (type === "clap") {
    for (let i = 0; i < 3; i++) {
      const buf = ctx.createBuffer(1, ctx.sampleRate * 0.04, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let j = 0; j < d.length; j++) d[j] = Math.random() * 2 - 1;
      const s = ctx.createBufferSource(); s.buffer = buf;
      const gg = ctx.createGain(); gg.connect(master);
      gg.gain.setValueAtTime(0.5, now + i * 0.012);
      gg.gain.exponentialRampToValueAtTime(0.001, now + i * 0.012 + 0.04);
      s.connect(gg); s.start(now + i * 0.012); s.stop(now + i * 0.012 + 0.04);
    }
  } else if (type === "open") {
    const buf = ctx.createBuffer(1, ctx.sampleRate * 0.3, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const s = ctx.createBufferSource(); s.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = "highpass"; f.frequency.value = 6000;
    s.connect(f); f.connect(g);
    g.gain.setValueAtTime(0.4, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    s.start(now); s.stop(now + 0.3);
  } else if (type === "ride") {
    const buf = ctx.createBuffer(1, ctx.sampleRate * 0.2, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const s = ctx.createBufferSource(); s.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = 5000; f.Q.value = 0.5;
    s.connect(f); f.connect(g);
    g.gain.setValueAtTime(0.35, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    s.start(now); s.stop(now + 0.2);
  }
}

// ─── PIANO KEY ───────────────────────────────────────────────────────────────
function PianoKey({ note, onPlay, synth }) {
  const isBlack = note.includes("#");
  return (
    <div onClick={() => { onPlay && onPlay(note); playNote(NOTE_FREQS[note], 0.4, synth); }}
      style={{
        height: CELL_H,
        background: isBlack ? "#111" : "#f0f0f0",
        border: "1px solid #222",
        borderRight: "1px solid #333",
        cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "flex-end",
        paddingRight: 3,
        fontSize: 8,
        color: isBlack ? "#666" : "#aaa",
        flexShrink: 0,
        transition: "filter 0.05s",
        userSelect: "none"
      }}
      onMouseDown={e => e.currentTarget.style.filter = "brightness(0.7)"}
      onMouseUp={e => e.currentTarget.style.filter = ""}
    >
      {note.replace("#","♯")}
    </div>
  );
}

// ─── PIANO ROLL ───────────────────────────────────────────────────────────────
function PianoRoll({ notes, onChange, synth }) {
  // notes = Set of "noteIndex_col"
  const toggle = (ni, ci) => {
    const key = `${ni}_${ci}`;
    const next = new Set(notes);
    if (next.has(key)) next.delete(key);
    else { next.add(key); playNote(NOTE_FREQS[ALL_NOTES[ni]], 0.3, synth); }
    onChange(next);
  };

  return (
    <div style={{ display: "flex", overflow: "auto", maxHeight: 340, border: "1px solid #111" }}>
      {/* Piano keys */}
      <div style={{ width: 44, flexShrink: 0 }}>
        {ALL_NOTES.map((note, ni) => <PianoKey key={note} note={note} synth={synth} />)}
      </div>
      {/* Grid */}
      <div style={{ position: "relative", cursor: "crosshair" }}>
        {ALL_NOTES.map((note, ni) => {
          const isBlack = note.includes("#");
          return (
            <div key={ni} style={{ display: "flex" }}>
              {Array.from({ length: PIANO_ROLL_COLS }).map((_, ci) => {
                const active = notes.has(`${ni}_${ci}`);
                const beat = Math.floor(ci / 4);
                return (
                  <div key={ci} onClick={() => toggle(ni, ci)} style={{
                    width: CELL_W, height: CELL_H, flexShrink: 0,
                    background: active
                      ? "#00e5ff"
                      : isBlack
                        ? ci % 4 === 0 ? "#141420" : "#0f0f1a"
                        : ci % 4 === 0 ? "#1a1a2e" : "#13131f",
                    borderRight: `1px solid ${ci % 4 === 3 ? "#2a2a3e" : "#0d0d18"}`,
                    borderBottom: "1px solid #0d0d18",
                    boxShadow: active ? "inset 0 0 6px rgba(0,229,255,0.4)" : "none",
                    transition: "background 0.05s"
                  }} />
                );
              })}
            </div>
          );
        })}
        {/* Beat markers */}
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "100%", pointerEvents: "none" }}>
          {Array.from({ length: PIANO_ROLL_COLS / 4 }).map((_, i) => (
            <div key={i} style={{
              position: "absolute", left: i * 4 * CELL_W, top: 0, bottom: 0,
              width: 1, background: "#2a2a3e", pointerEvents: "none"
            }} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── BEAT SEQUENCER MINI ──────────────────────────────────────────────────────
function BeatGrid({ grid, onToggle, currentStep, playing }) {
  return (
    <div>
      {DRUM_PADS.map((pad, pi) => (
        <div key={pi} style={{ display: "flex", alignItems: "center", gap: 3, marginBottom: 4 }}>
          <div style={{
            width: 42, fontSize: 8, color: pad.color, fontFamily: "monospace",
            letterSpacing: 1, textAlign: "right", paddingRight: 5, flexShrink: 0
          }}>{pad.name}</div>
          <div style={{ display: "flex", gap: 2 }}>
            {Array.from({ length: BEAT_STEPS }).map((_, si) => {
              const active = grid[pi]?.[si];
              const cur = playing && si === currentStep;
              return (
                <div key={si} onClick={() => onToggle(pi, si)} style={{
                  width: 22, height: 22, borderRadius: 3,
                  background: active ? (cur ? pad.color : `${pad.color}88`) : cur ? "#1a1a2e" : "#0d0d18",
                  border: `1px solid ${active ? pad.color : si % 4 === 0 ? "#1a1a2e" : "#111"}`,
                  cursor: "pointer",
                  boxShadow: active && cur ? `0 0 6px ${pad.color}` : "none",
                  transition: "all 0.05s"
                }} />
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── SYNTH PANEL ─────────────────────────────────────────────────────────────
function SynthPanel({ synth, onChange }) {
  const Knob = ({ label, param, min, max, step = 0.01, color = "#00e5ff", fmt = v => v.toFixed(2) }) => {
    const v = synth[param];
    const pct = ((v - min) / (max - min)) * 100;
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
        <div style={{
          width: 38, height: 38, borderRadius: "50%",
          background: `conic-gradient(${color} 0% ${pct}%, #111 ${pct}% 100%)`,
          display: "flex", alignItems: "center", justifyContent: "center",
          position: "relative", boxShadow: `0 0 6px ${color}33`
        }}>
          <div style={{
            width: 28, height: 28, borderRadius: "50%", background: "#0a0a0f",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 8, color: "#888", fontFamily: "monospace"
          }}>{fmt(v)}</div>
        </div>
        <input type="range" min={min} max={max} step={step} value={v}
          onChange={e => onChange({ ...synth, [param]: parseFloat(e.target.value) })}
          style={{ width: 50, accentColor: color, cursor: "pointer" }} />
        <span style={{ fontSize: 8, color: "#444", letterSpacing: 1, fontFamily: "monospace" }}>{label}</span>
      </div>
    );
  };

  return (
    <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "flex-start" }}>
      {/* Oscillator */}
      <div style={{ background: "#0d0d18", border: "1px solid #1a1a2e", borderRadius: 6, padding: 12 }}>
        <div style={{ fontSize: 9, color: "#444", letterSpacing: 3, marginBottom: 10 }}>OSCILLATOR</div>
        <div style={{ display: "flex", gap: 6 }}>
          {["sine","triangle","sawtooth","square"].map(w => (
            <button key={w} onClick={() => onChange({ ...synth, wave: w })} style={{
              padding: "4px 8px", border: `1px solid ${synth.wave === w ? "#00e5ff" : "#1a1a2e"}`,
              background: synth.wave === w ? "rgba(0,229,255,0.1)" : "transparent",
              color: synth.wave === w ? "#00e5ff" : "#444",
              fontSize: 9, cursor: "pointer", borderRadius: 3, fontFamily: "monospace", letterSpacing: 1
            }}>{w.slice(0,3).toUpperCase()}</button>
          ))}
        </div>
      </div>
      {/* ADSR */}
      <div style={{ background: "#0d0d18", border: "1px solid #1a1a2e", borderRadius: 6, padding: 12 }}>
        <div style={{ fontSize: 9, color: "#444", letterSpacing: 3, marginBottom: 10 }}>ADSR ENVELOPE</div>
        <div style={{ display: "flex", gap: 12 }}>
          <Knob label="ATK" param="attack" min={0.001} max={2} color="#ffaa00" />
          <Knob label="DEC" param="decay" min={0.01} max={2} color="#ff69b4" />
          <Knob label="SUS" param="sustain" min={0} max={1} color="#00ff9f" />
          <Knob label="REL" param="release" min={0.01} max={3} color="#b44dff" />
        </div>
      </div>
      {/* Filter */}
      <div style={{ background: "#0d0d18", border: "1px solid #1a1a2e", borderRadius: 6, padding: 12 }}>
        <div style={{ fontSize: 9, color: "#444", letterSpacing: 3, marginBottom: 10 }}>FILTER</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          {["lowpass","highpass","bandpass"].map(f => (
            <button key={f} onClick={() => onChange({ ...synth, filterType: f })} style={{
              padding: "3px 6px", border: `1px solid ${synth.filterType === f ? "#b44dff" : "#1a1a2e"}`,
              background: synth.filterType === f ? "rgba(180,77,255,0.1)" : "transparent",
              color: synth.filterType === f ? "#b44dff" : "#444",
              fontSize: 8, cursor: "pointer", borderRadius: 3, fontFamily: "monospace"
            }}>{f.slice(0,2).toUpperCase()}</button>
          ))}
        </div>
        <Knob label="CUTOFF" param="cutoff" min={100} max={8000} step={10} color="#b44dff"
          fmt={v => v >= 1000 ? `${(v/1000).toFixed(1)}k` : Math.round(v)} />
      </div>
    </div>
  );
}

// ─── SONG EDITOR ─────────────────────────────────────────────────────────────
function SongEditor({ tracks, patterns, songMap, onToggle, playhead, playing }) {
  const SONG_COLS = 32;
  return (
    <div style={{ overflowX: "auto" }}>
      {tracks.map((track, ti) => (
        <div key={ti} style={{ display: "flex", alignItems: "center", marginBottom: 3 }}>
          <div style={{
            width: 100, flexShrink: 0, fontSize: 9, color: TRACK_COLORS[ti % TRACK_COLORS.length],
            fontFamily: "monospace", letterSpacing: 1, paddingRight: 8, textAlign: "right",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"
          }}>{track.name}</div>
          <div style={{ display: "flex", gap: 2 }}>
            {Array.from({ length: SONG_COLS }).map((_, ci) => {
              const active = songMap[ti]?.[ci];
              const color = TRACK_COLORS[ti % TRACK_COLORS.length];
              const isCursor = playing && ci === playhead;
              return (
                <div key={ci} onClick={() => onToggle(ti, ci)} style={{
                  width: 20, height: 24, borderRadius: 3,
                  background: active ? `${color}88` : isCursor ? "#1a1a2e" : "#0d0d18",
                  border: `1px solid ${active ? color : isCursor ? "#333" : "#111"}`,
                  cursor: "pointer",
                  boxShadow: active && isCursor ? `0 0 8px ${color}` : "none"
                }} />
              );
            })}
          </div>
        </div>
      ))}
      {/* Ruler */}
      <div style={{ display: "flex", marginLeft: 108 }}>
        {Array.from({ length: 32 }).map((_, i) => (
          <div key={i} style={{
            width: 20, textAlign: "center", fontSize: 7, color: i % 4 === 0 ? "#444" : "#222",
            marginRight: 2, fontFamily: "monospace"
          }}>{i % 4 === 0 ? i / 4 + 1 : ""}</div>
        ))}
      </div>
    </div>
  );
}

// ─── MIXER CHANNEL ────────────────────────────────────────────────────────────
function MixerChannel({ track, index, onChange }) {
  const color = TRACK_COLORS[index % TRACK_COLORS.length];
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
      padding: "10px 8px", background: "#0a0a0f",
      border: `1px solid #111`, borderTop: `3px solid ${color}`,
      borderRadius: 4, minWidth: 52
    }}>
      <div style={{ fontSize: 7, color, letterSpacing: 1, fontFamily: "monospace", textAlign: "center",
        maxWidth: 46, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {track.name}
      </div>
      {/* Fader */}
      <div style={{ height: 100, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
        <input type="range" min={0} max={1.5} step={0.01} value={track.volume}
          onChange={e => onChange(index, "volume", parseFloat(e.target.value))}
          style={{ writingMode: "vertical-lr", direction: "rtl", height: 80, accentColor: color, cursor: "pointer" }} />
        <span style={{ fontSize: 8, color: "#444", fontFamily: "monospace" }}>{Math.round(track.volume * 100)}</span>
      </div>
      {/* Pan */}
      <input type="range" min={-1} max={1} step={0.01} value={track.pan || 0}
        onChange={e => onChange(index, "pan", parseFloat(e.target.value))}
        style={{ width: 44, accentColor: "#888", cursor: "pointer" }} />
      <span style={{ fontSize: 7, color: "#333", fontFamily: "monospace" }}>
        {track.pan === 0 || !track.pan ? "C" : track.pan > 0 ? `R${Math.round(track.pan*100)}` : `L${Math.round(-track.pan*100)}`}
      </span>
      {/* Mute/Solo */}
      <button onClick={() => onChange(index, "muted", !track.muted)} style={{
        width: 32, height: 18, border: `1px solid ${track.muted ? "#ff4d4d" : "#222"}`,
        background: track.muted ? "rgba(255,77,77,0.2)" : "transparent",
        color: track.muted ? "#ff4d4d" : "#444", fontSize: 8, cursor: "pointer", borderRadius: 2
      }}>M</button>
      <button onClick={() => onChange(index, "solo", !track.solo)} style={{
        width: 32, height: 18, border: `1px solid ${track.solo ? "#ffaa00" : "#222"}`,
        background: track.solo ? "rgba(255,170,0,0.2)" : "transparent",
        color: track.solo ? "#ffaa00" : "#444", fontSize: 8, cursor: "pointer", borderRadius: 2
      }}>S</button>
      {/* Level bar */}
      <div style={{ width: 8, height: 50, background: "#111", borderRadius: 2, overflow: "hidden", position: "relative" }}>
        <div style={{
          position: "absolute", bottom: 0, left: 0, right: 0,
          height: `${(track.muted ? 0 : track.volume / 1.5) * 100}%`,
          background: `linear-gradient(to top, ${color}, ${color}66)`,
          transition: "height 0.1s"
        }} />
      </div>
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
const DEFAULT_SYNTH = { wave: "sawtooth", attack: 0.01, decay: 0.1, sustain: 0.6, release: 0.2, cutoff: 2000, filterType: "lowpass" };

function makeTrack(name, type) {
  return { name, type, volume: 1, pan: 0, muted: false, solo: false };
}

export default function FLStudio() {
  const [tab, setTab] = useState("song");
  const [bpm, setBpm] = useState(128);
  const [playing, setPlaying] = useState(false);
  const [playhead, setPlayhead] = useState(0);

  // Tracks
  const [tracks, setTracks] = useState([
    makeTrack("MELODY", "synth"),
    makeTrack("BASS", "synth"),
    makeTrack("DRUMS", "beat"),
    makeTrack("PAD", "synth"),
  ]);

  // Per-track synth settings
  const [synthSettings, setSynthSettings] = useState({
    0: { ...DEFAULT_SYNTH, wave: "sawtooth", cutoff: 3000 },
    1: { ...DEFAULT_SYNTH, wave: "sine", cutoff: 800 },
    2: DEFAULT_SYNTH,
    3: { ...DEFAULT_SYNTH, wave: "sine", attack: 0.3, release: 0.8, cutoff: 1200 },
  });

  // Per-track piano roll notes (Set of "ni_ci")
  const [pianoNotes, setPianoNotes] = useState({ 0: new Set(), 1: new Set(), 2: new Set(), 3: new Set() });

  // Beat grids per track
  const [beatGrids, setBeatGrids] = useState({
    2: Array.from({ length: DRUM_PADS.length }, () => Array(BEAT_STEPS).fill(false))
  });

  // Song map [trackIdx][colIdx] = bool
  const [songMap, setSongMap] = useState(() => {
    const m = {};
    tracks.forEach((_, ti) => { m[ti] = Array(32).fill(false); });
    return m;
  });

  // Which track/pattern is open in editor
  const [editingTrack, setEditingTrack] = useState(0);

  // Beat sequencer state
  const [beatStep, setBeatStep] = useState(-1);
  const beatRef = useRef(null);
  const playRef = useRef(null);
  const playheadRef = useRef(0);

  // ── PLAYBACK ──
  const startPlay = useCallback(() => {
    const { ctx } = getAudio();
    if (ctx.state === "suspended") ctx.resume();
    setPlaying(true);
    const stepMs = (60 / bpm / 4) * 1000;
    let step = 0;
    beatRef.current = setInterval(() => {
      setBeatStep(step % BEAT_STEPS);
      // Play beat grid step
      const beatGrid = beatGrids[2];
      if (beatGrid) {
        beatGrid.forEach((row, pi) => {
          if (row[step % BEAT_STEPS]) playDrum(DRUM_PADS[pi].type);
        });
      }
      if (step % BEAT_STEPS === 0) {
        const col = Math.floor(step / BEAT_STEPS) % 32;
        setPlayhead(col);
        playheadRef.current = col;
        // Play synth tracks for this song column
        tracks.forEach((track, ti) => {
          if (track.muted) return;
          if (!songMap[ti]?.[col]) return;
          if (track.type === "synth") {
            const notes = pianoNotes[ti];
            if (!notes) return;
            const synth = synthSettings[ti] || DEFAULT_SYNTH;
            const noteDur = (60 / bpm) * 0.5;
            notes.forEach(key => {
              const [ni, ci] = key.split("_").map(Number);
              // Schedule note at beat position
              setTimeout(() => {
                playNote(NOTE_FREQS[ALL_NOTES[ni]], noteDur, synth);
              }, ci * stepMs);
            });
          }
        });
      }
      step++;
    }, stepMs);
  }, [bpm, beatGrids, tracks, songMap, pianoNotes, synthSettings]);

  const stopPlay = useCallback(() => {
    clearInterval(beatRef.current);
    clearInterval(playRef.current);
    setPlaying(false);
    setBeatStep(-1);
    setPlayhead(0);
  }, []);

  useEffect(() => () => { clearInterval(beatRef.current); }, []);

  const toggleSong = (ti, ci) => {
    setSongMap(prev => {
      const next = { ...prev };
      next[ti] = [...(next[ti] || Array(32).fill(false))];
      next[ti][ci] = !next[ti][ci];
      return next;
    });
  };

  const toggleBeat = (pi, si) => {
    setBeatGrids(prev => {
      const grid = prev[editingTrack] || Array.from({ length: DRUM_PADS.length }, () => Array(BEAT_STEPS).fill(false));
      const next = grid.map(row => [...row]);
      next[pi][si] = !next[pi][si];
      return { ...prev, [editingTrack]: next };
    });
  };

  const updateTrack = (idx, key, val) => {
    setTracks(prev => prev.map((t, i) => i === idx ? { ...t, [key]: val } : t));
  };

  const addTrack = () => {
    const idx = tracks.length;
    setTracks(prev => [...prev, makeTrack(`TRACK ${idx + 1}`, "synth")]);
    setSynthSettings(prev => ({ ...prev, [idx]: { ...DEFAULT_SYNTH } }));
    setPianoNotes(prev => ({ ...prev, [idx]: new Set() }));
    setSongMap(prev => { const n = { ...prev }; n[idx] = Array(32).fill(false); return n; });
  };

  const editTrack = tracks[editingTrack];
  const isBeatTrack = editTrack?.type === "beat";
  const currentBeatGrid = beatGrids[editingTrack] || Array.from({ length: DRUM_PADS.length }, () => Array(BEAT_STEPS).fill(false));

  const TABS = [
    { id: "song",   label: "SONG",   icon: "⊞" },
    { id: "piano",  label: "PIANO",  icon: "♩" },
    { id: "beat",   label: "BEATS",  icon: "◈" },
    { id: "synth",  label: "SYNTH",  icon: "≋" },
    { id: "mixer",  label: "MIXER",  icon: "▤" },
  ];

  return (
    <div style={{
      minHeight: "100vh",
      background: "#070709",
      fontFamily: "monospace",
      color: "#ccc",
      display: "flex",
      flexDirection: "column"
    }}>
      {/* TITLE BAR */}
      <div style={{
        background: "#0a0a0e",
        borderBottom: "1px solid #111",
        padding: "0 16px",
        display: "flex",
        alignItems: "center",
        gap: 16,
        height: 44,
        flexShrink: 0
      }}>
        <div style={{ fontSize: 14, letterSpacing: 6, color: "#fff", fontWeight: "bold" }}>
          FL<span style={{ color: "#ffaa00" }}>WEB</span>
        </div>
        <div style={{ width: 1, height: 20, background: "#1a1a2e" }} />
        {/* Transport */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button onClick={playing ? stopPlay : startPlay} style={{
            padding: "4px 14px",
            border: `1px solid ${playing ? "#ff4d4d" : "#00e5ff"}`,
            background: playing ? "rgba(255,77,77,0.15)" : "rgba(0,229,255,0.1)",
            color: playing ? "#ff4d4d" : "#00e5ff",
            fontSize: 12, cursor: "pointer", borderRadius: 3, letterSpacing: 2
          }}>{playing ? "⏹ STOP" : "▶ PLAY"}</button>
        </div>
        <div style={{ width: 1, height: 20, background: "#1a1a2e" }} />
        {/* BPM */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button onClick={() => setBpm(b => Math.max(60, b - 1))} style={{
            width: 18, height: 18, border: "1px solid #1a1a2e", background: "#0d0d18",
            color: "#888", cursor: "pointer", borderRadius: 2, fontSize: 11, lineHeight: 1
          }}>−</button>
          <div style={{
            background: "#000", border: "1px solid #1a1a2e", padding: "2px 8px",
            fontSize: 16, color: "#ffaa00", letterSpacing: 2, borderRadius: 3,
            minWidth: 50, textAlign: "center"
          }}>{bpm}</div>
          <button onClick={() => setBpm(b => Math.min(200, b + 1))} style={{
            width: 18, height: 18, border: "1px solid #1a1a2e", background: "#0d0d18",
            color: "#888", cursor: "pointer", borderRadius: 2, fontSize: 11, lineHeight: 1
          }}>+</button>
          <span style={{ fontSize: 8, color: "#333", letterSpacing: 2 }}>BPM</span>
        </div>
        <div style={{ flex: 1 }} />
        {/* Playhead display */}
        <div style={{ fontSize: 10, color: "#333", letterSpacing: 2 }}>
          BAR <span style={{ color: "#555" }}>{playhead + 1}</span>
        </div>
      </div>

      {/* MAIN LAYOUT */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

        {/* LEFT SIDEBAR — Track list */}
        <div style={{
          width: 160, background: "#09090d", borderRight: "1px solid #111",
          display: "flex", flexDirection: "column", flexShrink: 0, overflowY: "auto"
        }}>
          <div style={{ padding: "8px 10px", fontSize: 8, color: "#333", letterSpacing: 3, borderBottom: "1px solid #111" }}>
            TRACKS
          </div>
          {tracks.map((track, ti) => (
            <div key={ti} onClick={() => setEditingTrack(ti)} style={{
              padding: "8px 10px", cursor: "pointer",
              background: editingTrack === ti ? "#0f0f18" : "transparent",
              borderLeft: `2px solid ${editingTrack === ti ? TRACK_COLORS[ti % TRACK_COLORS.length] : "transparent"}`,
              borderBottom: "1px solid #0d0d0d",
              display: "flex", alignItems: "center", gap: 8
            }}>
              <div style={{
                width: 8, height: 8, borderRadius: "50%",
                background: TRACK_COLORS[ti % TRACK_COLORS.length],
                flexShrink: 0
              }} />
              <div>
                <div style={{ fontSize: 10, color: editingTrack === ti ? "#fff" : "#666", letterSpacing: 1 }}>
                  {track.name}
                </div>
                <div style={{ fontSize: 8, color: "#333", letterSpacing: 1, marginTop: 1 }}>
                  {track.type.toUpperCase()}
                </div>
              </div>
            </div>
          ))}
          <button onClick={addTrack} style={{
            margin: 10, padding: "6px 0",
            border: "1px dashed #1a1a2e", background: "transparent",
            color: "#333", fontSize: 9, cursor: "pointer", borderRadius: 3, letterSpacing: 2
          }}>+ TRACK</button>
        </div>

        {/* CENTER */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {/* Tab bar */}
          <div style={{ display: "flex", borderBottom: "1px solid #111", background: "#09090d", flexShrink: 0 }}>
            {TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)} style={{
                padding: "8px 16px", border: "none", background: "transparent",
                color: tab === t.id ? "#fff" : "#333",
                fontSize: 9, letterSpacing: 2, cursor: "pointer",
                borderBottom: tab === t.id ? "2px solid #ffaa00" : "2px solid transparent",
              }}>{t.icon} {t.label}</button>
            ))}
          </div>

          {/* Tab content */}
          <div style={{ flex: 1, overflow: "auto", padding: 16 }}>

            {/* SONG EDITOR */}
            {tab === "song" && (
              <div>
                <div style={{ fontSize: 9, color: "#333", letterSpacing: 3, marginBottom: 12 }}>
                  SONG EDITOR — haz click en los bloques para activar patrones
                </div>
                <SongEditor
                  tracks={tracks} patterns={{}} songMap={songMap}
                  onToggle={toggleSong} playhead={playhead} playing={playing}
                />
                <div style={{ marginTop: 20, fontSize: 9, color: "#222", lineHeight: 1.8 }}>
                  💡 Cada columna = 1 compás. Activa bloques para indicar cuándo suena cada pista.
                </div>
              </div>
            )}

            {/* PIANO ROLL */}
            {tab === "piano" && (
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                  <div style={{ fontSize: 9, color: "#333", letterSpacing: 3 }}>PIANO ROLL —</div>
                  <div style={{ fontSize: 9, color: TRACK_COLORS[editingTrack % TRACK_COLORS.length], letterSpacing: 2 }}>
                    {tracks[editingTrack]?.name}
                  </div>
                  <button onClick={() => setPianoNotes(prev => ({ ...prev, [editingTrack]: new Set() }))} style={{
                    marginLeft: "auto", padding: "4px 10px", border: "1px solid #1a1a2e",
                    background: "transparent", color: "#444", fontSize: 8, cursor: "pointer", borderRadius: 3
                  }}>LIMPIAR</button>
                </div>
                <PianoRoll
                  notes={pianoNotes[editingTrack] || new Set()}
                  onChange={notes => setPianoNotes(prev => ({ ...prev, [editingTrack]: notes }))}
                  synth={synthSettings[editingTrack] || DEFAULT_SYNTH}
                />
                <div style={{ marginTop: 10, fontSize: 9, color: "#222" }}>
                  {(pianoNotes[editingTrack]?.size || 0)} notas • {PIANO_ROLL_COLS / 4} compases
                </div>
              </div>
            )}

            {/* BEAT */}
            {tab === "beat" && (
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
                  <div style={{ fontSize: 9, color: "#333", letterSpacing: 3 }}>BEAT MAKER —</div>
                  <div style={{ fontSize: 9, color: TRACK_COLORS[editingTrack % TRACK_COLORS.length] }}>
                    {tracks[editingTrack]?.name}
                  </div>
                  <button onClick={() => setBeatGrids(prev => ({
                    ...prev,
                    [editingTrack]: Array.from({ length: DRUM_PADS.length }, () => Array(BEAT_STEPS).fill(false))
                  }))} style={{
                    marginLeft: "auto", padding: "4px 10px", border: "1px solid #1a1a2e",
                    background: "transparent", color: "#444", fontSize: 8, cursor: "pointer", borderRadius: 3
                  }}>LIMPIAR</button>
                </div>
                <BeatGrid
                  grid={currentBeatGrid}
                  onToggle={toggleBeat}
                  currentStep={beatStep}
                  playing={playing}
                />
                <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {[
                    { name: "BÁSICO", fn: () => {
                      const g = Array.from({ length: DRUM_PADS.length }, () => Array(BEAT_STEPS).fill(false));
                      g[0][0]=g[0][8]=true; g[1][4]=g[1][12]=true;
                      [0,2,4,6,8,10,12,14].forEach(i => g[2][i]=true);
                      setBeatGrids(p => ({ ...p, [editingTrack]: g }));
                    }},
                    { name: "TRAP", fn: () => {
                      const g = Array.from({ length: DRUM_PADS.length }, () => Array(BEAT_STEPS).fill(false));
                      g[0][0]=g[0][6]=g[0][10]=true; g[1][4]=g[1][12]=true;
                      [0,1,2,4,5,6,8,9,10,12,13,14].forEach(i => g[2][i]=true);
                      setBeatGrids(p => ({ ...p, [editingTrack]: g }));
                    }},
                    { name: "REGGAETON", fn: () => {
                      const g = Array.from({ length: DRUM_PADS.length }, () => Array(BEAT_STEPS).fill(false));
                      g[0][0]=g[0][3]=g[0][6]=g[0][9]=g[0][12]=true;
                      g[1][2]=g[1][6]=g[1][10]=g[1][14]=true;
                      [0,2,4,6,8,10,12,14].forEach(i => g[2][i]=true);
                      setBeatGrids(p => ({ ...p, [editingTrack]: g }));
                    }},
                  ].map(p => (
                    <button key={p.name} onClick={p.fn} style={{
                      padding: "5px 12px", border: "1px solid #1a1a2e", background: "transparent",
                      color: "#444", fontSize: 8, cursor: "pointer", borderRadius: 3, letterSpacing: 1
                    }}>{p.name}</button>
                  ))}
                </div>
              </div>
            )}

            {/* SYNTH */}
            {tab === "synth" && (
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
                  <div style={{ fontSize: 9, color: "#333", letterSpacing: 3 }}>SINTETIZADOR —</div>
                  <div style={{ fontSize: 9, color: TRACK_COLORS[editingTrack % TRACK_COLORS.length] }}>
                    {tracks[editingTrack]?.name}
                  </div>
                </div>
                <SynthPanel
                  synth={synthSettings[editingTrack] || DEFAULT_SYNTH}
                  onChange={s => setSynthSettings(prev => ({ ...prev, [editingTrack]: s }))}
                />
                {/* Mini keyboard */}
                <div style={{ marginTop: 20 }}>
                  <div style={{ fontSize: 9, color: "#333", letterSpacing: 3, marginBottom: 8 }}>TECLADO — toca notas</div>
                  <div style={{ display: "flex", gap: 1, overflowX: "auto" }}>
                    {["C4","D4","E4","F4","G4","A4","B4","C5","D5","E5","F5","G5","A5"].map(note => {
                      const isBlack = note.includes("#");
                      return (
                        <button key={note} onClick={() => playNote(NOTE_FREQS[note], 0.5, synthSettings[editingTrack] || DEFAULT_SYNTH)} style={{
                          width: isBlack ? 22 : 30, height: isBlack ? 60 : 90,
                          background: isBlack ? "#111" : "#e8e8e8",
                          border: "1px solid #333", borderRadius: "0 0 3px 3px",
                          cursor: "pointer", color: isBlack ? "#666" : "#999",
                          fontSize: 8, fontFamily: "monospace",
                          display: "flex", alignItems: "flex-end", justifyContent: "center",
                          paddingBottom: 4, flexShrink: 0
                        }}>{note.replace("#","♯")}</button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* MIXER */}
            {tab === "mixer" && (
              <div>
                <div style={{ fontSize: 9, color: "#333", letterSpacing: 3, marginBottom: 16 }}>MEZCLADORA</div>
                <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 8 }}>
                  {tracks.map((track, ti) => (
                    <MixerChannel key={ti} track={track} index={ti} onChange={updateTrack} />
                  ))}
                  {/* Master */}
                  <div style={{
                    display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
                    padding: "10px 8px", background: "#0a0a0f",
                    border: "1px solid #222", borderTop: "3px solid #fff",
                    borderRadius: 4, minWidth: 52
                  }}>
                    <div style={{ fontSize: 7, color: "#888", letterSpacing: 1 }}>MASTER</div>
                    <div style={{ height: 100, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                      <input type="range" min={0} max={1.5} step={0.01} defaultValue={0.7}
                        onChange={e => { if (_master) _master.gain.value = parseFloat(e.target.value); }}
                        style={{ writingMode: "vertical-lr", direction: "rtl", height: 80, accentColor: "#fff", cursor: "pointer" }} />
                    </div>
                    <div style={{ width: 8, height: 50, background: "#111", borderRadius: 2 }}>
                      <div style={{ width: "100%", height: "70%", background: "linear-gradient(to top, #00ff9f, #ffaa00)", borderRadius: 2 }} />
                    </div>
                  </div>
                </div>
              </div>
            )}

          </div>
        </div>
      </div>

      <style>{`
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 5px; height: 5px; }
        ::-webkit-scrollbar-track { background: #07070a; }
        ::-webkit-scrollbar-thumb { background: #1a1a2e; border-radius: 3px; }
        button:active { filter: brightness(0.8); }
      `}</style>
    </div>
  );
}
