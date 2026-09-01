/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useMemo, useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { format, parseISO, differenceInDays, addDays } from 'date-fns';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { SmoothTabs, type TabItem } from '@/components/kokonutui/smooth-tabs';
import { MotionCarousel } from '@/components/kokonutui/motion-carousel';
import { Scale, Flame, Utensils, HeartPulse, TrendingUp, Zap, Repeat, BarChart3 } from 'lucide-react';

// Types
interface WeightEntry {
  id: string;
  profileId: string;
  date: string;
  weight: number;
  notes?: string;
}

interface Goal {
  id: string;
  profileId: string;
  goalType: string;
  targetValue: number;
  createdAt: string;
}

interface CalorieBurn {
  id: string;
  profileId: string;
  date: string;
  activityType: string;
  duration: number;
  caloriesBurned: number;
}

interface FoodIntake {
  id: string;
  profileId: string;
  date: string;
  calories: number;
  mealType: string;
}

interface StaminaSession {
  id: string;
  profileId: string;
  date: string;
  activityType: string;
  duration: number;
  distance?: number;
}

interface InsightsClientProps {
  weightEntries: WeightEntry[];
  weightGoal: Goal | null;
  calorieBurns: CalorieBurn[];
  foodIntakes: FoodIntake[];
  staminaSessions: StaminaSession[];
}

type MetricKey = 'weight' | 'calories' | 'food' | 'stamina';

const METRIC_EMPTY_STATE: Record<MetricKey, { icon: string; message: string }> = {
  weight: { icon: '⚖️', message: 'Log your weight to see trends here.' },
  calories: { icon: '🔥', message: 'Log a workout to see calories burned over time.' },
  food: { icon: '🍽️', message: 'Log a meal to see your calorie intake over time.' },
  stamina: { icon: '💓', message: 'Log a stamina session to see your endurance trend.' },
};

// Data processing helper functions
function fillMissingDates<T extends { date: string; [key: string]: any }>(
  entries: T[],
  valueKey: keyof T,
  startDate: Date | null,
  endDate: Date = new Date()
): Array<{ date: string; [key: string]: any }> {
  if (entries.length === 0) return [];

  if (!startDate) {
    startDate = entries.length > 0 ? parseISO(entries[0].date) : new Date();
  }

  const dateMap = new Map<string, any>();

  entries.forEach((entry) => {
    const dateStr = format(parseISO(entry.date), 'yyyy-MM-dd');
    dateMap.set(dateStr, { date: dateStr, [valueKey]: entry[valueKey] });
  });

  const result = [];
  const days = differenceInDays(endDate, startDate) + 1;

  for (let i = 0; i < days; i++) {
    const currentDate = addDays(startDate, i);
    const dateStr = format(currentDate, 'yyyy-MM-dd');

    if (dateMap.has(dateStr)) {
      result.push(dateMap.get(dateStr));
    } else {
      let prevDate = null;
      let nextDate = null;
      let prevValue = null;
      let nextValue = null;

      for (let j = i - 1; j >= 0; j--) {
        const checkDate = addDays(startDate, j);
        const checkDateStr = format(checkDate, 'yyyy-MM-dd');
        if (dateMap.has(checkDateStr)) {
          prevDate = checkDate;
          prevValue = dateMap.get(checkDateStr)[valueKey];
          break;
        }
      }

      for (let j = i + 1; j < days; j++) {
        const checkDate = addDays(startDate, j);
        const checkDateStr = format(checkDate, 'yyyy-MM-dd');
        if (dateMap.has(checkDateStr)) {
          nextDate = checkDate;
          nextValue = dateMap.get(checkDateStr)[valueKey];
          break;
        }
      }

      let interpolatedValue = null;
      if (prevValue !== null && nextValue !== null) {
        const totalDays = differenceInDays(nextDate!, prevDate!);
        const daysSincePrev = differenceInDays(currentDate, prevDate!);
        const ratio = daysSincePrev / totalDays;
        interpolatedValue = prevValue + ratio * (nextValue - prevValue);
      } else if (prevValue !== null) {
        interpolatedValue = prevValue;
      } else if (nextValue !== null) {
        interpolatedValue = nextValue;
      }

      if (interpolatedValue !== null) {
        result.push({
          date: dateStr,
          [valueKey]: interpolatedValue,
          isInterpolated: true,
        });
      }
    }
  }

  return result;
}

