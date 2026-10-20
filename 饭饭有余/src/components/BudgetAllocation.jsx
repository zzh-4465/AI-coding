import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { allocateAmounts, allocationBoundary, moveAutomaticBoundary } from '../allocation.js';

const pools = [
  ['savings', '储蓄池', 'blue', '只进不出'],
  ['food', '饮食池', 'green', '用于一日三餐'],
  ['emergency', '应急必备池', 'coral', '水电医药等必需'],
  ['happy', '小余仓', 'yellow', '奖励与灵活开销']
];

const steadyStudentRatios = { savings: 20, food: 55, emergency: 15, happy: 10 };

export default function BudgetAllocation({ ratios, onChange, onAllocationChange, amount = 0 }) {
  const board = useRef(null);
  const [weights, setWeights] = useState(() => ({ ...ratios }));
  const [fixed, setFixed] = useState({});
  const [lastEdited, setLastEdited] = useState(null);
  const allocation = useMemo(() => allocateAmounts(amount, weights, fixed), [amount, weights, fixed]);
  const hasFixed = Object.keys(fixed).length > 0;
  const format = value => Number(value).toFixed(2);
  useLayoutEffect(() => {
    if (allocation.valid) onChange(allocation.ratios);
    onAllocationChange?.(allocation);
  }, [allocation, onChange, onAllocationChange]);
  const release = key => setFixed(current => { const next = { ...current }; delete next[key]; return next; });
  const remainingFor = key => Math.max(0, Math.round((allocation.total - allocation.fixedTotal + (Number(fixed[key]) || 0)) * 100) / 100);
  const editedTitle = pools.find(([key]) => key === lastEdited)?.[1];
  const otherFixedExceedsBudget = lastEdited && allocation.fixedTotal - (Number(fixed[lastEdited]) || 0) > allocation.total + .00001;
  const error = allocation.invalidKeys.length ? '请填写有效金额，最多保留两位小数。'
    : allocation.remainder < 0 ? `超出总预算 ${format(-allocation.remainder)} 元${otherFixedExceedsBudget ? '，其他已固定金额也已超额，请同时调整其他池子' : lastEdited ? `，${editedTitle}最多可填 ${format(remainingFor(lastEdited))} 元` : ''}。`
    : !allocation.freeKeys.length && allocation.remainder > 0 ? `还有 ${format(allocation.remainder)} 元未分配，请调整金额或恢复一个池子自动分配。` : '';
  const displayRatios = allocation.valid ? allocation.ratios : weights;
  const values = pools.map(([key]) => Number(displayRatios[key] || 0));
  const boundaries = values.slice(0, -1).map((_, index) => values.slice(0, index + 1).reduce((sum, value) => sum + value, 0));
  const changeBoundary = (index, position) => setWeights(current => moveAutomaticBoundary(amount, current, fixed, index, position));
  const drag = (event, index) => {
    const rect = board.current.getBoundingClientRect();
    changeBoundary(index, (event.clientY - rect.top) / rect.height * 100);
  };
  const handle = (index, position) => {
    const boundary = allocationBoundary(allocation, fixed, index);
    const disabled = !boundary;
    const minimum = boundary?.minimum ?? position;
    const maximum = boundary?.maximum ?? position;
    return {
      role: 'slider', tabIndex: disabled ? -1 : 0,
      'aria-disabled': disabled,
      'aria-label': `${pools[index][1]}和${pools[index + 1][1]}之间的分隔线`,
      'aria-valuemin': minimum, 'aria-valuemax': maximum, 'aria-valuenow': position, 'aria-orientation': 'vertical',
      onPointerDown: event => {
        if (disabled) return;
        event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); drag(event, index);
      },
      onPointerMove: event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) drag(event, index); },
      onPointerUp: event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); },
      onKeyDown: event => {
        if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key) || disabled) return;
        event.preventDefault();
        changeBoundary(index, event.key === 'Home' ? minimum : event.key === 'End' ? maximum : position + (event.key === 'ArrowDown' ? 1 : -1));
      }
    };
  };

  return <section className="allocation-editor">
    <div className="allocation-head"><b>分配到各个资金池</b><span className={allocation.valid ? 'valid' : 'invalid'}>{allocation.valid ? '已分配完成' : Number(amount) > 0 ? '待调整' : '先填总预算'}</span></div>
    <p className="allocation-help">填过的金额固定，其余池子按原比例分配剩余金额。</p>
    <div className="allocation-amounts">{pools.map(([key, title, tone]) => {
      const locked = Object.hasOwn(fixed, key);
      return <div className={`allocation-amount-row ${tone}`} key={key}>
        <label htmlFor={`allocation-${key}`}><b>{title}</b><small>{allocation.valid ? `${Number(allocation.ratios[key].toFixed(2))}%` : '待确认'}</small></label>
        <div className="allocation-number"><span>¥</span><input id={`allocation-${key}`} aria-label={`${title}分配金额`} type="number" required inputMode="decimal" min="0" step="0.01" disabled={!(Number(amount) > 0)} value={locked ? fixed[key] : format(allocation.amounts[key])} onFocus={event => event.target.select()} onChange={event => { setLastEdited(key); setFixed(current => ({ ...current, [key]: event.target.value })); }} aria-invalid={allocation.invalidKeys.includes(key) || Boolean(error && lastEdited === key)} aria-describedby={error ? 'allocation-error' : undefined}/></div>
        {locked ? <button type="button" className="allocation-lock" aria-label={`${title}已固定，点击恢复自动分配`} onClick={() => release(key)}>已固定 ↺</button> : <span className="allocation-auto">{allocation.freeKeys.length === 1 ? '剩余金额' : '自动分配'}</span>}
      </div>;
    })}</div>
    {error && <p className="allocation-error" id="allocation-error" role="alert">{error}</p>}
    <p className="allocation-sum">总预算 <b>¥{format(allocation.total)}</b><span>已固定 ¥{format(allocation.fixedTotal)}</span></p>
    <details className="allocation-chart" open><summary>查看分配图，也可拖动调整</summary>
      <div className="allocation-guide"><p className="allocation-help">{!allocation.valid ? '先修正金额，再拖动分隔线。' : allocation.freeKeys.length < 2 ? '至少保留两个自动池子，才能继续拖动分配。' : hasFixed ? '固定金额不变，拖动时调整分隔线两侧最近的自动池子。' : '上下拖动分隔线，调整相邻两个池子。'}</p><button type="button" onClick={() => setWeights(steadyStudentRatios)}>稳健参考</button></div>
      <div ref={board} className="allocation-stack">
        {pools.map(([key, title, tone, description]) => <div className={`allocation-layer ${tone}`} style={{ height: `${displayRatios[key]}%` }} key={key}><span>{title}<em>{description}</em></span><b>{Number(displayRatios[key].toFixed(2))}%</b><small>¥{format(allocation.amounts[key])}</small></div>)}
        {boundaries.map((position, index) => <div className="allocation-boundary" style={{ top: `${position}%` }} key={index} {...handle(index, position)}><span>↕</span></div>)}
      </div>
    </details>
  </section>;
}
