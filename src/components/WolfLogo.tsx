export default function WolfLogo({ size = 40, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Wolf head silhouette */}
      <path
        d="M50 8C35 8 22 20 20 35L10 25L18 42C16 48 16 54 18 60L8 55L16 66C20 78 34 88 50 88C66 88 80 78 84 66L92 55L82 60C84 54 84 48 82 42L90 25L80 35C78 20 65 8 50 8Z"
        fill="url(#goldGrad)"
      />
      {/* Eyes */}
      <ellipse cx="38" cy="40" rx="4" ry="3" fill="#050505" />
      <ellipse cx="62" cy="40" rx="4" ry="3" fill="#050505" />
      {/* Eye glow */}
      <ellipse cx="38" cy="40" rx="2" ry="1.5" fill="#d4a843" />
      <ellipse cx="62" cy="40" rx="2" ry="1.5" fill="#d4a843" />
      {/* Nose */}
      <path d="M47 50L50 53L53 50L50 48L47 50Z" fill="#050505" />
      {/* Mouth lines */}
      <path d="M50 53L44 58" stroke="#050505" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M50 53L56 58" stroke="#050505" strokeWidth="1.5" strokeLinecap="round" />
      <defs>
        <linearGradient id="goldGrad" x1="10" y1="8" x2="90" y2="88" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#e5ac2a" />
          <stop offset="50%" stopColor="#d4a843" />
          <stop offset="100%" stopColor="#b8862a" />
        </linearGradient>
      </defs>
    </svg>
  );
}
