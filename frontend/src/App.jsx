

import { useState } from 'react';

const featureNames = [
  { key: 'f', label: 'Frequency (f)' },
  { key: 'alpha', label: 'Angle of Attack (alpha)' },
  { key: 'c', label: 'Chord Length (c)' },
  { key: 'U_infinity', label: 'Free-stream Velocity (U_infinity)' },
  { key: 'delta', label: 'Suction Side Displacement Thickness (delta)' },
];

function App() {
  const [inputs, setInputs] = useState({
    f: '',
    alpha: '',
    c: '',
    U_infinity: '',
    delta: '',
  });
  const [prediction, setPrediction] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleInputChange = (e) => {
    setInputs({ ...inputs, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setPrediction(null);
    try {
      // Ensure order matches model expectation
      const data = featureNames.map(f => Number(inputs[f.key]));
      const res = await fetch('http://localhost:8000/predict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data }),
      });
      if (!res.ok) throw new Error('Server error');
      const result = await res.json();
      setPrediction(result.prediction);
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
        <label className="block text-gray-700 text-sm font-bold mb-2">Model Inputs</label>
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
          {loading ? 'Predicting...' : 'Get Prediction'}
        </button>
        {error && <p className="text-red-500 mt-2">{error}</p>}
        {prediction && (
          <div className="mt-4 p-4 bg-green-100 rounded">
            <span className="font-bold">Prediction:</span> {JSON.stringify(prediction)}
          </div>
        )}
      </form>
      <p className="text-gray-500 text-xs">Enter the airfoil features and get predictions from the FastAPI backend.</p>
    </div>
  );
}

export default App;
