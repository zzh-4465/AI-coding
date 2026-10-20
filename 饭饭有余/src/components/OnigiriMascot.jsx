import React, { useId, useMemo, useState } from 'react';
import source from '../assets/onigiri.svg?raw';
import './OnigiriMascot.css';

const states = { overspent: 'low', energized: 'bright', normal: 'normal', sleepy: 'sleepy', dazed: 'blank', wilted: 'low', resting: 'sleepy' };

export default function OnigiriMascot({ stage = 'normal', mood = 'happy', reaction = '' }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const [hovered, setHovered] = useState(false);
  const state = mood === 'worried' ? 'low' : mood === 'careful' ? 'blank' : states[stage] || 'normal';
  const markup = useMemo(() => source
    .replace(/id="([^"]+)"/g, (_, name) => `id="${id}-${name}"`)
    .replace(/url\(#([^)]+)\)/g, (_, name) => `url(#${id}-${name})`)
    .replace('data-state="normal"', `data-state="${state}"`)
    .replace('class="mascot"', `class="mascot ${reaction ? `is-${reaction}` : ''}"`)
    .replace('data-mood="idle"', `data-mood="${stage === 'overspent' ? 'idle' : reaction === 'dizzy' ? 'dizzy' : ['petted', 'poked'].includes(reaction) ? 'happy' : hovered ? 'curious' : 'idle'}"`), [id, state, hovered, reaction, stage]);
  return <span className="onigiri-art" onPointerEnter={() => setHovered(true)} onPointerLeave={event => { setHovered(false); event.currentTarget.style.setProperty('--look-x', '0px'); event.currentTarget.style.setProperty('--look-y', '0px'); }} onPointerMove={event => {
    const rect = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty('--look-x', `${(event.clientX - rect.left - rect.width / 2) / rect.width * 12}px`);
    event.currentTarget.style.setProperty('--look-y', `${(event.clientY - rect.top - rect.height / 2) / rect.height * 8}px`);
  }} dangerouslySetInnerHTML={{ __html: markup }} />;
}
