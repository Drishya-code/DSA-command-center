import { describe, it, expect } from 'vitest';
import { generateDayPlan } from '../utils/scheduler';
import { computeTopicStats } from '../utils/analytics';
import { topics } from '../data/dsaRoadmap';

describe('DSA Command Center Core Logic', () => {
  const baseState = {
    completedTopicIds: [],
    problemProgress: {},
    videoProgress: {},
    mistakes: [],
    sessions: [],
    dailyActivity: {},
    streak: { current: 0, longest: 0, lastActiveDate: '' },
    currentTopicId: 'fundamentals',
    taskCompletionsToday: {},
    dailyPlans: {},
    plannerPreferences: {
      dailyBudgetMin: 60,
      preferredTopicIds: [],
      difficultyPreference: ['Easy', 'Medium', 'Hard']
    },
    preferences: {
      onboarded: true,
      name: 'Test',
      weeklyHoursTarget: 10,
      studyDaysPerWeek: 5,
      preferredStudyTime: 'Morning',
      currentLevel: 'Beginner',
      difficultyPreference: ['Easy', 'Medium', 'Hard'],
      theme: 'dark',
      revisionIntervals: [1, 3, 7],
      minMinutesForStreak: 15
    },
    schemaVersion: 1
  };

  it('should compute topic stats correctly', () => {
    const state = baseState;
    const stats = computeTopicStats(topics[0], state);
    expect(stats.totalProblems).toBeGreaterThan(0);
    expect(stats.status).toBe('Not Started');
  });

  it('should generate a day plan', () => {
    const state = baseState;
    const plan = generateDayPlan('2026-09-27', state);
    expect(plan.tasks.length).toBeGreaterThan(0);
    expect(plan.dailyBudgetMin).toBe(60);
  });
});
