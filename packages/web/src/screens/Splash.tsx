import { m } from 'motion/react';
import { BrandMark } from '../components/icons';

export function Splash() {
  return (
    <div className="splash" aria-busy="true" aria-label="Loading">
      <m.div animate={{ scale: [1, 1.06, 1] }} transition={{ duration: 1.4, repeat: Infinity }}><BrandMark size={56} /></m.div>
    </div>
  );
}
