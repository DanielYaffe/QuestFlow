import { motion, AnimatePresence } from 'motion/react';
import { useEffect, useState } from 'react';

const RUNES = ['ᚠ', 'ᚢ', 'ᚦ', 'ᚨ', 'ᚱ', 'ᚲ', 'ᚷ', 'ᚹ', 'ᚺ', 'ᚾ', 'ᛁ', 'ᛃ', 'ᛇ', 'ᛈ', 'ᛉ', 'ᛊ', 'ᛏ', 'ᛒ', 'ᛖ', 'ᛗ', 'ᛚ', 'ᛜ', 'ᛞ', 'ᛟ'];

const OBJECTIVES_PHRASES = [
  'Consulting the ancient scrolls…',
  'Weaving fate into objectives…',
  'Deciphering the prophecy…',
  'Aligning the quest threads…',
];

const CHARACTERS_PHRASES = [
  'Summoning souls from the void…',
  'Breathing life into heroes…',
  'Forging characters in fire…',
  'Inscribing names in the ledger…',
];

const QUESTLINE_PHRASES = [
  'Binding the threads of fate…',
  'Etching the questline into stone…',
  'The oracle speaks…',
  'Forging your adventure…',
  'Awakening the quest…',
];

const ORBIT_COUNT = 8;

interface Props {
  visible: boolean;
  mode: 'objectives' | 'characters' | 'questline';
}

export function QuestLoadingScreen({ visible, mode }: Props) {
  const [phraseIndex, setPhraseIndex] = useState(0);
  const [runeGrid, setRuneGrid] = useState<string[]>([]);

  const phrases = mode === 'objectives' ? OBJECTIVES_PHRASES : mode === 'characters' ? CHARACTERS_PHRASES : QUESTLINE_PHRASES;

  useEffect(() => {
    if (!visible) return;
    setPhraseIndex(0);
    const interval = setInterval(() => {
      setPhraseIndex((i) => (i + 1) % phrases.length);
    }, 2200);
    return () => clearInterval(interval);
  }, [visible, mode, phrases.length]);

  // Randomize background rune grid on mount
  useEffect(() => {
    if (!visible) return;
    const grid = Array.from({ length: 48 }, () => RUNES[Math.floor(Math.random() * RUNES.length)]);
    setRuneGrid(grid);
  }, [visible]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          {/* Background rune grid */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            {runeGrid.map((rune, i) => (
              <motion.span
                key={i}
                className="absolute text-amber-900/20 font-mono select-none"
                style={{
                  left: `${(i % 8) * 13 + 2}%`,
                  top: `${Math.floor(i / 8) * 16 + 4}%`,
                  fontSize: `${14 + (i % 3) * 4}px`,
                }}
                animate={{ opacity: [0.1, 0.35, 0.1] }}
                transition={{
                  duration: 2.5 + (i % 5) * 0.4,
                  repeat: Infinity,
                  delay: (i % 7) * 0.3,
                }}
              >
                {rune}
              </motion.span>
            ))}
          </div>

          {/* Central sigil + orbiting particles */}
          <div className="relative flex items-center justify-center w-64 h-64">

            {/* Outer slow ring */}
            <motion.div
              className="absolute w-56 h-56 rounded-full border border-amber-700/30"
              animate={{ rotate: 360 }}
              transition={{ duration: 18, repeat: Infinity, ease: 'linear' }}
            />

            {/* Inner faster ring */}
            <motion.div
              className="absolute w-40 h-40 rounded-full border border-amber-600/40"
              animate={{ rotate: -360 }}
              transition={{ duration: 10, repeat: Infinity, ease: 'linear' }}
            />

            {/* Orbiting rune particles */}
            {Array.from({ length: ORBIT_COUNT }).map((_, i) => {
              const angle = (i / ORBIT_COUNT) * 360;
              const radius = 96;
              const rad = (angle * Math.PI) / 180;
              return (
                <motion.div
                  key={i}
                  className="absolute"
                  style={{ width: 96 * 2, height: 96 * 2, top: '50%', left: '50%', marginTop: -96, marginLeft: -96 }}
                  animate={{ rotate: 360 }}
                  transition={{ duration: 12 + (i % 3) * 2, repeat: Infinity, ease: 'linear', delay: -(i / ORBIT_COUNT) * 12 }}
                >
                  <span
                    className="absolute text-amber-400 font-mono text-sm"
                    style={{
                      top: `calc(50% + ${Math.sin(rad) * radius}px - 8px)`,
                      left: `calc(50% + ${Math.cos(rad) * radius}px - 6px)`,
                      textShadow: '0 0 8px rgba(251,191,36,0.8)',
                    }}
                  >
                    {RUNES[i % RUNES.length]}
                  </span>
                </motion.div>
              );
            })}

            {/* Central glowing sigil */}
            <motion.div
              className="relative z-10 w-20 h-20 rounded-full bg-zinc-900 border border-amber-600/60 flex items-center justify-center"
              animate={{ boxShadow: ['0 0 12px rgba(251,191,36,0.3)', '0 0 32px rgba(251,191,36,0.7)', '0 0 12px rgba(251,191,36,0.3)'] }}
              transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            >
              <motion.span
                className="text-3xl select-none"
                animate={{ rotate: [0, 10, -10, 0], scale: [1, 1.1, 1] }}
                transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
              >
                {mode === 'objectives' ? '📜' : mode === 'characters' ? '⚔️' : '🌟'}
              </motion.span>
            </motion.div>
          </div>

          {/* Cycling phrase */}
          <div className="absolute bottom-1/3 w-full flex justify-center">
            <AnimatePresence mode="wait">
              <motion.p
                key={phraseIndex}
                className="text-amber-400/80 text-sm tracking-widest uppercase font-mono"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.4 }}
              >
                {phrases[phraseIndex]}
              </motion.p>
            </AnimatePresence>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
