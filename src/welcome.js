'use strict';

// Onboarding welcome messages (Phase 2.6).
// Content lives here, separate from db/business logic, so the copy can be
// edited without touching code. In Phase 3 this could graduate to the settings
// table for runtime/UI editing without a deploy.

module.exports = [
  {
    id: 'welcome_1_intro',
    title: 'Welcome — your inbox brings you only what matters',
    content:
      'This is your matching engine. Instead of scrolling feeds, you describe what you care about once, and relevant items arrive right here in your inbox.',
  },
  {
    id: 'welcome_2_profile',
    title: 'Set your intent in My Profile',
    content:
      'Open "My Profile" and describe in plain words what interests you. The engine starts matching new content to it, and fresh results land in this inbox.',
  },
  {
    id: 'welcome_3_feedback',
    title: 'Star, approve or skip — the system learns from you',
    content:
      'Use the star, approve and skip actions on each item. Every action quietly tunes your profile, so over time the engine brings you better and better matches.',
  },
];
