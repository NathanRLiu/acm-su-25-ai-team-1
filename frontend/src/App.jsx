

import { useState, useRef } from 'react';
// Utility to map SSPL to gain (volume), e.g., normalize to [0,1]
function ssplToGain(sspl, minSSPL, maxSSPL) {
  // Map SSPL linearly to [0.1, 1] for audibility, avoid 0
  if (maxSSPL === minSSPL) return 0.5;
  return 0.1 + 0.9 * ((sspl - minSSPL) / (maxSSPL - minSSPL));
}



const featureNames = [
  { key: 'alpha', label: 'Angle of Attack (alpha)' },
  { key: 'c', label: 'Chord Length (c)' },
  { key: 'U_infinity', label: 'Free-stream Velocity (U_infinity)' },
  { key: 'delta', label: 'Suction Side Displacement Thickness (delta)' },
];

// Frequency range for log sweep (Hz)
const FREQ_MIN = 100;
const FREQ_MAX = 10000;
const FREQ_POINTS = 30;


function App() {
  // Only ask user for non-frequency features
  const [inputs, setInputs] = useState({
    alpha: '',
    c: '',
    U_infinity: '',
    delta: '',
  });
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
    const masterGain = audioCtx.createGain();
    masterGain.gain.value = volume;
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
      // No need to stop/restart audio, animation will pick up new results
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-100 p-4">
      <h1 className="text-3xl font-bold mb-6">Airfoil Noise Model Predictor</h1>
      <form onSubmit={handleSubmit} className="bg-white shadow-md rounded px-8 pt-6 pb-8 mb-4 w-full max-w-md">
        <label className="block text-gray-700 text-sm font-bold mb-2">Model Inputs (Frequency will be swept automatically)</label>
        {featureNames.map((feature) => (
          <div key={feature.key} className="mb-4">
            <label className="block text-gray-700 text-xs font-bold mb-1" htmlFor={feature.key}>{feature.label}</label>
            <input
              type="number"
              step="any"
              name={feature.key}
              id={feature.key}
              value={inputs[feature.key]}
              onChange={handleInputChange}
              className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
              required
            />
          </div>
        ))}
        <button
          type="submit"
          className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline w-full"
          disabled={loading}
        >
          {loading ? 'Sweeping Frequencies...' : 'Sweep Frequency & Predict'}
        </button>
        {error && <p className="text-red-500 mt-2">{error}</p>}
      </form>
  {results.length > 0 && (
        <div className="w-full max-w-2xl bg-white shadow rounded p-4 mb-4">
          <h2 className="text-lg font-bold mb-2">SSPL vs Frequency</h2>
          <div className="flex items-center gap-4 mb-4">
            <button
              className="bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline"
              onClick={handlePlayAll}
              disabled={playing}
            >
              {playing ? 'Playing...' : 'Play All Frequencies'}
            </button>
            <button
              className="bg-red-500 hover:bg-red-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline"
              onClick={handleStop}
              disabled={!playing}
            >
              Stop
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
                className="w-32"
                disabled={!results.length}
              />
            </label>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="text-left">Frequency (Hz)</th>
                <th className="text-left">Predicted SSPL</th>
              </tr>
            </thead>
            <tbody>
              {results.map(({f, sspl}) => (
                <tr key={f}>
                  <td>{f}</td>
                  <td>{sspl.toFixed(3)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <button
        className="bg-purple-500 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline mb-4"
        onClick={() => {
          // Create a test pattern: alternating high/low SSPL
          const testResults = Array.from({length: FREQ_POINTS}, (_, i) => ({
            f: Math.round(Math.exp(Math.log(FREQ_MIN) + (Math.log(FREQ_MAX) - Math.log(FREQ_MIN)) * i / (FREQ_POINTS - 1))),
            sspl: i % 2 === 0 ? 100 : 10
          }));
          setResults(testResults);
          resultsRef.current = testResults;
        }}
        type="button"
      >
        Test Noticeable Audio Pattern
      </button>
      <p className="text-gray-500 text-xs">Enter the airfoil features (except frequency) and get SSPL predictions across frequency bands.</p>
    </div>
  );
}

export default App;
