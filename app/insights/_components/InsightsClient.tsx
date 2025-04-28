/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useState, useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';
import { format, parseISO, differenceInDays, addDays } from 'date-fns';

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

// Data processing helper functions
function fillMissingDates<T extends { date: string; [key: string]: any }>(
  entries: T[],
  valueKey: keyof T,
  startDate: Date | null,
  endDate: Date = new Date()
): Array<{ date: string; [key: string]: any }> {
  if (entries.length === 0) return [];
  
  // Use the earliest entry date if no startDate provided
  if (!startDate) {
    startDate = entries.length > 0 ? parseISO(entries[0].date) : new Date();
  }

  const dateMap = new Map<string, any>();
  
  // First, map existing entries by their date string
  entries.forEach(entry => {
    const dateStr = format(parseISO(entry.date), 'yyyy-MM-dd');
    dateMap.set(dateStr, { date: dateStr, [valueKey]: entry[valueKey] });
  });
  
  // Create the complete array with all dates in range
  const result = [];
  const days = differenceInDays(endDate, startDate) + 1;
  
  for (let i = 0; i < days; i++) {
    const currentDate = addDays(startDate, i);
    const dateStr = format(currentDate, 'yyyy-MM-dd');
    
    if (dateMap.has(dateStr)) {
      // Use the actual data point
      result.push(dateMap.get(dateStr));
    } else {
      // Find nearest points for interpolation
      let prevDate = null;
      let nextDate = null;
      let prevValue = null;
      let nextValue = null;
      
      // Find the closest previous entry
      for (let j = i - 1; j >= 0; j--) {
        const checkDate = addDays(startDate, j);
        const checkDateStr = format(checkDate, 'yyyy-MM-dd');
        if (dateMap.has(checkDateStr)) {
          prevDate = checkDate;
          prevValue = dateMap.get(checkDateStr)[valueKey];
          break;
        }
      }
      
      // Find the closest future entry
      for (let j = i + 1; j < days; j++) {
        const checkDate = addDays(startDate, j);
        const checkDateStr = format(checkDate, 'yyyy-MM-dd');
        if (dateMap.has(checkDateStr)) {
          nextDate = checkDate;
          nextValue = dateMap.get(checkDateStr)[valueKey];
          break;
        }
      }
      
      // Interpolate value if both previous and next points exist
      let interpolatedValue = null;
      if (prevValue !== null && nextValue !== null) {
        const totalDays = differenceInDays(nextDate!, prevDate!);
        const daysSincePrev = differenceInDays(currentDate, prevDate!);
        const ratio = daysSincePrev / totalDays;
        interpolatedValue = prevValue + ratio * (nextValue - prevValue);
      } else if (prevValue !== null) {
        // Use the previous value if no future value exists
        interpolatedValue = prevValue;
      } else if (nextValue !== null) {
        // Use the next value if no previous value exists
        interpolatedValue = nextValue;
      }
      
      if (interpolatedValue !== null) {
        result.push({ 
          date: dateStr, 
          [valueKey]: interpolatedValue,
          isInterpolated: true 
        });
      }
    }
  }
  
  return result;
}

function calculateTrend(data: Array<{ date: string; [key: string]: any }>, valueKey: string) {
  if (data.length < 2) return { slope: 0, trend: "No clear trend yet" };
  
  const firstValue = data[0][valueKey];
  const lastValue = data[data.length - 1][valueKey];
  const daysDiff = differenceInDays(parseISO(data[data.length - 1].date), parseISO(data[0].date));
  
  // Avoid division by zero
  if (daysDiff === 0) return { slope: 0, trend: "No clear trend yet" };
  
  const slope = (lastValue - firstValue) / daysDiff;
  
  // Format trend message
  let trendText = "No clear trend yet";
  if (Math.abs(slope) > 0.01) {
    trendText = slope < 0 
      ? `losing ${Math.abs(slope).toFixed(2)} per day`
      : `gaining ${slope.toFixed(2)} per day`;
  }
  
  return { slope, trend: trendText };
}

