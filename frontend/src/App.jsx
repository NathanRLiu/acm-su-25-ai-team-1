

import { useState } from 'react';


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
      <p className="text-gray-500 text-xs">Enter the airfoil features (except frequency) and get SSPL predictions across frequency bands.</p>
    </div>
  );
}

export default App;
