import { supabase } from "@/lib/supabase";
import InsightsClient from "./_components/InsightsClient";
import { TopBar } from "@/components/TopBar";
import { BottomNav } from "@/components/BottomNav";

async function getWeightEntries(userId: string) {
  const { data, error } = await supabase
    .from('weight_entries')
    .select('*')
    .eq('profileId', userId)
    .order('date', { ascending: true });

  if (error) {
    console.error('Error fetching weight entries:', error);
    return [];
  }

  return data;
}

async function getWeightGoal(userId: string) {
  const { data, error } = await supabase
    .from('fitness_goals')
    .select('*')
    .eq('profileId', userId)
    .eq('goalType', 'weight')
    .order('createdAt', { ascending: false })
    .limit(1);

  if (error) {
    console.error('Error fetching weight goal:', error);
    return null;
  }

  return data && data.length > 0 ? data[0] : null;
}

async function getCalorieBurns(userId: string) {
  const { data, error } = await supabase
    .from('calorie_burns')
    .select('*')
    .eq('profileId', userId)
    .order('date', { ascending: true });

  if (error) {
    console.error('Error fetching calorie burns:', error);
    return [];
  }

  return data;
}

async function getFoodIntakes(userId: string) {
  const { data, error } = await supabase
    .from('food_intakes')
    .select('*')
    .eq('profileId', userId)
    .order('date', { ascending: true });

  if (error) {
    console.error('Error fetching food intakes:', error);
    return [];
  }

  return data;
}

async function getStaminaSessions(userId: string) {
  const { data, error } = await supabase
    .from('stamina_sessions')
    .select('*')
    .eq('profileId', userId)
    .order('date', { ascending: true });

  if (error) {
    console.error('Error fetching stamina sessions:', error);
    return [];
  }

  return data;
}

export default async function InsightsPage() {
  // For demonstration purposes - in production, get the userId from the session
  // This would typically come from auth context/session
  const userId = "replace-with-real-user-id";
  
  // Fetch all data in parallel
  const [weightEntries, weightGoal, calorieBurns, foodIntakes, staminaSessions] = 
    await Promise.all([
      getWeightEntries(userId),
      getWeightGoal(userId),
      getCalorieBurns(userId),
      getFoodIntakes(userId),
      getStaminaSessions(userId)
    ]);

  return (
    <div className="">
      <TopBar title="Insights" />
      <div className="container mx-auto px-4 py-8 pb-20">

      <InsightsClient 
        weightEntries={weightEntries} 
        weightGoal={weightGoal} 
        calorieBurns={calorieBurns} 
        foodIntakes={foodIntakes} 
        staminaSessions={staminaSessions} 
      />
      </div>
      <BottomNav />
    </div>
  );
}