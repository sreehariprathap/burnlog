"use client"
import { useState } from "react";

const WeeklyNavigator = () => {
    const [currentDayIndex, setCurrentDayIndex] = useState<number>(new Date().getDay());
    const todayIndex = new Date().getDay(); // Get the current day index (0-6)

    const setCurrentDay = (i: number): void => {
        setCurrentDayIndex(i);
        // You might want to add additional logic here
        // For example, loading data for the selected day
    };

    return (
        <div className="flex justify-around bg-white py-2 shadow-sm sticky top-0 z-20 p-2 gap-2">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d, i) => (
                <button
                    key={d}
                    className={`flex-1 text-center py-1 ${i === todayIndex ? 'bg-blue-500 text-white rounded' : 'text-gray-600'
                        } ${currentDayIndex === i ? 'bg-blue-200' : ''}`}
                    onClick={() => setCurrentDay(i)}
                >
                    {d}
                </button>
            ))}
        </div>

    )
}
export default WeeklyNavigator