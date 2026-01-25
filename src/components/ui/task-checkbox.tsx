import { useState } from 'react';
import { CheckSquare, Square } from 'lucide-react';
import { triggerCompletionFeedback } from '@/lib/feedbackUtils';

interface TaskCheckboxProps {
  checked: boolean;
  onToggle: () => void;
  disabled?: boolean;
  size?: 'sm' | 'md';
}

// Confetti particle component - paper confetti style
function ConfettiParticles() {
  const particles = Array.from({ length: 16 }, (_, i) => i);
  const colors = [
    'bg-orange-400', 'bg-yellow-400', 'bg-green-400', 'bg-blue-400', 
    'bg-pink-400', 'bg-purple-400', 'bg-red-400', 'bg-cyan-400'
  ];
  const shapes = ['rounded-full', 'rounded-sm', 'rounded-none']; // circle, square, rectangle
  
  return (
    <div className="absolute inset-0 pointer-events-none overflow-visible">
      {particles.map((i) => {
        const angle = (i / 16) * 360 + Math.random() * 20;
        const distance = 20 + Math.random() * 25;
        const size = Math.random() > 0.5 ? 'w-1.5 h-1.5' : 'w-2 h-1';
        const shape = shapes[i % 3];
        const color = colors[i % colors.length];
        const delay = i * 25;
        const duration = 500 + Math.random() * 200;
        
        return (
          <span
            key={i}
            className={`absolute ${size} ${shape} ${color}`}
            style={{
              left: '50%',
              top: '50%',
              '--confetti-angle': `${angle}deg`,
              '--confetti-distance': `${distance}px`,
              '--confetti-rotation': `${Math.random() * 720 - 360}deg`,
              animation: `confetti-burst ${duration}ms cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards`,
              animationDelay: `${delay}ms`,
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
