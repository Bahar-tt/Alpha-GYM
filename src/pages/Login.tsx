import { useState, useRef, useMemo, Suspense } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Float, Stars, MeshDistortMaterial, Environment } from '@react-three/drei';
import * as THREE from 'three';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Lock, User, ArrowLeft } from 'lucide-react';

/* ===================== 3D SCENE COMPONENTS ===================== */

function FloatingOrbs() {
  const group = useRef<THREE.Group>(null);
  const orbs = useMemo(() => {
    return Array.from({ length: 18 }).map((_, i) => ({
      position: [
        (Math.random() - 0.3) * 8,
        (Math.random() - 0.5) * 6,
        (Math.random() - 0.5) * 4 - 2,
      ] as [number, number, number],
      scale: 0.04 + Math.random() * 0.12,
      speed: 0.3 + Math.random() * 0.6,
      color: i % 3 === 0 ? '#39ff14' : '#ff6b00',
    }));
  }, []);

  useFrame((state) => {
    if (!group.current) return;
    group.current.children.forEach((child, i) => {
      const t = state.clock.elapsedTime * orbs[i].speed;
      child.position.y = orbs[i].position[1] + Math.sin(t + i) * 0.35;
      child.position.x = orbs[i].position[0] + Math.cos(t * 0.7 + i) * 0.15;
    });
  });

  return (
    <group ref={group}>
      {orbs.map((orb, i) => (
        <mesh key={i} position={orb.position} scale={orb.scale}>
          <sphereGeometry args={[1, 16, 16]} />
          <meshStandardMaterial
            color={orb.color}
            emissive={orb.color}
            emissiveIntensity={2.5}
            transparent
            opacity={0.85}
          />
        </mesh>
      ))}
    </group>
  );
}

function HeroPlane() {
  const mesh = useRef<THREE.Mesh>(null);
  const texture = useMemo(() => {
    const loader = new THREE.TextureLoader();
    const tex = loader.load('/hero-woman.jpg');
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }, []);

  useFrame((state) => {
    if (!mesh.current) return;
    // subtle parallax follow mouse
    const x = state.pointer.x * 0.15;
    const y = state.pointer.y * 0.08;
    mesh.current.rotation.y = THREE.MathUtils.lerp(mesh.current.rotation.y, x, 0.05);
    mesh.current.rotation.x = THREE.MathUtils.lerp(mesh.current.rotation.x, -y, 0.05);
  });

  return (
    <Float speed={1.2} rotationIntensity={0.15} floatIntensity={0.4}>
      <mesh ref={mesh} position={[2.8, 0.1, -1.2]} scale={[4.2, 5.6, 1]}>
        <planeGeometry args={[1, 1, 32, 32]} />
        <MeshDistortMaterial
          map={texture}
          distort={0.08}
          speed={1.5}
          roughness={0.35}
          metalness={0.1}
          transparent
          opacity={0.95}
        />
      </mesh>
    </Float>
  );
}

function GlowRing() {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    if (!ref.current) return;
    ref.current.rotation.z = state.clock.elapsedTime * 0.25;
    ref.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.4) * 0.15;
  });

  return (
    <mesh ref={ref} position={[2.6, 0, -1.8]}>
      <torusGeometry args={[1.6, 0.02, 16, 100]} />
      <meshStandardMaterial
        color="#ff6b00"
        emissive="#ff6b00"
        emissiveIntensity={3}
        transparent
        opacity={0.6}
      />
    </mesh>
  );
}

function Scene() {
  return (
    <>
      <color attach="background" args={['#030303']} />
      <fog attach="fog" args={['#030303', 6, 16]} />

      <ambientLight intensity={0.25} />
      <pointLight position={[4, 3, 2]} intensity={1.8} color="#ff6b00" distance={12} />
      <pointLight position={[-3, -1, 1]} intensity={1.2} color="#39ff14" distance={10} />
      <spotLight
        position={[0, 6, 4]}
        angle={0.5}
        penumbra={0.8}
        intensity={1.4}
        color="#ffffff"
        castShadow
      />

      <Stars radius={40} depth={30} count={1200} factor={3} saturation={0} fade speed={0.6} />
      <FloatingOrbs />
      <HeroPlane />
      <GlowRing />

      {/* soft ground reflection hint */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -3.2, 0]}>
        <planeGeometry args={[20, 20]} />
        <meshStandardMaterial color="#050505" transparent opacity={0.6} />
      </mesh>
    </>
  );
}

