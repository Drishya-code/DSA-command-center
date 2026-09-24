import type { Topic } from '@/types';

/** Exact 19-step structure and links from the attached Striver A2Z repository. */
export const topics: Topic[] = [
  { id: "fundamentals", title: "Beginner Problems", description: "Programming basics, patterns, basic maths and STL", estimatedHours: 12, order: 1, tufUrl: "https://takeuforward.org/practice/dsa/pattern-1?category=patterns&source=strivers-a2z-dsa-sheet", youtubeUrl: "https://www.youtube.com/watch?v=tNm_NNSB3_w&list=PLgUwDviBIf0oF6QL8m22w1hIDC1vJ_BHz&index=3" },
  { id: "sorting", title: "Sorting", description: "Selection, bubble, insertion, merge and quick sort", estimatedHours: 4, order: 2, tufUrl: "https://takeuforward.org/practice/dsa/selection-sort?category=algorithms&source=strivers-a2z-dsa-sheet", youtubeUrl: "https://youtu.be/HGk_ypEuS24?t=167" },
  { id: "arrays", title: "Arrays", description: "Array problems from basics through hard patterns", estimatedHours: 22, order: 3, tufUrl: "https://takeuforward.org/practice/dsa/linear-search?category=fundamentals&source=strivers-a2z-dsa-sheet", youtubeUrl: "https://youtu.be/wvcQg43_V8U?t=2465" },
  { id: "hashing", title: "Hashing", description: "Hash maps, frequency counting and hashing patterns", estimatedHours: 4, order: 4, tufUrl: "https://takeuforward.org/practice/dsa/longest-consecutive-sequence-in-an-array?category=faqs&source=strivers-a2z-dsa-sheet", youtubeUrl: "https://youtu.be/oO5uLE7EUlM" },
  { id: "binary-search", title: "Binary Search", description: "1D, 2D and answer-space binary search", estimatedHours: 18, order: 5, tufUrl: "https://takeuforward.org/practice/dsa/search-x-in-sorted-array?category=fundamentals&source=strivers-a2z-dsa-sheet", youtubeUrl: "https://youtu.be/MHf6awe89xw" },
  { id: "recursion", title: "Recursion", description: "Recursion, subsequences and backtracking", estimatedHours: 14, order: 6, tufUrl: "https://takeuforward.org/practice/dsa/pow(x,n)", youtubeUrl: "https://youtu.be/l0YC3876qxg" },
  { id: "linked-list", title: "Linked-List", description: "Singly, doubly, medium and hard linked-list problems", estimatedHours: 18, order: 7, tufUrl: "https://takeuforward.org/practice/dsa/traversal-in-linked-list?category=fundamentals-single-ll&source=strivers-a2z-dsa-sheet" },
  { id: "bit-manipulation", title: "Bit Manipulation", description: "Bitwise concepts and problem solving", estimatedHours: 9, order: 8, tufUrl: "https://takeuforward.org/practice/dsa/minimum-bit-flips-to-convert-number?category=problems&source=strivers-a2z-dsa-sheet", youtubeUrl: "https://youtu.be/OOdrmcfZXd8?si=rnkRVz1UiVBKWC69" },
  { id: "greedy", title: "Greedy Algorithms", description: "Greedy choices, intervals and optimization", estimatedHours: 10, order: 9, tufUrl: "https://takeuforward.org/practice/dsa/assign-cookies?category=easy&source=strivers-a2z-dsa-sheet", youtubeUrl: "https://youtu.be/DIX2p7vb9co?si=GofAIDimue-Av0Fi" },
  { id: "sliding-window", title: "Sliding Window / 2 Pointer", description: "Sliding-window and two-pointer patterns", estimatedHours: 8, order: 10, tufUrl: "https://takeuforward.org/practice/dsa/maximum-points-you-can-obtain-from-cards-?category=constant-window&source=strivers-a2z-dsa-sheet", youtubeUrl: "https://youtu.be/pBWCOCS636U?si=-X64rY67noxvOwrG" },
  { id: "stack-queue", title: "Stack / Queues", description: "Stacks, queues, monotonic structures and expressions", estimatedHours: 14, order: 11, tufUrl: "https://takeuforward.org/practice/dsa/implement-stack-using-arrays?category=implementation&source=strivers-a2z-dsa-sheet", youtubeUrl: "https://youtu.be/tqQ5fTamIN4?si=ofLt8Zt1ZvhikZ6w" },
  { id: "binary-trees", title: "Binary Trees", description: "Traversals and binary-tree problem solving", estimatedHours: 20, order: 12, tufUrl: "https://takeuforward.org/practice/dsa/inorder-traversal?category=theory-and-traversals&source=strivers-a2z-dsa-sheet", youtubeUrl: "https://youtu.be/lxTGsVXjwvM" },
  { id: "bst", title: "Binary Search Trees", description: "BST concepts and problem solving", estimatedHours: 10, order: 13, tufUrl: "https://takeuforward.org/practice/dsa/search-in-bst?category=theory-and-basics&source=strivers-a2z-dsa-sheet", youtubeUrl: "https://youtu.be/KcNt6v_56cc" },
  { id: "heaps", title: "Heaps", description: "Priority queues and heap patterns", estimatedHours: 8, order: 14, tufUrl: "https://takeuforward.org/practice/dsa/heapify-algorithm?category=theory-and-implementation&source=strivers-a2z-dsa-sheet" },
  { id: "graphs", title: "Graphs", description: "BFS, DFS, shortest paths, MST and DSU", estimatedHours: 28, order: 15, tufUrl: "https://takeuforward.org/practice/dsa/traversal-techniques?category=theory-and-traversals&source=strivers-a2z-dsa-sheet", youtubeUrl: "https://youtu.be/Qzf1a--rhp8" },
  { id: "dp", title: "Dynamic Programming", description: "DP patterns from basics to advanced", estimatedHours: 32, order: 16, tufUrl: "https://takeuforward.org/practice/dsa/climbing-stairs?category=1d-dp&source=strivers-a2z-dsa-sheet", youtubeUrl: "https://youtu.be/mLfjzJsN8us" },
  { id: "tries", title: "Tries", description: "Trie fundamentals and applications", estimatedHours: 5, order: 17, tufUrl: "https://takeuforward.org/practice/dsa/trie-implementation-and-operations?category=triessubc&source=strivers-a2z-dsa-sheet", youtubeUrl: "https://www.youtube.com/watch?v=dBGUmUQhjaM&list=PLgUwDviBIf0pcIDCZnxhv0LkHf5KzG9zp" },
  { id: "advanced-strings", title: "Strings (Advanced Algo)", description: "Advanced string algorithms and pattern matching", estimatedHours: 7, order: 18, tufUrl: "https://takeuforward.org/practice/dsa/reverse-every-word-in-a-string?category=medium-problems&source=strivers-a2z-dsa-sheet" },
  { id: "maths", title: "Maths", description: "Useful competitive-programming mathematics", estimatedHours: 5, order: 19, tufUrl: "https://takeuforward.org/practice/dsa/print-all-primes-till-n?category=sieve-of-eratosthenes&source=strivers-a2z-dsa-sheet" },
];

export const A2Z_SOURCE_URL = 'https://takeuforward.org/strivers-a2z-dsa-course/strivers-a2z-dsa-course-sheet-2/';
export const YOUTUBE_PLAYLIST_URL = 'https://youtube.com/playlist?list=PLgUwDviBIf0oF6QL8m22w1hIDC1vJ_BHz';
export const CODOLIO_TRACKER_URL = 'https://codolio.com/question-tracker/sheet/strivers-a2z-dsa-sheet';

export const getTopicLinks = (topicId: string) => {
  const topic = topics.find((t) => t.id === topicId);
  return {
    tufUrl: topic?.tufUrl || A2Z_SOURCE_URL,
    youtubeUrl: topic?.youtubeUrl || YOUTUBE_PLAYLIST_URL,
    playlistUrl: YOUTUBE_PLAYLIST_URL,
  };
};