function calculateTrend(data: Array<{ date: string; [key: string]: any }>, valueKey: string) {
  if (data.length < 2) return { slope: 0, trend: 'No clear trend yet' };

  const firstValue = data[0][valueKey];
  const lastValue = data[data.length - 1][valueKey];
  const daysDiff = differenceInDays(parseISO(data[data.length - 1].date), parseISO(data[0].date));

  if (daysDiff === 0) return { slope: 0, trend: 'No clear trend yet' };

  const slope = (lastValue - firstValue) / daysDiff;

  let trendText = 'No clear trend yet';
  if (Math.abs(slope) > 0.01) {
    trendText =
      slope < 0
        ? `losing ${Math.abs(slope).toFixed(2)} per day`
        : `gaining ${slope.toFixed(2)} per day`;
  }

  return { slope, trend: trendText };
}

function calculateForecast(data: Array<{ date: string; [key: string]: any }>, valueKey: string, targetValue: number) {
  const { slope } = calculateTrend(data, valueKey);
  const currentValue = data[data.length - 1][valueKey];

  if (Math.abs(slope) < 0.01 || (targetValue < currentValue && slope >= 0) || (targetValue > currentValue && slope <= 0)) {
    return 'No clear progress toward goal';
  }

  const daysToGoal = Math.abs((targetValue - currentValue) / slope);
  const forecastDate = addDays(new Date(), Math.ceil(daysToGoal));

  return `At this rate, you'll hit ${targetValue} by ${format(forecastDate, 'MMMM d, yyyy')}`;
}

function calculateFastestProgress(chartData: Array<{ date: string; [key: string]: any }>, metric: MetricKey, valueKey: string) {
  if (chartData.length < 2) return 'Not enough data';

  let maxDrop = 0;
  let maxDropDate = '';

  for (let i = 1; i < chartData.length; i++) {
    const change = chartData[i - 1][valueKey] - chartData[i][valueKey];
    if (metric === 'weight' && change > maxDrop) {
      maxDrop = change;
      maxDropDate = chartData[i].date;
    } else if (metric !== 'weight' && change < maxDrop) {
      maxDrop = change;
      maxDropDate = chartData[i].date;
    }
  }

  if (maxDrop === 0) return 'No significant change detected';

  const direction = metric === 'weight' ? 'loss' : 'gain';
  return `Highest ${direction}: ${Math.abs(maxDrop).toFixed(1)} on ${format(parseISO(maxDropDate), 'MMM d')}`;
}

function calculateLongestStreak(chartData: Array<{ date: string; [key: string]: any }>) {
  if (chartData.length === 0) return 'No data yet';

  const nonInterpolatedData = chartData.filter((d) => !d.isInterpolated);
  if (nonInterpolatedData.length < 2) return 'Log more data to see streaks';

  let currentStreak = 1;
  let longestStreak = 1;

  for (let i = 1; i < nonInterpolatedData.length; i++) {
    const prevDate = parseISO(nonInterpolatedData[i - 1].date);
    const currDate = parseISO(nonInterpolatedData[i].date);

    if (differenceInDays(currDate, prevDate) === 1) {
      currentStreak++;
      longestStreak = Math.max(longestStreak, currentStreak);
    } else {
      currentStreak = 1;
    }
  }

  return `Longest logging streak: ${longestStreak} days`;
}

