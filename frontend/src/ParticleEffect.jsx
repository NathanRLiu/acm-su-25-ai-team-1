import React from "react";

// --- ParticleEffect component ---
function ParticleEffect({ U_infinity }) {
  const [particles, setParticles] = React.useState([]);
  const [containerWidth, setContainerWidth] = React.useState(window.innerWidth);
  // Update width on resize
  React.useEffect(() => {
    const handleResize = () => setContainerWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  // Animate particles
  React.useEffect(() => {
    let running = true;
    // Calculate the single speed for all particles
    const minSpeed = 1;
    const maxSpeed = 20;
    const u = Math.max(0, Math.min(U_infinity, 100)); // clamp 0-100
    const speed = minSpeed + (maxSpeed - minSpeed) * (u / 100);
    function randomNormal() {
      // Box-Muller transform for standard normal
      let u = 0, v = 0;
      while (u === 0) u = Math.random();
      while (v === 0) v = Math.random();
      return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    }
    function spawnParticle() {
      // Normal distribution, mean at center, stddev covers most of 80% height
      const mean = 0.5 * 128;
      const stddev = 0.2 * 128; // 95% of values within ~80% of height
      let y = mean + randomNormal() * stddev;
      // Clamp to visible area (10% to 90% of height)
      y = Math.max(0.1 * 128, Math.min(0.9 * 128, y));
      // Add a small random relative speed (e.g., -0.5 to +0.5)
      const relSpeed = (Math.random() - 0.5) * 1.0; // range: -0.5 to +0.5
      setParticles(particles => [
        ...particles,
        {
          id: Math.random().toString(36).slice(2),
          x: containerWidth, // start at right edge of visible area
          y,
          size: 6 + Math.random() * 8,
          opacity: 0.5 + Math.random() * 0.5,
          speed, // global speed
          relSpeed, // small relative speed
        },
      ]);
    }
    // Spawn rate: faster U_infinity = more frequent (min 60ms, max 400ms)
    const minInterval = 80;
    const maxInterval = 800;
    const spawnIntervalMs = maxInterval - (maxInterval - minInterval) * (u / 100);
    let spawnIntervalId = setInterval(() => {
      if (running && particles.length < 40) spawnParticle(); // limit max concurrent particles
    }, spawnIntervalMs);
    // Move particles
    const moveInterval = setInterval(() => {
      setParticles(particles =>
        particles
          .map(p => ({ ...p, x: p.x - (p.speed + (p.relSpeed || 0)) }))
          .filter(p => p.x > -20)
      );
    }, 16);
    return () => {
      running = false;
      clearInterval(spawnIntervalId);
      clearInterval(moveInterval);
    };
  }, [containerWidth, U_infinity]);
  // Render as absolutely positioned dots in a full-width, fixed-height container
  return (
    <>
      {/* Gradient background, behind everything (zIndex: 0) */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: '100vw',
          height: '8rem',
          zIndex: 0,
          pointerEvents: 'none',
          overflow: 'hidden',
          background: 'linear-gradient(to bottom, #7ecbff 0%, #cbefff 50%, #7ecbff 100%)',
        }}
      />
      {/* Particles, in front (zIndex: 3) */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: '100vw',
          height: '8rem',
          zIndex: 3,
          pointerEvents: 'none',
          overflow: 'hidden',
        }}
      >
        {particles.map(p => (
          <div
            key={p.id}
            style={{
              position: 'absolute',
              left: p.x,
              top: p.y,
              width: p.size * 8, // make the line much longer for a streak effect
              height: 2 + Math.random() * 2, // thin line
              borderRadius: '1px',
              background: `linear-gradient(90deg, rgba(255,255,255,${p.opacity}), rgba(255,255,255,0))`,
              boxShadow: `0 0 8px 2px rgba(255,255,255,${p.opacity*0.5})`,
              pointerEvents: 'none',
            }}
          />
        ))}
      </div>
    </>
  );
}

export default ParticleEffect;
