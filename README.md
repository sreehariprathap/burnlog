# BurnLog - Your Personal Fitness Tracking Companion

![BurnLog Logo](/public/burnlog-icon-splash.png)

BurnLog is a comprehensive fitness tracking application built with Next.js that helps you monitor your workouts, track your progress, and achieve your fitness goals.

## 🔥 Features

- **User Authentication:** Secure login and signup with Supabase auth
- **Profile Management:** Set up and manage your fitness profile with personal metrics
- **Dashboard:** Get a quick overview of your fitness journey with key stats and metrics
- **Workout Sessions:** Log and track different types of workouts:
  - Push/Pull/Legs routines
  - Cardio sessions
  - Full-body workouts
  - Rest days
- **Goal Setting:** Create and monitor progress toward fitness goals
- **Weight & BMI Tracking:** Monitor your weight changes and BMI over time
- **Insights:** Visualize your fitness data with charts and progress indicators
- **Progressive Web App:** Install on your device for offline access and push notifications
- **Responsive Design:** Optimized for both mobile and desktop devices
- **Dark Mode:** Toggle between light and dark themes for better visibility

## 🛠️ Technologies Used

- **Frontend:** Next.js 14, React, TypeScript, TailwindCSS
- **Backend:** Next.js API routes, Supabase
- **Database:** PostgreSQL (via Supabase)
- **Authentication:** Supabase Auth
- **Styling:** Tailwind CSS with Shadcn components
- **Charts:** Recharts
- **PWA Support:** Service Workers, Web Push API

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ installed
- Supabase account and project

### Installation

1. Clone the repository:
```bash
git clone https://github.com/sreehariprathap/burnlog.git
cd burnlog
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
Create a `.env` file in the root directory with the following variables:
```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
DATABASE_URL=your_database_url
```

4. Run the development server:
```bash
npm run dev
```

5. Open [http://localhost:3000](http://localhost:3000) with your browser to see the application.

## 📊 Main Pages

- **Dashboard**: Overview of fitness metrics, goals, and workout stats
![Dashboard](/public/docs/dashboard.png)
- **Sessions**: Log and track workout sessions
![Sessions](/public/docs/sessions.png)
- **Goals**: Set and monitor fitness goals
![Goals](/public/docs/goals.png)
- **Insights**: Advanced data visualization and trends
![Insights](/public/docs/insights.png)
- **Profile**: User profile management
![Profile](/public/docs/profile.png)

## 📋 Database Schema

![Database Architecture](/public/docs/db-architecture.png)

The application uses the following main data models:

- **profiles**: User profile information (height, weight, age, etc.)
- **sessions**: Workout session logs
- **fitness_goals**: User fitness goals
- **weight_entries**: Historical weight measurements

## 🔐 Authentication Flow

1. User signs up/logs in through Supabase Auth
2. New users are redirected to complete their profile setup
3. Returning users are directed to the dashboard


## 📱 Progressive Web App

BurnLog is designed as a Progressive Web App, allowing users to install it on their devices for offline access and receive push notifications for workout reminders.

To install:
1. Visit the application on a supported browser
2. Click the "Install" button in the dashboard
3. Follow the browser prompts to complete installation

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📞 Contact

If you have any questions or feedback, please reach out at sreehariprathap1996@gmail.com
