'use client';

import { Activity } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type BMI = {
  value: number;
  category: string;
  color: string;
};

type BMIWidgetProps = {
  height: number; // in cm
  weight: number; // in kg
};

export function BMIWidget({ height, weight }: BMIWidgetProps) {
  // Calculate BMI: weight (kg) / height^2 (m)
  const heightInMeters = height / 100;
  const bmi = weight / (heightInMeters * heightInMeters);
  const roundedBmi = Math.round(bmi * 10) / 10;
  
  // Determine BMI category
  const getBmiCategory = (bmi: number): BMI => {
    if (bmi < 18.5) return { value: bmi, category: 'Underweight', color: '#3B82F6' }; // blue
    if (bmi < 25) return { value: bmi, category: 'Healthy', color: '#10B981' }; // green
    if (bmi < 30) return { value: bmi, category: 'Overweight', color: '#F59E0B' }; // amber
    return { value: bmi, category: 'Obese', color: '#EF4444' }; // red
  };
  
  const bmiData = getBmiCategory(bmi);
  
  // Calculate position on the BMI scale (0-100%)
  const getScalePosition = (bmi: number) => {
    // BMI scale from 15 to 35
    const minBmi = 15;
    const maxBmi = 35;
    const percentage = ((bmi - minBmi) / (maxBmi - minBmi)) * 100;
    return Math.min(Math.max(percentage, 0), 100); // Clamp between 0-100%
  };
  
  const position = getScalePosition(bmi);
  
  return (
    <Card className="col-span-4">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle>BMI</CardTitle>
          <Activity className="w-5 h-5 text-amber-500" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between mb-2">
          <div>
            <span className="text-2xl font-bold">{roundedBmi}</span>
            <span className="ml-2 text-sm" style={{ color: bmiData.color }}>
              {bmiData.category}
            </span>
          </div>
        </div>
        
        {/* BMI Scale */}
        <div className="relative h-3 w-full bg-gray-200 rounded-full mt-1">
          <div className="absolute flex w-full justify-between px-1 -top-5 text-[10px] text-gray-500">
            <span>15</span>
            <span>20</span>
            <span>25</span>
            <span>30</span>
            <span>35</span>
          </div>
          
          {/* Color bands */}
          <div className="absolute h-full w-full flex rounded-full overflow-hidden">
            <div className="h-full bg-blue-400" style={{ width: '17.5%' }}></div>
            <div className="h-full bg-green-400" style={{ width: '32.5%' }}></div>
            <div className="h-full bg-amber-400" style={{ width: '25%' }}></div>
            <div className="h-full bg-red-400" style={{ width: '25%' }}></div>
          </div>
          
          {/* Indicator */}
          <div 
            className="absolute h-5 w-2 bg-gray-800 rounded-full -top-1" 
            style={{ left: `calc(${position}% - 2px)` }}
          ></div>
        </div>
      </CardContent>
    </Card>
  );
}