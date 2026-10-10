import React, { useRef, useMemo, useState, useEffect, Suspense } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

// Fallback CSS background in case WebGL is disabled or fails
export function FallbackBackground() {
  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 pointer-events-none z-0 overflow-hidden bg-[#04070f]"
    >
      {/* Cybernetic grid */}
      <div
        className="absolute inset-0 opacity-20"
        style={{
          backgroundImage: `
            linear-gradient(to right, rgba(34, 211, 238, 0.15) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(34, 211, 238, 0.15) 1px, transparent 1px)
          `,
          backgroundSize: '40px 40px',
        }}
      />
      {/* Radial depth glow in navy & cyan */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_75%_45%,rgba(37,99,235,0.18)_0%,rgba(34,211,238,0.06)_40%,transparent_75%)]" />
      <div className="absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-t from-[#04070f] to-transparent" />
    </div>
  );
}

// Error Boundary for WebGL canvas
export class SceneErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.warn('WebGL / R3F Canvas caught error, using fallback cyber gradient:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return <FallbackBackground />;
    }
    return this.props.children;
  }
}

/**
 * Procedural low-poly humanoid head wireframe + points in profile
 */
function CyberHead({ isMobile }) {
  const meshRef = useRef();
  const pointsRef = useRef();
  const haloRef = useRef();

  // Create procedural craniofacial geometry deformed from an icosphere
  const geometry = useMemo(() => {
    const geo = new THREE.IcosahedronGeometry(2.3, isMobile ? 2 : 3);
    const pos = geo.attributes.position;
    const v = new THREE.Vector3();

    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);

      // Deform sphere into humanoid head profile:
      // Y is up, X is lateral (width), Z is forward/back
      // Cranium: widen top and back
      if (v.y > 0.2) {
        v.x *= 0.95;
        if (v.z < 0) v.z *= 1.25; // occipital protrusion
      }
      // Face / jaw taper:
      if (v.y < -0.2) {
        v.x *= Math.max(0.45, 1.0 + v.y * 0.35); // jaw narrowing
        if (v.z > 0) {
          v.z *= 1.15; // chin/jaw angle
        }
      }
      // Forehead & nose profile
      if (v.y > -0.2 && v.y < 0.6 && v.z > 0.8) {
        v.z += Math.sin((v.y + 0.2) * Math.PI) * 0.35; // nasal bridge projection
      }

      pos.setXYZ(i, v.x, v.y, v.z);
    }

    geo.computeVertexNormals();
    return geo;
  }, [isMobile]);

  // Clean up geometry on unmount
  useEffect(() => {
    return () => {
      geometry.dispose();
    };
  }, [geometry]);

  // Floating line bars around the head
  const bars = useMemo(() => {
    const count = isMobile ? 3 : 6;
    const items = [];
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      items.push({
        x: Math.cos(angle) * 3.6,
        y: (Math.sin(angle) * 1.5) - 0.2,
        z: Math.sin(angle) * 1.8,
        length: 1.0 + (i % 3) * 0.7,
        rotY: angle,
      });
    }
    return items;
  }, [isMobile]);

  useFrame((state, delta) => {
    const time = state.clock.getElapsedTime();

    if (meshRef.current) {
      // Gentle floating and subtle profile orientation
      meshRef.current.rotation.y = 0.55 + Math.sin(time * 0.3) * 0.12;
      meshRef.current.rotation.x = Math.sin(time * 0.2) * 0.05;
      meshRef.current.position.y = Math.sin(time * 0.5) * 0.08;
    }

    if (pointsRef.current) {
      pointsRef.current.rotation.y = 0.55 + Math.sin(time * 0.3) * 0.12;
      pointsRef.current.rotation.x = Math.sin(time * 0.2) * 0.05;
      pointsRef.current.position.y = Math.sin(time * 0.5) * 0.08;
    }

    if (haloRef.current) {
      haloRef.current.rotation.z = time * 0.1;
      haloRef.current.rotation.x = 1.2 + Math.sin(time * 0.2) * 0.05;
    }
  });

  return (
    <group position={[isMobile ? 0 : 2.0, 0, -1.0]}>
      {/* Wireframe head */}
      <mesh ref={meshRef} geometry={geometry}>
        <meshBasicMaterial
          color="#22d3ee"
          wireframe
          transparent
          opacity={isMobile ? 0.35 : 0.45}
        />
      </mesh>

      {/* Vertex point cloud for glowing neural nodes */}
      <points ref={pointsRef} geometry={geometry}>
        <pointsMaterial
          color="#38bdf8"
          size={isMobile ? 0.06 : 0.08}
          transparent
          opacity={0.85}
          sizeAttenuation
        />
      </points>

      {/* Cyber halo ring around cranium */}
      <mesh ref={haloRef} position={[0, 0.4, 0]}>
        <ringGeometry args={[2.9, 2.94, 48]} />
        <meshBasicMaterial
          color="#2563eb"
          side={THREE.DoubleSide}
          transparent
          opacity={0.3}
        />
      </mesh>

      {/* Thin floating neon cyan/amber data bars */}
      {bars.map((bar, i) => (
        <mesh
          key={i}
          position={[bar.x, bar.y, bar.z]}
          rotation={[0, bar.rotY, Math.PI / 2]}
        >
          <planeGeometry args={[0.03, bar.length]} />
          <meshBasicMaterial
            color={i === 2 ? '#f5a524' : '#22d3ee'} // One rare amber accent
            transparent
            opacity={0.65}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
    </group>
  );
}

/**
 * Drifting particle field in background
 */
function DriftingParticles({ count = 80 }) {
  const pointsRef = useRef();

  const [positions, geometry] = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 20;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 14;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 12;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    return [pos, geo];
  }, [count]);

  useEffect(() => {
    return () => {
      geometry.dispose();
    };
  }, [geometry]);

  useFrame((state, delta) => {
    if (!pointsRef.current) return;
    const time = state.clock.getElapsedTime();
    const posAttr = pointsRef.current.geometry.attributes.position;
    const arr = posAttr.array;

    for (let i = 0; i < count; i++) {
      // Slow upward and lateral drift
      arr[i * 3 + 1] += delta * 0.12;
      arr[i * 3] += Math.sin(time + i) * 0.002;

      // Wrap around bounds
      if (arr[i * 3 + 1] > 7) arr[i * 3 + 1] = -7;
      if (arr[i * 3] > 10) arr[i * 3] = -10;
      if (arr[i * 3] < -10) arr[i * 3] = 10;
    }
    posAttr.needsUpdate = true;
  });

  return (
    <points ref={pointsRef} geometry={geometry}>
      <pointsMaterial
        color="#22d3ee"
        size={0.045}
        transparent
        opacity={0.4}
        sizeAttenuation
      />
    </points>
  );
}

