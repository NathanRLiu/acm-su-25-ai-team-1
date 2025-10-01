import React from 'react';
import ParticleEffect from './ParticleEffect';

// Props: angle, dragging, planeRef, handlePlanePointerDown, inputs, U_infinity
export default function JetBar({
  angle,
  dragging,
  planeRef,
  handlePlanePointerDown,
  inputs,
  U_infinity
}) {
  return (
    <div
      style={{
        position: 'relative',
        width: '100vw',
        height: '8rem',
      }}
    >
      {/* Particle effect container */}
      <ParticleEffect U_infinity={Number(U_infinity) || 0} />
      {/* Plane visual, higher z-index */}
      <div
        ref={planeRef}
        style={{
          width: '8rem',
          height: '8rem',
          marginLeft: '4rem',
          transform: `rotate(${angle}deg)`,
          transition: dragging ? 'none' : 'transform 0.2s',
          userSelect: 'none',
          cursor: dragging ? 'grabbing' : 'grab',
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
        <span style={{ transform: 'translate(-50%,120%)' }}>
          {angle.toFixed(1)}°
        </span>
      </div>
    </div>
  );
}
