import { useState, useRef, useMemo, Suspense } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Float, Stars, MeshDistortMaterial } from '@react-three/drei';
import * as THREE from 'three';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Lock, User, ArrowLeft } from 'lucide-react';

/* ===================== 3D SCENE ===================== */

function FloatingOrbs() {
  const group = useRef<THREE.Group>(null);
  const orbs = useMemo(() => {
    return Array.from({ length: 22 }).map((_, i) => ({
      position: [
        (Math.random() - 0.2) * 9,
        (Math.random() - 0.5) * 7,
        (Math.random() - 0.5) * 5 - 1,
      ] as [number, number, number],
      scale: 0.035 + Math.random() * 0.11,
      speed: 0.25 + Math.random() * 0.7,
      color: i % 3 === 0 ? '#39ff14' : '#ff6b00',
    }));
  }, []);

  useFrame((state) => {
    if (!group.current) return;
    group.current.children.forEach((child, i) => {
      const t = state.clock.elapsedTime * orbs[i].speed;
      child.position.y = orbs[i].position[1] + Math.sin(t + i) * 0.4;
      child.position.x = orbs[i].position[0] + Math.cos(t * 0.6 + i) * 0.2;
    });
  });

  return (
    <group ref={group}>
      {orbs.map((orb, i) => (
        <mesh key={i} position={orb.position} scale={orb.scale}>
          <sphereGeometry args={[1, 12, 12]} />
          <meshStandardMaterial
            color={orb.color}
            emissive={orb.color}
            emissiveIntensity={2.8}
            transparent
            opacity={0.9}
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
    const x = state.pointer.x * 0.12;
    const y = state.pointer.y * 0.06;
    mesh.current.rotation.y = THREE.MathUtils.lerp(mesh.current.rotation.y, x, 0.04);
    mesh.current.rotation.x = THREE.MathUtils.lerp(mesh.current.rotation.x, -y, 0.04);
  });

  return (
    <Float speed={1.1} rotationIntensity={0.12} floatIntensity={0.35}>
      <mesh ref={mesh} position={[2.4, 0.15, -0.8]} scale={[5.2, 6.8, 1]}>
        <planeGeometry args={[1, 1, 24, 24]} />
        <MeshDistortMaterial
          map={texture}
          distort={0.06}
          speed={1.2}
          roughness={0.3}
          metalness={0.05}
          transparent
          opacity={1}
        />
      </mesh>
    </Float>
  );
}

function GlowRing() {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    if (!ref.current) return;
    ref.current.rotation.z = state.clock.elapsedTime * 0.2;
    ref.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.35) * 0.12;
  });

  return (
    <mesh ref={ref} position={[2.3, 0.1, -1.5]}>
      <torusGeometry args={[1.9, 0.025, 16, 100]} />
      <meshStandardMaterial
        color="#ff6b00"
        emissive="#ff6b00"
        emissiveIntensity={3.5}
        transparent
        opacity={0.7}
      />
    </mesh>
  );
}

