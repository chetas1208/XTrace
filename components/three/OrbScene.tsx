"use client";

import { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { Float, Icosahedron, MeshDistortMaterial, OrbitControls } from "@react-three/drei";

/**
 * The actual WebGL scene. Loaded only on the client (ssr:false) and only after
 * a capability check passes. A slowly rotating, distorting icosahedron mesh —
 * the "media-analysis orb" — with a faint wireframe shell.
 */
export default function OrbScene({ height = 360 }: { height?: number }) {
  return (
    <div style={{ height }} className="w-full">
      <Canvas camera={{ position: [0, 0, 4.2], fov: 45 }} dpr={[1, 1.6]} gl={{ antialias: true, alpha: true }}>
        <ambientLight intensity={0.5} />
        <pointLight position={[4, 4, 4]} intensity={2.2} color="#39d0ff" />
        <pointLight position={[-4, -2, 2]} intensity={1.6} color="#a06bff" />
        <Suspense fallback={null}>
          <Float speed={1.4} rotationIntensity={0.6} floatIntensity={0.8}>
            <Icosahedron args={[1.25, 4]}>
              <MeshDistortMaterial
                color="#1b2740"
                emissive="#1d6fb0"
                emissiveIntensity={0.35}
                roughness={0.25}
                metalness={0.8}
                distort={0.32}
                speed={1.6}
              />
            </Icosahedron>
            <Icosahedron args={[1.7, 1]}>
              <meshBasicMaterial color="#39d0ff" wireframe transparent opacity={0.12} />
            </Icosahedron>
          </Float>
        </Suspense>
        <OrbitControls enablePan={false} enableZoom={false} autoRotate autoRotateSpeed={0.6} />
      </Canvas>
    </div>
  );
}
