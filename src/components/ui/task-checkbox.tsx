import { useState } from 'react';
import { CheckSquare, Square } from 'lucide-react';
import { triggerCompletionFeedback } from '@/lib/feedbackUtils';

interface TaskCheckboxProps {
  checked: boolean;
  onToggle: () => void;
  disabled?: boolean;
  size?: 'sm' | 'md';
}

// Confetti particle component - paper confetti style with JS-calculated coordinates
function ConfettiParticles() {
  const particles = Array.from({ length: 16 }, (_, i) => i);
  const colors = [
    'bg-orange-400', 'bg-yellow-400', 'bg-green-400', 'bg-blue-400', 
    'bg-pink-400', 'bg-purple-400', 'bg-red-400', 'bg-cyan-400'
  ];
  const shapes = ['rounded-full', 'rounded-sm', 'rounded-none'];
  
  return (
    <div className="absolute inset-0 pointer-events-none overflow-visible">
      {particles.map((i) => {
        // Calculate angle and distance with some randomness
        const angleRad = ((i / 16) * 360 + Math.random() * 20) * (Math.PI / 180);
        const distance = 20 + Math.random() * 25;
        
        // Calculate coordinates using JavaScript (avoids CSS cos/sin compatibility issues)
        const txMid = `${Math.cos(angleRad) * distance * 0.5}px`;
        const tyMid = `${Math.sin(angleRad) * distance * 0.5 - 10}px`;
        const txEnd = `${Math.cos(angleRad) * distance}px`;
        const tyEnd = `${Math.sin(angleRad) * distance + 15}px`;
        
        const size = Math.random() > 0.5 ? 'w-1.5 h-1.5' : 'w-2 h-1';
        const shape = shapes[i % 3];
        const color = colors[i % colors.length];
        
        return (
          <span
            key={i}
            className={`absolute confetti-particle ${size} ${shape} ${color}`}
            style={{
              left: '50%',
              top: '50%',
              '--tx-mid': txMid,
              '--ty-mid': tyMid,
              '--tx-end': txEnd,
              '--ty-end': tyEnd,
              '--duration': `${500 + Math.random() * 200}ms`,
              '--delay': `${i * 25}ms`,
            } as React.CSSProperties}
          />
        );
      })}
    </div>
  );
}

export function TaskCheckbox({ checked, onToggle, disabled = false, size = 'md' }: TaskCheckboxProps) {
  const [animating, setAnimating] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (disabled) return;
    
    // Only trigger celebration when completing (not uncompleting)
    if (!checked) {
      setAnimating(true);
      setShowConfetti(true);
      triggerCompletionFeedback();
      
      setTimeout(() => setAnimating(false), 400);
      setTimeout(() => setShowConfetti(false), 600);
    }
    
    onToggle();
  };
  
  const iconSize = size === 'sm' ? 'h-4 w-4' : 'h-5 w-5';
  
  return (
    <button
      onClick={handleClick}
      disabled={disabled}
      className={`
        relative flex items-center justify-center
        transition-transform duration-200
        ${animating ? 'animate-task-complete' : ''}
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:scale-110'}
      `}
      aria-label={checked ? 'Mark as incomplete' : 'Mark as complete'}
    >
      {checked ? (
        <CheckSquare 
          className={`${iconSize} text-orange-500 transition-colors duration-200`} 
        />
      ) : (
        <Square 
          className={`${iconSize} text-muted-foreground hover:text-orange-500 transition-colors duration-200`} 
        />
      )}
      
      {showConfetti && <ConfettiParticles />}
    </button>
  );
}
