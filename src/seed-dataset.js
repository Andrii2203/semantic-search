'use strict';

const INTENTS = [
  {
    id: 'rust-async',
    text: 'Asynchronous programming in Rust: concurrency, futures, tokio, non-blocking IO in production services.',
  },
  {
    id: 'frontend-role',
    text: 'A senior frontend engineer position working with React and TypeScript, remote, product company.',
  },
  {
    id: 'sourdough',
    text: 'Baking sourdough bread at home: starter, hydration, fermentation and crust.',
  },
];

const ITEMS = [
  {
    intent: 'rust-async',
    group: 'exact',
    split: 'dev',
    title: 'Async Rust: tokio vs async-std',
    content:
      'A deep comparison of async Rust runtimes. tokio and async-std both provide async await executors; we benchmark task scheduling, latency and throughput in production Rust services.',
  },
  {
    intent: 'rust-async',
    group: 'exact',
    split: 'dev',
    title: 'Understanding async await in Rust',
    content:
      'How the Rust async model works: futures, the Future trait, pinning, and how the tokio runtime polls tasks. A practical guide to writing asynchronous Rust code.',
  },
  {
    intent: 'rust-async',
    group: 'exact',
    split: 'locked',
    title: 'Building a high performance async web server in Rust',
    content:
      'We build an async HTTP server in Rust using tokio and hyper, covering non blocking IO, async tasks, and concurrency for thousands of simultaneous connections.',
  },
  {
    intent: 'rust-async',
    group: 'semantic',
    split: 'dev',
    title: 'Coroutines in systems programming',
    content:
      'Lightweight cooperative concurrency lets systems software handle many simultaneous tasks without operating system threads. We discuss green threads, executors and non blocking scheduling.',
  },
  {
    intent: 'rust-async',
    group: 'semantic',
    split: 'locked',
    title: 'Non blocking concurrency with futures and executors',
    content:
      'A look at how futures, executors and event loops let a program run thousands of simultaneous tasks in a low level language without blocking a single operating system thread.',
  },
  {
    intent: 'rust-async',
    group: 'partial',
    split: 'dev',
    title: 'Python asyncio tutorial',
    content:
      'Learn asynchronous programming in Python with asyncio: the event loop, coroutines with async await, and awaiting IO bound tasks concurrently.',
  },
  {
    intent: 'rust-async',
    group: 'partial',
    split: 'locked',
    title: 'Go goroutines and channels',
    content:
      'Concurrency in Go uses goroutines and channels for communicating sequential processes. A practical introduction to writing concurrent Go programs.',
  },
  {
    intent: 'rust-async',
    group: 'trap',
    split: 'dev',
    title: 'How to remove rust from old hand tools',
    content:
      'Restore rusty hand tools: soak the metal in vinegar to dissolve rust, scrub the corrosion with steel wool, then oil the surface to prevent oxidation and further rusting.',
  },
  {
    intent: 'rust-async',
    group: 'trap',
    split: 'locked',
    title: 'Rust belt: the decline of American manufacturing',
    content:
      'The Rust Belt saw factories close as heavy industry declined. An economic history of steel towns, job losses, shrinking populations and urban decay across the American midwest.',
  },
  {
    intent: 'rust-async',
    group: 'spam',
    split: 'dev',
    title: 'RUST ASYNC TOKIO best rust async tutorial 2026 rust async',
    content:
      'rust async tokio rust async await futures rust concurrency best rust async guide 2026 click here rust async tokio rust async tutorial cheap rust course buy now rust async.',
  },
  {
    intent: 'rust-async',
    group: 'duplicate',
    split: 'dev',
    title: 'Async Rust: comparing tokio and async-std',
    content:
      'A deep comparison of async Rust runtimes. tokio and async-std both offer async await executors; we benchmark task scheduling, latency and throughput in production Rust services.',
  },
  {
    intent: 'rust-async',
    group: 'thin',
    split: 'locked',
    title: 'Rust async',
    content: 'Rust async is interesting. Read more on our site.',
  },

  {
    intent: 'frontend-role',
    group: 'exact',
    split: 'dev',
    title: 'Senior Frontend Engineer, React and TypeScript, remote',
    content:
      'We are hiring a senior frontend engineer to build our product interface in React and TypeScript. You will own component architecture, performance and accessibility. Remote within Europe, product company, four year old codebase.',
  },
  {
    intent: 'frontend-role',
    group: 'exact',
    split: 'dev',
    title: 'Frontend developer (React) at a fintech product team',
    content:
      'Our product team is looking for an experienced React developer. Stack: React, TypeScript, Vite, state management, design system work. Remote friendly, senior level, direct product ownership.',
  },
  {
    intent: 'frontend-role',
    group: 'exact',
    split: 'locked',
    title: 'Lead UI engineer, React, TypeScript, design systems',
    content:
      'Lead the user interface work of a growing product: React with TypeScript, a shared design system, testing culture and mentoring two mid level engineers. Fully remote position, senior compensation band.',
  },
  {
    intent: 'frontend-role',
    group: 'semantic',
    split: 'dev',
    title: 'Client side engineer for a single page application',
    content:
      'Join the team building our browser application: component driven interface work, typed JavaScript, bundling, rendering performance and a shared component library. Experienced level, distributed team.',
  },
  {
    intent: 'frontend-role',
    group: 'semantic',
    split: 'locked',
    title: 'User interface developer, component architecture, typed JavaScript',
    content:
      'You will shape how our web interface is built: reusable components, strict typing, browser performance budgets and accessibility. Senior role in a product company, work from anywhere.',
  },
  {
    intent: 'frontend-role',
    group: 'partial',
    split: 'dev',
    title: 'Full stack engineer, Node and React',
    content:
      'A full stack role split between an Express backend and a React interface. Database design, API work and interface work in equal measure. Hybrid office, mid to senior level.',
  },
  {
    intent: 'frontend-role',
    group: 'partial',
    split: 'locked',
    title: 'Junior frontend developer, internship to hire',
    content:
      'A starting position for someone learning React. Six month internship with mentoring, converting to a permanent junior role. Office based, no prior commercial experience required.',
  },
  {
    intent: 'frontend-role',
    group: 'trap',
    split: 'dev',
    title: 'React chemistry: understanding reaction rates',
    content:
      'How reactants combine, what a catalyst does to activation energy, and how temperature changes the rate at which a chemical reaction proceeds. A school level introduction with worked examples.',
  },
  {
    intent: 'frontend-role',
    group: 'trap',
    split: 'locked',
    title: 'The front end of a locomotive, a history',
    content:
      'The front end of a steam locomotive housed the smokebox and the chimney. This is a history of the engineering that shaped the front of the machine over a century of railway design.',
  },
  {
    intent: 'frontend-role',
    group: 'spam',
    split: 'dev',
    title: 'REACT JOBS react developer jobs react remote jobs hiring now react',
    content:
      'react jobs react developer remote react hiring react typescript jobs apply now best react jobs 2026 react react react remote jobs click apply subscribe hiring react jobs board.',
  },
  {
    intent: 'frontend-role',
    group: 'duplicate',
    split: 'dev',
    title: 'Senior Frontend Engineer, React and TypeScript, fully remote',
    content:
      'We are hiring a senior frontend engineer to build our product interface with React and TypeScript. You will own component architecture, performance and accessibility. Remote within Europe, product company, four year old codebase.',
  },
  {
    intent: 'frontend-role',
    group: 'thin',
    split: 'locked',
    title: 'Frontend job',
    content: 'Frontend job available. Apply on our website.',
  },

  {
    intent: 'sourdough',
    group: 'exact',
    split: 'dev',
    title: 'Keeping a sourdough starter alive',
    content:
      'A sourdough starter is a culture of wild yeast and lactic bacteria. Feed it with flour and water on a schedule, watch the rise and the smell, and learn to read when it is ready to bake with.',
  },
  {
    intent: 'sourdough',
    group: 'exact',
    split: 'dev',
    title: 'High hydration sourdough, from mix to crust',
    content:
      'Working with a wet dough: autolyse, stretch and fold, bulk fermentation timing by temperature, shaping a loaf that holds its form, and baking with steam for a crisp dark crust.',
  },
  {
    intent: 'sourdough',
    group: 'exact',
    split: 'locked',
    title: 'Why my sourdough loaf came out dense',
    content:
      'The usual causes of a heavy crumb: an underactive starter, bulk fermentation cut short, a shaping step that knocked the gas out, and an oven that was not hot enough at the start of the bake.',
  },
  {
    intent: 'sourdough',
    group: 'semantic',
    split: 'dev',
    title: 'Wild fermentation and naturally leavened loaves',
    content:
      'Bread raised without commercial yeast depends on the culture living in the flour. Temperature, time and hydration decide the flavour, the acidity and how open the crumb turns out.',
  },
  {
    intent: 'sourdough',
    group: 'semantic',
    split: 'locked',
    title: 'Baking with a levain, timing by temperature',
    content:
      'A levain is a build of the mother culture made for a specific bake. Warmer dough ferments faster and sours less, cooler dough takes longer and tastes sharper. How to plan a bake around that.',
  },
  {
    intent: 'sourdough',
    group: 'partial',
    split: 'dev',
    title: 'Baking focaccia with commercial yeast',
    content:
      'A fast flatbread with dried yeast: mix, rest, dimple with olive oil and bake hot. No starter needed, ready in an afternoon, forgiving of imprecise timing.',
  },
  {
    intent: 'sourdough',
    group: 'partial',
    split: 'locked',
    title: 'Choosing a home oven for bread',
    content:
      'What matters when baking bread at home: stored heat, steam, how evenly the oven holds temperature, and whether a stone or a covered pot is worth the money.',
  },
  {
    intent: 'sourdough',
    group: 'trap',
    split: 'dev',
    title: 'Sourdough starter cultures in microbiology teaching',
    content:
      'A laboratory exercise on culturing microorganisms. Students plate samples, count colonies, and study how competing populations of bacteria and yeast stabilise in an acidic medium.',
  },
  {
    intent: 'sourdough',
    group: 'trap',
    split: 'locked',
    title: 'Bread and circuses: the politics of grain in Rome',
    content:
      'The grain dole shaped Roman politics for centuries. Who controlled the supply, what a shortage did to a city of a million people, and how bread became an instrument of power.',
  },
  {
    intent: 'sourdough',
    group: 'spam',
    split: 'dev',
    title: 'SOURDOUGH RECIPE best sourdough bread recipe sourdough starter buy',
    content:
      'sourdough bread recipe sourdough starter kit buy sourdough banneton best sourdough recipe 2026 click here sourdough course discount sourdough sourdough bread starter kit sale.',
  },
  {
    intent: 'sourdough',
    group: 'duplicate',
    split: 'dev',
    title: 'How to keep a sourdough starter alive',
    content:
      'A sourdough starter is a culture of wild yeast and lactic bacteria. Feed it flour and water on a schedule, watch the rise and the smell, and learn to read when it is ready to bake with.',
  },
  {
    intent: 'sourdough',
    group: 'thin',
    split: 'locked',
    title: 'Sourdough',
    content: 'Sourdough bread. See the full recipe on our blog.',
  },
];

const RELEVANT_GROUPS = new Set(['exact', 'semantic', 'duplicate']);
const DIRTY_GROUPS = new Set(['trap', 'spam', 'thin']);

function isRelevant(item, intentId) {
  return item.intent === intentId && RELEVANT_GROUPS.has(item.group);
}

module.exports = { INTENTS, ITEMS, RELEVANT_GROUPS, DIRTY_GROUPS, isRelevant };