/* ===================== MAIN LOGIN PAGE ===================== */

export default function Login() {
  const { signIn } = useAuth();
  const navigate = useNavigate();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // CSS 3D tilt for the form card
  const cardRef = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    setTilt({
      x: ((y - centerY) / centerY) * -14,
      y: ((x - centerX) / centerX) * 14,
    });
  };

  const handleMouseLeave = () => setTilt({ x: 0, y: 0 });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const { error: err } = await signIn(username, password);
    if (err) setError(err);
    else navigate('/dashboard');
    setLoading(false);
  };

  const orange = '#ff6b00';
  const orangeBright = '#ff8c33';
  const neonGreen = '#39ff14';

  return (
    <div dir="rtl" className="min-h-screen relative overflow-hidden bg-[#030303]">
      {/* ========== FULLSCREEN 3D CANVAS ========== */}
      <div className="absolute inset-0 z-0">
        <Canvas
          camera={{ position: [0, 0, 6.5], fov: 45 }}
          dpr={[1, 1.75]}
          gl={{ antialias: true, alpha: false }}
        >
          <Suspense fallback={null}>
            <Scene />
          </Suspense>
        </Canvas>
      </div>

      {/* dark gradient overlay left for readability */}
      <div
        className="absolute inset-0 z-[1] pointer-events-none"
        style={{
          background: `
            linear-gradient(90deg,
              rgba(3,3,3,0.92) 0%,
              rgba(3,3,3,0.75) 32%,
              rgba(3,3,3,0.25) 58%,
              rgba(3,3,3,0.15) 100%
            )
          `,
        }}
      />

      {/* ========== UI LAYER ========== */}
      <div className="relative z-10 min-h-screen flex items-center">
        <div className="w-full max-w-7xl mx-auto px-5 sm:px-8 py-10 flex flex-col lg:flex-row items-center justify-between gap-10">
          
          {/* LEFT – FORM */}
          <div className="w-full max-w-[400px] flex flex-col items-center lg:items-start">
            {/* Logo */}
            <div className="text-center lg:text-right mb-7">
              <img
                src="/v5.png"
                alt="Alpha GYM"
                className="mx-auto lg:mx-0 w-[130px] sm:w-[150px] h-auto object-contain"
                style={{
                  filter: `
                    drop-shadow(0 0 18px rgba(255,107,0,0.65))
                    drop-shadow(0 0 32px rgba(57,255,20,0.3))
                  `,
                }}
              />
              <h1
                className="mt-4 font-black tracking-[0.14em]"
                style={{
                  fontSize: 'clamp(1.7rem, 4.5vw, 2.2rem)',
                  background: `linear-gradient(180deg, #fff 0%, ${orangeBright} 40%, ${orange} 80%)`,
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  filter: 'drop-shadow(0 3px 12px rgba(255,107,0,0.45))',
                }}
              >
                ALPHA GYM
              </h1>
              <p
                className="mt-1.5 text-[11px] font-bold tracking-[0.28em] uppercase"
                style={{ color: neonGreen, textShadow: '0 0 12px rgba(57,255,20,0.45)' }}
              >
                Management System
              </p>
            </div>

            {/* 3D tilted card */}
            <div
              ref={cardRef}
              onMouseMove={handleMouseMove}
              onMouseLeave={handleMouseLeave}
              className="w-full"
              style={{ perspective: '1200px' }}
            >
              <div
                className="w-full rounded-2xl p-7 relative transition-transform duration-150 ease-out"
                style={{
                  background: 'linear-gradient(165deg, rgba(14,14,14,0.92) 0%, rgba(6,6,6,0.96) 100%)',
                  border: '1px solid rgba(255,107,0,0.4)',
                  boxShadow: `
                    0 0 0 1px rgba(57,255,20,0.12),
                    0 25px 50px -10px rgba(0,0,0,0.85),
                    0 0 60px -12px rgba(255,107,0,0.28),
                    0 0 40px -8px rgba(57,255,20,0.15),
                    inset 0 1px 0 rgba(255,255,255,0.06)
                  `,
                  transform: `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg) translateZ(20px)`,
                  backdropFilter: 'blur(16px)',
                }}
              >
                {/* top neon line */}
                <div
                  className="absolute top-0 right-8 left-8 h-[2.5px] rounded-b-full"
                  style={{
                    background: `linear-gradient(90deg, transparent, ${orange}, ${neonGreen}, transparent)`,
                    boxShadow: `0 0 12px ${orange}, 0 0 8px ${neonGreen}`,
                  }}
                />

                <p
                  className="text-center text-sm font-bold mb-6"
                  style={{ color: '#ffd9b0', textShadow: '0 0 16px rgba(255,107,0,0.3)' }}
                >
                  ورود به پنل مدیریت
                </p>

                {error && (
                  <div
                    className="mb-4 p-3 rounded-xl text-sm"
                    style={{
                      background: 'rgba(248,113,113,0.12)',
                      color: '#fca5a5',
                      border: '1px solid rgba(248,113,113,0.3)',
                    }}
                  >
                    {error}
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-5">
                  <div>
                    <label className="block text-xs font-bold mb-2" style={{ color: 'rgba(255,140,51,0.9)' }}>
                      نام کاربری
                    </label>
                    <div className="relative">
                      <User size={16} className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'rgba(255,107,0,0.55)' }} />
                      <input
                        type="text"
                        className="w-full rounded-xl py-3.5 pr-10 pl-4 text-sm outline-none transition-all"
                        style={{
                          background: 'rgba(0,0,0,0.6)',
                          border: '1px solid rgba(255,107,0,0.3)',
                          color: '#f5f5f5',
                          boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.45)',
                        }}
                        placeholder="admin"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        required
                        onFocus={(e) => {
                          e.currentTarget.style.borderColor = neonGreen;
                          e.currentTarget.style.boxShadow = '0 0 0 3px rgba(57,255,20,0.18), inset 0 2px 6px rgba(0,0,0,0.45)';
                        }}
                        onBlur={(e) => {
                          e.currentTarget.style.borderColor = 'rgba(255,107,0,0.3)';
                          e.currentTarget.style.boxShadow = 'inset 0 2px 6px rgba(0,0,0,0.45)';
                        }}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold mb-2" style={{ color: 'rgba(255,140,51,0.9)' }}>
                      رمز عبور
                    </label>
                    <div className="relative">
                      <Lock size={16} className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'rgba(255,107,0,0.55)' }} />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        className="w-full rounded-xl py-3.5 pr-10 pl-10 text-sm outline-none transition-all"
                        style={{
                          background: 'rgba(0,0,0,0.6)',
                          border: '1px solid rgba(255,107,0,0.3)',
                          color: '#f5f5f5',
                          boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.45)',
                        }}
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        onFocus={(e) => {
                          e.currentTarget.style.borderColor = neonGreen;
                          e.currentTarget.style.boxShadow = '0 0 0 3px rgba(57,255,20,0.18), inset 0 2px 6px rgba(0,0,0,0.45)';
                        }}
                        onBlur={(e) => {
                          e.currentTarget.style.borderColor = 'rgba(255,107,0,0.3)';
                          e.currentTarget.style.boxShadow = 'inset 0 2px 6px rgba(0,0,0,0.45)';
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute left-3.5 top-1/2 -translate-y-1/2"
                        style={{ color: 'rgba(255,107,0,0.6)' }}
                      >
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full mt-2 py-4 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.97] disabled:opacity-55"
                    style={{
                      background: `linear-gradient(145deg, ${orangeBright} 0%, ${orange} 50%, #e05a00 100%)`,
                      color: '#0a0a0a',
                      border: '1px solid rgba(255,200,120,0.45)',
                      boxShadow: `
                        0 1px 0 rgba(255,255,255,0.25) inset,
                        0 6px 0 #b34a00,
                        0 14px 28px -4px rgba(255,107,0,0.55),
                        0 0 24px -2px rgba(57,255,20,0.3)
                      `,
                      transform: 'translateY(-1px)',
                    }}
                  >
                    {loading ? (
                      <span className="flex items-center gap-2">
                        <span className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                        در حال ورود...
                      </span>
                    ) : (
                      <>
                        ورود به سیستم
                        <ArrowLeft size={17} strokeWidth={2.5} />
                      </>
                    )}
                  </button>
                </form>
              </div>
            </div>

            <p className="text-[10px] mt-7 font-semibold tracking-[0.25em] text-white/25 text-center lg:text-right">
              ALPHA GYM · POWERED BY STRENGTH
            </p>
          </div>

          {/* RIGHT – space for 3D focus (empty, scene handles it) */}
          <div className="hidden lg:block w-[45%] h-[70vh]" />
        </div>
      </div>
    </div>
  );
}
