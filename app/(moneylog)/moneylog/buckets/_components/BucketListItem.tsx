// app/(moneylog)/moneylog/buckets/_components/BucketListItem.tsx
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import type { BucketSummary } from '@/lib/moneylog/queries';

export function BucketListItem({ bucket }: { bucket: BucketSummary }) {
  return (
    <Link href={`/moneylog/buckets/${bucket.id}`}>
      <Card>
        <CardContent className="pt-4 space-y-2">
          <div className="flex items-baseline justify-between">
            <span className="font-medium">{bucket.name}</span>
            <span className="text-lg font-semibold">${bucket.balance.toFixed(2)}</span>
          </div>
          {bucket.targetAmount !== null && (
            <>
              <Progress value={(bucket.progress ?? 0) * 100} />
              <p className="text-xs text-muted-foreground">
                {Math.round((bucket.progress ?? 0) * 100)}% of ${bucket.targetAmount.toFixed(2)}
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
