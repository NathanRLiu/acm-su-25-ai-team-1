

import React, { useState, useRef, useCallback, useEffect } from 'react';
import ParticleEffect from './ParticleEffect';
// Utility to map SSPL to gain (volume), e.g., normalize to [0,1]
function ssplToGain(sspl, minSSPL, maxSSPL) {
  // Map SSPL linearly to [0.1, 1] for audibility, avoid 0
  if (maxSSPL === minSSPL) return 0.5;
  return 0.1 + 0.9 * ((sspl - minSSPL) / (maxSSPL - minSSPL));
}



const featureNames = [
  { key: 'alpha', label: 'Angle of Attack (alpha)' },
  { key: 'c', label: 'Chord Length (meters)' },
  { key: 'U_infinity', label: 'Free-stream Velocity (meters per second)' },
  { key: 'delta', label: 'Suction Side Displacement Thickness (meters)' },
];

// Frequency range for log sweep (Hz)
const FREQ_MIN = 20;
const FREQ_MAX = 20000;
const FREQ_POINTS = 30;


function App() {
  // Only ask user for non-frequency features
  const [inputs, setInputs] = useState({
    alpha: '',
    c: '0.3048',
    U_infinity: '0',
    delta: '0.00266337',
  });
  // Ref to track last alpha value for auto-fetch
  const lastAlphaRef = useRef('');
  const [results, setResults] = useState([]); // [{f, sspl}]
  const resultsRef = useRef([]); // <--- new ref for results
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(0.5); // 0 to 1
  const audioCtxRef = useRef(null);
  const masterGainRef = useRef(null);
  const oscillatorsRef = useRef([]);
  // Play wind/static sound, modulating filter cutoff to follow SSPL profile
  const handlePlayAll = () => {
    if (!resultsRef.current.length || playing) return;
    setPlaying(true);
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    audioCtxRef.current = audioCtx;
    // Scale volume for low U_infinity
    const u = Number(inputs.U_infinity) || 0;
    let velocityScale = 1;
    if (u < 30) {
      // Use log scale: scale = log10(1 + 9 * (u/30))
      // u=0 -> 0, u=30 -> 1, smooth log curve
      velocityScale = Math.log10(1 + 9 * (u / 30));
    }
    const masterGain = audioCtx.createGain();
    masterGain.gain.value = volume * velocityScale;
    masterGain.connect(audioCtx.destination);
    masterGainRef.current = masterGain;

    // Precompute min/max SSPL for normalization
    const currentResults = resultsRef.current;
    const minSSPL = Math.min(...currentResults.map(r => r.sspl));
    const maxSSPL = Math.max(...currentResults.map(r => r.sspl));

    // Create white noise buffer
    const bufferSize = 2 * audioCtx.sampleRate;
    const noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }
    const whiteNoise = audioCtx.createBufferSource();
    whiteNoise.buffer = noiseBuffer;
    whiteNoise.loop = true;

    // For each frequency, create a bandpass filter and gain node
    const filterNodes = [];
    const gainNodes = [];
    currentResults.forEach(({ f, sspl }) => {
      const filter = audioCtx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.Q.value = 10; // Narrow band
      filter.frequency.value = f;
      const gainNode = audioCtx.createGain();
      gainNode.gain.value = ssplToGain(sspl, minSSPL, maxSSPL) * volume;
      filter.connect(gainNode).connect(masterGain);
      filterNodes.push(filter);
      gainNodes.push(gainNode);
    });

    // Connect white noise to all filters
    filterNodes.forEach(filter => {
      whiteNoise.connect(filter);
    });
    whiteNoise.start();

    // Store references for stopping
    oscillatorsRef.current = [whiteNoise, ...filterNodes, ...gainNodes];
  };

  // Stop the wind/static sound
  const handleStop = () => {
    setPlaying(false);
    if (oscillatorsRef.current.length) {
      const [whiteNoise] = oscillatorsRef.current;
      try { whiteNoise.stop(); } catch {}
      oscillatorsRef.current = [];
    }
    if (masterGainRef.current) {
      try { masterGainRef.current.disconnect(); } catch {}
      masterGainRef.current = null;
    }
    if (audioCtxRef.current) {
      try { audioCtxRef.current.close(); } catch {}
      audioCtxRef.current = null;
    }
  };

  // Update master gain when volume changes
  const handleVolumeChange = (e) => {
    const v = Number(e.target.value);
    setVolume(v);
    if (masterGainRef.current) {
      masterGainRef.current.gain.value = v;
    }
  };
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleInputChange = (e) => {
    setInputs({ ...inputs, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResults([]);
    try {
      // Generate log-spaced frequency values
      const freqs = Array.from({length: FREQ_POINTS}, (_, i) =>
        Math.round(Math.exp(Math.log(FREQ_MIN) + (Math.log(FREQ_MAX) - Math.log(FREQ_MIN)) * i / (FREQ_POINTS - 1)))
      );
      const fixedInputs = featureNames.map(f => Number(inputs[f.key]));
      const promises = freqs.map(async (f) => {
        const data = [f, ...fixedInputs];
        const res = await fetch('http://localhost:8000/predict', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data }),
        });
        if (!res.ok) throw new Error('Server error');
        const result = await res.json();
        return { f, sspl: result.prediction[0] };
      });
      const allResults = await Promise.all(promises);
      setResults(allResults);
      resultsRef.current = allResults; // update ref for audio

      // Smoothly update gain nodes if audio is playing and nodes exist
      if (playing && oscillatorsRef.current.length > 0 && masterGainRef.current && audioCtxRef.current) {
        // oscillatorsRef.current = [whiteNoise, ...filterNodes, ...gainNodes]
        const gainNodes = oscillatorsRef.current.slice(1 + FREQ_POINTS); // after whiteNoise and filters
        const minSSPL = Math.min(...allResults.map(r => r.sspl));
        const maxSSPL = Math.max(...allResults.map(r => r.sspl));
        // Also apply velocity scaling to gain nodes
        const u = Number(inputs.U_infinity) || 0;
        let velocityScale = 1;
        if (u < 30) {
          velocityScale = Math.log10(1 + 9 * (u / 30));
        }
        allResults.forEach((result, i) => {
          const gainNode = gainNodes[i];
          if (gainNode && gainNode.gain) {
            const newGain = ssplToGain(result.sspl, minSSPL, maxSSPL) * volume * velocityScale;
            gainNode.gain.setTargetAtTime(newGain, audioCtxRef.current.currentTime, 0.1);
          }
        });
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // --- Drag-to-rotate logic for angle (alpha) ---
  const planeRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState(null);
  // Angle in degrees, display the true signed value for rotation
  const [displayAngle, setDisplayAngle] = useState(0);
  const angle = Number(displayAngle) || 0;

  // Mouse/touch event handlers
  const handlePlanePointerDown = useCallback((e) => {
    e.preventDefault();
    setDragging(true);
    // Get center of plane visual
    const rect = planeRef.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    setDragStart({
      cx,
      cy,
      startAngle: angle,
    });
    document.body.style.userSelect = 'none';
  }, [angle]);
  const handlePlanePointerMove = useCallback((e) => {
    if (!dragging || !dragStart) return;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const dx = clientX - dragStart.cx;
    const dy = clientY - dragStart.cy;
    // atan2 gives angle in radians
    let theta = Math.atan2(dy, dx) * 180 / Math.PI;
  // Clamp to [-50, 50] for display and input
  theta = Math.max(-50, Math.min(50, theta));
  setDisplayAngle(theta);
  setInputs(inputs => ({ ...inputs, alpha: Math.abs(theta).toFixed(1) }));
  }, [dragging, dragStart]);
  const handlePlanePointerUp = useCallback(() => {
    setDragging(false);
    setDragStart(null);
    document.body.style.userSelect = '';
  }, []);
  // Attach/detach listeners
  React.useEffect(() => {
    if (dragging) {
      window.addEventListener('mousemove', handlePlanePointerMove);
      window.addEventListener('touchmove', handlePlanePointerMove);
      window.addEventListener('mouseup', handlePlanePointerUp);
      window.addEventListener('touchend', handlePlanePointerUp);
    } else {
      window.removeEventListener('mousemove', handlePlanePointerMove);
      window.removeEventListener('touchmove', handlePlanePointerMove);
      window.removeEventListener('mouseup', handlePlanePointerUp);
      window.removeEventListener('touchend', handlePlanePointerUp);
    }
    return () => {
      window.removeEventListener('mousemove', handlePlanePointerMove);
      window.removeEventListener('touchmove', handlePlanePointerMove);
      window.removeEventListener('mouseup', handlePlanePointerUp);
      window.removeEventListener('touchend', handlePlanePointerUp);
    };
  }, [dragging, dragStart, handlePlanePointerMove, handlePlanePointerUp]);

  // Poll for new audio every 200ms while dragging plane or changing U_infinity, and fetch once when released
  useEffect(() => {
    let pollInterval = null;
    // Helper to fetch audio if alpha or U_infinity changed
    const fetchIfChanged = () => {
      const alphaChanged = inputs.alpha !== lastAlphaRef.current && inputs.alpha !== '' && !isNaN(Number(inputs.alpha));
      const uChanged = inputs.U_infinity !== lastAlphaRef.currentU && inputs.U_infinity !== '' && !isNaN(Number(inputs.U_infinity));
      if (alphaChanged || uChanged) {
        lastAlphaRef.current = inputs.alpha;
        lastAlphaRef.currentU = inputs.U_infinity;
        handleSubmit({ preventDefault: () => {} });
      }
    };
    const isSliderActive = typeof window !== 'undefined' && window.isUInfinitySliding;
    if (dragging || isSliderActive) {
      pollInterval = setInterval(fetchIfChanged, 50);
    } else {
      // Only fetch once on drag/slider release if there was a change
      fetchIfChanged();
    }
    return () => {
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [inputs.alpha, inputs.U_infinity, dragging]);

  // Track U_infinity slider drag state
  useEffect(() => {
    const slider = document.getElementById('U_infinity');
    if (!slider) return;
    const handleDown = () => { window.isUInfinitySliding = true; };
    const handleUp = () => { window.isUInfinitySliding = false; };
    slider.addEventListener('mousedown', handleDown);
    slider.addEventListener('touchstart', handleDown);
    slider.addEventListener('mouseup', handleUp);
    slider.addEventListener('touchend', handleUp);
    slider.addEventListener('mouseleave', handleUp);
    return () => {
      slider.removeEventListener('mousedown', handleDown);
      slider.removeEventListener('touchstart', handleDown);
      slider.removeEventListener('mouseup', handleUp);
      slider.removeEventListener('touchend', handleUp);
      slider.removeEventListener('mouseleave', handleUp);
    };
  }, []);

  return (
    <div style={{height: '100vh'}}>
  <div className="min-h-screen flex flex-col items-center bg-gray-100 pt-8 px-4">
      <h1 className="text-3xl font-bold mb-6">Airfoil Noise Model Predictor</h1>
      <div className="text-gray-700 mt-2" style={{zIndex:3, position:'relative'}}>Drag the plane to set Angle of Attack (alpha)</div>
      {/* Large central plane visual for angle */}
      <div
        className="flex flex-col items-center mb-8 overflow-hidden pr-3"
        style={{
          position: 'relative',
          width: '8rem',
          height: '8rem',
        }}
      >
        {/* Particle effect container */}
  <ParticleEffect U_infinity={Number(inputs.U_infinity) || 0} />
        {/* Plane visual, higher z-index */}
        <div
          ref={planeRef}
          className="select-none absolute left-0 top-0"
          style={{
            width: '8rem',
            height: '8rem',
            marginLeft: '4rem',
            transform: `rotate(${angle}deg)`,
            transition: dragging ? 'none' : 'transform 0.2s',
            userSelect: 'none',
            cursor: dragging ? 'grabbing': 'grab',
          }}
          onMouseDown={handlePlanePointerDown}
          onTouchStart={handlePlanePointerDown}
        >
          <img
            src="/fighter_jet.png"
            alt="Fighter Jet"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              position: 'absolute',
              left: 0,
              top: 0,
              pointerEvents: 'none',
              userSelect: 'none',
            }}
            draggable={false}
          />
          {/* Angle label overlay */}
          <span className="absolute left-1/2 top-1/2 text-2xl font-bold text-blue-700" style={{transform:'translate(-50%,120%)'}}>
            {angle.toFixed(1)}°
          </span>
        </div>
  </div>

      <form onSubmit={handleSubmit} className="bg-white shadow-md rounded-xl px-8 pt-6 pb-8 mb-4 w-full max-w-md">
        <label className="block text-gray-700 text-sm font-bold mb-2">Model Inputs (Frequency will be swept automatically)</label>
        {/* Render other inputs except alpha */}
        {featureNames.filter(f => f.key !== 'alpha').map((feature) => (
          <div key={feature.key} className="mb-4">
            <label className="block text-gray-700 text-xs font-bold mb-1" htmlFor={feature.key}>{feature.label}</label>
            {feature.key === 'U_infinity' ? (
              <div className="flex flex-col">
                <div className="relative w-full flex items-center">
                  <input
                    type="range"
                    name="U_infinity"
                    id="U_infinity"
                    min="0"
                    max="150"
                    step="1"
                    value={inputs.U_infinity}
                    onChange={handleInputChange}
                    className="w-full accent-blue-500 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-400 transition-all"
                    style={{ minWidth: '350px', maxWidth: '100%' }}
                  />
                  <span className="absolute right-0 -top-7 bg-blue-100 text-blue-700 text-xs font-semibold px-2 py-1 rounded shadow" style={{minWidth:'48px', textAlign:'center'}}>{inputs.U_infinity} m/s</span>
                </div>
              </div>
            ) : (
              <input
                type="number"
                step="any"
                name={feature.key}
                id={feature.key}
                value={inputs[feature.key]}
                onChange={handleInputChange}
                className="shadow appearance-none border border-gray-300 rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400 transition-all"
                required
              />
            )}
          </div>
        ))}
        <button
          type="submit"
          className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 w-full flex items-center justify-center gap-2 transition-all shadow-md hover:scale-105"
          disabled={loading}
        >
          {loading ? 'Sweeping Frequencies...' : 'Predict Audio'}
        </button>
        {error && <p className="text-red-500 mt-2">{error}</p>}
      </form>
  {results.length > 0 && (
    <div className="w-full max-w-2xl bg-white shadow-lg rounded-xl p-6 mb-4">
      <h2 className="text-lg font-bold mb-4">SSPL vs Frequency</h2>
      <div className="flex items-center gap-4 mb-6">
        <button
          className={`font-bold px-4 rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 transition-all shadow-md hover:scale-105 h-12 w-56 flex items-center justify-center gap-2 ${playing ? 'bg-red-500 hover:bg-red-700 text-white focus:ring-red-400' : 'bg-green-500 hover:bg-green-700 text-white focus:ring-green-400'}`}
          style={{height: '48px', width: '224px', display: 'flex', alignItems: 'center', justifyContent: 'center'}} // fixed height and width for button
          onClick={playing ? handleStop : handlePlayAll}
          disabled={false}
        >
          {playing ? (
            <svg style={{height:'24px', width:'24px', display: 'block', marginRight: '0.5rem'}} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
          ) : (
            <svg style={{height:'24px', width:'24px', display: 'block', marginRight: '0.5rem'}} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 3v18l15-9-15-9z" /></svg>
          )}
          <span style={{lineHeight: '1', display: 'block'}}>{playing ? 'Stop' : 'Play'}</span>
        </button>
        <label className="flex items-center gap-2">
          <span>Volume</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={volume}
            onChange={handleVolumeChange}
            className="w-32 accent-blue-500 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-400 transition-all"
            disabled={!results.length}
          />
        </label>
      </div>
      <div className="overflow-x-auto rounded-lg">
        <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
          <thead>
            <tr className="bg-gray-50">
              <th className="text-left px-3 py-2 font-semibold">Frequency (Hz)</th>
              <th className="text-left px-3 py-2 font-semibold">Predicted SSPL(dB)</th>
            </tr>
          </thead>
          <tbody>
            {results.map(({f, sspl}, i) => (
              <tr key={f} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                <td className="px-3 py-2">{f}</td>
                <td className="px-3 py-2">
                  <span className={`inline-block px-2 py-1 rounded text-xs font-mono font-bold ${sspl > 100 ? 'bg-red-100 text-red-700' : sspl < 60 ? 'bg-blue-100 text-blue-700' : 'bg-yellow-100 text-yellow-700'}`}>{sspl.toFixed(3)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )}
    </div>
  </div>
  );
}

export default App;
