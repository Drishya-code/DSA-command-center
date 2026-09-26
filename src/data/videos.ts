import type { Video } from '@/types';
import { topics } from '@/data/dsaRoadmap';
import { YOUTUBE_PLAYLIST_URL } from '@/data/dsaRoadmap';

/** One verified Striver A2Z YouTube entry per roadmap step, sourced from the attached repo. */
export const videos: Video[] = topics.map((topic) => ({
  id: `v-${topic.id}`,
  topicId: topic.id,
  title: `${topic.title} - Striver A2Z`,
  creator: 'take U forward',
  durationMin: 20,
  url: topic.youtubeUrl || YOUTUBE_PLAYLIST_URL,
  order: topic.order,
  topicUrl: topic.tufUrl,
  playlistUrl: YOUTUBE_PLAYLIST_URL,
}));

export const getVideosByTopic = (topicId: string): Video[] =>
  videos.filter((v) => v.topicId === topicId).sort((a, b) => a.order - b.order);