function calculateAverage(chartData: Array<{ date: string; [key: string]: any }>, metric: MetricKey, valueKey: string) {
  if (chartData.length === 0) return 'No data available';

  const sum = chartData.reduce((acc, d) => acc + d[valueKey], 0);
  const average = sum / chartData.length;

  switch (metric) {
    case 'weight':
      return `Average weight: ${average.toFixed(1)} kg`;
    case 'calories':
      return `Average daily burn: ${average.toFixed(0)} cal`;
    case 'food':
      return `Average daily intake: ${average.toFixed(0)} cal`;
    case 'stamina':
      return `Average duration: ${average.toFixed(0)} min`;
    default:
      return 'No data available';
  }
}

const METRIC_META: Record<MetricKey, { title: string; yAxisLabel: string; dataKey: string; unit: string }> = {
  weight: { title: 'Weight Over Time', yAxisLabel: 'Weight (kg)', dataKey: 'weight', unit: 'kg' },
  calories: { title: 'Calories Burned Over Time', yAxisLabel: 'Calories Burned', dataKey: 'calories', unit: 'cal' },
  food: { title: 'Food Intake Over Time', yAxisLabel: 'Calories Consumed', dataKey: 'intake', unit: 'cal' },
  stamina: { title: 'Stamina Over Time', yAxisLabel: 'Duration (min)', dataKey: 'duration', unit: 'min' },
};

