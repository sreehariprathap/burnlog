// app/(moneylog)/moneylog/buckets/[id]/_components/EntryListItem.tsx
type Entry = { id: string; type: string; amount: number; note: string | null; source: string; createdAt: string };

export function EntryListItem({ entry }: { entry: Entry }) {
  const isContribution = entry.type === 'contribution';
  return (
    <div className="flex items-center justify-between border-b py-2 last:border-0">
      <div>
        <p className="text-sm">{entry.note || (isContribution ? 'Contribution' : 'Withdrawal')}</p>
        <p className="text-xs text-muted-foreground">
          {new Date(entry.createdAt).toLocaleDateString()} · {entry.source === 'auto_rule' ? 'Auto rule' : 'Manual'}
        </p>
      </div>
      <span className={isContribution ? 'text-green-600' : 'text-destructive'}>
        {isContribution ? '+' : '-'}${entry.amount.toFixed(2)}
      </span>
    </div>
  );
}