/**
 * Parallax controller for desktop mouse movement
 */
function CameraController({ isMobile }) {
  const { camera } = useThree();
  const mouseRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (isMobile) return;

    const handleMouseMove = (e) => {
      mouseRef.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      mouseRef.current.y = -(e.clientY / window.innerHeight) * 2 + 1;
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [isMobile]);

  useFrame(() => {
    if (isMobile) return;
    // Smooth lerp camera towards mouse
    camera.position.x = THREE.MathUtils.lerp(camera.position.x, mouseRef.current.x * 0.35, 0.05);
    camera.position.y = THREE.MathUtils.lerp(camera.position.y, mouseRef.current.y * 0.25, 0.05);
    camera.lookAt(0, 0, 0);
  });

  return null;
}

/**
 * Inner Canvas Scene
 */
function SceneCanvas({ isMobile, isTabVisible }) {
  return (
    <Canvas
      dpr={isMobile ? 1 : [1, 1.5]}
      frameloop={isTabVisible ? 'always' : 'never'}
      camera={{ position: [0, 0, 7.5], fov: 45 }}
      gl={{
        antialias: !isMobile,
        powerPreference: 'high-performance',
        alpha: true,
      }}
      style={{
        position: 'fixed',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 0,
      }}
    >
      <CameraController isMobile={isMobile} />
      <ambientLight intensity={0.4} />
      <directionalLight position={[5, 5, 5]} intensity={0.8} color="#22d3ee" />
      <directionalLight position={[-5, -5, -2]} intensity={0.5} color="#2563eb" />

      <CyberHead isMobile={isMobile} />
      <DriftingParticles count={isMobile ? 35 : 100} />
    </Canvas>
  );
}

/**
 * Main SceneBackground component
 * Lazy-loadable, handles visibility pauses, mobile light-mode, and WebGL error boundary.
 */
export default function SceneBackground() {
  const [isMobile, setIsMobile] = useState(false);
  const [isTabVisible, setIsTabVisible] = useState(true);

  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 768 || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
      setIsMobile(mobile);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);

    const handleVisibility = () => {
      setIsTabVisible(document.visibilityState === 'visible');
    };

    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.removeEventListener('resize', checkMobile);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  return (
    <SceneErrorBoundary>
      <FallbackBackground />
      <Suspense fallback={null}>
        <SceneCanvas isMobile={isMobile} isTabVisible={isTabVisible} />
      </Suspense>
    </SceneErrorBoundary>
  );
}
