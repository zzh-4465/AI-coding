export const isDateKey = value => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  return year >= 1900 && year <= 9999 && month >= 1 && month <= 12 && day >= 1 && day <= new Date(year, month, 0).getDate();
};
export function changeMonth(date, offset) {
  const [year, month, day] = date.split('-').map(Number);
  const next = new Date(year, month - 1 + offset, 1);
  return selectMonth(date, `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`);
}
export function selectMonth(date, month) {
  const [year, number] = month.split('-').map(Number);
  if (!/^\d{4}-\d{2}$/.test(month) || year < 1900 || year > 9999 || number < 1 || number > 12) return date;
  return `${month}-${String(Math.min(Number(date.slice(-2)), new Date(year, number, 0).getDate())).padStart(2, '0')}`;
}
