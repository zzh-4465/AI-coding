import React from 'react';
import { now, setSimulationTime, exitSimulation } from '../clock.js';

export default function SimulationBanner() {
  const date = now();
  const move = unit => {
    const next = new Date(date);
    if (unit === 'day') next.setDate(next.getDate() + 1);
    else { next.setDate(1); next.setMonth(next.getMonth() + 1); }
    setSimulationTime(next.toISOString());
  };
  const local = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  return <aside className="simulation-banner">
    <b>时间演练 · 独立账本</b><span>这里的记账和日期变化不会写入真实账本。</span>
    <input type="datetime-local" aria-label="模拟日期时间" value={local} onChange={event => event.target.value && setSimulationTime(event.target.value)} />
    <div><button onClick={() => move('day')}>下一天</button><button onClick={() => move('month')}>下月 1 日</button><button onClick={exitSimulation}>返回真实账本</button></div>
  </aside>;
}
