
import React, { useEffect, useState } from 'react';
import { Cloud, Moon } from 'lucide-react';

interface AODDisplayProps {
  onWake: () => void;
}

const AODDisplay: React.FC<AODDisplayProps> = ({ onWake }) => {
  const [time, setTime] = useState(new Date());
  const [offset, setOffset] = useState({ x: 0, y: 0 }); // Pixel shifting
  
  useEffect(() => {
    const timer = setInterval(() => {
      setTime(new Date());
    }, 1000);
    
    // Pixel Shifting every minute to prevent burn-in
    const shifter = setInterval(() => {
        setOffset({
            x: (Math.random() - 0.5) * 50, // Move within 50px range
            y: (Math.random() - 0.5) * 50
        });
    }, 60000);

    return () => {
        clearInterval(timer);
        clearInterval(shifter);
    };
  }, []);

  const hours = time.getHours().toString().padStart(2, '0');
  const minutes = time.getMinutes().toString().padStart(2, '0');
  const date = new Intl.DateTimeFormat('vi-VN', { weekday: 'long', day: 'numeric', month: 'long' }).format(time);

  return (
    <div 
        onClick={onWake}
        className="fixed inset-0 bg-black z-[100] flex items-center justify-center cursor-pointer select-none"
    >
      <div 
        className="text-center transition-transform duration-[2000ms]"
        style={{ transform: `translate(${offset.x}px, ${offset.y}px)` }}
      >
        <div className="flex items-center justify-center mb-6 opacity-40">
            <Moon size={32} className="text-purple-300" />
        </div>
        
        <h1 className="text-[80px] md:text-[120px] font-thin text-neutral-800 leading-none tracking-tighter"
            style={{ fontFamily: 'Inter, sans-serif' }}>
            {hours}<span className="animate-pulse">:</span>{minutes}
        </h1>
        
        <p className="text-neutral-600 mt-4 text-base md:text-lg font-light tracking-widest uppercase">
            {date}
        </p>

        <div className="mt-12 flex justify-center gap-4 text-neutral-700 text-sm">
             <div className="flex items-center gap-2">
                 <Cloud size={16} />
                 <span>26°C • Hà Nội</span>
             </div>
        </div>

        <p className="fixed bottom-10 left-0 right-0 text-center text-[10px] text-neutral-800 tracking-[0.3em] uppercase">
            Chạm để đánh thức Aura
        </p>
      </div>
    </div>
  );
};

export default AODDisplay;