function MetricSlide({
  metric,
  chartData,
  weightGoal,
}: {
  metric: MetricKey;
  chartData: Array<{ date: string; [key: string]: any }>;
  weightGoal: Goal | null;
}) {
  const meta = METRIC_META[metric];

  const trend = useMemo(() => {
    if (chartData.length === 0) return { trend: 'No data available' };
    return calculateTrend(chartData, meta.dataKey);
  }, [chartData, meta.dataKey]);

  const forecast = useMemo(() => {
    if (chartData.length === 0 || metric !== 'weight' || !weightGoal) return 'No forecast available';
    return calculateForecast(chartData, 'weight', weightGoal.targetValue);
  }, [chartData, metric, weightGoal]);

  const fastestProgress = useMemo(() => calculateFastestProgress(chartData, metric, meta.dataKey), [chartData, metric, meta.dataKey]);
  const longestStreak = useMemo(() => calculateLongestStreak(chartData), [chartData]);
  const averageMetric = useMemo(() => calculateAverage(chartData, metric, meta.dataKey), [chartData, metric, meta.dataKey]);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{meta.title}</CardTitle>
        </CardHeader>
        <CardContent>
          <div style={{ width: '100%', height: 260 }}>
            {chartData.length > 0 ? (
              <ResponsiveContainer>
                <LineChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="date" tickFormatter={(date) => format(parseISO(date), 'MMM d')} tick={{ fontSize: 11 }} />
                  <YAxis label={{ value: meta.yAxisLabel, angle: -90, position: 'insideLeft', style: { fontSize: 11 } }} tick={{ fontSize: 11 }} />
                  <Tooltip
                    labelFormatter={(date) => format(parseISO(date), 'MMM d, yyyy')}
                    formatter={(value) => [value, meta.unit]}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey={meta.dataKey}
                    stroke="var(--chart-1)"
                    activeDot={{ r: 6 }}
                    strokeWidth={2}
                    name={meta.title.split(' Over Time')[0]}
                  />
                  {metric === 'weight' && weightGoal && (
                    <Line
                      type="monotone"
                      dataKey={() => weightGoal.targetValue}
                      stroke="var(--chart-2)"
                      strokeDasharray="5 5"
                      strokeWidth={1}
                      name="Goal Weight"
                      dot={false}
                    />
                  )}
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex flex-col items-center justify-center gap-2 h-full text-center px-4">
                <span className="text-3xl" aria-hidden="true">{METRIC_EMPTY_STATE[metric].icon}</span>
                <p className="text-sm text-muted-foreground">{METRIC_EMPTY_STATE[metric].message}</p>
                <Button asChild size="sm" className="mt-1">
                  <Link href="/burnlog/goals">Log an entry</Link>
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm text-muted-foreground font-medium">
              <TrendingUp className="h-4 w-4" />
              Trend
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-sm">{trend.trend}</p>
            {metric === 'weight' && weightGoal && <p className="text-xs text-muted-foreground mt-1">{forecast}</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm text-muted-foreground font-medium">
              <Zap className="h-4 w-4" />
              Best Day
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-sm">{fastestProgress}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm text-muted-foreground font-medium">
              <Repeat className="h-4 w-4" />
              Logging Streak
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-sm">{longestStreak}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm text-muted-foreground font-medium">
              <BarChart3 className="h-4 w-4" />
              Average
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-sm">{averageMetric}</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

const insightTabs: TabItem[] = [
  { id: 'weight', icon: Scale, label: 'Weight', color: 'var(--chart-1)' },
  { id: 'calories', icon: Flame, label: 'Calories', color: 'var(--chart-2)' },
  { id: 'food', icon: Utensils, label: 'Food', color: 'var(--chart-3)' },
  { id: 'stamina', icon: HeartPulse, label: 'Stamina', color: 'var(--chart-4)' },
];

const METRICS: MetricKey[] = ['weight', 'calories', 'food', 'stamina'];

// Main component
export default function InsightsClient({
  weightEntries,
  weightGoal,
  calorieBurns,
  foodIntakes,
  staminaSessions,
}: InsightsClientProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  const processedWeightData = useMemo(() => {
    const startDate = weightEntries.length > 0 ? parseISO(weightEntries[0].date) : null;
    return fillMissingDates(weightEntries, 'weight', startDate);
  }, [weightEntries]);

  const processedCalorieData = useMemo(() => {
    const caloriesByDate: Record<string, number> = {};
    calorieBurns.forEach((entry) => {
      const dateStr = format(parseISO(entry.date), 'yyyy-MM-dd');
      if (!caloriesByDate[dateStr]) caloriesByDate[dateStr] = 0;
      caloriesByDate[dateStr] += entry.caloriesBurned;
    });

    const entries = Object.entries(caloriesByDate).map(([date, calories]) => ({ date, calories }));
    const startDate = entries.length > 0 ? parseISO(entries[0].date) : null;
    return fillMissingDates(entries as any[], 'calories', startDate);
  }, [calorieBurns]);

  const processedFoodData = useMemo(() => {
    const caloriesByDate: Record<string, number> = {};
    foodIntakes.forEach((entry) => {
      const dateStr = format(parseISO(entry.date), 'yyyy-MM-dd');
      if (!caloriesByDate[dateStr]) caloriesByDate[dateStr] = 0;
      caloriesByDate[dateStr] += entry.calories;
    });

    const entries = Object.entries(caloriesByDate).map(([date, calories]) => ({ date, intake: calories }));
    const startDate = entries.length > 0 ? parseISO(entries[0].date) : null;
    return fillMissingDates(entries as any[], 'intake', startDate);
  }, [foodIntakes]);

  const processedStaminaData = useMemo(() => {
    const entries = staminaSessions.map((session) => ({
      date: format(parseISO(session.date), 'yyyy-MM-dd'),
      duration: session.duration,
      distance: session.distance || 0,
    }));

    const startDate = entries.length > 0 ? parseISO(entries[0].date) : null;
    return fillMissingDates(entries, 'duration', startDate);
  }, [staminaSessions]);

  const dataByMetric: Record<MetricKey, Array<{ date: string; [key: string]: any }>> = {
    weight: processedWeightData,
    calories: processedCalorieData,
    food: processedFoodData,
    stamina: processedStaminaData,
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="sticky top-14 z-10 -mx-4 border-b bg-background/80 px-4 py-2 backdrop-blur">
        <SmoothTabs items={insightTabs} selectedIndex={selectedIndex} onSelect={setSelectedIndex} showLabels />
      </div>
      <MotionCarousel
        selectedIndex={selectedIndex}
        onSelect={setSelectedIndex}
        slides={METRICS.map((metric) => (
          <MetricSlide key={metric} metric={metric} chartData={dataByMetric[metric]} weightGoal={weightGoal} />
        ))}
      />
    </div>
  );
}
