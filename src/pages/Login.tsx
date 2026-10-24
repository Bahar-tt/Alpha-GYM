import { useState, useRef, useMemo, Suspense } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Float, Stars } from '@react-three/drei';
import * as THREE from 'three';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Lock, User, ArrowLeft } from 'lucide-react';

/* ===================== 3D SCENE ===================== */

function FloatingOrbs() {
  const group = useRef<THREE.Group>(null);
  const orbs = useMemo(() => {
    return Array.from({ length: 18 }).map((_, i) => ({
      position: [
        (Math.random() - 0.1) * 11,
        (Math.random() - 0.5) * 7,
        (Math.random() - 0.5) * 5 - 1,
      ] as [number, number, number],
      scale: 0.028 + Math.random() * 0.09,
      speed: 0.18 + Math.random() * 0.55,
      color: i % 3 === 0 ? '#39ff14' : '#ff6b00',
    }));
  }, []);

  useFrame((state) => {
    if (!group.current) return;
    group.current.children.forEach((child, i) => {
      const t = state.clock.elapsedTime * orbs[i].speed;
      child.position.y = orbs[i].position[1] + Math.sin(t + i) * 0.32;
      child.position.x = orbs[i].position[0] + Math.cos(t * 0.45 + i) * 0.15;
    });
  });

  return (
    <group ref={group}>
      {orbs.map((orb, i) => (
        <mesh key={i} position={orb.position} scale={orb.scale}>
          <sphereGeometry args={[1, 10, 10]} />
          <meshStandardMaterial
            color={orb.color}
            emissive={orb.color}
            emissiveIntensity={2.4}
            transparent
            opacity={0.8}
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
    const x = state.pointer.x * 0.08;
    const y = state.pointer.y * 0.04;
    mesh.current.rotation.y = THREE.MathUtils.lerp(mesh.current.rotation.y, x, 0.035);
    mesh.current.rotation.x = THREE.MathUtils.lerp(mesh.current.rotation.x, -y, 0.035);
  });

  return (
    <Float speed={0.9} rotationIntensity={0.08} floatIntensity={0.25}>
      <mesh ref={mesh} position={[2.7, 0.15, -0.5]} scale={[6.2, 7.9, 1]}>
        <planeGeometry args={[1, 1]} />
        <meshStandardMaterial
          map={texture}
          roughness={0.45}
          metalness={0.02}
          transparent
          opacity={1}
        />
      </mesh>
    </Float>
  );
}

function Scene() {
  return (
    <>
      <color attach="background" args={['#010101']} />
      <fog attach="fog" args={['#010101', 9, 22]} />

      <ambientLight intensity={0.5} />
      <pointLight position={[6, 3, 4]} intensity={2.8} color="#ff6b00" distance={18} />
      <pointLight position={[-2, 1, 3]} intensity={1.1} color="#39ff14" distance={12} />
      <spotLight position={[3.5, 6, 5]} angle={0.48} penumbra={0.85} intensity={2.2} color="#ffffff" />

      <Stars radius={70} depth={45} count={1400} factor={2.8} saturation={0} fade speed={0.35} />
      <FloatingOrbs />
      <HeroPlane />
    </>
  );
}

/* ===================== LOGIN PAGE ===================== */

export default function Login() {
  const { signIn } = useAuth();
  const navigate = useNavigate();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

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
      x: ((y - centerY) / centerY) * -8,
      y: ((x - centerX) / centerX) * 8,
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

  // Premium gold palette
  const gold = '#f5c518';
  const goldBright = '#ffe066';
  const goldDeep = '#d4a017';
  const orange = '#ff6b00';
  const neonGreen = '#39ff14';

  return (
    <div className="min-h-screen relative overflow-hidden bg-[#010101]">
      {/* 3D Canvas */}
      <div className="absolute inset-0 z-0">
        <Canvas
          camera={{ position: [0, 0, 6], fov: 40 }}
          dpr={[1, 1.5]}
          gl={{ antialias: true, alpha: false }}
        >
          <Suspense fallback={null}>
            <Scene />
          </Suspense>
        </Canvas>
      </div>

      {/* Left dark veil */}
      <div
        className="absolute inset-0 z-[1] pointer-events-none"
        style={{
          background: `linear-gradient(90deg,
            rgba(1,1,1,0.94) 0%,
            rgba(1,1,1,0.72) 24%,
            rgba(1,1,1,0.28) 44%,
            transparent 60%
          )`,
        }}
      />

      {/* FORM – LEFT */}
      <div
        className="absolute z-20 top-0 bottom-0 left-0 w-full max-w-[400px] flex items-center"
        style={{ padding: '28px 22px' }}
      >
        <div className="w-full" dir="rtl">
          {/* ===== LOGO SECTION – bigger & pure gold ===== */}
          <div className="mb-8 text-center">
            <div className="relative inline-block">
              <img
                src="/v5.png"
                alt="Alpha GYM"
                className="mx-auto w-[160px] sm:w-[185px] h-auto"
                style={{
                  filter: `
                    drop-shadow(0 0 8px rgba(245,197,24,0.9))
                    drop-shadow(0 0 22px rgba(245,197,24,0.55))
                    drop-shadow(0 0 40px rgba(245,197,24,0.25))
                    drop-shadow(0 8px 20px rgba(0,0,0,0.6))
                  `,
                }}
              />
            </div>

            <h1
              className="mt-4 font-black tracking-[0.2em]"
              style={{
                fontSize: 'clamp(1.75rem, 4.2vw, 2.25rem)',
                background: `linear-gradient(180deg, ${goldBright} 0%, ${gold} 40%, ${goldDeep} 100%)`,
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                filter: 'drop-shadow(0 2px 10px rgba(245,197,24,0.35))',
              }}
            >
              ALPHA GYM
            </h1>

            <div className="mt-2 flex items-center justify-center gap-2">
              <span
                className="h-px w-8"
                style={{ background: `linear-gradient(90deg, transparent, ${gold})` }}
              />
              <p
                className="text-[10px] sm:text-[11px] font-semibold tracking-[0.35em] uppercase"
                style={{ color: 'rgba(245,197,24,0.75)' }}
              >
                Management System
              </p>
              <span
                className="h-px w-8"
                style={{ background: `linear-gradient(90deg, ${gold}, transparent)` }}
              />
            </div>
          </div>

          {/* ===== CARD ===== */}
          <div
            ref={cardRef}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            style={{ perspective: '1000px' }}
          >
            <div
              className="rounded-2xl p-6 sm:p-7 relative transition-transform duration-150 ease-out"
              style={{
                background: 'linear-gradient(165deg, rgba(14,14,14,0.96) 0%, rgba(6,6,6,0.98) 100%)',
                border: '1px solid rgba(245,197,24,0.22)',
                boxShadow: `
                  0 0 0 1px rgba(245,197,24,0.06),
                  0 24px 48px -12px rgba(0,0,0,0.9),
                  0 0 40px -10px rgba(245,197,24,0.12),
                  inset 0 1px 0 rgba(255,255,255,0.04)
                `,
                transform: `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg) translateZ(10px)`,
                backdropFilter: 'blur(14px)',
              }}
            >
              {/* subtle top accent */}
              <div
                className="absolute top-0 right-8 left-8 h-[1.5px] rounded-b-full"
                style={{
                  background: `linear-gradient(90deg, transparent, ${gold}, transparent)`,
                  opacity: 0.7,
                }}
              />

              <p
                className="text-center text-[13px] font-semibold mb-6"
                style={{ color: 'rgba(255,230,160,0.9)', letterSpacing: '0.04em' }}
              >
                ورود به پنل مدیریت
              </p>

              {error && (
                <div
                  className="mb-4 p-3 rounded-xl text-sm"
                  style={{
                    background: 'rgba(248,113,113,0.1)',
                    color: '#fca5a5',
                    border: '1px solid rgba(248,113,113,0.25)',
                  }}
                >
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label
                    className="block text-[11px] font-semibold mb-1.5"
                    style={{ color: 'rgba(245,197,24,0.7)' }}
                  >
                    نام کاربری
                  </label>
                  <div className="relative">
                    <User
                      size={15}
                      className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none"
                      style={{ color: 'rgba(245,197,24,0.45)' }}
                    />
                    <input
                      type="text"
                      className="w-full rounded-xl py-3 pr-9 pl-3 text-sm outline-none transition-all"
                      style={{
                        background: 'rgba(0,0,0,0.6)',
                        border: '1px solid rgba(245,197,24,0.18)',
                        color: '#f2f2f2',
                        boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.4)',
                      }}
                      placeholder="admin"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      required
                      onFocus={(e) => {
                        e.currentTarget.style.borderColor = gold;
                        e.currentTarget.style.boxShadow =
                          '0 0 0 2px rgba(245,197,24,0.15), inset 0 1px 3px rgba(0,0,0,0.4)';
                      }}
                      onBlur={(e) => {
                        e.currentTarget.style.borderColor = 'rgba(245,197,24,0.18)';
                        e.currentTarget.style.boxShadow = 'inset 0 1px 3px rgba(0,0,0,0.4)';
                      }}
                    />
                  </div>
                </div>

                <div>
                  <label
                    className="block text-[11px] font-semibold mb-1.5"
                    style={{ color: 'rgba(245,197,24,0.7)' }}
                  >
                    رمز عبور
                  </label>
                  <div className="relative">
                    <Lock
                      size={15}
                      className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none"
                      style={{ color: 'rgba(245,197,24,0.45)' }}
                    />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      className="w-full rounded-xl py-3 pr-9 pl-9 text-sm outline-none transition-all"
                      style={{
                        background: 'rgba(0,0,0,0.6)',
                        border: '1px solid rgba(245,197,24,0.18)',
                        color: '#f2f2f2',
                        boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.4)',
                      }}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      onFocus={(e) => {
                        e.currentTarget.style.borderColor = gold;
                        e.currentTarget.style.boxShadow =
                          '0 0 0 2px rgba(245,197,24,0.15), inset 0 1px 3px rgba(0,0,0,0.4)';
                      }}
                      onBlur={(e) => {
                        e.currentTarget.style.borderColor = 'rgba(245,197,24,0.18)';
                        e.currentTarget.style.boxShadow = 'inset 0 1px 3px rgba(0,0,0,0.4)';
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute left-3 top-1/2 -translate-y-1/2"
                      style={{ color: 'rgba(245,197,24,0.5)' }}
                    >
                      {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full mt-2 py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-55"
                  style={{
                    background: `linear-gradient(145deg, ${goldBright} 0%, ${gold} 45%, ${goldDeep} 100%)`,
                    color: '#1a1400',
                    border: '1px solid rgba(255,230,140,0.45)',
                    boxShadow: `
                      0 1px 0 rgba(255,255,255,0.3) inset,
                      0 4px 0 ${goldDeep},
                      0 10px 20px -3px rgba(245,197,24,0.4)
                    `,
                  }}
                >
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <span className="w-4 h-4 border-2 border-black/25 border-t-black rounded-full animate-spin" />
                      در حال ورود...
                    </span>
                  ) : (
                    <>
                      ورود به سیستم
                      <ArrowLeft size={16} strokeWidth={2.5} />
                    </>
                  )}
                </button>
              </form>
            </div>
          </div>

          <p
            className="text-[10px] mt-6 font-medium tracking-[0.25em] text-center"
            style={{ color: 'rgba(255,255,255,0.18)' }}
          >
            ALPHA GYM · POWERED BY STRENGTH
          </p>
        </div>
      </div>
    </div>
  );
}
