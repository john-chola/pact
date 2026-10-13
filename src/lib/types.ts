export type Profile = {
  id: string;
  name: string | null;
  what_im_building: string | null;
  goal: string | null;
  streak_count: number;
  longest_streak: number;
  last_checkin_date: string | null;
  reminders_enabled: boolean;
  reminder_hour: number;
  reminder_minute: number;
};

export type Group = {
  id: string;
  name: string;
  goal_category: string;
  join_code: string;
  sprint_duration_days: number;
  sprint_start_date: string;
  sprint_number: number;
  max_members: number;
  created_by: string | null;
};

export type Member = {
  user_id: string;
  joined_at: string;
  streak_count: number;
  longest_streak: number;
  last_checkin_date: string | null;
};

export type Reaction = {
  id: string;
  emoji: string;
  user_id: string;
};

export type Checkin = {
  id: string;
  user_id: string;
  group_id: string;
  worked_on: string;
  duration_minutes: number;
  honest_feeling: string | null;
  tomorrow_plan: string | null;
  checkin_date: string;
  sprint_number: number | null;
  created_at: string;
  reactions?: Reaction[];
};

export const REACTION_EMOJIS = ['🔥', '💪', '👏', '❤️'] as const;
