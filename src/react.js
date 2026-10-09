// React wrapper: <BotAvatar type="clover" state="working" />
// Kept dependency-free at the library level: React is a peer import here only.
// onReady(bot) hands over the controller (for react(), speak(), lookAt(), …);
// onPoke, onBlink, onJump, onLand and onState listen to its events.

import { createElement, useEffect, useRef } from 'react';
import { BotAvatar as Controller } from './bot.js';

const EVENTS = { onPoke: 'poke', onBlink: 'blink', onJump: 'jump', onLand: 'land', onState: 'state', onGrab: 'grab', onToss: 'toss', onPet: 'pet' };

export function BotAvatar({ className, style, onReady, onPoke, onBlink, onJump, onLand, onState, onGrab, onToss, onPet, ...options }) {
  const host = useRef(null);
  const bot = useRef(null);
  const last = useRef('');
  const handlers = useRef({});
  handlers.current = { onPoke, onBlink, onJump, onLand, onState, onGrab, onToss, onPet };
  useEffect(() => {
    const b = (bot.current = new Controller(host.current, options));
    last.current = JSON.stringify(options);
    const offs = Object.entries(EVENTS).map(([prop, name]) => b.on(name, (e) => handlers.current[prop]?.(e)));
    onReady?.(b);
    return () => { offs.forEach((off) => off()); b.destroy(); bot.current = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    // Only when something actually changed: a render with the same props costs nothing.
    const key = JSON.stringify(options);
    if (key === last.current) return;
    last.current = key;
    bot.current?.set(options);
  });
  const size = options.size ?? 64;
  return createElement('span', { ref: host, className, style: { display: 'inline-block', width: size, height: size, lineHeight: 0, ...style } });
}

export default BotAvatar;
