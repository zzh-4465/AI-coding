import React, { useEffect, useRef, useState } from 'react';

const KEY = 'fanfan-floating-pet-position-v1';
const clamp = value => Math.max(0, Math.min(1, value));
export default function FloatingPet({ stage, children, onTap }) {
  const button = useRef(null), gesture = useRef(null), suppressClick = useRef(false);
  const [position, setPosition] = useState(() => {
    try { const saved = JSON.parse(localStorage.getItem(KEY)); if (Number.isFinite(saved?.x) && Number.isFinite(saved?.y)) return { x: clamp(saved.x), y: clamp(saved.y) }; } catch {}
    return { x: 1, y: 1 };
  });
  const [bounds, setBounds] = useState(null);
  const measure = () => {
    const frame = button.current?.closest('.phone-stage')?.getBoundingClientRect();
    const nav = button.current?.closest('.phone-stage')?.querySelector('.bottom-nav')?.getBoundingClientRect();
    const width = window.visualViewport?.width || window.innerWidth, height = window.visualViewport?.height || window.innerHeight;
    const left = Math.max(8, (frame?.left || 0) + 8), top = Math.max(8, (frame?.top || 0) + 65);
    const next = { left, top, right: Math.max(left, Math.min(width, frame?.right || width) - 86), bottom: Math.max(top, Math.min(height, nav?.top || height) - 88) };
    setBounds(previous => previous && Object.keys(next).every(key => next[key] === previous[key]) ? previous : next);
  };
  useEffect(measure);
  useEffect(() => {
    window.addEventListener('resize', measure); window.addEventListener('scroll', measure, true); window.visualViewport?.addEventListener('resize', measure);
    return () => { window.removeEventListener('resize', measure); window.removeEventListener('scroll', measure, true); window.visualViewport?.removeEventListener('resize', measure); };
  }, []);
  const point = bounds ? { x: bounds.left + position.x * (bounds.right - bounds.left), y: bounds.top + position.y * (bounds.bottom - bounds.top) } : null;
  const finish = event => {
    const active = gesture.current;
    if (!active || active.id !== event.pointerId) return;
    if (active.moved) {
      suppressClick.current = true;
      try { localStorage.setItem(KEY, JSON.stringify(active.latest)); } catch {}
    }
    gesture.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  return <button ref={button} type="button" className={`global-pet-button draggable-pet stage-${stage}`} style={point ? { left: point.x, top: point.y } : { right: 16, bottom: 86 }} aria-label="饭团助手，点击记账，可拖动位置" onPointerDown={event => {
    if (!point || (event.pointerType === 'mouse' && event.button !== 0)) return;
    suppressClick.current = false; gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY, left: point.x, top: point.y, latest: position, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  }} onPointerMove={event => {
    const active = gesture.current;
    if (!active || active.id !== event.pointerId || !bounds) return;
    const dx = event.clientX - active.x, dy = event.clientY - active.y;
    if (!active.moved && Math.hypot(dx, dy) < 7) return;
    active.moved = true;
    active.latest = { x: clamp((active.left + dx - bounds.left) / (bounds.right - bounds.left || 1)), y: clamp((active.top + dy - bounds.top) / (bounds.bottom - bounds.top || 1)) };
    setPosition(active.latest);
  }} onPointerUp={finish} onPointerCancel={finish} onClick={() => {
    if (suppressClick.current) { suppressClick.current = false; return; }
    onTap();
  }} onContextMenu={event => event.preventDefault()}>
    <span className="global-pet-hint">点我记账 · 可拖动</span>{children}
  </button>;
}
