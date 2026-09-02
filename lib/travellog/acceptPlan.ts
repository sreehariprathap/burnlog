// lib/travellog/acceptPlan.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ItineraryRequest, Itinerary } from './itinerary';

function firstCoordinates(itinerary: Itinerary): { lat: number; lng: number } {
  for (const day of itinerary.days) {
    for (const activity of day.activities) {
      if (activity.lat != null && activity.lng != null) {
        return { lat: activity.lat, lng: activity.lng };
      }
    }
  }
  return { lat: 0, lng: 0 };
}

function formatDayNotes(day: Itinerary['days'][number]): string {
  return day.activities.map((a) => `${a.time} — ${a.title}`).join('\n');
}

/**
 * Accepts a reviewed itinerary: saves the TravelPlan, auto-logs a TravelVisit
 * for the destination so it appears on the Map tab, and creates TaskLog
 * tasks (logistics + one per itinerary day) tagged with the plan's id.
 */
export async function acceptTravelPlan(
  supabase: SupabaseClient,
  profileId: string,
  req: ItineraryRequest,
  itinerary: Itinerary
): Promise<{ tasksCreated: number }> {
  const acceptedAt = new Date().toISOString();

  const { data: plan, error: planError } = await supabase
    .from('travellog_plans')
    .insert({
      profileId,
      destination: req.destination,
      hotel: req.hotel || null,
      startDate: req.startDate,
      endDate: req.endDate,
      numPeople: req.numPeople,
      transportMode: req.transportMode,
      budget: req.budget,
      budgetCurrency: req.budgetCurrency,
      itinerary,
      status: 'accepted',
      acceptedAt,
    })
    .select()
    .single();
  if (planError) throw planError;

  const { error: memberError } = await supabase.from('travellog_plan_members').insert({
    planId: plan.id,
    profileId,
    role: 'owner',
  });
  if (memberError) throw memberError;

  const { lat, lng } = firstCoordinates(itinerary);
  const { error: visitError } = await supabase.from('travellog_visits').insert({
    profileId,
    tripPlanId: plan.id,
    placeName: req.destination,
    country: req.destination,
    lat,
    lng,
    arrivalDate: req.startDate,
    departureDate: req.endDate,
    notes: 'Auto-logged from trip plan',
  });
  if (visitError) throw visitError;

  const logisticsTasks: Array<{ title: string; priority: string }> = [];
  if (req.transportMode === 'flight' || req.transportMode === 'mixed') {
    logisticsTasks.push({ title: `Book flights to ${req.destination}`, priority: 'high' });
  }
  logisticsTasks.push({
    title: req.hotel ? `Confirm booking: ${req.hotel}` : `Book accommodation in ${req.destination}`,
    priority: 'high',
  });
  logisticsTasks.push({ title: `Pack for ${req.destination} trip`, priority: 'high' });

  const dayTasks = itinerary.days.map((day) => ({
    title: `Day ${day.day} in ${req.destination}`,
    priority: 'medium',
    dueDate: day.date,
    notes: formatDayNotes(day),
  }));

  const taskRows = [
    ...logisticsTasks.map((t) => ({
      profileId,
      travelPlanId: plan.id,
      title: t.title,
      category: 'life',
      priority: t.priority,
      dueDate: req.startDate,
    })),
    ...dayTasks.map((t) => ({
      profileId,
      travelPlanId: plan.id,
      title: t.title,
      category: 'life',
      priority: t.priority,
      dueDate: t.dueDate,
      notes: t.notes,
    })),
  ];

  const { error: tasksError } = await supabase.from('tasklog_tasks').insert(taskRows);
  if (tasksError) throw tasksError;

  return { tasksCreated: taskRows.length };
}
