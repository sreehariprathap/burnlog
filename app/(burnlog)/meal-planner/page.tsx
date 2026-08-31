// app/(burnlog)/meal-planner/page.tsx
import { Suspense } from 'react';
import type { Metadata } from 'next';
import { Loader2 } from 'lucide-react';
import { MealPlannerFlow } from './_components/MealPlannerFlow';

export const metadata: Metadata = {
  title: 'Meal Planner - burnlog',
};

export default function MealPlannerPage() {
  return (
    <Suspense
      fallback={
        <div className="h-screen flex items-center justify-center">
          <Loader2 className="animate-spin h-8 w-8" />
        </div>
      }
    >
      <MealPlannerFlow />
    </Suspense>
  );
}
