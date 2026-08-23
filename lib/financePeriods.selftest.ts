// lib/financePeriods.selftest.ts
async function main() {
  const { getPeriodRange, expandRecurringInRange } = await import('./financePeriods');

  let failures = 0;
  function assert(cond: boolean, msg: string) {
    if (!cond) {
      failures++;
      console.error(`FAIL: ${msg}`);
    } else {
      console.log(`OK: ${msg}`);
    }
  }

  // getPeriodRange
  const anchor = new Date(2026, 2, 15); // March 15, 2026 (Sunday)
  const weekly = getPeriodRange('weekly', anchor);
  assert(weekly.start.getDate() <= 15 && weekly.end.getDate() >= 15, 'weekly range contains the anchor day');

  const monthly = getPeriodRange('monthly', anchor);
  assert(monthly.start.getMonth() === 2 && monthly.start.getDate() === 1, 'monthly range starts on the 1st');
  assert(monthly.end.getMonth() === 2 && monthly.end.getDate() === 31, 'monthly range ends on the 31st for March');

  const yearly = getPeriodRange('yearly', anchor);
  assert(yearly.start.getMonth() === 0 && yearly.start.getDate() === 1, 'yearly range starts Jan 1');
  assert(yearly.end.getMonth() === 11 && yearly.end.getDate() === 31, 'yearly range ends Dec 31');

  // expandRecurringInRange — weekly
  const weeklyItem = {
    id: '1', type: 'expense', category: 'groceries', label: 'Groceries', amount: 50,
    frequency: 'weekly', dayOfWeek: 1, dayOfMonth: null, monthOfYear: null,
    startDate: new Date(2026, 0, 1).toISOString(), endDate: null, isActive: true,
  };
  const monthRange = getPeriodRange('monthly', new Date(2026, 2, 1)); // March 2026 has 5 Mondays
  const weeklyOccurrences = expandRecurringInRange([weeklyItem], monthRange.start, monthRange.end);
  assert(weeklyOccurrences.length === 5, `weekly item expands to 5 Mondays in March 2026 (got ${weeklyOccurrences.length})`);
  assert(weeklyOccurrences.every((o) => o.amount === 50 && o.category === 'groceries'), 'weekly occurrences carry amount/category');

  // expandRecurringInRange — monthly with day-of-month clamping (31st in February)
  const monthlyItem = {
    id: '2', type: 'income', category: 'salary', label: 'Salary', amount: 3000,
    frequency: 'monthly', dayOfWeek: null, dayOfMonth: 31, monthOfYear: null,
    startDate: new Date(2026, 0, 1).toISOString(), endDate: null, isActive: true,
  };
  const febRange = getPeriodRange('monthly', new Date(2026, 1, 1)); // Feb 2026, not a leap year -> 28 days
  const febOccurrences = expandRecurringInRange([monthlyItem], febRange.start, febRange.end);
  assert(febOccurrences.length === 1, 'monthly item with dayOfMonth=31 still produces exactly one Feb occurrence');
  assert(febOccurrences[0]?.date.getDate() === 28, `Feb occurrence clamps to the 28th (got ${febOccurrences[0]?.date.getDate()})`);

  // expandRecurringInRange — yearly
  const yearlyItem = {
    id: '3', type: 'expense', category: 'insurance', label: 'Car Insurance', amount: 1200,
    frequency: 'yearly', dayOfWeek: null, dayOfMonth: 15, monthOfYear: 6,
    startDate: new Date(2025, 0, 1).toISOString(), endDate: null, isActive: true,
  };
  const yearRange = getPeriodRange('yearly', new Date(2026, 0, 1));
  const yearlyOccurrences = expandRecurringInRange([yearlyItem], yearRange.start, yearRange.end);
  assert(yearlyOccurrences.length === 1, 'yearly item expands to exactly one occurrence per year in range');
  assert(yearlyOccurrences[0]?.date.getMonth() === 5 && yearlyOccurrences[0]?.date.getDate() === 15, 'yearly occurrence lands on June 15');

  // expandRecurringInRange — inactive items excluded
  const inactiveItem = { ...weeklyItem, id: '4', isActive: false };
  assert(expandRecurringInRange([inactiveItem], monthRange.start, monthRange.end).length === 0, 'inactive items produce no occurrences');

  // expandRecurringInRange — items outside the date window excluded
  const futureItem = { ...weeklyItem, id: '5', startDate: new Date(2030, 0, 1).toISOString() };
  assert(expandRecurringInRange([futureItem], monthRange.start, monthRange.end).length === 0, 'items starting after the range produce no occurrences');

  const endedItem = { ...weeklyItem, id: '6', endDate: new Date(2025, 0, 1).toISOString() };
  assert(expandRecurringInRange([endedItem], monthRange.start, monthRange.end).length === 0, 'items ended before the range produce no occurrences');

  if (failures > 0) {
    console.error(`\n${failures} assertion(s) failed`);
    process.exit(1);
  }
  console.log('\nAll financePeriods assertions passed');
}

main();
