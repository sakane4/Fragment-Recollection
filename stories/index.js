import prologue from './prologue.js';
import yuya_1 from './yuya_1.js';
import yuya_2 from './yuya_2.js';
import rabi_1 from './rabi_1.js';
import rabi_2 from './rabi_2.js';
import shizuku_1 from './shizuku_1.js';
import yukika_1 from './yukika_1.js';
import kaoru_1 from './kaoru_1.js';
import { countStoryParagraphs } from './_pageCount.js';

const _rawStories = {
  prologue,
  yuya_1,
  yuya_2,
  rabi_1,
  rabi_2,
  shizuku_1,
  yukika_1,
  kaoru_1,
};

// pageCount は body の段落数(-----/---区切り)から自動計算する。手動指定は不要
const STORIES = Object.fromEntries(
  Object.entries(_rawStories).map(([id, story]) => [id, { ...story, pageCount: countStoryParagraphs(story.body) }])
);

export { STORIES };
