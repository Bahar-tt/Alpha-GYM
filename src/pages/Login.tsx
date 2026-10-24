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
    return Array.from({ length: 20 }).map((_, i) => ({
      position: [
        (Math.random() - 0.15) * 10,
        (Math.random() - 0.5) * 7,
        (Math.random() - 0.5) * 5 - 1,
      ] as [number, number, number],
      scale: 0.03 + Math.random() * 0.1,
      speed: 0.2 + Math.random() * 0.6,
      color: i % 3 === 0 ? '#39ff14' : '#ff6b00',
    }));
  }, []);

  useFrame((state) => {
    if (!group.current) return;
    group.current.children.forEach((child, i) => {
      const t = state.clock.elapsedTime * orbs[i].speed;
      child.position.y = orbs[i].position[1] + Math.sin(t + i) * 0.35;
      child.position.x = orbs[i].position[0] + Math.cos(t * 0.5 + i) * 0.18;
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
            emissiveIntensity={2.6}
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
    const x = state.pointer.x * 0.1;
    const y = state.pointer.y * 0.05;
    mesh.current.rotation.y = THREE.MathUtils.lerp(mesh.current.rotation.y, x, 0.04);
    mesh.current.rotation.x = THREE.MathUtils.lerp(mesh.current.rotation.x, -y, 0.04);
  });

  return (
    <Float speed={1} rotationIntensity={0.1} floatIntensity={0.3}>
      <mesh ref={mesh} position={[2.6, 0.2, -0.6]} scale={[5.8, 7.4, 1]}>
        <planeGeometry args={[1, 1, 16, 16]} />
        <meshStandardMaterial
          map={texture}
          roughness={0.4}
          metalness={0.05}
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
      <color attach="background" args={['#020202']} />
      <fog attach="fog" args={['#020202', 8, 20]} />

      <ambientLight intensity={0.45} />
      <pointLight position={[6, 3, 4]} intensity={2.5} color="#ff6b00" distance={16} />
      <pointLight position={[-3, 1, 3]} intensity={1.2} color="#39ff14" distance={12} />
      <spotLight position={[3, 6, 5]} angle={0.5} penumbra={0.8} intensity={2} color="#ffffff" />

      <Stars radius={60} depth={40} count={1600} factor={3} saturation={0} fade speed={0.4} />
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
      x: ((y - centerY) / centerY) * -10,
      y: ((x - centerX) / centerX) * 10,
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
      {/* Fullscreen 3D */}
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

      {/* Dark veil only on LEFT so woman stays bright on right */}
      <div
        className="absolute inset-0 z-[1] pointer-events-none"
        style={{
          background: `linear-gradient(90deg,
            rgba(2,2,2,0.92) 0%,
            rgba(2,2,2,0.7) 22%,
            rgba(2,2,2,0.25) 42%,
            transparent 58%
          )`,
        }}
      />

      {/* ========== FORM – absolute LEFT ========== */}
      <div
        className="absolute z-20 top-0 bottom-0 left-0 w-full max-w-[420px] flex items-center"
        style={{ padding: '24px 20px' }}
      >
        <div className="w-full" dir="rtl">
          {/* Logo + Title */}
          <div className="mb-6 text-center">
            <img
              src="/v5.png"
              alt="Alpha GYM"
              className="mx-auto w-[120px] sm:w-[140px] h-auto"
              style={{
                filter: 'drop-shadow(0 0 16px rgba(255,107,0,0.7)) drop-shadow(0 0 26px rgba(57,255,20,0.25))',
              }}
            />
            <h1
              className="mt-3 font-black tracking-[0.14em]"
              style={{
                fontSize: 'clamp(1.6rem, 4vw, 2.1rem)',
                background: `linear-gradient(180deg, #ffffff 0%, ${orangeBright} 45%, ${orange} 100%)`,
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                filter: 'drop-shadow(0 2px 8px rgba(255,107,0,0.4))',
              }}
            >
              ALPHA GYM
            </h1>
            <p
              className="mt-1 text-[11px] font-bold tracking-[0.28em] uppercase"
              style={{ color: neonGreen, textShadow: '0 0 10px rgba(57,255,20,0.45)' }}
            >
              Management System
            </p>
          </div>

          {/* Card */}
          <div
            ref={cardRef}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            style={{ perspective: '1000px' }}
          >
            <div
              className="rounded-2xl p-6 relative transition-transform duration-150 ease-out"
              style={{
                background: 'linear-gradient(165deg, rgba(12,12,12,0.95) 0%, rgba(5,5,5,0.98) 100%)',
                border: '1px solid rgba(255,107,0,0.4)',
                boxShadow: `
                  0 0 0 1px rgba(57,255,20,0.1),
                  0 20px 40px -8px rgba(0,0,0,0.9),
                  0 0 45px -8px rgba(255,107,0,0.28),
                  inset 0 1px 0 rgba(255,255,255,0.05)
                `,
                transform: `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg) translateZ(12px)`,
                backdropFilter: 'blur(12px)',
              }}
            >
              {/* top line */}
              <div
                className="absolute top-0 right-6 left-6 h-[2px] rounded-b-full"
                style={{
                  background: `linear-gradient(90deg, transparent, ${orange}, ${neonGreen}, transparent)`,
                  boxShadow: `0 0 8px ${orange}`,
                }}
              />

              <p
                className="text-center text-[13px] font-bold mb-5"
                style={{ color: '#ffd4a8', letterSpacing: '0.02em' }}
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

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Username */}
                <div>
                  <label
                    className="block text-[11px] font-bold mb-1.5"
                    style={{ color: 'rgba(255,140,51,0.9)' }}
                  >
                    نام کاربری
                  </label>
                  <div className="relative">
                    <User
                      size={15}
                      className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none"
                      style={{ color: 'rgba(255,107,0,0.55)' }}
                    />
                    <input
                      type="text"
                      className="w-full rounded-xl py-3 pr-9 pl-3 text-sm outline-none"
                      style={{
                        background: 'rgba(0,0,0,0.75)',
                        border: '1px solid rgba(255,107,0,0.3)',
                        color: '#f0f0f0',
                        boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.5)',
                      }}
                      placeholder="admin"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      required
                      onFocus={(e) => {
                        e.currentTarget.style.borderColor = neonGreen;
                        e.currentTarget.style.boxShadow =
                          '0 0 0 2px rgba(57,255,20,0.18), inset 0 2px 4px rgba(0,0,0,0.5)';
                      }}
                      onBlur={(e) => {
                        e.currentTarget.style.borderColor = 'rgba(255,107,0,0.3)';
                        e.currentTarget.style.boxShadow = 'inset 0 2px 4px rgba(0,0,0,0.5)';
                      }}
                    />
                  </div>
                </div>

                {/* Password */}
                <div>
                  <label
                    className="block text-[11px] font-bold mb-1.5"
                    style={{ color: 'rgba(255,140,51,0.9)' }}
                  >
                    رمز عبور
                  </label>
                  <div className="relative">
                    <Lock
                      size={15}
                      className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none"
                      style={{ color: 'rgba(255,107,0,0.55)' }}
                    />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      className="w-full rounded-xl py-3 pr-9 pl-9 text-sm outline-none"
                      style={{
                        background: 'rgba(0,0,0,0.75)',
                        border: '1px solid rgba(255,107,0,0.3)',
                        color: '#f0f0f0',
                        boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.5)',
                      }}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      onFocus={(e) => {
                        e.currentTarget.style.borderColor = neonGreen;
                        e.currentTarget.style.boxShadow =
                          '0 0 0 2px rgba(57,255,20,0.18), inset 0 2px 4px rgba(0,0,0,0.5)';
                      }}
                      onBlur={(e) => {
                        e.currentTarget.style.borderColor = 'rgba(255,107,0,0.3)';
                        e.currentTarget.style.boxShadow = 'inset 0 2px 4px rgba(0,0,0,0.5)';
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

                {/* Button */}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full mt-1 py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.97] disabled:opacity-55"
                  style={{
                    background: `linear-gradient(145deg, ${orangeBright}, ${orange} 55%, #e05a00)`,
                    color: '#0a0a0a',
                    border: '1px solid rgba(255,200,120,0.4)',
                    boxShadow: `
                      0 1px 0 rgba(255,255,255,0.25) inset,
                      0 5px 0 #b34a00,
                      0 12px 22px -3px rgba(255,107,0,0.5),
                      0 0 18px -2px rgba(57,255,20,0.22)
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

          <p className="text-[10px] mt-5 font-semibold tracking-[0.22em] text-white/20 text-center">
            ALPHA GYM · POWERED BY STRENGTH
          </p>
        </div>
      </div>
    </div>
  );
}