function Scene() {
  return (
    <>
      <color attach="background" args={['#020202']} />
      <fog attach="fog" args={['#020202', 7, 18]} />

      <ambientLight intensity={0.3} />
      <pointLight position={[5, 4, 3]} intensity={2.2} color="#ff6b00" distance={14} />
      <pointLight position={[-4, -2, 2]} intensity={1.4} color="#39ff14" distance={12} />
      <spotLight position={[1, 7, 5]} angle={0.45} penumbra={0.9} intensity={1.6} color="#ffffff" />

      <Stars radius={50} depth={40} count={1800} factor={3.5} saturation={0} fade speed={0.5} />
      <FloatingOrbs />
      <HeroPlane />
      <GlowRing />
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
      x: ((y - centerY) / centerY) * -12,
      y: ((x - centerX) / centerX) * 12,
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
    <div className="min-h-screen relative overflow-hidden bg-[#020202]">
      {/* 3D Canvas */}
      <div className="absolute inset-0 z-0">
        <Canvas
          camera={{ position: [0, 0, 6.2], fov: 42 }}
          dpr={[1, 1.6]}
          gl={{ antialias: true, alpha: false }}
        >
          <Suspense fallback={null}>
            <Scene />
          </Suspense>
        </Canvas>
      </div>

      {/* Soft dark gradient only on left for form readability */}
      <div
        className="absolute inset-0 z-[1] pointer-events-none"
        style={{
          background: `linear-gradient(90deg,
            rgba(2,2,2,0.88) 0%,
            rgba(2,2,2,0.55) 28%,
            rgba(2,2,2,0.15) 50%,
            transparent 70%
          )`,
        }}
      />

      {/* UI */}
      <div className="relative z-10 min-h-screen flex items-center">
        <div className="w-full max-w-[1400px] mx-auto px-5 sm:px-10 py-8 grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
          
          {/* FORM – forced to visual left */}
          <div className="w-full max-w-[390px] justify-self-start order-2 lg:order-1" dir="rtl">
            {/* Logo */}
            <div className="mb-7 text-center lg:text-right">
              <img
                src="/v5.png"
                alt="Alpha GYM"
                className="mx-auto lg:mr-0 lg:ml-auto w-[125px] sm:w-[145px] h-auto"
                style={{
                  filter: 'drop-shadow(0 0 16px rgba(255,107,0,0.7)) drop-shadow(0 0 28px rgba(57,255,20,0.25))',
                }}
              />
              <h1
                className="mt-3 font-black tracking-[0.12em]"
                style={{
                  fontSize: 'clamp(1.65rem, 4vw, 2.15rem)',
                  background: `linear-gradient(180deg, #fff 0%, ${orangeBright} 42%, ${orange} 85%)`,
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  filter: 'drop-shadow(0 2px 10px rgba(255,107,0,0.4))',
                }}
              >
                ALPHA GYM
              </h1>
              <p
                className="mt-1 text-[11px] font-bold tracking-[0.26em] uppercase"
                style={{ color: neonGreen, textShadow: '0 0 10px rgba(57,255,20,0.4)' }}
              >
                Management System
              </p>
            </div>

            {/* Card */}
            <div
              ref={cardRef}
              onMouseMove={handleMouseMove}
              onMouseLeave={handleMouseLeave}
              style={{ perspective: '1100px' }}
            >
              <div
                className="rounded-2xl p-6 sm:p-7 relative transition-transform duration-150 ease-out"
                style={{
                  background: 'linear-gradient(160deg, rgba(12,12,12,0.94) 0%, rgba(5,5,5,0.97) 100%)',
                  border: '1px solid rgba(255,107,0,0.42)',
                  boxShadow: `
                    0 0 0 1px rgba(57,255,20,0.1),
                    0 22px 45px -10px rgba(0,0,0,0.9),
                    0 0 50px -10px rgba(255,107,0,0.3),
                    0 0 35px -6px rgba(57,255,20,0.12),
                    inset 0 1px 0 rgba(255,255,255,0.05)
                  `,
                  transform: `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg) translateZ(16px)`,
                  backdropFilter: 'blur(14px)',
                }}
              >
                <div
                  className="absolute top-0 right-7 left-7 h-[2px] rounded-b-full"
                  style={{
                    background: `linear-gradient(90deg, transparent, ${orange}, ${neonGreen}, transparent)`,
                    boxShadow: `0 0 10px ${orange}`,
                  }}
                />

                <p className="text-center text-sm font-bold mb-5" style={{ color: '#ffd9b0' }}>
                  ورود به پنل مدیریت
                </p>

                {error && (
                  <div
                    className="mb-4 p-3 rounded-xl text-sm"
                    style={{ background: 'rgba(248,113,113,0.12)', color: '#fca5a5', border: '1px solid rgba(248,113,113,0.3)' }}
                  >
                    {error}
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold mb-1.5" style={{ color: 'rgba(255,140,51,0.9)' }}>
                      نام کاربری
                    </label>
                    <div className="relative">
                      <User size={15} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'rgba(255,107,0,0.55)' }} />
                      <input
                        type="text"
                        className="w-full rounded-xl py-3 pr-9 pl-3 text-sm outline-none"
                        style={{
                          background: 'rgba(0,0,0,0.7)',
                          border: '1px solid rgba(255,107,0,0.32)',
                          color: '#eee',
                          boxShadow: 'inset 0 2px 5px rgba(0,0,0,0.5)',
                        }}
                        placeholder="admin"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        required
                        onFocus={(e) => {
                          e.currentTarget.style.borderColor = neonGreen;
                          e.currentTarget.style.boxShadow = '0 0 0 2px rgba(57,255,20,0.2), inset 0 2px 5px rgba(0,0,0,0.5)';
                        }}
                        onBlur={(e) => {
                          e.currentTarget.style.borderColor = 'rgba(255,107,0,0.32)';
                          e.currentTarget.style.boxShadow = 'inset 0 2px 5px rgba(0,0,0,0.5)';
                        }}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold mb-1.5" style={{ color: 'rgba(255,140,51,0.9)' }}>
                      رمز عبور
                    </label>
                    <div className="relative">
                      <Lock size={15} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'rgba(255,107,0,0.55)' }} />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        className="w-full rounded-xl py-3 pr-9 pl-9 text-sm outline-none"
                        style={{
                          background: 'rgba(0,0,0,0.7)',
                          border: '1px solid rgba(255,107,0,0.32)',
                          color: '#eee',
                          boxShadow: 'inset 0 2px 5px rgba(0,0,0,0.5)',
                        }}
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        onFocus={(e) => {
                          e.currentTarget.style.borderColor = neonGreen;
                          e.currentTarget.style.boxShadow = '0 0 0 2px rgba(57,255,20,0.2), inset 0 2px 5px rgba(0,0,0,0.5)';
                        }}
                        onBlur={(e) => {
                          e.currentTarget.style.borderColor = 'rgba(255,107,0,0.32)';
                          e.currentTarget.style.boxShadow = 'inset 0 2px 5px rgba(0,0,0,0.5)';
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute left-3 top-1/2 -translate-y-1/2"
                        style={{ color: 'rgba(255,107,0,0.6)' }}
                      >
                        {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full mt-1 py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.97] disabled:opacity-55"
                    style={{
                      background: `linear-gradient(145deg, ${orangeBright}, ${orange} 50%, #e05a00)`,
                      color: '#0a0a0a',
                      border: '1px solid rgba(255,200,120,0.4)',
                      boxShadow: `
                        0 1px 0 rgba(255,255,255,0.25) inset,
                        0 5px 0 #b34a00,
                        0 12px 24px -3px rgba(255,107,0,0.5),
                        0 0 20px -2px rgba(57,255,20,0.25)
                      `,
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
                        <ArrowLeft size={16} strokeWidth={2.5} />
                      </>
                    )}
                  </button>
                </form>
              </div>
            </div>

            <p className="text-[10px] mt-6 font-semibold tracking-[0.22em] text-white/20 text-center lg:text-right">
              ALPHA GYM · POWERED BY STRENGTH
            </p>
          </div>

          {/* Right side empty – 3D scene lives here */}
          <div className="hidden lg:block order-1 lg:order-2" />
        </div>
      </div>
    </div>
  );
}
