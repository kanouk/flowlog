import { useState } from 'react';
import { CheckSquare, Square } from 'lucide-react';
import { triggerCompletionFeedback } from '@/lib/feedbackUtils';

interface TaskCheckboxProps {
  checked: boolean;
  onToggle: () => void;
  disabled?: boolean;
  size?: 'sm' | 'md';
}

// Confetti particle component
function ConfettiParticles() {
  const particles = Array.from({ length: 6 }, (_, i) => i);
  const colors = ['bg-orange-400', 'bg-yellow-400', 'bg-green-400', 'bg-blue-400', 'bg-pink-400', 'bg-purple-400'];
  
  return (
    <div className="absolute inset-0 pointer-events-none">
      {particles.map((i) => (
        <span
          key={i}
          className={`absolute w-1.5 h-1.5 rounded-full ${colors[i]} animate-confetti-pop`}
          style={{
            left: '50%',
            top: '50%',
            transform: `rotate(${i * 60}deg) translateY(-8px)`,
            animationDelay: `${i * 30}ms`,
          }}
        />
      ))}
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
