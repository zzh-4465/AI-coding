import React from 'react';
import { changeMonth, selectMonth } from '../calendar.js';

export default function Calendar({ selectedDate, onSelect, today, transactions = [], pool, budgets = {} }) {
  const [year, month] = selectedDate.split('-').map(Number);
  const prefix = selectedDate.slice(0, 7);
  const count = new Date(year, month, 0).getDate();
  const leading = (new Date(year, month - 1, 1).getDay() + 6) % 7;
  const tone = date => {
    const items = transactions.filter(item => item.date === date && (!pool || item.pool === pool));
    if (!items.length) return '';
    if (pool === 'food' && Number.isFinite(budgets[date])) {
      const spent = items.filter(item => item.amount < 0 && !item.transferId && item.kind !== 'calibration').reduce((sum, item) => sum - item.amount, 0);
      return spent > budgets[date] ? 'filled-danger' : spent > budgets[date] * .75 ? 'filled-warn' : 'filled-good';
    }
    return 'has-records';
  };
  return <section className="calendar-block">
    <div className="calendar-toolbar">
      <button type="button" aria-label="上个月" onClick={() => onSelect(changeMonth(selectedDate, -1))}>‹</button>
      <label><span>选择年月</span><input aria-label="选择年月" type="month" min="1900-01" max="9999-12" value={prefix} onChange={event => onSelect(selectMonth(selectedDate, event.target.value))} /></label>
      <button type="button" aria-label="下个月" onClick={() => onSelect(changeMonth(selectedDate, 1))}>›</button>
      <button type="button" className="calendar-today" onClick={() => onSelect(today)}>今天</button>
    </div>
    <div className="week-labels">{['一','二','三','四','五','六','日'].map(day => <span key={day}>{day}</span>)}</div>
    <div className="calendar-grid">
      {Array.from({ length: leading }, (_, index) => <span key={`blank-${index}`} />)}
      {Array.from({ length: count }, (_, index) => index + 1).map(day => {
        const date = `${prefix}-${String(day).padStart(2, '0')}`;
        return <button type="button" key={date} aria-label={`${year}年${month}月${day}日`} aria-pressed={date === selectedDate} className={`${date === selectedDate ? 'selected' : ''} ${tone(date)}`} onClick={() => onSelect(date)}>{day}</button>;
      })}
    </div>
    <p className="calendar-hint">带点日期有记录；历史预算缺失时不判断超支。</p>
  </section>;
}
