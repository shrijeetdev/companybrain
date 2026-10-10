// Motion's animation/gesture/layout features, loaded after first paint by <LazyMotion> in App.
// Keeping them out of the entry chunk is the single biggest bundle win; `m.*` components render
// immediately and start animating once this arrives.
import { domMax } from 'motion/react';

export default domMax;
