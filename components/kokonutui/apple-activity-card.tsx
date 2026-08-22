"use client";

/**
 * @author: @kokonutui
 * @description: Apple Activity Card
 * @version: 1.0.0
 * @date: 2025-06-26
 * @license: MIT
 * @website: https://kokonutui.com
 * @github: https://github.com/kokonut-labs/kokonutui
 *
 * Adapted for burnlog: `activities` and `title` are now props so the rings
 * can be driven by real tracking data.
 */

import { motion } from "motion/react";
import { cn } from "@/lib/utils";

export interface ActivityData {
  label: string;
  value: number;
  color: string;
  /** Gradient end color; falls back to a lighter tint of `color`. */
  colorEnd?: string;
  size: number;
  current: number;
  target: number;
  unit: string;
}

interface CircleProgressProps {
  data: ActivityData;
  index: number;
}

const defaultActivities: ActivityData[] = [
  {
    label: "MOVE",
    value: 85,
    color: "#FF2D55",
    colorEnd: "#FF6B8B",
    size: 200,
    current: 479,
    target: 800,
    unit: "CAL",
  },
  {
    label: "EXERCISE",
    value: 60,
    color: "#A3F900",
    colorEnd: "#C5FF4D",
    size: 160,
    current: 24,
    target: 30,
    unit: "MIN",
  },
  {
    label: "STAND",
    value: 30,
    color: "#04C7DD",
    colorEnd: "#4DDFED",
    size: 120,
    current: 6,
    target: 12,
    unit: "HR",
  },
];

const CircleProgress = ({ data, index }: CircleProgressProps) => {
  const strokeWidth = 16;
  const radius = (data.size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const progress = ((100 - data.value) / 100) * circumference;

  const gradientId = `gradient-${data.label.toLowerCase().replace(/\s+/g, "-")}-${index}`;
  const gradientUrl = `url(#${gradientId})`;

  return (
    <motion.div
      animate={{ opacity: 1, scale: 1 }}
      className="absolute inset-0 flex items-center justify-center"
      initial={{ opacity: 0, scale: 0.8 }}
      transition={{ duration: 0.8, delay: index * 0.2, ease: "easeOut" }}
    >
      <div className="relative">
        <svg
          aria-label={`${data.label} Activity Progress - ${data.value}%`}
          className="-rotate-90 transform"
          height={data.size}
          viewBox={`0 0 ${data.size} ${data.size}`}
          width={data.size}
        >
          <title>{`${data.label} Activity Progress - ${data.value}%`}</title>

          <defs>
            <linearGradient id={gradientId} x1="0%" x2="100%" y1="0%" y2="100%">
              <stop
                offset="0%"
                style={{ stopColor: data.color, stopOpacity: 1 }}
              />
              <stop
                offset="100%"
                style={{
                  stopColor: data.colorEnd ?? data.color,
                  stopOpacity: 1,
                }}
              />
            </linearGradient>
          </defs>

          <circle
            className="text-zinc-200/50 dark:text-zinc-800/50"
            cx={data.size / 2}
            cy={data.size / 2}
            fill="none"
            r={radius}
            stroke="currentColor"
            strokeWidth={strokeWidth}
          />

          <motion.circle
            animate={{ strokeDashoffset: progress }}
            cx={data.size / 2}
            cy={data.size / 2}
            fill="none"
            initial={{ strokeDashoffset: circumference }}
            r={radius}
            stroke={gradientUrl}
            strokeDasharray={circumference}
            strokeLinecap="round"
            strokeWidth={strokeWidth}
            style={{
              filter: "drop-shadow(0 0 6px rgba(0,0,0,0.15))",
            }}
            transition={{
              duration: 1.8,
              delay: index * 0.2,
              ease: "easeInOut",
            }}
          />
        </svg>
      </div>
    </motion.div>
  );
};

const DetailedActivityInfo = ({
  activities,
}: {
  activities: ActivityData[];
}) => {
  return (
    <motion.div
      animate={{ opacity: 1, x: 0 }}
      className="ml-8 flex flex-col gap-6"
      initial={{ opacity: 0, x: 20 }}
      transition={{ duration: 0.5, delay: 0.3 }}
    >
      {activities.map((activity) => (
        <motion.div className="flex flex-col" key={activity.label}>
          <span className="font-medium text-sm text-zinc-600 dark:text-zinc-400">
            {activity.label}
          </span>
          <span
            className="font-semibold text-2xl"
            style={{ color: activity.color }}
          >
            {activity.current}/{activity.target}
            <span className="ml-1 text-base text-zinc-600 dark:text-zinc-400">
              {activity.unit}
            </span>
          </span>
        </motion.div>
      ))}
    </motion.div>
  );
};

export default function AppleActivityCard({
  title = "Activity Rings",
  className,
  activities = defaultActivities,
}: {
  title?: string;
  className?: string;
  activities?: ActivityData[];
}) {
  const outerSize = activities[0]?.size ?? 200;

  return (
    <div
      className={cn(
        "relative mx-auto w-full max-w-3xl rounded-3xl p-8",
        "text-zinc-900 dark:text-white",
        className
      )}
    >
      <div className="flex flex-col items-center gap-8">
        <motion.h2
          animate={{ opacity: 1, y: 0 }}
          className="font-medium text-2xl text-zinc-900 dark:text-white"
          initial={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.5 }}
        >
          {title}
        </motion.h2>

        <div className="flex items-center">
          <div
            className="relative"
            style={{ height: outerSize, width: outerSize }}
          >
            {activities.map((activity, index) => (
              <CircleProgress
                data={activity}
                index={index}
                key={activity.label}
              />
            ))}
          </div>
          <DetailedActivityInfo activities={activities} />
        </div>
      </div>
    </div>
  );
}