function calculateForecast(data: Array<{ date: string; [key: string]: any }>, valueKey: string, targetValue: number) {
  const { slope } = calculateTrend(data, valueKey);
  const currentValue = data[data.length - 1][valueKey];
  
  // Check if we have a meaningful slope and if we're actually heading toward the target
  if (Math.abs(slope) < 0.01 || (targetValue < currentValue && slope >= 0) || (targetValue > currentValue && slope <= 0)) {
    return "No clear progress toward goal";
  }
  
  // Calculate days to target
  const daysToGoal = Math.abs((targetValue - currentValue) / slope);
  const forecastDate = addDays(new Date(), Math.ceil(daysToGoal));
  
  return `At this rate, you'll hit ${targetValue} by ${format(forecastDate, 'MMMM d, yyyy')}`;
}

// Main component
export default function InsightsClient({
  weightEntries,
  weightGoal,
  calorieBurns,
  foodIntakes,
  staminaSessions
}: InsightsClientProps) {
  const [selectedMetric, setSelectedMetric] = useState<'weight' | 'calories' | 'food' | 'stamina'>('weight');

  // Process weight data
  const processedWeightData = useMemo(() => {
    const startDate = weightEntries.length > 0 ? parseISO(weightEntries[0].date) : null;
    return fillMissingDates(weightEntries, 'weight', startDate);
  }, [weightEntries]);

  // Process calorie data
  const processedCalorieData = useMemo(() => {
    // Group calories by date
    const caloriesByDate: Record<string, number> = {};
    calorieBurns.forEach(entry => {
      const dateStr = format(parseISO(entry.date), 'yyyy-MM-dd');
      if (!caloriesByDate[dateStr]) caloriesByDate[dateStr] = 0;
      caloriesByDate[dateStr] += entry.caloriesBurned;
    });

    const entries = Object.entries(caloriesByDate).map(([date, calories]) => ({
      date,
      calories
    }));

    const startDate = entries.length > 0 ? parseISO(entries[0].date) : null;
    return fillMissingDates(entries as any[], 'calories', startDate);
  }, [calorieBurns]);

  // Process food intake data
  const processedFoodData = useMemo(() => {
    // Group calories by date
    const caloriesByDate: Record<string, number> = {};
    foodIntakes.forEach(entry => {
      const dateStr = format(parseISO(entry.date), 'yyyy-MM-dd');
      if (!caloriesByDate[dateStr]) caloriesByDate[dateStr] = 0;
      caloriesByDate[dateStr] += entry.calories;
    });

    const entries = Object.entries(caloriesByDate).map(([date, calories]) => ({
      date,
      intake: calories
    }));

    const startDate = entries.length > 0 ? parseISO(entries[0].date) : null;
    return fillMissingDates(entries as any[], 'intake', startDate);
  }, [foodIntakes]);

  // Process stamina data
  const processedStaminaData = useMemo(() => {
    // Use duration as the primary measure for stamina
    const entries = staminaSessions.map(session => ({
      date: format(parseISO(session.date), 'yyyy-MM-dd'),
      duration: session.duration,
      distance: session.distance || 0
    }));

    const startDate = entries.length > 0 ? parseISO(entries[0].date) : null;
    return fillMissingDates(entries, 'duration', startDate);
  }, [staminaSessions]);

  // Decide which data to display based on selected metric
  const chartData = useMemo(() => {
    switch (selectedMetric) {
      case 'weight':
        return processedWeightData;
      case 'calories':
        return processedCalorieData;
      case 'food':
        return processedFoodData;
      case 'stamina':
        return processedStaminaData;
      default:
        return processedWeightData;
    }
  }, [selectedMetric, processedWeightData, processedCalorieData, processedFoodData, processedStaminaData]);

  // Calculate trends and insights
  const trend = useMemo(() => {
    if (chartData.length === 0) return { trend: "No data available" };
    
    const valueKey = {
      'weight': 'weight',
      'calories': 'calories',
      'food': 'intake',
      'stamina': 'duration'
    }[selectedMetric];
    
    return calculateTrend(chartData, valueKey!);
  }, [chartData, selectedMetric]);

  const forecast = useMemo(() => {
    if (chartData.length === 0 || selectedMetric !== 'weight' || !weightGoal) {
      return "No forecast available";
    }
    
    return calculateForecast(chartData, 'weight', weightGoal.targetValue);
  }, [chartData, selectedMetric, weightGoal]);

  // Calculate insight widgets
  const fastestProgress = useMemo(() => {
    if (chartData.length < 2) return "Not enough data";
    
    const valueKey = {
      'weight': 'weight',
      'calories': 'calories',
      'food': 'intake',
      'stamina': 'duration'
    }[selectedMetric];
    
    let maxDrop = 0;
    let maxDropDate = "";
    
    for (let i = 1; i < chartData.length; i++) {
      const change = chartData[i-1][valueKey!] - chartData[i][valueKey!];
      if (selectedMetric === 'weight' && change > maxDrop) {
        maxDrop = change;
        maxDropDate = chartData[i].date;
      } else if (selectedMetric !== 'weight' && change < maxDrop) {
        maxDrop = change;
        maxDropDate = chartData[i].date;
      }
    }
    
    if (maxDrop === 0) return "No significant change detected";
    
    const direction = selectedMetric === 'weight' ? 'loss' : 'gain';
    return `Highest ${direction}: ${Math.abs(maxDrop).toFixed(1)} on ${format(parseISO(maxDropDate), 'MMM d')}`;
  }, [chartData, selectedMetric]);

  const longestStreak = useMemo(() => {
    // Find the longest streak of consecutive logging days
    if (chartData.length === 0) return "No data yet";
    
    const nonInterpolatedData = chartData.filter(d => !d.isInterpolated);
    if (nonInterpolatedData.length < 2) return "Log more data to see streaks";
    
    let currentStreak = 1;
    let longestStreak = 1;
    
    for (let i = 1; i < nonInterpolatedData.length; i++) {
      const prevDate = parseISO(nonInterpolatedData[i-1].date);
      const currDate = parseISO(nonInterpolatedData[i].date);
      
      if (differenceInDays(currDate, prevDate) === 1) {
        currentStreak++;
        longestStreak = Math.max(longestStreak, currentStreak);
      } else {
        currentStreak = 1;
      }
    }
    
    return `Longest logging streak: ${longestStreak} days`;
  }, [chartData]);

  const averageMetric = useMemo(() => {
    if (chartData.length === 0) return "No data available";
    
    const valueKey = {
      'weight': 'weight',
      'calories': 'calories',
      'food': 'intake',
      'stamina': 'duration'
    }[selectedMetric];
    
    const sum = chartData.reduce((acc, d) => acc + d[valueKey!], 0);
    const average = sum / chartData.length;
    
    switch (selectedMetric) {
      case 'weight':
        return `Average weight: ${average.toFixed(1)} kg`;
      case 'calories':
        return `Average daily burn: ${average.toFixed(0)} cal`;
      case 'food':
        return `Average daily intake: ${average.toFixed(0)} cal`;
      case 'stamina':
        return `Average duration: ${average.toFixed(0)} min`;
      default:
        return "No data available";
    }
  }, [chartData, selectedMetric]);

  // Generate appropriate Y-axis label based on metric
  const yAxisLabel = useMemo(() => {
    switch (selectedMetric) {
      case 'weight':
        return 'Weight (kg)';
      case 'calories':
        return 'Calories Burned';
      case 'food':
        return 'Calories Consumed';
      case 'stamina':
        return 'Duration (min)';
      default:
        return '';
    }
  }, [selectedMetric]);

  // Get the appropriate data key for the current metric
  const dataKey = useMemo(() => {
    switch (selectedMetric) {
      case 'weight':
        return 'weight';
      case 'calories':
        return 'calories';
      case 'food':
        return 'intake';
      case 'stamina':
        return 'duration';
      default:
        return 'weight';
    }
  }, [selectedMetric]);

  return (
    <div>
      {/* Metric Selector */}
      <div className="mb-6">
        <div className="flex flex-wrap gap-2">
          <button 
            onClick={() => setSelectedMetric('weight')} 
            className={`px-4 py-2 rounded-full ${selectedMetric === 'weight' ? 'bg-amber-500 text-white' : 'border-amber-200'}`}
          >
            Weight
          </button>
          <button 
            onClick={() => setSelectedMetric('calories')} 
            className={`px-4 py-2 rounded-full ${selectedMetric === 'calories' ? 'bg-amber-500 text-white' : 'border-amber-200'}`}
          >
            Calories Burned
          </button>
          <button 
            onClick={() => setSelectedMetric('food')} 
            className={`px-4 py-2 rounded-full ${selectedMetric === 'food' ? 'bg-amber-500 text-white' : 'border-amber-200'}`}
          >
            Food Intake
          </button>
          <button 
            onClick={() => setSelectedMetric('stamina')} 
            className={`px-4 py-2 rounded-full ${selectedMetric === 'stamina' ? 'bg-amber-500 text-white' : 'border-amber-200'}`}
          >
            Stamina
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="md:col-span-2">
          {/* Main Chart */}
          <div className="ark:bg-primary p-4 rounded-lg shadow-md">
            <h2 className="text-xl font-semibold mb-4">{`${selectedMetric.charAt(0).toUpperCase() + selectedMetric.slice(1)} Over Time`}</h2>
            <div style={{ width: '100%', height: 300 }}>
              {chartData.length > 0 ? (
                <ResponsiveContainer>
                  <LineChart
                    data={chartData}
                    margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                      dataKey="date" 
                      tickFormatter={(date) => format(parseISO(date), 'MMM d')} 
                    />
                    <YAxis label={{ value: yAxisLabel, angle: -90, position: 'insideLeft' }} />
                    <Tooltip 
                      labelFormatter={(date) => format(parseISO(date), 'MMM d, yyyy')} 
                      formatter={(value) => [value, selectedMetric === 'weight' ? 'kg' : (selectedMetric === 'stamina' ? 'min' : 'cal')]}
                    />
                    <Legend />
                    <Line 
                      type="monotone" 
                      dataKey={dataKey} 
                      stroke="#FF9E4F" 
                      activeDot={{ r: 8 }}
                      strokeWidth={2}
                      name={selectedMetric.charAt(0).toUpperCase() + selectedMetric.slice(1)}
                    />
                    {selectedMetric === 'weight' && weightGoal && (
                      <Line
                        type="monotone"
                        dataKey={() => weightGoal.targetValue}
                        stroke="#82ca9d"
                        strokeDasharray="5 5"
                        strokeWidth={1}
                        name="Goal Weight"
                        dot={false}
                      />
                    )}
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full">
                  <p>No data available for this metric</p>
                </div>
              )}
            </div>
          </div>
        </div>
        
        <div>
          {/* Insights Cards */}
          <div className="space-y-4">
            {/* Trend Card */}
            <div className=" p-4 rounded-lg shadow-md dark:bg-primary">
              <h3 className="text-lg font-semibold mb-2">Trend</h3>
              <p className="">{trend.trend}</p>
              {selectedMetric === 'weight' && weightGoal && (
                <p className=" mt-2">{forecast}</p>
              )}
            </div>
            
            {/* Fastest Progress Card */}
            <div className=" p-4 rounded-lg shadow-md dark:bg-primary">
              <h3 className="text-lg font-semibold mb-2">Best Day</h3>
              <p className="">{fastestProgress}</p>
            </div>
            
            {/* Longest Streak Card */}
            <div className=" p-4 rounded-lg shadow-md dark:bg-primary">
              <h3 className="text-lg font-semibold mb-2">Logging Streak</h3>
              <p className="">{longestStreak}</p>
            </div>
            
            {/* Average Metric Card */}
            <div className=" p-4 rounded-lg shadow-md dark:bg-primary">
              <h3 className="text-lg font-semibold mb-2">Average</h3>
              <p className="">{averageMetric}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}